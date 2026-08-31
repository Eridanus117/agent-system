---
status: proposal
created: 2026-08-31
scope: Orca 支持的 AGENT 统一接入、调度与证据闭环
authority: 非权威；负责人审阅通过并迁入 OpenSpec 前不得作为产品合同
---

# Orca Agent 调度设计草案

## 1. 决策

Agent System 的支持边界不再由当前已经实现的 OMP、Claude adapter 决定，而由 Orca 当前可调度的 Agent provider 集合决定。

Orca 支持的每个 AGENT 都必须在 Agent System 中具备同一组可观测能力：

- discovery：能被 Orca provider 清单发现；
- probe：能取得版本、宿主能力和证据；
- assembly：能把 Role / ConfigurationRevision 转成该 AGENT 的原生装配；
- scheduling：能生成 Orca automation 或等价调度意图；
- dispatch：能在指定 repo、worktree、project host 或 terminal 中启动；
- observation：能回收启动、运行和终态证据；
- recovery：失败、取消、超时和未知结果有明确收口。

AGENT 之间保持实现独立。共享的是 Agent System 合同和证据模型，不共享原生配置格式、权限机制、Skill/MCP 加载方式或 Session 语义。

## 2. Orca 侧已核实合同

本轮通过版本匹配的 Orca CLI 读取到：

- Orca runtime 状态为 ready，当前运行版本为 `1.4.192`；
- `orca worktree create --agent <id>` 支持在工作树首个终端启动指定 Agent；
- 当前 CLI 指南明确示例和已知 Agent ID 包括 `claude`、`codex`、`omp`、`pi`、`grok`；同时允许其他已安装的 TUI Agent；
- `orca automations create --provider <agent>` 是调度入口；
- 调度支持 `hourly`、`daily`、`weekdays`、`weekly`、5-field cron 和 RRULE；
- 调度目标支持 repo、已有 workspace、project、project host 和远端 runtime；
- 调度支持 `precheck`、`fresh-session`、`reuse-session`、timezone、missed-run grace 等选项；
- `orca agent-context --json` 提供机器可读的 CLI 合同，但当前没有单独的“列出全部已安装 Agent provider”命令；
- `Hermes` 未出现在当前 CLI 指南的已知 ID 中，因此暂不把它标记为已核实的 Orca provider。

“Orca 可以接受某个 Agent ID”只证明调度接口允许该标识，不等于该 Agent 已通过 Agent System 的真实启动和观察验收。

## 3. 目标分层

```text
Orca Provider / Agent Support Matrix
        |
        v
Agent Registry
  - AgentId
  - AgentDescriptor
  - CapabilitySnapshot
        |
        v
Agent System Control Plane
  - Role / ConfigurationRevision
  - schedule intent
  - activation / dispatch
  - observation / reconcile
  - evidence / recovery
        |
        +-- AgentAdapter: claude
        +-- AgentAdapter: codex
        +-- AgentAdapter: omp
        +-- AgentAdapter: pi
        +-- AgentAdapter: grok
        +-- AgentAdapter: other Orca providers
        +-- AgentAdapter: hermes（仅在 Orca 证据确认后）
        |
        v
Orca Scheduler / Worktree / Terminal Backend
```

Agent System 继续采用六边形模块化单体：domain 不依赖 Orca、Bun、SQLite 或任何具体 Agent；application 是唯一状态变更入口；Orca、SQLite、Agent process 和文件系统均通过 ports/adapters 接入。

## 4. 稳定合同

### 4.1 Agent Registry

```text
AgentId
AgentDescriptor {
  id,
  displayName,
  provider,
  sourceEvidence,
  supportLevel,
  version,
  capabilities
}
CapabilitySnapshot {
  probeId,
  observedAt,
  version,
  launch,
  schedule,
  worktree,
  sessionPolicy,
  contentAssembly,
  evidence
}
```

`supportLevel` 使用现有封闭集合：

```text
supported | degraded | unsupported | unknown
```

注册表中的“可见”与“可启动”分开表达。Orca 清单发现、宿主安装、能力 probe、真实启动和实际生效不得折叠成一个布尔值。

### 4.2 AgentAdapter

当前 `ClientAdapter` 的概念目标迁移为 `AgentAdapter`：

```text
probe(revision?)
prepare(operation, revision)
start(operation, prepared)
observe(operation, started)
abort(operation, prepared, started?)
```

各 adapter 可以生成不同的 native argv、文件和环境，但必须返回统一的：

```text
manifestHash
launch context
process reference
observation outcome
reason / evidence reference
```

### 4.3 调度合同

Agent System 新增调度意图，而不是新增一套 cron 实现：

```text
AgentScheduleIntent {
  scheduleId,
  agentId,
  revisionId,
  trigger,
  target,
  sessionPolicy,
  precheckRef,
  sourceContextRef,
  requestedBy,
  createdAt
}
```

其中：

- `trigger` 表达 preset、cron 或 RRULE；
- `target` 表达 repo、workspace、project、host；
- `sessionPolicy` 表达 fresh 或 reuse；
- `precheckRef` 和 `sourceContextRef` 只保存受控引用，不把动态任务原文或凭据写入产品数据库。

Orca adapter 负责把调度意图翻译为：

```text
orca automations create
```

并回传：

```text
OrcaAutomationReceipt {
  automationId,
  provider,
  target,
  trigger,
  createdAt,
  sourceEvidence
}
```

实际每次运行仍需单独产生 `DispatchOperation` 和 `LaunchObservation`，不能用 automation 创建成功代替 Agent 启动成功。

## 5. 运行流程

```text
用户选择 Role / revision
        |
        v
选择 Agent
        |
        v
Agent Registry probe
        |
        +-- unknown / unsupported -> fail closed
        |
        v
创建 AgentScheduleIntent
        |
        v
生成 Orca automation spec
        |
        v
Orca 创建 automation
        |
        v
到点执行 precheck
        |
        +-- precheck 失败 -> skipped，不能伪造 dispatch
        |
        v
Orca 创建或复用 worktree / terminal
        |
        v
启动指定 AGENT
        |
        v
AgentAdapter observe / reconcile
        |
        v
保存 DispatchOperation、receipt、observation、cleanup evidence
```

Agent System 保存“计划、绑定、证据和结果”；Orca 负责计时器、工作区、终端和宿主进程生命周期。两者不宣称跨系统事务原子性。

## 6. 失败与安全边界

以下情况必须停止调度或标记为未知：

- Agent 不在当前 Orca 支持矩阵；
- provider 能发现但版本或必要能力未知；
- Role capability 无法解析或无法按该 Agent 物化；
- Orca automation 创建失败；
- precheck 非零退出；
- worktree、terminal 或 remote host 不可用；
- Agent 启动结果无法关联到 operation、revision、manifest 或 target；
- 进程退出但没有足够观察证明实际装配生效。

退出码为零只能作为进程层事实，不能直接推导为 `verified`。

调度、激活、取消和恢复都必须绑定 `operationId`、`agentId`、`revisionId`、`target` 和 `manifestHash`，防止旧确认、旧配置或旧 Session 被错误复用。

## 7. 现有实现的迁移路径

1. 保留 OMP 和 Claude 的实际 native 行为，只先把接口和领域术语抽象为 Agent；
2. 将当前硬编码的 `OmpClientAdapter` / `ClaudeClientAdapter` 注册改成 Agent Registry；
3. 引入 Orca scheduler/dispatch port，先实现纯 dry-run 映射，不创建真实 automation；
4. 为 OMP、Claude 补齐调度合同和 dispatch receipt；
5. 按 Orca provider matrix 逐个增加 Codex、Pi、Grok 和其他 provider；
6. Hermes 只有在 provider 身份、启动方式和真实 smoke 证据确认后接入；
7. 每新增一个 Agent，必须同时加入 capability matrix、adapter contract test、Orca dispatch test 和宿主 smoke。

## 8. 验证门

### 合同测试

- Agent ID、版本和 capability snapshot 的 Known/Unknown 分层；
- provider 不存在、能力未知和版本漂移时 fail closed；
- 相同调度意图生成稳定的 Orca spec；
- fresh/reuse、repo/workspace/project/host 目标映射正确；
- precheck 失败生成 skipped，不生成成功 dispatch。

### Agent adapter 测试

每个 Agent 至少覆盖：

- probe；
- Role / revision 装配；
- native launch plan；
- 缺失必需能力；
- 进程启动失败；
- 观察结果未知；
- cleanup / recovery。

### 真实 smoke

每个 Agent 进入 `supported` 前必须在目标宿主上保存：

```text
provider/version
capability probe
Orca automation 或等价 dispatch
fresh session launch
observation
cleanup
```

没有真实宿主证据时最高只能标记 `unknown` 或 `degraded`。

## 9. 非目标

- 不在 Agent System 内重新实现 cron、RRULE、worktree、terminal 或远端 host 管理；
- 不把所有 AGENT 强行转换成同一种配置文件；
- 不把 Orca 的 provider 可接受性直接当成 Agent System 的支持承诺；
- 不为 Hermes 或其他未核实 provider 提前伪造 adapter；
- 不把 Agent 的动态任务、prompt、凭据或 transcript 写进稳定 ConfigurationRevision 或产品数据库；
- 不修改现有 `.orca/` 运行状态。

## 10. 需要负责人审阅的结论

本草案只记录设计，不改变当前 `openspec/specs/` 或 `_bmad-output/` 权威内容。负责人通过后，再拆成正式 OpenSpec change，更新 Agent 术语、支持矩阵和调度合同，然后进入实现计划。
