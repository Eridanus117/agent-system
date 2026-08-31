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
  | 'discovery-timeout'
  | 'probe-unavailable'
  | 'probe-failed'
  | 'probe-timeout'
  | 'retry-exhausted'
  | 'adapter-unregistered'
  | 'backend-unregistered'
  | 'unsupported-source'
  | 'receipt-mismatch'
  | 'invalid-record'
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

export type AgentSourceErrorCode =
  | 'discovery-failed'
  | 'discovery-timeout'
  | 'probe-failed'
  | 'probe-timeout'
  | 'invalid-record'
  | 'identity-conflict';

export interface AgentSourceError {
  readonly code: AgentSourceErrorCode;
  readonly sourceId: AgentSourceId;
  readonly key?: AgentKey;
  readonly retryable: boolean;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly message: string;
}

export type SourceResult<T> =
  | { readonly status: 'complete'; readonly value: T; readonly attempts: number }
  | { readonly status: 'partial'; readonly value: T; readonly error: AgentSourceError; readonly attempts: number }
  | { readonly status: 'failed' | 'timeout'; readonly value: null; readonly error: AgentSourceError; readonly attempts: number };

export interface AgentSourcePort {
  readonly sourceId: AgentSourceId;
  discover(): Promise<SourceResult<readonly DiscoveryRecord[]>>;
  probe?(
    key: AgentKey,
    revision?: ConfigurationRevision,
  ): Promise<SourceResult<AgentCapabilitySnapshot>>;
}
```
完整事实类型和 Registry mutation 合同如下；它们是 application/domain 的编译时边界，不是对现有实现的描述：

```ts
export interface AgentDescriptor {
  readonly key: AgentKey;
  readonly sourceId: AgentSourceId;
  readonly agentId: AgentId;
  readonly providerId: string | null;
  readonly displayName: string;
  readonly evidence: readonly AgentEvidence[];
  readonly unknownReasons: UnknownReasons;
}

export interface AgentCapabilitySnapshot {
  readonly key: AgentKey;
  readonly sourceId: AgentSourceId;
  readonly agentId: AgentId;
  readonly level: SupportLevel;
  readonly stages: Readonly<Record<CapabilityStage, SupportLevel>>;
  readonly version: ObservedText;
  readonly capabilities: Readonly<Record<string, SupportLevel>>;
  readonly evidence: readonly AgentEvidence[];
  readonly observedAt: string;
  readonly unknownReasons: UnknownReasons;
}

export type RegistryMutationResult =
  | { readonly status: 'inserted' | 'updated' | 'merged' | 'unchanged'; readonly descriptor: AgentDescriptor }
  | { readonly status: 'conflict'; readonly error: 'duplicate-key' | 'identity-mismatch' | 'provider-mismatch' | 'migration-conflict' };

export interface AgentRegistry {
  list(): Promise<readonly AgentDescriptor[]>;
  get(key: AgentKey): Promise<AgentDescriptor | null>;
  probe(key: AgentKey, revision?: ConfigurationRevision): Promise<AgentCapabilitySnapshot>;
  adapter(key: AgentKey, backendId?: string): AgentAdapter | null;
  register(record: DiscoveryRecord): Promise<RegistryMutationResult>;
  upsert(record: DiscoveryRecord): Promise<RegistryMutationResult>;
  merge(record: DiscoveryRecord): Promise<RegistryMutationResult>;
}
```

`register` 只接受新 key；同 key 的 canonical record 重放返回 `unchanged`，不改变 evidence 顺序或未知 reason；属性或 provider 不一致返回 `conflict` 且不覆盖旧事实。`upsert` 允许同 key 的新 descriptor 更新可变 display/evidence，但 provider/source/agent 不一致仍 conflict；`merge` 只做按 normalized reference 去重的并集，结果按 `(kind, observedAt, reference)` 稳定排序。三者都以 `(sourceId, agentId)` 为幂等键；不同 source 的同名 Agent 不相互写入。`SourceResult.partial` 保留 value 并投影阶段 `unknown`/`degraded`；`failed`、`timeout` 在达到 `maxAttempts` 后 materialize 一个 unknown snapshot/descriptor，`retryable` 只允许 source wrapper 按固定上限重试，不把中间 attempt 当成 supported 证据；`retry-exhausted` 只在最后一次失败投影。

`AgentRegistry` 的 discover orchestration 先 materialize `SourceResult.value`，逐条调用 `register`，再将 `error.code` 映射到 `unknownReasons.discovery`；`probe` 缺失、partial、failed、timeout 分别映射 `probe-unavailable`、`probe-failed`/`probe-timeout`，并返回带相同 key 的 snapshot。除 typed `RegistryMutationResult` 和 `SourceResult` 外，未知/失败不得通过抛出普通 `Error` 隐藏；unexpected programmer error 才中止 orchestration。`register/upsert/merge` 在持久化失败时返回 typed `identity-mismatch` 或 `migration-conflict`，并保证事务不提交部分事实。

代码状态：上述类型、source result 和 Registry mutation API 尚未在代码中实现；当前 `packages/control-plane/src/application/ports/agent-registry.ts:5-14` 仍是 AgentId-only 且依赖 `OrcaAgentProviderPort`，`src/application/agent-registry.ts:6-38` 仍直接调用 Orca provider，`src/adapters/orca/agent-provider.ts:37-53` 仍按 AgentId 存储。

v1 明确采用 `sourceId + agentId` 作为 Registry 复合身份。`agentId` 在 source 内稳定，`sourceId` 标识发现/探测证据来源；同名 Agent 由不同 source 报告时是两个独立的 `AgentKey`，不得互相覆盖。`AgentDescriptor` 和 `AgentCapabilitySnapshot` 必须携带 `sourceId`，`AgentRegistry.get`、`probe` 和 `adapter` 均接收 `AgentKey`；`adapter` 可额外接收 backendId 执行 allow-list 校验；`list` 返回 source-scoped descriptors。

`providerId` 是 source 暴露给外部 backend 的 token，可以与 `agentId` 不同。Source 必须在 descriptor 中显式声明 `providerId`；只有 source 明确声明两者相等时才允许复用 `agentId`。若 source 只提供 Agent ID，provider binding 保持 `unknown`，不得创建 scheduling/dispatch supported 事实。Orca `--provider` 使用该显式 `providerId`，application 不自行猜测映射。

`AgentRegistry` 依赖一个或多个 `AgentSourcePort`，并独立持有 optional adapter registry。`OrcaAgentProvider` 只在 adapter 目录实现通用 source port，不能出现在 application 的通用 port 文件中。

同一 `AgentKey` 的重复 descriptor、providerId 不一致或 snapshot identity 不一致都返回 typed conflict/unknown；不同 `AgentKey` 的同名 Agent 不冲突。

### 2. Evidence collection

证据不是三个自由字符串，而是按阶段定义的受控事实：

```ts
export type AgentEvidence =
  | { readonly kind: 'discovery'; readonly operationId: null; readonly sourceId: AgentSourceId; readonly agentKey: AgentKey; readonly providerId: string | null; readonly backendId: string | null; readonly reference: string; readonly observedAt: string }
  | { readonly kind: 'probe'; readonly operationId: null; readonly sourceId: AgentSourceId; readonly agentKey: AgentKey; readonly providerId: string | null; readonly backendId: string | null; readonly version: ObservedText; readonly capabilities: Readonly<Record<string, SupportLevel>>; readonly reference: string; readonly observedAt: string }
  | { readonly kind: 'assembly'; readonly operationId: string; readonly sourceId: AgentSourceId; readonly agentKey: AgentKey; readonly providerId: string | null; readonly backendId: string | null; readonly manifestHash: string; readonly materializedFiles: readonly string[]; readonly reference: string; readonly observedAt: string }
  | { readonly kind: 'launch'; readonly operationId: string; readonly sourceId: AgentSourceId; readonly agentKey: AgentKey; readonly providerId: string | null; readonly backendId: string | null; readonly executable: string; readonly version: string; readonly processReference: string; readonly outcome: 'started' | 'failed' | 'unknown'; readonly reference: string; readonly observedAt: string }
  | { readonly kind: 'schedule'; readonly operationId: string; readonly sourceId: AgentSourceId; readonly backendId: string; readonly agentKey: AgentKey; readonly providerId: string; readonly externalId: string | null; readonly dryRun: boolean; readonly reference: string; readonly observedAt: string }
  | { readonly kind: 'dispatch'; readonly operationId: string; readonly sourceId: AgentSourceId; readonly backendId: string; readonly agentKey: AgentKey; readonly providerId: string; readonly externalId: string; readonly reference: string; readonly observedAt: string }
  | { readonly kind: 'observation'; readonly operationId: string; readonly sourceId: AgentSourceId; readonly agentKey: AgentKey; readonly providerId: string | null; readonly backendId: string | null; readonly outcome: 'succeeded' | 'degraded' | 'failed' | 'incomplete' | 'unknown'; readonly cleaned: boolean; readonly reference: string; readonly observedAt: string }
  | { readonly kind: 'recovery'; readonly operationId: string; readonly sourceId: AgentSourceId; readonly agentKey: AgentKey; readonly providerId: string | null; readonly backendId: string | null; readonly externalId: string | null; readonly cancellationRef: string | null; readonly retryOperationId: string | null; readonly action: 'cancel' | 'timeout' | 'failure' | 'retry' | 'unknown'; readonly closed: boolean; readonly reference: string; readonly observedAt: string };
```
```ts
export type EvidenceValidationErrorCode =
  | 'invalid-reference'
  | 'sensitive-reference'
  | 'duplicate-evidence'
  | 'ownership-conflict'
  | 'stage-cardinality'
  | 'stage-dependency'
  | 'receipt-mismatch'
  | 'revoked-scheme';

export interface EvidenceValidationError {
  readonly code: EvidenceValidationErrorCode;
  readonly message: string;
  readonly reference?: string;
  readonly operationId?: string;
}

export type EvidenceValidationResult =
  | { readonly status: 'accepted'; readonly evidence: AgentEvidence }
  | { readonly status: 'rejected'; readonly error: EvidenceValidationError; readonly projectedStage: 'unknown' | 'degraded' };

export interface EvidenceBinding {
  readonly sourceId: AgentSourceId;
  readonly agentKey: AgentKey;
  readonly providerId: string | null;
  readonly backendId: string | null;
  readonly kind: AgentEvidence['kind'];
  readonly operationId: string | null;
}

export type ReferenceValidationResult =
  | { readonly status: 'accepted'; readonly reference: string }
  | { readonly status: 'rejected'; readonly error: EvidenceValidationError };

export interface EvidenceReferenceRegistry {
  register(
    sourceId: AgentSourceId,
    scheme: string,
    validate: (reference: string) => boolean,
  ): { readonly status: 'registered' | 'unchanged' | 'conflict'; readonly error?: EvidenceValidationError };
  revoke(sourceId: AgentSourceId, scheme: string): { readonly status: 'revoked' | 'already-revoked' | 'unknown-scheme' };
  normalize(reference: string, binding: EvidenceBinding): ReferenceValidationResult;
  validate(reference: string, binding: EvidenceBinding): ReferenceValidationResult;
}

export interface EvidenceValidator {
  validate(
    evidence: AgentEvidence,
    context: {
      readonly expected: EvidenceBinding;
      readonly existing: readonly AgentEvidence[];
      readonly stageLevels: Readonly<Record<CapabilityStage, SupportLevel>>;
    },
  ): EvidenceValidationResult;
}

export interface RecoveryValidator {
  validate(input: {
    readonly recovery: Extract<AgentEvidence, { readonly kind: 'recovery' }>;
    readonly receipt: ScheduleReceipt;
    readonly dispatch?: Extract<AgentEvidence, { readonly kind: 'dispatch' }>;
    readonly retryReceipt?: ScheduleReceipt;
  }): EvidenceValidationResult;
}

export interface AgentEvidenceCollectorPort {
  collect(input: {
    readonly key: AgentKey;
    readonly providerId: string | null;
    readonly backendId: string | null;
    readonly operationId: string | null;
    readonly kind: AgentEvidence['kind'];
    readonly result: unknown;
    readonly referenceParts: readonly string[];
    readonly observedAt: string;
  }): Promise<EvidenceValidationResult>;
}
```
`EvidenceReferenceRegistry` 的 scheme 注册以 `(sourceId, scheme)` 幂等；重复注册相同 validator 返回 `unchanged`，不同 validator 返回 `conflict`。`revoke` 立即拒绝后续 normalize/validate，历史已接受 fact 不删除，只能在下一次投影中标记 `evidence-invalid`。normalize 的 accepted reference 是唯一可写入 fact 的 canonical 值；任何 rejected 结果都必须保留错误码和 projected stage。

`EvidenceValidator` 校验 binding 的 source/agent/provider/backend/kind/operationId 完全一致；同一 normalized reference 在同一 operation 只能出现一次，且不得跨 operation、Agent、provider 或 backend 借用。discovery/probe 的 operationId 必须为 null；assembly 至 recovery 必须为非空 operationId。stage cardinality v1 为 discovery/probe 每 key 至多一条最新 fact、assembly/launch/observation/recovery 每 operation 至多一条终态 fact、schedule/dispatch 每 operation 至多一条成功 fact；重复写入返回 `duplicate-evidence`，不覆盖旧事实。

`RecoveryValidator` 对 cancel/timeout/failure/retry 都要求 recovery 与 receipt 的 operationId、AgentKey、backendId、providerId 完全相等；apply 还要求 dispatch fact 完全相等且 externalId 非空，recovery.externalId/cancellationRef 与 receipt 相等；dry-run 两者都必须为 null。`action='retry'` 还要求 `retryOperationId` 非空、`retryReceipt` 存在且与原 receipt 同 key/backend/provider、`retryReceipt.operationId !== receipt.operationId`；缺少 retryReceipt、任一比较失败或 receipt 不存在均返回 `receipt-mismatch`，closure 只能 unknown。retry 是 v1 recovery substage，不新增 evidence kind。

application 负责调用 `AgentEvidenceCollectorPort`：adapter lifecycle 不直接拼 evidence；collector 为每次 prepare/start/observe/abort/retry 生成 operation-scoped reference、observedAt 和 typed fact，并原子调用 `EvidenceValidator`。collector 返回 rejected 时，application 必须把对应阶段投影为 unknown/degraded 并保留错误，禁止继续写 supported。adapter 方法的 throw/timeout 由 application 捕获为 typed lifecycle failure，再交 collector 生成 `outcome='failed'|'unknown'` 的 launch/observation/recovery fact；collector failure 本身不得被吞掉。

代码状态：上述 EvidenceValidator、RecoveryValidator、EvidenceReferenceRegistry 扩展和 AgentEvidenceCollectorPort 尚未在代码中实现；当前 `packages/control-plane/src/application/ports/agent-adapter.ts:7-38` 的 lifecycle 输出仍不携带 typed evidence。

校验合同：

- `sourceId`、`backendId`、`providerId`、ID、`operationId` 和 `manifestHash` 使用小写 ASCII 标识符或既有 domain validator；长度上限 128。`observedAt` 必须是 RFC3339 UTC 时间戳，且同一 operation 的 evidence 时间不得倒退。
- `reference` 由 `EvidenceReferenceRegistry` 校验并返回 canonical normalized string：source 注册 scheme、最大长度 256、大小写归一化、禁止 `prompt`、`credential`、`secret`、`transcript`、`environment`、动态任务正文和等号注入；未知、已撤销 scheme、非法格式或越界长度拒绝。
- `EvidenceValidator` 负责 typed fact 的 `AgentKey`、providerId、evidence kind、operationId、stage cardinality 和 uniqueness；同一 normalized reference 只能归属于同一 operation 和完全相同的 source/agent/provider/kind/backend binding，不能跨 operation、Agent、provider 或 backend 借用。
- 一个 `supported` 阶段至少需要一个同 source/AgentKey 的对应 typed fact；`providerId` 对任何 supported stage 必须非空，`backendId` 对 scheduling、dispatch、observation、recovery、closure 必须非空，discovery/probe/assembly/launch 的 backendId 可为 null。
- `launch` 必须同时有 executable、version、processReference 和 started outcome；`observation` 必须有终态与 `cleaned: true`；`recovery` 必须有 action、operationId、`closed: true`。cancel/timeout/failure 复用 receipt 的 externalId/cancellationRef；retry 还必须有 retryOperationId 和 retry receipt。
- recovery 的精确 receipt 关联、dry-run/apply 差异和 retry 规则以 `RecoveryValidator` 为唯一裁判；任一比较失败或 receipt 不存在，closure 只能为 unknown 并写 `identity-conflict` 或 `receipt-mismatch`。
- `scheduling: supported` 必须有同 binding 的 dry-run schedule fact 或真实 dispatch fact；`dispatch: supported` 必须有 externalId、operationId 和 backend 绑定。
- 任意非法/缺失/冲突证据只将对应阶段降为 `unknown` 或 `degraded`，不得升级其他阶段；`unknownReasons` 对 unknown/degraded 必须非空，对已验证阶段必须为 null。

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
  | 'backend-unregistered'
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

`OrcaScheduler` 只接受 `input.sourceId === 'orca'`；其他 source 返回 typed `unsupported-source`，不执行外部调用。Orca argv 的 `--provider` 必须使用 intent 的显式 `providerId`，不得使用 `agentId`。对 Orca intent，它把 `automationId`、Orca JSON、Orca flags 和 cancellation confirmation 限制在 adapter 内部；`apply` 模式将 `automationId` 映射为非空 `externalId`，`dry-run` 模式只验证 argv/JSON 并返回 `externalId: null`、`cancellationRef: null`，同时写入 `dryRun: true` 的 schedule evidence。application 只处理通用 receipt，不解析 Orca 字段。
`SchedulerPort.create` 的 unsupported/legacy/identity failures reject typed `SchedulerError`；backend failures也 reject该错误。`cancel` 仅在 backend error 时 reject；missing cancellation reference 由 `CancellationResult` 显式返回，不吞掉错误。
`cancel` 对 dry-run receipt 是无外部副作用且 `outcome: 'closed'` 的闭合操作；对 apply receipt 使用 `cancellationRef ?? externalId`，两者都为空时返回 `{ outcome: 'missing-cancellation-reference', externalCall: false }`。application 不解释 opaque cancellation token。
`SchedulerPort.cancel` 先校验 `receipt.backendId === this.backendId`；Orca implementation 还要求 `receipt.agentKey.sourceId === 'orca'`，否则 reject `{ code: 'unsupported-source' }` 且 `externalCall` 不发生。其他 backend 按自己的 source allow-list 执行同一 binding check。
`SchedulerPort.create` 还必须满足可重复的 receipt invariant：除 `operationId`、`externalId`、`cancellationRef`、`createdAt` 外，receipt 的 `agentKey`、`providerId`、`target` 和 `trigger` 与 input 完全相等，`receipt.backendId === this.backendId`，并且 evidence 至少包含同 binding 的 schedule 或 dispatch fact。任何不满足都返回 typed `identity-conflict`，不得写入成功 receipt。没有已注册 backend 时返回 `backend-unregistered`，不得把 adapter-unregistered 投影到 scheduling/dispatch。


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

迁移必须按 expand → backfill → verify → cutover 顺序执行。**不得修改已应用的 `0004_agent_scheduling.sql` 内容或 checksum**：当前数据库已记录 version 4 后，改写该文件会触发 checksum mismatch。新增 `0005_agent_runtime_neutral.sql`（version 5）承载 nullable 通用列、索引、evidence/unknown reason 字段及 backfill；新库仍按 0001→0005 顺序执行，已有 v4 库只执行 v5。先在 disposable copy 上回填所有历史 Orca 行，再通过 round-trip、target/trigger correlation、appendReceipt 幂等、cancel lookup、失败重试、v4 checksum 保持和 dual-read 验证；读路径切换后至少保留一个版本的 dual-read。任何冲突停止 v5 并保留原数据库；回滚只回退读写代码，不删除 v5 新列、旧列或历史事实。

### 4. Agent adapter plugin boundary

adapter contract 继续保留现有 lifecycle 字段，并显式增加统一 binding；`backendId` 不由 adapter 根据 agentId/providerId 猜测：
```ts
export interface AgentAdapterInput {
  readonly key: AgentKey;
  readonly backendId: string;
  readonly operationId: string;
  readonly revision: ConfigurationRevision;
  readonly forwardedArgs?: readonly string[];
}

export interface AgentProbeInput {
  readonly key: AgentKey;
  readonly backendId?: string;
  readonly revision?: ConfigurationRevision;
}

interface AgentAdapter {
  readonly sourceId: AgentSourceId;
  readonly agentId: AgentId;
  readonly backendAllowList: readonly string[];
  probe(input: AgentProbeInput): Promise<AgentCapabilitySnapshot>;
  prepare(input: AgentAdapterInput): Promise<PreparedActivation>;
  start(input: AgentAdapterInput & { readonly prepared: PreparedActivation }): Promise<StartedProcess>;
  observe(input: AgentAdapterInput & { readonly started: StartedProcess }): Promise<ObservedLaunch>;
  abort?(input: AgentAdapterInput & { readonly prepared: PreparedActivation; readonly started?: StartedProcess }): Promise<void>;
}

export interface AgentSourceRegistration {
  readonly sourceId: AgentSourceId;
  readonly owner: string;
  readonly source: AgentSourcePort;
  readonly backendAllowList: readonly string[];
}

export interface AgentSourceRegistry {
  get(sourceId: AgentSourceId): AgentSourceRegistration | null;
  register(registration: AgentSourceRegistration):
    | { readonly status: 'registered' | 'unchanged' }
    | { readonly status: 'conflict'; readonly reason: 'duplicate-source' | 'ownership-mismatch' | 'allow-list-mismatch' };
}

export type AdapterRegistrationResult =
  | { readonly status: 'registered' | 'unchanged' }
  | { readonly status: 'conflict'; readonly reason: 'duplicate-key' | 'identity-mismatch' | 'source-unregistered' | 'backend-not-allowed' };

interface AgentAdapterRegistry {
  get(key: AgentKey, backendId?: string): AgentAdapter | null;
  register(adapter: AgentAdapter): AdapterRegistrationResult;
}
```
每个 source registration 的 `owner` 是唯一维护边界；同一 sourceId 的重复 registration 只有完全相同 owner/source/allow-list 才 `unchanged`，否则 conflict。adapter 只有在 source 已注册、`AgentKey` 完全一致且 `backendAllowList` 是 source allow-list 的子集时才可注册；lookup 先按 key 再校验 backend allow-list，禁止用 agentId 或 providerId 猜测 adapter。

`AgentAdapterInput` 保留现有 `revision`、`forwardedArgs` 及既有 `PreparedActivation`/`StartedProcess`/`ObservedLaunch` 字段；v1 仅新增必填 `key`、`backendId` 和 `operationId`。`AgentProbeInput.backendId` 可选：省略时 probe 只产生 operationId 为 null 的 source evidence；提供时必须命中 `backendAllowList`。prepare/start/observe/abort 的 `backendId` 必须与选定 `SchedulerPort.backendId` 及对应 `MatrixRow.backendId` 完全相等，providerId 只由 descriptor/intent 绑定并交给 collector，不由 adapter 推断。

application 的 adapter lifecycle 不负责持久化 evidence，而由 §2 的 `AgentEvidenceCollectorPort` 负责；每次 prepare/start/observe/abort 调用都必须带同一 key、operationId 和选定 backend，collector 用返回的 manifest/process/outcome 生成 canonical reference、observedAt 和 typed fact。adapter throw/timeout 由 application 转为 typed lifecycle failure 后交 collector，不得以普通成功返回替代。

代码状态：上述 source registry、backend allow-list、key-aware adapter registry 和 evidence collector 尚未在代码中实现；当前 `packages/control-plane/src/adapters/clients/agent-adapters.ts:191-199` 仍是 `Map<AgentId, AgentAdapter>`，OMP/Claude 实现仍在 `:123-189`，没有 sourceId、Droid 或 Hermes adapter。
目录边界以当前 composition root 为准：

```text
packages/control-plane/src/adapters/clients/
  agent-adapters.ts              # source/agent registry 与静态 composition root
  <source>/<agent>-adapter.ts    # 真实 adapter 实现，按需创建
```

source ownership 约定：Droid 的 source registration 归 `adapters/clients/droid/`，Hermes 归 `adapters/clients/hermes/`；各自必须声明唯一 sourceId、owner 和 backend allow-list，并通过 `agent-adapters.ts` 注册。Droid/Hermes 只有在实现具体 adapter、固定 provider binding、backend allow-list 和宿主验证命令后才可从 deferred 变为 supported；目录可以不存在，不用空 stub 伪造支持。未知 Agent descriptor 不要求对应文件存在。



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
  -> SourceResult<DiscoveryRecord[]> (complete | partial | failed | timeout)
  -> AgentRegistry.register/upsert/merge (AgentKey 幂等)
  -> source-scoped descriptor registered
  -> optional source.probe()
  -> optional adapter lookup
  -> capability projection
```
`DiscoveryRecord` 至少包含 `sourceId` 和 source-local `agentId`；`displayName`、`providerId` 和 evidence 在 record 中可选，materialize descriptor 时缺省为 agentId、null 和空集合。任何 supported 或 scheduling/dispatch projection 都必须有 providerId。`unknownReasons` 是唯一的 reason 表示，按 stage 存储，不做全局单值覆盖：source 只有 Agent ID 时写 `discovery: 'source-only-discovery'`；probe 能力缺失/失败/超时时写 `probe-unavailable`/`probe-failed`/`probe-timeout`；非法 record 写 `discovery: 'invalid-record'`；重试达到 `maxAttempts` 时写 `retry-exhausted`；adapter 不存在时只写 assembly/launch/observation/recovery/closure 对应的 `adapter-unregistered`；证据或 identity 冲突只写冲突所在 stage。Registry 创建的最小 descriptor 与 snapshot 使用相同 map，不因缺少 adapter 抛出系统级 unsupported 错误。若 backend 未注册，scheduling/dispatch 使用 `backend-unregistered`，不得使用 `adapter-unregistered`。


SourceResult 的 `partial` 记录保留已发现 records，并把 source error 投影到受影响 stage；`failed`/`timeout` 不产生虚假 Agent，只对已有 key 保留 descriptor 并更新 reason。重试由 source wrapper 负责，attempt 计数必须单调递增；任何中间 attempt 不进入 evidence collection。

### 6. Matrix schema

```ts
export interface MatrixRow {
  readonly schemaVersion: 2;
  readonly rowKey: string; // `${sourceId}/${agentId}/${providerId ?? '-'}/${backendId ?? '-'}`
  readonly agentKey: AgentKey;
  readonly sourceId: AgentSourceId;
  readonly agentId: AgentId;
  readonly providerId: string | null;
  readonly backendId: string | null;
  readonly stages: Readonly<Record<CapabilityStage, SupportLevel>>;
  readonly reasons: UnknownReasons;
  readonly evidence: readonly AgentEvidence[];
}

export interface MatrixValidationError {
  readonly code: 'invalid-row-key' | 'identity-mismatch' | 'stage-dependency' | 'evidence-mismatch' | 'missing-reason' | 'backend-required';
  readonly message: string;
}

export interface MatrixValidator {
  validate(row: MatrixRow): { readonly status: 'accepted' } | { readonly status: 'rejected'; readonly errors: readonly MatrixValidationError[] };
}
```

`rowKey` 由 canonical lowercase `sourceId/agentId/providerId/backendId` 生成，`-` 只表示 null；它是矩阵幂等键。`backendId: null` 只允许 discovery/probe/assembly/launch 行，且 scheduling、dispatch、observation、recovery、closure 必须为 `unknown` 并写 `backend-unregistered`；一旦任一 runtime stage 有 backend evidence，backendId 必须非空。每个 row 的 `agentKey.sourceId === sourceId`、`agentKey.agentId === agentId`，provider/backend 和所有 evidence binding 必须逐字段相等。

```json
{
  "schemaVersion": 2,
  "rowKey": "example-source/droid/-/example-backend",
  "agentKey": { "sourceId": "example-source", "agentId": "droid" },
  "sourceId": "example-source",
  "agentId": "droid",
  "providerId": null,
  "backendId": "example-backend",
  "stages": {
    "discovery": "unknown",
    "probe": "unknown",
    "assembly": "unknown",
    "launch": "unknown",
    "scheduling": "unknown",
    "dispatch": "unknown",
    "observation": "unknown",
    "recovery": "unknown",
    "closure": "unknown"
  },
  "reasons": {
    "discovery": "source-only-discovery",
    "probe": "probe-unavailable",
    "assembly": "adapter-unregistered",
    "launch": "adapter-unregistered",
    "scheduling": "backend-unregistered",
    "dispatch": "backend-unregistered",
    "observation": "adapter-unregistered",
    "recovery": "adapter-unregistered",
    "closure": "adapter-unregistered"
  },
  "evidence": []
}
```

上面是**字段形状示例**，不是 Droid 已发现或已支持的事实。空 `evidence` 只能与 `unknown` 状态共存。

矩阵约束：

1. `discovery` 或 `probe` 为 `unknown` 或 `unsupported` 时，assembly、launch、observation、recovery、scheduling、dispatch 均不能为 `supported`。
2. `scheduling: supported` 必须拥有与同一 source/backend/agent/provider 绑定的真实 dry-run schedule 或 dispatch evidence；没有 backend 使用 `backend-unregistered`。
3. `launch: supported` 必须有宿主 executable、版本和真实启动 evidence。
4. `observation: supported` 必须有启动终态、观察结果和清理 evidence。
5. `recovery: supported` 必须有失败、取消、超时或 retry 的收口 evidence。
6. `dispatch: supported` 必须有 backend external ID、operation correlation 和 dispatch evidence。
7. source/backend 变更必须产生独立 row，禁止跨 backend 借用 evidence 升级状态。
8. 任一阶段为 `unknown` 或 `degraded` 时 `reasons[stage]` 必须是 `UnknownReason`；已验证阶段为 null；`closure: supported` 还必须有 recovery fact 的 `closed: true`。


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

每个 gate 必须输出 `{ sourceId, agentKey, providerId, backendId, operationId, status, evidenceRefs, unknownReasons }`；`status` 只能是 `PASS`、`BLOCKED` 或 `DEFERRED`。`DEFERRED` 只表示设计允许但当前没有真实 adapter/host，不能计入 supported 或 APPROVE；`BLOCKED` 表示本应执行的 gate 缺少命令、receipt 或关联证据。九项不能由 discovery/probe 的成功替代；每项必须关联同一 `AgentKey`，providerId 对 supported stage 非空，backendId 只对 scheduling/dispatch/observation/recovery/closure 强制非空。

其中 `scheduling` 覆盖 create/dry-run/cancel contract，`dispatch` 覆盖 external ID 与 operation correlation；`cancel/retry closure` 必须由 `kind: 'recovery'` 的 action、operationId、`closed: true`、externalId/cancellationRef、retryOperationId（retry 时）和关联 receipt/dispatch evidence 覆盖。`RecoveryValidator` 是唯一裁判；receipt 缺失、identity 不匹配、retry receipt 缺失或 collector rejected 都是 BLOCKED/unknown，不能手工改成 PASS。

“Orca 接受 provider ID”“adapter 合同测试通过”“dry-run argv 正确”只证明对应的 contract 层，不能替代 native launch 或 real task evidence。真实 adapter 必须在接入时注册固定 host command，并将输出交给 `AgentEvidenceCollectorPort`；没有真实 Droid/Hermes adapter 时，Droid/Hermes launch/observation/recovery/closure gate 明确为 `DEFERRED`，若验收要求真实运行则为 `BLOCKED`，不得伪造通过。


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

- source discovery 返回 `partial`：保留已返回 rows，返回 typed source error，并只把受影响 key 的 discovery reason 投影为 `discovery-failed`/`discovery-timeout`；`failed`/`timeout` 且无 rows 时不自动创建 Agent。达到 maxAttempts 后追加 `retry-exhausted`，不生成 supported evidence。
- probe 缺失、partial、failed 或 timeout：snapshot 与 descriptor 保持 source identity，分别写 `probe-unavailable`、`probe-failed` 或 `probe-timeout`；重试中间态不写 evidence，不得继续执行需要 supported probe 的流程。
- adapter 缺失：descriptor 可查询，assembly/launch/observation/recovery/closure 为 `unknown`，对应 reason 为 `adapter-unregistered`；scheduling/dispatch 若 backend 也不存在，使用 `backend-unregistered`，不得混用。
- scheduler backend 失败：不产生成功 receipt；application 记录 `unknownReasons.scheduling='backend-failed'` 或 `unknownReasons.dispatch='backend-failed'`。
- unsupported source 或 legacy schedule：分别写 `unknownReasons.scheduling='unsupported-source'` 或 `'legacy-schedule-unverified'`，不得调用外部 backend。
- cancel backend 失败：写 `unknownReasons.recovery='cancel-failed'`，不伪造 closure；retry receipt 缺失或 recovery validator 拒绝时写 `receipt-mismatch` 对应的 unknown。
- receipt backend/source/agent/target 不匹配：拒绝关联，保持 `incomplete` 或 `unknown`，写 `unknownReasons.dispatch='identity-conflict'`。
- evidence collector 或 observation/recovery 证据缺失：保留 typed failure，不得把 `dispatched` 提升为 `succeeded`；collector 自身失败不得被吞掉。

## Migration and compatibility

迁移顺序和门禁固定如下：

1. **Inventory gate**：用 symbol-aware references 盘点 `OrcaAgentProviderPort`、`OrcaAutomationReceipt`、`OrcaAutomationReceipt.sourceEvidence`、`DispatchOperation.automationId` 及所有单值 evidence caller；未完成盘点不得改名。
2. **Version gate**：验证现有 `0004_agent_scheduling.sql` 的内容和 checksum 不变；任何已应用 v4 的数据库不得通过编辑 0004 迁移。v5 只能由新增 `0005_agent_runtime_neutral.sql` 承载。
3. **Expand gate**：在 v5 新增 `AgentKey`、通用 ports/receipt、nullable SQLite columns、source/backend indexes 和兼容 projection；旧 Orca columns 保持可读。
4. **Backfill gate**：所有 `agent_schedule` 行先写入 `source_id='orca'`；只有 Orca descriptor 明确声明 `providerId === agentId` 时才回填 `provider_id=agent_id`，否则 provider 保持 unknown。随后从关联 schedule 复制 source/provider 到 `dispatch_operation`，再回填所有历史 Orca receipt/dispatch 行的 `backend_id='orca'`、`external_id=automation_id`、`provider_id=receipt_provider`；`receipt_source_evidence` 按 operation/schedule join 仅在非空 automation ID 且元数据齐全、引用可校验时生成唯一 `kind='dispatch'` fact，其他值保留旧列并产生 `evidence-invalid` unknown。
5. **Verify gate**：执行 receipt round-trip、target/trigger correlation、appendReceipt 幂等、cancel lookup、失败重试、v4 checksum 保持、旧新列 dual-read 和矩阵一致性测试；任何冲突停止 v5 并保留原数据库。
6. **Cutover gate**：application、repository、SQLite store 和 CLI projection 改为新字段；写路径只写新列，读路径至少 dual-read 一个版本。
7. **Adapter gate**：`OrcaAgentProvider`/`OrcaScheduler` 实现通用 ports，Orca argv/JSON/side effects 仍封装在 `adapters/orca/`；`adapters/clients/agent-adapters.ts` 继续是静态 composition root。
8. **Evidence gate**：没有真实 evidence 的 Agent/backend 行保持 `unknown` 或 `degraded`；不得把既有 Orca evidence 借给其他 source/backend。
9. 不改 `openspec/specs/`，不改 `.orca/`，不删除已有 Orca 历史事实。

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
| `packages/control-plane/migrations/0004_agent_scheduling.sql` | immutable schema history | keep applied version-4 SQL/checksum byte-identical; never add v1 columns here | migration compatibility | checksum mismatch on existing DB | v4 checksum assertion in persistence migration gate | restore read path; do not rewrite v4 |
| `packages/control-plane/migrations/0005_agent_runtime_neutral.sql` | schema expansion/backfill | add nullable generic columns, indexes, evidence and unknown-reason projections | database schema | destructive migration | v5 expand/backfill/verify/rollback fixture | abort v5 staging copy; preserve v4 and old columns |
| `packages/control-plane/src/adapters/sqlite/store.ts` | SQLite migration runner | run staged migration and verify backfill before cutover | database runtime | partial migration | migration gate command | abort transaction and leave original DB |
| `packages/control-plane/src/cli/index.ts` and `packages/control-plane/src/cli/render.ts` | CLI projection | expose source/provider/backend/mode/external ID/unknownReasons without raw evidence | user-visible contract | misleading support or completion status | CLI snapshots and integration tests | preserve old fields during dual-read |
| `packages/control-plane/src/adapters/orca/` | Orca source/backend adapter | implement generic ports while isolating Orca argv/JSON/side effects | external integration | Orca CLI regression | provider/scheduler contracts and dry-run | disable adapter; no real automation side effect |
| `work/records/2026-08-31-orca-agent-scheduling/orca-provider-matrix.json` | current acceptance evidence | regenerate as source/backend-aware matrix v2 | acceptance evidence | evidence borrowed across rows | matrix consistency tests | regenerate; never hand-upgrade support |

## Acceptance criteria
- application ports 不再引用 `OrcaAgentProviderPort` 或 `OrcaAutomationReceipt` 作为通用合同。
- v1 所有 descriptor、snapshot、schedule、dispatch 和 adapter lookup 都使用 `(sourceId, agentId)` 的 `AgentKey`；provider 与 backend 必须显式绑定；register/upsert/merge 对重放幂等、对冲突不覆盖。
- Orca provider/scheduler 仍能通过 adapter 提供现有功能，且 Orca-specific behavior 没有进入 domain。
- 任意未知 Agent descriptor 可以被注册、查询和投影；没有 adapter 或 probe 时所有未验证能力保持 `unknown`，SourceResult 的 partial/failure/timeout/retry 投影保持 typed reason。
- Droid、Hermes 和未来 Agent 通过 `adapters/clients/agent-adapters.ts` 的 source+agent registry 注册，不需要修改调度核心；尚无真实 Droid/Hermes adapter 时只允许 `DEFERRED`/`BLOCKED`，不得记为 supported。
- MatrixRow 每行包含 canonical rowKey、AgentKey、source、nullable provider/backend、九阶段状态、UnknownReasons 和 typed evidence collection；MatrixValidator 拒绝 identity、依赖、reason、backend 或 evidence mismatch。
- 矩阵测试拒绝跨 source/backend/operation 借证据、discovery/probe 未知或 unsupported 时的 downstream supported、无真实调度证据的 scheduling supported，以及缺少 external ID/correlation 的 dispatch supported。

### Reproducible verification gates

每条命令都在仓库根目录执行；命令未实现前不能声称 pass。`PASS` 只表示对应 contract/fixture 的可重复结果；`DEFERRED` 表示没有真实 adapter/host，`BLOCKED` 表示该 gate 是验收必需但没有可执行命令或 receipt/evidence，二者都不能升级为 supported。

| gate | fixture / command | pass | fail / rollback |
|---|---|---|---|
| identity isolation | `bun test packages/control-plane/tests/contracts/agent-registry.test.ts packages/control-plane/tests/domain/agent.test.ts` with two-source/same-agent fixtures and register/upsert/merge replay | both `AgentKey` rows remain queryable; same-key replay is idempotent; conflict is typed and non-destructive | no overwrite; stop backfill and restore read path |
| source/probe projection | `bun test packages/control-plane/tests/contracts/agent-registry.test.ts` with complete/partial/failed/timeout and retry-exhausted fixtures | partial rows remain visible; typed errors and deterministic `unknownReasons` are preserved; no intermediate retry is evidence | keep last known descriptor; do not create unsupported Agent or supported stage |
| evidence validation | `bun test packages/control-plane/tests/domain/agent.test.ts` with valid/invalid, revoked-scheme, duplicate, cross-operation and sensitive-reference fixtures | accepted facts are canonical and operation-scoped; only their stage upgrades | invalid/duplicate/ownership/stage mismatch yields typed rejection and unknown/degraded |
| scheduler | `bun test packages/control-plane/tests/contracts/orca-scheduler.test.ts packages/control-plane/tests/application/scheduling.test.ts` with dry-run/apply fake backends | dry-run has no external call and null external ID; apply preserves receipt binding; missing backend returns `backend-unregistered` | failed create produces no success receipt; dry-run side effect is a failure |
| receipt-linked recovery | `bun test packages/control-plane/tests/contracts/orca-scheduler.test.ts packages/control-plane/tests/application/scheduling.test.ts` with apply/dry-run receipts plus cancel and retry receipts | `RecoveryValidator` accepts exact receipt/dispatch binding; cancel uses `cancellationRef ?? externalId`; retry requires distinct linked retry receipt and closes only the original operation | missing/mismatched receipt, token or retry receipt remains unknown; no closure claim |
| unknown flow | `bun test packages/control-plane/tests/contracts/agent-registry.test.ts` with discovery-only Droid/Hermes records | descriptor visible, reasons deterministic, no false supported stage; scheduling/dispatch use backend reason, never adapter reason | missing probe/adapter never blocks listing or upgrades capability |
| lifecycle + evidence collector | `bun test packages/control-plane/tests/contracts/agent-adapter.test.ts packages/control-plane/tests/contracts/agent-adapters.test.ts` | prepare → start → observe → abort propagates one `AgentKey`; application collector emits typed operation-scoped evidence | key mismatch, collector rejection or absent host executable is typed unknown, not skipped success |
| Droid/Hermes native lifecycle | `DEFERRED/BLOCKED: no command exists until a real adapter registers a fixed host command and evidence schema` | only after registration: fixed command returns launch/observation/recovery evidence and gate is PASS | before registration, launch/observation/recovery/closure remain DEFERRED (or BLOCKED when required); never fabricate evidence |
| matrix consistency | `bun test packages/control-plane/tests/contracts/orca-provider-matrix.test.ts` with MatrixRow/rowKey and cross source/backend/operation fixtures | MatrixValidator accepts only matching bindings; schedule/dispatch/recovery/retry closure are explicit | reject row and preserve previous evidence |
| persistence migration | `bun test packages/control-plane/tests/integration/agent-scheduling-sqlite.test.ts packages/control-plane/tests/contracts/sqlite-store.test.ts` on a disposable v4 SQLite copy | v4 checksum is unchanged; v5 expand/backfill/dual-read/round-trip/rollback pass without deleting old rows/columns | any conflict aborts v5 staging migration and leaves original v4 database |

当前 Orca host gate 的确定性命令为：

```powershell
$orca = Get-Command orca -ErrorAction SilentlyContinue
if ($null -eq $orca) { exit 2 }
bun run packages/control-plane/src/cli/index.ts schedule create --help
if ($LASTEXITCODE -ne 0) { exit 1 }
```

exit 0 只证明 Orca CLI 与 control-plane help contract 可用；exit 1 是验证失败；exit 2 是 `UNKNOWN_HOST_UNAVAILABLE`，不能记为 pass 或 skipped。真实 native launch/real task 必须由具体 adapter 注册固定命令和结构化 evidence；当前 Droid/Hermes 没有该命令，因此 lifecycle gate 明确 DEFERRED/BLOCKED。

## Resolved decisions and follow-ups

1. **Identity resolved**：v1 使用 `AgentKey = { sourceId, agentId }`；`agentId` 保持 source-local stable ID，不生成第二套 descriptor ID。相同 key 的重复 discovery 必须走 typed conflict，不得覆盖已有事实；register/upsert/merge 的幂等和 merge 排序规则见 §1。
2. **Provider mapping resolved**：`providerId` 是 descriptor/source 显式提供的外部 identity；backend 使用 source+agent+provider 绑定，禁止按名称推断；backend 缺失用 `backend-unregistered`，不借用 `adapter-unregistered`。
3. **Cancellation and retry resolved**：`ScheduleReceipt.cancellationRef` 为 nullable opaque token；cancel 使用 `cancellationRef ?? externalId`，application 不解释 token。retry 纳入 v1 recovery substage，必须有 `action='retry'`、`retryOperationId` 和同 binding 的 distinct retry receipt，由 `RecoveryValidator` 收口。
4. **Evidence ownership resolved**：adapter 只返回 lifecycle transport metadata；application 通过 `AgentEvidenceCollectorPort` 生成 canonical reference/observedAt、调用 EvidenceValidator 并原子持久化，collector failure 投影 unknown/degraded，不得吞掉。
5. **Migration version resolved**：已应用的 v4 SQL/checksum 不可修改；通用列和 backfill 进入新增 v5 migration，回滚只回退读写代码并保留新旧事实。
6. **Plugin loading follow-up**：v1 只使用 `adapters/clients/agent-adapters.ts` 静态 composition registry；manifest/dynamic discovery 是后续独立设计，不阻塞本次批准。
7. **Adapter ownership follow-up**：adapter 可以在本仓或独立 Agent package 中实现，但必须通过同一 source+agent registry 注册并满足 source/backend allow-list；Droid/Hermes 未有真实 adapter 和固定 host command 前保持 DEFERRED/BLOCKED。

## Action items

- [ ] Repository owner review and approve this design before implementation.
- [ ] After approval, write a task-sized implementation plan with migration order and rollback gates.
- [ ] During implementation, run the symbol-aware inventory and lock the complete caller list before renames.
- [ ] During implementation, add source/backend/evidence fixtures before changing support-level projection.
