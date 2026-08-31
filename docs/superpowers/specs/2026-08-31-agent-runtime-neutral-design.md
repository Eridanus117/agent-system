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
- **Evidence**：通用 `AgentEvidence[]` 描述 source、阶段和受控 reference。
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

新增通用 source port、发现记录与复合身份：

```ts
export type AgentSourceId = string;

export type UnknownReason =
  | 'source-only-discovery'
  | 'discovery-failed'
  | 'probe-unavailable'
  | 'probe-failed'
  | 'adapter-unregistered'
  | 'unsupported-source'
  | 'legacy-schedule-unverified'
  | 'evidence-invalid'
  | 'identity-conflict'
  | 'migration-conflict'
  | 'backend-failed'
  | 'cancel-failed';
export type CapabilityStage =
  | 'discovery'
  | 'probe'
  | 'assembly'
  | 'launch'
  | 'scheduling'
  | 'dispatch'
  | 'observation'
  | 'recovery'
  | 'closure';

export type UnknownReasons = {
  readonly [stage in CapabilityStage]: UnknownReason | null;
};

export interface AgentKey {
  readonly sourceId: AgentSourceId;
  readonly agentId: AgentId;
}

export interface DiscoveryRecord {
  readonly sourceId: AgentSourceId;
  readonly agentId: AgentId;
  readonly providerId?: string;
  readonly descriptor?: AgentDescriptor;
  readonly evidence?: readonly AgentEvidence[];
  readonly unknownReason?: UnknownReason;
}

export interface AgentSourcePort {
  readonly sourceId: AgentSourceId;
  discover(): Promise<readonly DiscoveryRecord[]>;
  probe?(
    key: AgentKey,
    revision?: ConfigurationRevision,
  ): Promise<AgentCapabilitySnapshot>;
}
```

v1 明确采用 `sourceId + agentId` 作为 Registry 复合身份。`agentId` 在 source 内稳定，`sourceId` 标识发现/探测证据来源；同名 Agent 由不同 source 报告时是两个独立的 `AgentKey`，不得互相覆盖。`AgentDescriptor` 和 `AgentCapabilitySnapshot` 必须携带 `sourceId`，`AgentRegistry.get`、`probe`、`adapter` 均接收 `AgentKey`；`list` 返回 source-scoped descriptors。

`providerId` 是 source 暴露给外部 backend 的 token，可以与 `agentId` 不同。Source 必须在 descriptor 中显式声明 `providerId`；只有 source 明确声明两者相等时才允许复用 `agentId`。若 source 只提供 Agent ID，provider binding 保持 `unknown`，不得创建 scheduling/dispatch supported 事实。Orca `--provider` 使用该显式 `providerId`，application 不自行猜测映射。

`AgentRegistry` 依赖一个或多个 `AgentSourcePort`，并独立持有 optional adapter registry。`OrcaAgentProvider` 只在 adapter 目录实现通用 source port，不能出现在 application 的通用 port 文件中。

同一 `AgentKey` 的重复 descriptor、providerId 不一致或 snapshot identity 不一致都返回 typed conflict/unknown；不同 `AgentKey` 的同名 Agent 不冲突。

### 2. Evidence collection

证据不是三个自由字符串，而是按阶段定义的受控事实：

```ts
export type AgentEvidence =
  | { readonly kind: 'discovery'; readonly sourceId: AgentSourceId; readonly agentKey: AgentKey; readonly providerId: string | null; readonly backendId: string | null; readonly reference: string; readonly observedAt: string }
  | { readonly kind: 'probe'; readonly sourceId: AgentSourceId; readonly agentKey: AgentKey; readonly providerId: string | null; readonly backendId: string | null; readonly version: ObservedText; readonly capabilities: Readonly<Record<string, SupportLevel>>; readonly reference: string; readonly observedAt: string }
  | { readonly kind: 'assembly'; readonly sourceId: AgentSourceId; readonly agentKey: AgentKey; readonly providerId: string | null; readonly backendId: string | null; readonly manifestHash: string; readonly materializedFiles: readonly string[]; readonly reference: string; readonly observedAt: string }
  | { readonly kind: 'launch'; readonly sourceId: AgentSourceId; readonly agentKey: AgentKey; readonly providerId: string | null; readonly backendId: string | null; readonly executable: string; readonly version: string; readonly processReference: string; readonly outcome: 'started' | 'failed' | 'unknown'; readonly reference: string; readonly observedAt: string }
  | { readonly kind: 'schedule'; readonly sourceId: AgentSourceId; readonly backendId: string; readonly agentKey: AgentKey; readonly providerId: string; readonly externalId: string | null; readonly dryRun: boolean; readonly reference: string; readonly observedAt: string }
  | { readonly kind: 'dispatch'; readonly sourceId: AgentSourceId; readonly backendId: string; readonly agentKey: AgentKey; readonly providerId: string; readonly externalId: string; readonly operationId: string; readonly reference: string; readonly observedAt: string }
  | { readonly kind: 'observation'; readonly sourceId: AgentSourceId; readonly agentKey: AgentKey; readonly providerId: string | null; readonly backendId: string | null; readonly outcome: 'succeeded' | 'degraded' | 'failed' | 'incomplete' | 'unknown'; readonly cleaned: boolean; readonly reference: string; readonly observedAt: string }
  | { readonly kind: 'recovery'; readonly sourceId: AgentSourceId; readonly agentKey: AgentKey; readonly providerId: string | null; readonly backendId: string | null; readonly operationId: string; readonly externalId: string | null; readonly cancellationRef: string | null; readonly action: 'cancel' | 'timeout' | 'failure' | 'unknown'; readonly closed: boolean; readonly reference: string; readonly observedAt: string };
```
```ts
export interface EvidenceReferenceRegistry {
  register(
    sourceId: AgentSourceId,
    scheme: string,
    validate: (reference: string) => boolean,
  ): void;
  normalize(
    reference: string,
    binding: {
      readonly sourceId: AgentSourceId;
      readonly agentKey: AgentKey;
      readonly providerId?: string;
      readonly kind: AgentEvidence['kind'];
      readonly backendId?: string;
    },
  ): string;
  validate(
    reference: string,
    binding: {
      readonly sourceId: AgentSourceId;
      readonly agentKey: AgentKey;
      readonly providerId?: string;
      readonly kind: AgentEvidence['kind'];
      readonly backendId?: string;
    },
  ): boolean;
}
```

校验合同：

- `sourceId`、`backendId`、`providerId`、ID 和 `manifestHash` 使用小写 ASCII 标识符或既有 domain validator；长度上限 128。
- `reference` 由 `EvidenceReferenceRegistry` 校验并返回 canonical normalized string：source 注册 scheme、最大长度 256、大小写归一化、禁止 `prompt`、`credential`、`secret`、`transcript`、`environment`、动态任务正文和等号注入；未知 scheme、非法格式或越界长度拒绝。
- `EvidenceValidator` 负责 typed fact 的 `AgentKey`、providerId、evidence kind、stage cardinality 和 uniqueness；同一 normalized reference 只能归属于完全相同的 source/agent/provider/kind/backend binding，不能跨 Agent、provider 或 backend 借用。
- 一个 `supported` 阶段至少需要一个同 `sourceId`、同 `agentKey` 的对应 typed fact；`providerId` 对任何 supported stage 必须非空，`backendId` 对 scheduling、dispatch、observation、recovery、closure 必须非空，discovery/probe/assembly/launch 的 backendId 可为 null。
- `launch` 必须同时有 executable、version、processReference 和 started outcome；`observation` 必须有终态与 `cleaned: true`；`recovery` 必须有 action、operationId、`closed: true`，并以 externalId/cancellationRef 与 receipt 关联；cancel/retry closure 是 recovery 的受控 substage，不是第九种 evidence kind。
- `RecoveryValidator` 必须执行精确关联。所有模式都要求 `recovery.operationId === receipt.operationId`、`recovery.agentKey === receipt.agentKey`、`recovery.backendId === receipt.backendId`、`recovery.providerId === receipt.providerId`；`apply` 模式还要求 dispatch row 的 operationId/identity 全等，`recovery.externalId === receipt.externalId` 且 externalId 非空，`recovery.cancellationRef === receipt.cancellationRef`（可为 null，实际取消 token 仍按 `cancellationRef ?? externalId` 解析）；`dry-run` 模式不要求 dispatch row，且 recovery.externalId/cancellationRef 必须都为 null。任一比较失败或 receipt 不存在，closure 只能为 unknown 并写 `identity-conflict`。
- `scheduling: supported` 必须有 `dryRun: true` 的 schedule fact 或真实 dispatch fact；`dispatch: supported` 必须有 externalId、operationId 和 backend 绑定。
- 任意非法/缺失/冲突证据只将对应阶段降为 `unknown` 或 `degraded`，不得升级其他阶段。
`AgentDescriptor` 和 `AgentCapabilitySnapshot` 增加 `unknownReasons: UnknownReasons`；当 descriptor/snapshot 的任一对应 stage 为 `unknown` 或 `degraded` 时，必须在该 stage 写入受控 reason，已验证状态使用 null。`DiscoveryRecord.unknownReason` 只承载 discovery stage 的单一来源原因，并 materialize 为 `unknownReasons.discovery`；matrix 用按 stage 分组的 `reasons` 对象投影。

### 3. Backend-neutral scheduling
`AgentScheduleIntent` v1 增加 `sourceId` 和显式 `providerId`，保持 `agentId` 为 source-local ID：

```ts
interface AgentScheduleIntent {
  readonly sourceId: AgentSourceId;
  readonly agentId: AgentId;
  readonly providerId: string;
  readonly mode: 'dry-run' | 'apply';
  // 其余 trigger、target、revision 和 session 字段保持现有合同
}
```
兼容读路径不把不完整旧行伪装成新的 intent：

```ts
interface LegacyScheduleRecord {
  readonly kind: 'legacy-unknown';
  readonly scheduleId: string;
  readonly agentId: AgentId;
  readonly sourceId: AgentSourceId;
  readonly providerId: null;
  readonly mode: null;
  readonly unknownReasons: {
    readonly discovery: 'migration-conflict';
    readonly scheduling: 'legacy-schedule-unverified';
  };
}

type PersistedSchedule = AgentScheduleIntent | LegacyScheduleRecord;
```

`AgentScheduleRepository.findById/listByAgent` 在 dual-read 期间返回 `PersistedSchedule`；只有 `AgentScheduleIntent` 可进入 Scheduler。legacy record 只可查询/展示，dispatch、cancel 和 apply 都返回 typed `legacy-schedule-unverified`，不得猜测 provider 或 mode。


Scheduler backend 只能使用 intent 中已经绑定的 `providerId`；不能根据 `agentId`、source 名称或 backend 名称隐式猜测 provider 映射。


```ts
export interface ScheduleReceipt {
  readonly mode: AgentScheduleIntent['mode'];
  readonly operationId: string;
  readonly externalId: string | null;
  readonly cancellationRef: string | null;
  readonly backendId: string;
  readonly agentKey: AgentKey;
  readonly providerId: string;
  readonly target: AgentScheduleIntent['target'];
  readonly trigger: AgentScheduleIntent['trigger'];
  readonly createdAt: string;
  readonly evidence: readonly AgentEvidence[];
}

export type CancellationResult =
  | { readonly outcome: 'closed'; readonly externalCall: boolean }
  | { readonly outcome: 'missing-cancellation-reference'; readonly externalCall: false };
export type SchedulerErrorCode =
  | 'unsupported-source'
  | 'legacy-schedule-unverified'
  | 'missing-cancellation-reference'
  | 'identity-conflict'
  | 'backend-failed'
  | 'cancel-failed';

export interface SchedulerError {
  readonly code: SchedulerErrorCode;
  readonly sourceId?: AgentSourceId;
  readonly agentKey?: AgentKey;
}

export interface SchedulerPort {
  readonly backendId: string;
  create(input: AgentScheduleIntent): Promise<ScheduleReceipt>;
  cancel(receipt: ScheduleReceipt): Promise<CancellationResult>;
}
```

`OrcaScheduler` 只接受 `input.sourceId === 'orca'`；其他 source 返回 typed `unsupported-source`，不执行外部调用。对 Orca intent，它把 `automationId`、Orca JSON、Orca flags 和 cancellation confirmation 限制在 adapter 内部；`apply` 模式将 `automationId` 映射为非空 `externalId`，`dry-run` 模式只验证 argv/JSON 并返回 `externalId: null`、`cancellationRef: null`，同时写入 `dryRun: true` 的 schedule evidence。application 只处理通用 receipt，不解析 Orca 字段。
`SchedulerPort.create` 的 unsupported/legacy/identity failures reject typed `SchedulerError`；backend failures也 reject该错误。`cancel` 仅在 backend error 时 reject；missing cancellation reference 由 `CancellationResult` 显式返回，不吞掉错误。
`cancel` 对 dry-run receipt 是无外部副作用且 `outcome: 'closed'` 的闭合操作；对 apply receipt 使用 `cancellationRef ?? externalId`，两者都为空时返回 `{ outcome: 'missing-cancellation-reference', externalCall: false }`。application 不解释 opaque cancellation token。
`SchedulerPort.cancel` 先校验 `receipt.backendId === this.backendId`；Orca implementation 还要求 `receipt.agentKey.sourceId === 'orca'`，否则 reject `{ code: 'unsupported-source' }` 且 `externalCall` 不发生。其他 backend 按自己的 source allow-list 执行同一 binding check。


#### Receipt / SQLite migration matrix

| 旧事实 | v1 通用事实 | 迁移规则 |
|---|---|---|
| `OrcaAutomationReceipt.automationId` | `ScheduleReceipt.externalId` | 原值保留；`backendId = 'orca'`；不得改写 ID |
| `OrcaAutomationReceipt.provider` | `ScheduleReceipt.providerId` | 原值保留；`sourceId = 'orca'`；不等同于 `agentId` 除非 descriptor 显式绑定 |
| `OrcaAutomationReceipt.sourceEvidence` | `ScheduleReceipt.evidence[kind='dispatch']` | locate the unique `dispatch_operation` row by `(operation_id, receipt_automation_id) = (receipt.operationId, receipt.automationId)`; join `agent_schedule` on `schedule_id`; derive source/agent from schedule and provider from validated `receipt_provider`. Non-empty automation ID gives `backendId='orca'`, `externalId`, `dryRun=false`; normalize the old reference unchanged through `EvidenceReferenceRegistry`. Missing/duplicate join or invalid reference keeps old column and writes `unknownReasons.dispatch='evidence-invalid'` |
| `DispatchOperation.automationId` | `DispatchOperation.externalId` + `backendId` | 新列先回填 `backendId='orca'`、`externalId=automation_id`；旧列只读兼容一个版本 |
| `receipt_automation_id` / `receipt_provider` | `receipt_external_id` / `receipt_backend_id` / `receipt_provider_id` / `receipt_mode` | apply receipts use partial unique index `(operation_id, receipt_backend_id, receipt_external_id) WHERE receipt_external_id IS NOT NULL`; dry-run receipts use partial unique index `(operation_id, receipt_backend_id, receipt_mode) WHERE receipt_external_id IS NULL`, so SQLite NULL semantics cannot create duplicate dry-run facts |
| `receipt_source_evidence` | `receipt_evidence_json` | apply the same unique operation/automation join and unchanged-reference normalization; malformed or unclassifiable values never enter typed evidence, remain in old column, and set `unknownReasons.dispatch='evidence-invalid'` |
| `agent_schedule.agent_id` | `agent_schedule.source_id` + `agent_schedule.agent_id` + `agent_schedule.provider_id` | 新增 nullable columns；历史行回填 `source_id='orca'`、`provider_id=agent_id` only when Orca descriptor explicitly binds them, otherwise provider remains unknown |
| `CLI --dry-run` / legacy scheduling mode | `agent_schedule.mode` | `true -> 'dry-run'`, `false -> 'apply'`; missing legacy mode is represented only by `LegacyScheduleRecord` and cannot dispatch |
| `dispatch_operation.agent_id` | `dispatch_operation.source_id` + `dispatch_operation.agent_id` + `dispatch_operation.provider_id` | source/agent come from linked schedule; provider uses validated `receipt_provider` when present, otherwise null. A known receipt provider may make dispatch addressable but never backfills the unknown schedule provider; mismatch sets `unknownReasons.dispatch='identity-conflict'` |
| `DiscoveryRecord.unknownReason` / descriptor/snapshot `unknownReasons` | `agent_schedule.unknown_reasons_json` + `dispatch_operation.unknown_reasons_json` | discovery reason materializes at `discovery`; stage-specific reasons serialize as a validated map; null only for fully verified rows; invalid/missing values force the affected stage unknown |
| `schedule-repository` old row projection | `PersistedSchedule` union | dual-read old rows as `LegacyScheduleRecord` during one compatibility version; new writes require source/provider/mode; legacy records remain queryable but cannot dispatch/cancel/apply |

迁移必须按 expand → backfill → verify → cutover 顺序执行：先新增 nullable 通用列和索引，回填所有历史 Orca 行；round-trip、target/trigger correlation、appendReceipt 幂等、cancel lookup 和失败重试通过后，读路径切换到新列；至少保留一个版本的 dual-read；回滚只回退读写代码，不删除旧列或历史事实。任何回填冲突停止迁移并保留原数据库。

### 4. Agent adapter plugin boundary

adapter contract 直接沿用现有 `AgentAdapter` 的精确输入输出，不在设计文档中发明位置参数：

```ts
interface AgentAdapter {
  readonly sourceId: AgentSourceId;
  readonly agentId: AgentId;
  probe(input: { readonly key: AgentKey; readonly revision?: ConfigurationRevision }): Promise<AgentCapabilitySnapshot>;
  prepare(input: AgentAdapterInput & { readonly key: AgentKey }): Promise<PreparedActivation>;
  start(input: AgentAdapterInput & { readonly key: AgentKey; readonly prepared: PreparedActivation }): Promise<StartedProcess>;
  observe(input: AgentAdapterInput & { readonly key: AgentKey; readonly started: StartedProcess }): Promise<ObservedLaunch>;
  abort?(input: AgentAdapterInput & { readonly key: AgentKey; readonly prepared: PreparedActivation; readonly started?: StartedProcess }): Promise<void>;
}

export type AdapterRegistrationResult =
  | { readonly status: 'registered' }
  | { readonly status: 'conflict'; readonly reason: 'duplicate-key' | 'identity-mismatch' };

interface AgentAdapterRegistry {
  get(key: AgentKey): AgentAdapter | null;
  register(adapter: AgentAdapter): AdapterRegistrationResult;
}
```

`AgentAdapterInput`、`PreparedActivation`、`StartedProcess` 和 `ObservedLaunch` 的生命周期字段保持现有 `packages/control-plane/src/application/ports/agent-adapter.ts` 定义；v1 在 input 增加 `key: AgentKey`，`probe` 显式接收同一 key。每个生命周期方法必须校验 input key 与 adapter 的 sourceId/agentId 一致，snapshot 必须回传同一 identity；`register` 拒绝属性与 key 不一致或同 key 重复的 adapter，并返回 typed conflict。

目录边界以当前 composition root 为准：

```text
packages/control-plane/src/adapters/clients/
  agent-adapters.ts              # 静态 registry 与 composition root
  <source>/<agent>-adapter.ts    # 真实 adapter 实现，按需创建
```

既有 OMP/Claude 实现先由 `agent-adapters.ts` 暴露，再按 source/agent ownership 迁移到对应模块；Droid/Hermes 目录只有在实现具体 adapter 时创建，不用空 stub 伪造支持。未知 Agent descriptor 不要求对应文件存在。


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
  -> DiscoveryRecord { sourceId, agentId, providerId?, descriptor?, unknownReason? }
  -> source-scoped descriptor registered
  -> optional source.probe()
  -> optional adapter lookup
  -> capability projection
```

`DiscoveryRecord` 至少包含 `sourceId` 和 source-local `agentId`；`displayName`、`providerId` 和 evidence 可选只适用于 unknown descriptor。任何 supported 或 scheduling/dispatch projection 都必须有 providerId。`unknownReasons` 是唯一的 reason 表示，按 stage 存储，不做全局单值覆盖：source 只有 Agent ID 时写 `discovery: 'source-only-discovery'`；probe 能力缺失/失败时写 `probe: 'probe-unavailable'`/`'probe-failed'`；adapter 不存在时写 assembly/launch/observation/recovery/closure 对应的 `adapter-unregistered`；证据或 identity 冲突只写冲突所在 stage。Registry 创建的最小 descriptor 与 snapshot 使用相同 map，不因缺少 adapter 抛出系统级 unsupported 错误。

### 6. Matrix schema

```json
{
  "schemaVersion": 2,
  "agent": "droid",
  "provider": null,
  "source": "example-source",
  "backend": "example-backend",
  "discovery": "unknown",
  "probe": "unknown",
  "assembly": "unknown",
  "launch": "unknown",
  "observation": "unknown",
  "recovery": "unknown",
  "closure": "unknown",
  "scheduling": "unknown",
  "dispatch": "unknown",
  "reasons": {
    "discovery": "source-only-discovery",
    "probe": "probe-unavailable",
    "assembly": "adapter-unregistered",
    "launch": "adapter-unregistered",
    "observation": "adapter-unregistered",
    "recovery": "adapter-unregistered",
    "closure": "adapter-unregistered",
    "scheduling": "adapter-unregistered",
    "dispatch": "adapter-unregistered"
  },
  "evidence": []
}
```

上面是**字段形状示例**，不是 Droid 已发现或已支持的事实。空 `evidence` 只能与 `unknown` 状态共存。

其中：

- `agent` 是 `(source, agentId)` 绑定后的 Agent System identity；同一个 source-local Agent 不跨 source 合并。
- `provider` 是 descriptor 的显式 `providerId`，由 source 提供给 backend；它可以与 `agent` 不同，不能由 backend 猜测。
- `source` 是 discovery/probe 证据来源，例如 `orca`、`local`、`remote`。
- `backend` 是调度或执行后端，例如 `orca-scheduler`、`local-process`、`remote-runtime`。
- backend 使用 `(source, agent, provider)` 三元绑定；matrix evidence 必须匹配同一 source/backend，不能跨行借用。
- `evidence` 是通用 typed evidence collection；`orcaEvidence` 只允许在 Orca-specific adapter record 中存在。

矩阵约束：

1. `discovery` 或 `probe` 为 `unknown` 时，assembly、launch、observation、recovery、scheduling、dispatch 均不能为 `supported`。
2. `scheduling: supported` 必须拥有与同一 source/backend/agent 绑定的真实 dry-run 或 dispatch evidence。
3. `launch: supported` 必须有宿主 executable、版本和真实启动证据。
4. `observation: supported` 必须有启动终态、观察结果和清理证据。
5. `recovery: supported` 必须有失败、取消、超时或未知结果的收口证据。
6. `dispatch: supported` 必须有 backend external ID、operation correlation 和 dispatch evidence。
7. source/backend 变更必须产生独立矩阵行，禁止跨 backend 借用 evidence 升级状态。
8. 任一阶段为 `unknown` 或 `degraded` 时 `reasons[stage]` 必须是 `UnknownReason` 枚举值；已验证阶段在 `reasons` 中为 null；`closure: supported` 还必须有对应 recovery fact 的 `closed: true`。


### 7. Verification contract

每个 Agent 的验收包必须按九个可审计阶段分开记录；最后一项是 recovery evidence 的 closure substage，不新增第九种 evidence kind：

```text
discovery verified
probe verified
assembly verified
launch verified
scheduling verified
dispatch verified
observation verified
recovery verified
cancel/retry closure verified (recovery substage)
```

其中 `scheduling` 覆盖 create/dry-run/cancel contract，`dispatch` 覆盖 external ID 与 operation correlation；`cancel/retry closure` 必须由 `kind: 'recovery'` 的 `action`、`operationId`、`closed: true`、externalId/cancellationRef 和关联 receipt evidence 覆盖。九项不能由 discovery/probe 的成功替代；每项必须关联同一 `AgentKey`，providerId 对 supported stage 非空，backendId 只对 scheduling/dispatch/observation/recovery/closure 强制非空。

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

- source discovery 失败：保留 typed source failure，未发现的 Agent 不自动创建；已存在 descriptor 的 discovery reason 为 `discovery-failed` only when discovery returned a partial row.
- probe 缺失或失败：snapshot 为 `unknown`，写 `unknownReasons.probe='probe-unavailable'` 或 `'probe-failed'`，不得继续执行需要 supported probe 的流程。
- adapter 缺失：descriptor 可查询，assembly/launch/observation/recovery/closure 为 `unknown`，对应 reason 为 `adapter-unregistered`。
- scheduler backend 失败：不产生成功 receipt；application 记录 `unknownReasons.scheduling='backend-failed'` 或 `unknownReasons.dispatch='backend-failed'`。
- unsupported source 或 legacy schedule：分别写 `unknownReasons.scheduling='unsupported-source'` 或 `'legacy-schedule-unverified'`，不得调用外部 backend。
- cancel backend 失败：写 `unknownReasons.recovery='cancel-failed'`，不伪造 closure。
- receipt backend/source/agent/target 不匹配：拒绝关联，保持 `incomplete` 或 `unknown`，写 `unknownReasons.dispatch='identity-conflict'`。
- observation 或 recovery 证据缺失：不得把 `dispatched` 提升为 `succeeded`。

## Migration and compatibility

迁移顺序和门禁固定如下：

1. **Inventory gate**：用 symbol-aware references 盘点 `OrcaAgentProviderPort`、`OrcaAutomationReceipt`、`OrcaAutomationReceipt.sourceEvidence`、`DispatchOperation.automationId` 及所有单值 evidence caller；未完成盘点不得改名。
2. **Expand gate**：新增 `AgentKey`、通用 ports/receipt、nullable SQLite columns、source/backend indexes 和兼容 projection；旧 Orca columns 保持可读。
3. **Backfill gate**：所有 `agent_schedule` 行先写入 `source_id='orca'`；只有 Orca descriptor 明确声明 `providerId === agentId` 时才回填 `provider_id=agent_id`，否则 provider 保持 unknown。随后从关联 schedule 复制 source/provider 到 `dispatch_operation`，再回填所有历史 Orca receipt/dispatch 行的 `backend_id='orca'`、`external_id=automation_id`、`provider_id=receipt_provider`；`receipt_source_evidence` 按 operation/schedule join 仅在非空 automation ID 且元数据齐全、引用可校验时生成唯一 `kind='dispatch'` fact，其他值保留旧列并产生 `evidence-invalid` unknown。
4. **Verify gate**：执行 receipt round-trip、target/trigger correlation、appendReceipt 幂等、cancel lookup、失败重试、旧新列 dual-read 和矩阵一致性测试；任何冲突停止迁移并保留原数据库。
5. **Cutover gate**：application、repository、SQLite store 和 CLI projection 改为新字段；写路径只写新列，读路径至少 dual-read 一个版本。
6. **Adapter gate**：`OrcaAgentProvider`/`OrcaScheduler` 实现通用 ports，Orca argv/JSON/side effects 仍封装在 `adapters/orca/`；`adapters/clients/agent-adapters.ts` 继续是静态 composition root。
7. **Evidence gate**：没有真实 evidence 的 Agent/backend 行保持 `unknown` 或 `degraded`；不得把既有 Orca evidence 借给其他 source/backend。
8. 不改 `openspec/specs/`，不改 `.orca/`，不删除已有 Orca 历史事实。

## Touched assets
| asset_id | relation | change_or_usage | scope | risk | verify | rollback |
|---|---|---|---|---|---|---|
| `packages/control-plane/src/application/scheduling.ts` | scheduling orchestration | thread AgentKey/provider/mode through validation, create, dispatch and cancel | application flow | wrong backend/source correlation | scheduling and CLI integration tests | retain old intent mapping in dual-read |
| `packages/control-plane/src/application/ports/agent-registry.ts` | source-scoped registry contract | `AgentKey`、optional source probe、explicit provider binding | application boundary | same local ID overwrite | source/registry contract tests、typecheck | restore old registry mapping; preserve facts |
| `packages/control-plane/src/application/ports/agent-adapter.ts` | native adapter contract | add source identity while retaining exact prepare/start/observe/abort shapes | application boundary | adapter signature drift | adapter contract tests、typecheck | keep old adapter implementation behind composition root |
| `packages/control-plane/src/application/ports/scheduler.ts` | backend-neutral scheduler contract | `AgentSchedulerPort` → `SchedulerPort` and `ScheduleReceipt` | application boundary | external/cancel correlation loss | scheduler contract and cancel tests | retain Orca backend mapping |
| `packages/control-plane/src/domain/agent.ts` | Agent descriptor/snapshot facts | source-scoped identity and typed evidence collection | domain facts | evidence overclaim or privacy leak | domain serialization and evidence validation tests | revert projection only; never delete facts |
| `packages/control-plane/src/domain/schedule.ts` | schedule/receipt facts | replace Orca receipt shape with generic receipt and opaque cancellation ref | domain/application facts | historical automation correlation loss | migration/round-trip/correlation tests | map back with `backendId='orca'` |
| `packages/control-plane/src/application/ports/schedule-repository.ts` | schedule persistence port | source/provider/mode fields flow through save/find/list | persistence boundary | identity lost on restart | repository contract and dual-read tests | retain old projection during compatibility version |
| `packages/control-plane/src/adapters/sqlite/schedule-repository.ts` | SQLite schedule repository | serialize `source_id`, `provider_id`, and `mode`; materialize unknown reason deterministically | persistence adapter | source collision or malformed legacy row | SQLite schedule round-trip/migration tests | stop cutover; preserve old schedule row |
| `packages/control-plane/src/application/agent-registry.ts` | registry implementation | `AgentAdapterRegistry.get/register(AgentKey)` and conflict handling | application composition | agentId-only lookup collision | registry conflict and propagation tests | restore old lookup behind composition root |
| `packages/control-plane/src/domain/dispatch-operation.ts` | dispatch lifecycle facts | replace bare automation ID with external ID + backend/source identity | domain facts | cross-backend receipt association | lifecycle and invariant tests | dual-read old automation column |
| `packages/control-plane/src/application/ports/dispatch-repository.ts` | dispatch persistence port | expose generic receipt persistence and correlation queries | persistence boundary | repository/application mismatch | repository contract tests | retain old method only during dual-read window |
| `packages/control-plane/src/adapters/clients/agent-adapters.ts` | adapter composition root | propagate `AgentKey` to lookup/probe/prepare/start/observe and reject duplicate registration | process/runtime boundary | source identity dropped mid-lifecycle | adapter registry and lifecycle contract tests | omit conflicting/unverified adapter |
| `packages/control-plane/src/adapters/sqlite/dispatch-repository.ts` | SQLite repository | serialize typed evidence, source/backend IDs and generic receipt fields | persistence adapter | malformed backfill or duplicate receipt | SQLite round-trip/migration tests | stop cutover; preserve old columns |
| `packages/control-plane/migrations/0004_agent_scheduling.sql` | schema history | add nullable generic columns, indexes and compatibility fields | database schema | destructive migration | expand/backfill/rollback fixture | old schema remains readable |
| `packages/control-plane/src/adapters/sqlite/store.ts` | SQLite migration runner | run staged migration and verify backfill before cutover | database runtime | partial migration | migration gate command | abort transaction and leave original DB |
| `packages/control-plane/src/cli/index.ts` and `packages/control-plane/src/cli/render.ts` | CLI projection | expose source/provider/backend/mode/external ID/unknownReasons without raw evidence | user-visible contract | misleading support or completion status | CLI snapshots and integration tests | preserve old fields during dual-read |
| `packages/control-plane/src/adapters/orca/` | Orca source/backend adapter | implement generic ports while isolating Orca argv/JSON/side effects | external integration | Orca CLI regression | provider/scheduler contracts and dry-run | disable adapter; no real automation side effect |
| `work/records/2026-08-31-orca-agent-scheduling/orca-provider-matrix.json` | current acceptance evidence | regenerate as source/backend-aware matrix v2 | acceptance evidence | evidence borrowed across rows | matrix consistency tests | regenerate; never hand-upgrade support |

## Acceptance criteria

- application ports 不再引用 `OrcaAgentProviderPort` 或 `OrcaAutomationReceipt` 作为通用合同。
- v1 所有 descriptor、snapshot、schedule、dispatch 和 adapter lookup 都使用 `(sourceId, agentId)` 的 `AgentKey`；provider 与 backend 必须显式绑定。
- Orca provider/scheduler 仍能通过 adapter 提供现有功能，且 Orca-specific behavior 没有进入 domain。
- 任意未知 Agent descriptor 可以被注册、查询和投影；没有 adapter 或 probe 时所有未验证能力保持 `unknown`。
- Droid、Hermes 和未来 Agent 通过 `adapters/clients/agent-adapters.ts` 的 source+agent registry 注册，不需要修改调度核心。
- matrix 每行包含 agent、provider、source、backend、九阶段状态和 typed evidence collection。
- 矩阵测试拒绝跨 source/backend 借证据、discovery/probe 未知时的 downstream supported、无真实调度证据的 scheduling supported，以及缺少 external ID/correlation 的 dispatch supported。

### Reproducible verification gates

| gate | fixture / command | pass | fail / rollback |
|---|---|---|---|
| identity isolation | `bun test packages/control-plane/tests/contracts/agent-registry.test.ts packages/control-plane/tests/domain/agent.test.ts` with two-source/same-agent fixtures | both `AgentKey` rows remain queryable; same key conflict is typed and non-destructive | no overwrite; stop backfill and restore read path |
| evidence validation | `bun test packages/control-plane/tests/domain/agent.test.ts` with valid/invalid reference fixtures | valid source/backend-bound facts upgrade only their stage | invalid scheme, sensitive token, length or stage mismatch yields unknown/degraded |
| scheduler | `bun test packages/control-plane/tests/contracts/orca-scheduler.test.ts packages/control-plane/tests/application/scheduling.test.ts` with dry-run/apply fake backends | dry-run has no external call and null external ID; apply preserves external/backend/source/provider/target/trigger; cancel resolves `cancellationRef ?? externalId` | failed create produces no success receipt; dry-run side effect is a failure |
| unknown flow | `bun test packages/control-plane/tests/contracts/agent-registry.test.ts` with discovery-only Droid/Hermes records | descriptor visible, `unknownReasons` deterministic by stage, no false supported stage | missing probe/adapter never blocks listing or upgrades capability |
| lifecycle | `bun test packages/control-plane/tests/contracts/agent-adapter.test.ts packages/control-plane/tests/contracts/agent-adapters.test.ts` | prepare → start → observe → abort propagates one `AgentKey`, stage evidence is correlated | key mismatch or absent host executable is typed unknown, not a skipped success |
| matrix consistency | `bun test packages/control-plane/tests/contracts/orca-provider-matrix.test.ts` | no evidence reused across source/backend rows; schedule/dispatch and recovery closure explicit | reject matrix row and preserve previous evidence |
| persistence migration | `bun test packages/control-plane/tests/integration/agent-scheduling-sqlite.test.ts packages/control-plane/tests/contracts/sqlite-store.test.ts` on a disposable SQLite copy | schedule/dispatch source/provider/mode and old Orca receipt rows round-trip; expand/backfill/dual-read/rollback gates pass | any conflict aborts migration without deleting old columns/rows |

当前 Orca host gate 的确定性命令为：

```powershell
$orca = Get-Command orca -ErrorAction SilentlyContinue
if ($null -eq $orca) { exit 2 }
bun run packages/control-plane/src/cli/index.ts schedule create --help
if ($LASTEXITCODE -ne 0) { exit 1 }
```

exit 0 只证明 Orca CLI 与 control-plane help contract 可用；exit 1 是验证失败；exit 2 是 `UNKNOWN_HOST_UNAVAILABLE`，不能记为 pass 或 skipped。真实 native launch/real task 仍必须由具体 adapter 提供固定命令和结构化 evidence，当前设计不追认该证据。

## Resolved decisions and follow-ups

1. **Identity resolved**：v1 使用 `AgentKey = { sourceId, agentId }`；`agentId` 保持 source-local stable ID，不生成第二套 descriptor ID。相同 key 的重复 discovery 必须走 typed conflict，不得覆盖已有事实。
2. **Provider mapping resolved**：`providerId` 是 descriptor/source 显式提供的外部 identity；backend 使用 source+agent+provider 绑定，禁止按名称推断。
3. **Cancellation resolved**：`ScheduleReceipt.cancellationRef` 为 nullable opaque token；cancel 使用 `cancellationRef ?? externalId`，application 不解释 token。
4. **Plugin loading follow-up**：v1 只使用 `adapters/clients/agent-adapters.ts` 静态 composition registry；manifest/dynamic discovery 是后续独立设计，不阻塞本次批准。
5. **Adapter ownership follow-up**：adapter 可以在本仓或独立 Agent package 中实现，但必须通过同一 source+agent registry 注册；Droid/Hermes 未有真实 adapter 前保持 unknown。

## Action items

- [ ] Repository owner review and approve this design before implementation.
- [ ] After approval, write a task-sized implementation plan with migration order and rollback gates.
- [ ] During implementation, run the symbol-aware inventory and lock the complete caller list before renames.
- [ ] During implementation, add source/backend/evidence fixtures before changing support-level projection.
