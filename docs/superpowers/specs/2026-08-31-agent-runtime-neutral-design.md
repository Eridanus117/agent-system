---
title: Agent Runtime Neutral Architecture
status: proposal
created: 2026-08-31
reader_action: review and approve the architecture before implementation
lifecycle_stage: design
artifact_shape: design doc
approver: repository owner
---

# Agent Runtime Neutral Architecture

## Decision card

- **Driver**：Agent System 不能把 Orca、OMP、Claude 或任何单一 runtime 当作公共边界；新增 Agent 必须可注册、可探测、可逐步适配。
- **Approver**：repository owner。
- **Contributors**：control-plane domain、application、provider adapters、scheduler adapters、测试与验收维护者。
- **Informed**：后续 Agent adapter 实现者、Orca/其他 runtime 集成维护者。
- **Decision state**：设计提案，等待实现前审阅。
- **Impact**：重塑 discovery/probe、evidence、scheduler 和 adapter 的公共类型；现有 Orca 调度作为兼容 adapter 保留。

## TL;DR

选择“核心 Agent 合同中立、外部来源与调度后端适配化”的方案。Orca 只实现一个 Agent source 和一个 Scheduler backend；Droid、Hermes 以及未来的本地进程、远程 runtime 或其他调度器通过同一组 ports 接入。未知 Agent 可以注册 descriptor，但缺少 adapter 或分层运行证据时只能保持 `unknown`，不得拒绝注册，也不得升级为 `supported`。

## Problem and context

当前控制面已经把 Agent ID、AgentAdapter、Agent Registry 和调度领域事实抽象出来，但仍有三个公共合同泄漏 Orca 语义：

1. `AgentRegistry` 直接依赖 `OrcaAgentProviderPort`。
2. `AgentSchedulerPort` 返回 `OrcaAutomationReceipt`。
3. provider matrix 把 `orcaEvidence` 当作主要证据字段。

这会产生两个错误方向：

- 其他 Agent source 需要伪装成 Orca provider 才能进入系统。
- 一个 Agent 是否支持被 discovery、native assembly、scheduler backend 和真实 launch 混成单一判断。

目标不是在 Agent System 内重新实现每个 runtime 的行为，而是提供统一的接入、证据和状态合同，让具体 Agent 与具体 backend 独立演进。

现有 Orca 切片的事实边界保持有效：Orca CLI 合同、结构化 argv、SQLite 事实、dry-run 和 fail-closed 机制已验证；真实 Orca automation、native Agent launch 和 real Agent task 仍需宿主 smoke，不在本设计中被追认。

## Goals

1. 用通用 Agent source port 替代 application 对 `OrcaAgentProviderPort` 的直接依赖。
2. 将 evidence 表达为带来源和阶段的受控集合；`orcaEvidence` 只作为 Orca-specific evidence，不进入通用合同。
3. 将 `AgentSchedulerPort` 提升为 backend-neutral `SchedulerPort`；Orca scheduler 实现该 port。
4. 提供独立的 Agent adapter 插件路径，覆盖 Droid、Hermes 以及未来 provider。
5. 允许注册未知 Agent descriptor；没有 adapter 时返回可见 descriptor 和 `unknown` capability，而不是抛错或虚报支持。
6. 将 provider matrix 扩展为 Agent、source、backend、evidence 的多维记录。
7. 对每个 Agent 分别验证 discovery、probe、assembly、launch、observation、recovery。

## Non-goals

- 不在本轮实现 Droid 或 Hermes 的 native flags、配置格式或宿主启动行为。
- 不把所有 Agent 的配置、权限、Skill/MCP 加载和 Session 语义强行统一。
- 不在 control-plane 内重实现 Orca cron、RRULE、worktree、terminal、远程 host 或 process supervisor。
- 不把 provider ID 能被某个 CLI 接受解释为该 Agent 已安装或已可运行。
- 不创建真实 Orca automation，不修改 `.orca/`，不把 prompt、credential、transcript 或动态任务原文写入产品事实。
- 不在没有真实宿主证据时把 `unknown` 升级为 `supported`。

## Options considered

### Option A: core-neutral ports with source/backend adapters — selected

- **Boundary**：domain/application 只依赖 `AgentSourcePort`、`AgentAdapter` 和 `SchedulerPort`。
- **Evidence**：通用 `AgentEvidenceRef[]` 描述 source、阶段和受控 reference。
- **Cost**：需要迁移 Orca receipt、provider port、matrix schema 和调用方。
- **Risk**：类型迁移面较大，但一次性清除 Orca 泄漏；新 Agent 和新 backend 只增加 adapter。
- **Reversibility**：Orca adapter 保留现有 argv/JSON 行为，迁移失败可在 adapter 边界回退。
- **Outcome**：公共合同不再绑定任何外部 runtime，符合长期扩展目标。

### Option B: keep Orca contracts behind wrappers

- **Boundary**：保留 `OrcaAgentProviderPort` 和 `OrcaAutomationReceipt`，新增 wrapper 将其他来源转换为 Orca 形状。
- **Cost**：初始改动小。
- **Risk**：Orca 类型继续渗透 application；非 Orca source 必须伪造 `orcaEvidence` 和 automation 字段；后续每个 backend 都要增加兼容层。
- **Outcome**：短期兼容，长期违背 runtime-neutral 目标，拒绝。

### Option C: external plugin manifest first

- **Boundary**：从 manifest 动态发现 provider、source、adapter 和 scheduler。
- **Cost**：需要插件加载、版本协商、信任边界、失败隔离和安装管理。
- **Risk**：在核心 ports 尚未中立前引入过多运行时机制，难以区分“可发现”和“可执行”。
- **Outcome**：未来可叠加，但不是当前最小切片，拒绝作为本轮主方案。

## Proposed architecture

### 1. Agent source boundary

新增通用 source port：

```ts
export interface AgentSourcePort {
  readonly sourceId: string;
  discover(): Promise<readonly AgentDescriptor[]>;
  probe(
    agentId: AgentId,
    revision?: ConfigurationRevision,
  ): Promise<AgentCapabilitySnapshot>;
}
```

`AgentRegistry` 依赖一个或多个 `AgentSourcePort`，并独立持有 optional adapter registry。`OrcaAgentProvider` 改为实现通用 source port；名称可以保留在 adapter 目录，不能出现在 application 的通用 port 文件中。

同一 Agent ID 可由多个 source 报告。Registry 必须保留 source identity，不能用后注册的 snapshot 静默覆盖先注册的 snapshot；冲突应返回受控 `unknown` 或 typed conflict。

### 2. Evidence collection

新增受控证据类型：

```ts
export type AgentEvidenceKind =
  | 'discovery'
  | 'probe'
  | 'assembly'
  | 'launch'
  | 'schedule'
  | 'dispatch'
  | 'observation'
  | 'recovery';

export interface AgentEvidenceRef {
  readonly source: string;
  readonly kind: AgentEvidenceKind;
  readonly reference: string;
}
```

规则：

- `AgentDescriptor` 使用通用 `evidence` collection；迁移期不得再新增 `orcaEvidence` 通用字段。
- `AgentCapabilitySnapshot` 使用通用 evidence collection；现有 `evidenceRef` 迁移为 collection 中的 probe/source evidence。
- Orca adapter 可以在 collection 中产生 `source: 'orca'` 的 evidence；Orca-specific receipt 可保留在 Orca adapter 内部。
- 所有 reference 必须经过 scheme、长度和敏感词校验；禁止 raw prompt、credential、transcript、环境变量和动态任务文本。
- evidence 缺失表示 `unknown`，不能用空字符串代替已验证事实。

### 3. Backend-neutral scheduling

新增通用 receipt 和 port：

```ts
export interface ScheduleReceipt {
  readonly externalId: string;
  readonly backendId: string;
  readonly agentId: AgentId;
  readonly target: AgentScheduleIntent['target'];
  readonly trigger: AgentScheduleIntent['trigger'];
  readonly createdAt: string;
  readonly evidence: readonly AgentEvidenceRef[];
}

export interface SchedulerPort {
  readonly backendId: string;
  create(input: AgentScheduleIntent): Promise<ScheduleReceipt>;
  cancel(receipt: ScheduleReceipt): Promise<void>;
}
```

`OrcaScheduler` 实现 `SchedulerPort`，把 `automationId`、Orca JSON、Orca flags 和 cancellation confirmation 限制在 adapter 内部。application 只处理 `externalId`、`backendId` 和通用证据。

持久化 dispatch fact 需要保存 backend identity 和 external receipt identity，不能只保存 `automationId`。迁移必须保留已有 Orca rows，并将旧字段映射为 `backendId: 'orca'`。

### 4. Agent adapter plugin boundary

统一 adapter contract 继续使用现有窄接口：

```ts
probe(revision?)
prepare(operation, revision)
start(operation, prepared)
observe(operation, started)
abort?(operation, prepared, started?)
```

目录边界：

```text
packages/control-plane/src/adapters/agents/
  claude/
  omp/
  codex/
  pi/
  grok/
  droid/
  hermes/
```

当前 OMP/Claude 既有实现可先通过 adapter index 暴露；Droid/Hermes 目录只在实现具体 adapter 时创建，不用空 stub 伪造支持。未知 Agent descriptor 不要求对应目录存在。

Adapter registry 的 lookup 结果必须区分：

```text
known descriptor + adapter      -> 可继续 probe/assembly
known descriptor + no adapter   -> descriptor 可见，capability unknown
unknown descriptor              -> 不自动创建 supported 事实
```

### 5. Unknown descriptor flow

注册流程：

```text
source.discover()
  -> descriptor registered
  -> source.probe() if available
  -> adapter lookup
  -> capability projection
```

如果 source 只提供 Agent ID，Registry 创建最小 descriptor，并将 source、version、capability、launch 等字段设为 `unknown`。如果 adapter 不存在，`probe` 不抛出“unsupported provider”作为系统级错误；只能返回带 reason/evidence 的 unknown snapshot。

### 6. Matrix schema

provider matrix 改为：

```json
{
  "schemaVersion": 2,
  "agent": "droid",
  "provider": "droid",
  "source": "orca",
  "backend": "orca-scheduler",
  "discovery": "known",
  "probe": "unknown",
  "assembly": "unknown",
  "launch": "unknown",
  "observation": "unknown",
  "recovery": "unknown",
  "scheduling": "unknown",
  "dispatch": "unknown",
  "evidence": []
}
```

其中：

- `agent` 是 Agent System identity。
- `provider` 是 source/backend 传递给外部系统的 provider identity。
- `source` 是 discovery/probe 证据来源，例如 `orca`、`local`、`remote`。
- `backend` 是调度或执行后端，例如 `orca-scheduler`、`local-process`、`remote-runtime`。
- `evidence` 是通用 evidence collection；`orcaEvidence` 仅允许在 Orca-specific adapter record 中存在。

矩阵约束：

1. `discovery` 或 `probe` 为 `unknown` 时，后续阶段不能为 `supported`。
2. `scheduling: supported` 必须拥有与同一 source/backend 关联的真实 dry-run 或 dispatch evidence。
3. `launch: supported` 必须有宿主 executable、版本和真实启动证据。
4. `observation: supported` 必须有启动终态、观察结果和清理证据。
5. `recovery: supported` 必须有失败、取消、超时或未知结果的收口证据。
6. source/backend 变更必须产生独立矩阵行，禁止跨 backend 借用 evidence 升级状态。

### 7. Verification contract

每个 Agent 的验收包必须分开记录：

```text
discovery verified
probe verified
assembly verified
launch verified
observation verified
recovery verified
```

“Orca 接受 provider ID”“adapter 合同测试通过”“dry-run argv 正确”只证明对应的 contract 层，不能替代 native launch 或 real task evidence。

## Data flow and failure handling

```text
AgentSourcePort
  -> AgentRegistry descriptor
  -> source-scoped probe snapshot
  -> optional AgentAdapter
  -> optional SchedulerPort
  -> ScheduleReceipt / DispatchOperation
  -> observation and recovery evidence
```

失败处理：

- source discovery 失败：保留 typed source failure，未发现的 Agent 不自动创建。
- probe 缺失或失败：snapshot 为 `unknown`，不得继续执行需要 supported probe 的流程。
- adapter 缺失：descriptor 可查询，assembly/launch/observation/recovery 为 `unknown`。
- scheduler backend 失败：不产生成功 receipt；application 只记录受控 failure/unknown。
- receipt backend/source/agent/target 不匹配：拒绝关联，保持 `incomplete` 或 `unknown`。
- observation 或 recovery 证据缺失：不得把 `dispatched` 提升为 `succeeded`。

## Migration and compatibility

1. 先新增通用 `AgentSourcePort` 和 `SchedulerPort`，用类型级迁移替换 application 对 Orca ports/receipt 的依赖。
2. 让 `OrcaAgentProvider` 和 `OrcaScheduler` 实现新端口，保留 Orca argv、JSON 和 side-effect boundary。
3. 迁移 Agent descriptor/snapshot evidence 为 collection；为 SQLite 和 CLI projection 增加 source/backend 字段。
4. 将 `InMemoryAgentRegistry` 改为可接收多个 source 和 optional adapter registry；未知 descriptor 不再由 adapter 缺失阻断查询。
5. 建立 `adapters/agents/<agent>/` 的插件注册约定；先迁移既有 OMP/Claude 路径，再为 Droid/Hermes 建立真实 adapter 计划。
6. 更新 provider matrix、CLI projection、合同测试和验收记录；没有真实证据的行保持 unknown/degraded。
7. 不改 `openspec/specs/`，不改 `.orca/`，不删除已有 Orca 历史事实。

## Touched assets

| asset_id | relation | change_or_usage | scope | risk | verify | rollback |
|---|---|---|---|---|---|---|
| `packages/control-plane/src/application/ports/agent-registry.ts` | 通用 source 与 registry 合同 | 移除 Orca-specific application port，增加 source identity | application boundary | source 冲突或漏注册 | source/registry contract tests、typecheck | 恢复前一端口实现，不改变 domain facts |
| `packages/control-plane/src/application/ports/scheduler.ts` | 通用调度后端合同 | `AgentSchedulerPort` → `SchedulerPort` 和 generic receipt | application boundary | receipt 字段丢失、取消关联错误 | scheduler/application/SQLite tests | 保留 backend adapter，回退 application mapping |
| `packages/control-plane/src/domain/agent.ts` | Agent descriptor/snapshot evidence | 单值证据迁移为受控 collection | domain facts | evidence 误升级或隐私泄漏 | domain projection and serialization tests | 仅回退 projection，不删除持久事实 |
| `packages/control-plane/src/domain/schedule.ts` | schedule/receipt facts | Orca receipt 改为 backend-neutral receipt | domain/application facts | 历史 automation correlation 丢失 | migration/round-trip/correlation tests | 保留 `backendId: orca` 的历史映射 |
| `packages/control-plane/src/adapters/orca/` | Orca source/backend adapter | 实现通用 ports，保持 Orca side effects 隔离 | external integration | Orca CLI contract regression | Orca scheduler/provider contract tests、dry-run | 停用 adapter，不执行真实 automation |
| `packages/control-plane/src/adapters/agents/` | native Agent plugin path | OMP/Claude 迁移，Droid/Hermes 后续接入 | process/runtime boundary | 误报 provider supported | per-agent adapter and host smoke | 未完成 adapter 不注册为 executable |
| `work/records/2026-08-31-orca-agent-scheduling/orca-provider-matrix.json` | 当前验收证据 | 扩展 source/backend 维度 | acceptance evidence | 借证据跨 backend 升级 | matrix consistency tests | 重新生成矩阵，不手改支持等级 |

## Acceptance criteria

- application ports 不再引用 `OrcaAgentProviderPort` 或 `OrcaAutomationReceipt` 作为通用合同。
- Orca provider/scheduler 仍能通过 adapter 提供现有功能，且 Orca-specific behavior 没有进入 domain。
- 任意未知 Agent descriptor 可以被注册、查询和投影；没有 adapter 时所有未验证能力保持 `unknown`。
- Droid、Hermes 和未来 Agent 有明确的独立 adapter 注册路径，不需要修改调度核心。
- matrix 每行包含 agent、provider、source、backend 和通用 evidence collection。
- 矩阵测试拒绝跨 source/backend 借证据、discovery/probe 未知时的 downstream supported，以及无真实调度证据的 scheduling supported。
- 每个 Agent 的 discovery、probe、assembly、launch、observation、recovery 都有独立验证项和证据引用。
- 全部现有 control-plane tests、typecheck、OpenSpec strict validation 通过；`.orca/` 和 `openspec/specs/` 不变。

## Open questions

1. 是否把 `agent` 与 `provider` 永久拆成两个 domain identity，还是在第一轮保持 `AgentId` 作为唯一稳定 identity？
2. 多 source 同时发现同一个 Agent 时，是否需要复合键 `sourceId + agentId`，还是由 Registry 生成 source-scoped descriptor ID？
3. generic `ScheduleReceipt` 的 `externalId` 是否足够，还是需要为 backend-specific cancellation 增加 opaque cancellation token？
4. 插件加载第一阶段是否只采用静态 composition registry，还是需要后续 manifest/discovery 机制？
5. Droid、Hermes 的 native adapter 是否由本仓实现，还是由外部 Agent package 提供并通过 adapter package 接入？

## Action items

- [ ] Repository owner review and approve this design before implementation.
- [ ] After approval, write a task-sized implementation plan with migration order and rollback gates.
- [ ] Inventory all `OrcaAgentProviderPort`, `OrcaAutomationReceipt`, `orcaEvidence` and single-value evidence callsites using symbol-aware references.
- [ ] Define the generic receipt migration and SQLite historical-row mapping before changing repositories.
- [ ] Define static adapter registration for existing OMP/Claude and empty-state behavior for Droid/Hermes.
- [ ] Add source/backend matrix fixtures before changing support-level projection.
