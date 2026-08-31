# Orca Agent Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Agent System 从 OMP/Claude 专用控制面扩展为 Agent-neutral 控制面，并通过 Orca 调度合同支持任意已核实的 Orca Agent provider。

**Architecture:** 保留现有六边形模块化单体和 SQLite 产品事实，将领域术语从 Client 收敛为 Agent。新增 Agent Registry、Agent capability snapshot、Schedule/Dispatch 事实和 Orca scheduler adapter；Orca 继续拥有 cron/RRULE、worktree、terminal、host 和 Agent 进程生命周期，Agent System 只拥有装配意图、调度策略、绑定关系和证据。OMP 与 Claude 先迁移到新合同；其他 provider 按 Orca 支持矩阵和独立宿主证据逐个接入。

**Tech Stack:** TypeScript, Bun, `bun:test`, Bun SQLite, JSONL/JSON CLI contracts, Orca CLI `--json` commands.

**Spec:** `work/records/2026-08-31-orca-agent-scheduling/design.md`

## Global Constraints

- 只支持 Orca 支持矩阵中的 Agent；未被 Orca 证实的 provider 只能是 `unknown`，不能宣称 supported。
- 每个 Agent 的支持必须分别验证 discovery、probe、assembly、schedule、dispatch、observation 和 recovery。
- `Agent System` 不实现自己的 cron/RRULE、worktree、terminal、remote host 或 Agent process supervisor。
- Orca automation 创建成功不等于 Agent Session 启动成功；每次运行必须生成独立的 dispatch/observation 证据。
- `domain` 不得导入 Orca、Bun、SQLite、文件系统、进程环境或投影格式；所有外部能力通过 ports/adapters 接入。
- SQLite 是产品事实唯一持久权威；manifest、receipt、Orca automation ID 和 launch context 只按 allowlist 保存。
- 动态任务原文、prompt、凭据和 transcript 不写入 ConfigurationRevision、schedule 记录、receipt 或日志；使用受控引用。
- 未经负责人明确授权，不创建真实 Orca automation，不修改现有 `.orca/` 状态，不改变 GitHub Issue 生命周期。
- 新增或实质修改的代码只使用 TypeScript、Python、Go 或 Rust；本计划中的实现使用 TypeScript/Bun。
- 新增代码注释使用中文；标识符、命令、路径、错误码和外部专名保持原文。

---

## Scope Decomposition

本计划只实现一个可独立验收的基础切片：**Agent-neutral registry + Orca scheduling/dispatch + OMP/Claude 迁移**。它使任何具有 Orca provider ID 的 Agent 都能进入统一调度流程，但只有已经具备 native assembly adapter 和真实 smoke 的 Agent 才能标记完整 `supported`。

Codex、Pi、Grok、Hermes 和后续 Orca provider 的 native assembly 作为独立的 provider adapter 计划执行；它们共享本计划产出的 Agent/Registry/Scheduler 合同，不在没有宿主证据时伪造实现。

## File Map

- OpenSpec change：记录公开需求、技术现状、改造方案、测试方案和任务真源。
- `packages/control-plane/src/domain/agent.ts`：Agent 标识、描述和 capability snapshot 的领域类型。
- `packages/control-plane/src/domain/schedule.ts`：调度意图、目标、触发器和 Session policy 的不变量。
- `packages/control-plane/src/domain/dispatch-operation.ts`：一次调度运行的状态和关联键。
- `packages/control-plane/src/application/ports/agent-adapter.ts`：Agent native adapter 端口。
- `packages/control-plane/src/application/ports/agent-registry.ts`：Agent provider 注册和 capability 查询端口。
- `packages/control-plane/src/application/ports/scheduler.ts`：调度后端端口。
- `packages/control-plane/src/application/ports/dispatch-repository.ts`：dispatch 事实读写端口。
- `packages/control-plane/src/application/scheduling.ts`：创建、取消、派发和 reconcile 调度用例。
- `packages/control-plane/src/adapters/orca/`：Orca CLI 的结构化 command adapter 和 scheduler/dispatch 实现。
- `packages/control-plane/src/adapters/clients/`：OMP/Claude adapter 的 Agent 术语迁移及后续 provider adapter 落点。
- `packages/control-plane/src/adapters/sqlite/`：schedule/dispatch repository 与迁移实现。
- `packages/control-plane/migrations/0004_agent_scheduling.sql`：从 `client_id` 收敛到 `agent_id` 并增加 schedule/dispatch 表。
- `packages/control-plane/tests/domain/`：领域不变量测试。
- `packages/control-plane/tests/contracts/`：Agent adapter、Orca command 和 materialization 合同测试。
- `packages/control-plane/tests/integration/`：SQLite 持久化、schedule/dispatch/reconcile 测试。

---

### Task 1: Formalize the approved design as an OpenSpec change

**Files:**
- Create: `openspec/changes/orca-agent-scheduling/.openspec.yaml`
- Create: `openspec/changes/orca-agent-scheduling/README.md`
- Create: `openspec/changes/orca-agent-scheduling/01-原始需求/原始需求索引.md`
- Create: `openspec/changes/orca-agent-scheduling/03-业务现状/业务现状.md`
- Create: `openspec/changes/orca-agent-scheduling/04-技术现状/技术现状.md`
- Create: `openspec/changes/orca-agent-scheduling/05-改造方案/改造方案.md`
- Create: `openspec/changes/orca-agent-scheduling/06-测试方案/测试方案.md`
- Create: `openspec/changes/orca-agent-scheduling/07-实施任务/实施任务.md`
- Create: `openspec/changes/orca-agent-scheduling/task-state.json`

**Interfaces:**
- Consumes: `work/records/2026-08-31-orca-agent-scheduling/design.md`, current `openspec/config.yaml`, current `ARCHITECTURE-SPINE.md`, current OMP/Claude implementation.
- Produces: a delivery-change skeleton whose source, scope, non-goals, test gates and task-state contract are explicit; it must not update `openspec/specs/` until implementation evidence exists.

- [ ] **Step 1: Copy the approved design into OpenSpec artifacts**

  Write the source, business-current, technical-current, change-plan and test-plan artifacts in Chinese. Record the Orca CLI evidence exactly: runtime `1.4.192`, known IDs `claude`, `codex`, `omp`, `pi`, `grok`, generic installed TUI providers, and `automations create --provider <agent>`.

- [ ] **Step 2: Define the OpenSpec acceptance scenarios**

  The test plan must contain observable scenarios for:

  ```text
  AGENT-001: known Orca provider is discoverable
  AGENT-002: unknown provider is not marked supported
  AGENT-003: stable Role/revision binds to one Agent schedule
  AGENT-004: all supported Orca trigger forms map without loss
  AGENT-005: precheck failure produces skipped dispatch
  AGENT-006: automation creation does not imply Session success
  AGENT-007: dispatch receipt and observation preserve operation/revision/agent/target hashes
  AGENT-008: OMP and Claude retain existing activation behavior after terminology migration
  ```

- [ ] **Step 3: Initialize and validate task state**

  Create `task-state.json` with one planned task per implementation task below. Run:

  ```text
  node --experimental-strip-types .delivery-spec-runtime/openspec/tools/delivery-control.ts task inspect --change-root openspec/changes/orca-agent-scheduling
  npx openspec doctor
  npx openspec validate orca-agent-scheduling --strict
  ```

  Expected: task projection has no drift; the change is structurally valid; no live spec is modified.

- [ ] **Step 4: Commit the OpenSpec change skeleton**

  ```text
  git add openspec/changes/orca-agent-scheduling
  git commit -m "docs: 建立 Orca Agent 调度 OpenSpec 变更"
  ```

### Task 2: Introduce Agent domain terminology and immutable support snapshots
**Files:**
- Create: `packages/control-plane/src/domain/agent.ts`
- Modify: `packages/control-plane/src/domain/client.ts` → replace with `agent.ts` using an LSP file rename
- Modify: `packages/control-plane/src/application/ports/client-adapter.ts` → `agent-adapter.ts`
- Modify: `packages/control-plane/src/application/ports/index.ts`
- Modify: `packages/control-plane/src/domain/index.ts`
- Modify: `packages/control-plane/src/application/activation.ts`
- Modify: `packages/control-plane/src/application/harness-composition.ts`
- Modify: `packages/control-plane/src/cli/index.ts`
- Modify: `packages/control-plane/src/adapters/clients/client-adapters.ts`
- Test: `packages/control-plane/tests/domain/agent.test.ts`
- Test: `packages/control-plane/tests/contracts/agent-adapter.test.ts`
- Modify: all existing tests and source callsites importing the renamed client symbols

- Consumes: existing `ClientId`, `ClientCapability`, `ClientAdapter` behavior and all current activation, composition, CLI and test callsites.
- Produces:

  ```ts
  export type AgentId = string & { readonly __agentId: unique symbol };
  export function agentId(value: string): AgentId;

  export type SupportLevel = 'supported' | 'degraded' | 'unsupported' | 'unknown';

  export interface AgentDescriptor {
    readonly id: AgentId;
    readonly displayName: string;
    readonly provider: string;
    readonly sourceEvidence: string;
  }

  export interface AgentCapabilitySnapshot {
    readonly probeId: string;
    readonly agentId: AgentId;
    readonly level: SupportLevel;
    readonly version: ObservedText;
    readonly capabilities: Readonly<Record<string, SupportLevel>>;
    readonly observedAt: string;
    readonly evidenceRef: string;
  }

  export interface AgentAdapterInput {
    readonly operationId: string;
    readonly revision: ConfigurationRevision;
    readonly forwardedArgs?: readonly string[];
  }

  export interface AgentAdapter {
    readonly agentId: AgentId;
    probe(input?: { readonly revision: ConfigurationRevision }): Promise<AgentCapabilitySnapshot>;
    prepare(input: AgentAdapterInput): Promise<PreparedActivation>;
    start(input: AgentAdapterInput & { readonly prepared: PreparedActivation }): Promise<StartedProcess>;
    observe(input: AgentAdapterInput & { readonly started: StartedProcess }): Promise<ObservedLaunch>;
    abort?(input: AgentAdapterInput & { readonly prepared: PreparedActivation; readonly started?: StartedProcess }): Promise<void>;
  }
  ```

- [ ] **Step 1: Use LSP to rename the exported client symbols and every current callsite**

  Run LSP references for `ClientId`, `clientId`, `ClientCapability`, `ClientAdapter`, `ClientAdapterRegistry`, then apply symbol-aware renames to `AgentId`, `agentId`, `AgentCapabilitySnapshot`, `AgentAdapter`, and `AgentAdapterRegistry`. The migration covers `domain/index.ts`, `application/ports/index.ts`, `application/activation.ts`, `application/harness-composition.ts`, `cli/index.ts`, `adapters/clients/client-adapters.ts`, and every existing source/test import. Do not leave aliases, compatibility re-exports, or stale `Client*` references.
- [ ] **Step 2: Write failing Agent domain tests**

  Add tests named:

  ```text
  rejects an empty AgentId
  trims an AgentId before branding
  preserves Known and Unknown version evidence
  preserves per-capability support levels without boolean collapse
  rejects a capability snapshot with an empty evidence reference
  ```

- [ ] **Step 3: Implement the Agent domain types**

  Keep the existing tagged-union behavior for `ObservedText`; move only the vocabulary and snapshot types into the Agent domain. Do not import Orca or process APIs into domain code.

- [ ] **Step 4: Run focused tests and typecheck**

  ```text
  bun test packages/control-plane/tests/domain/agent.test.ts packages/control-plane/tests/contracts/agent-adapter.test.ts
  bunx tsc --noEmit -p packages/control-plane/tsconfig.json
  ```

  Expected: all focused tests pass, every migrated source/test callsite compiles with no `Client*` alias, and typecheck exits 0.
- [ ] **Step 5: Commit the domain migration**

  ```text
  git add packages/control-plane/src packages/control-plane/tests/domain/agent.test.ts packages/control-plane/tests/contracts/agent-adapter.test.ts
  git commit -m "refactor: 将客户端合同收敛为 Agent"
  ```

### Task 3: Add Agent Registry and Orca provider support snapshots

**Files:**
- Create: `packages/control-plane/src/application/ports/agent-registry.ts`
- Create: `packages/control-plane/src/application/agent-registry.ts`
- Modify: `packages/control-plane/src/application/harness-composition.ts`
- Modify: `packages/control-plane/src/adapters/clients/client-adapters.ts` → `agent-adapters.ts`
- Create: `packages/control-plane/src/adapters/orca/agent-provider.ts`
- Create: `packages/control-plane/tests/contracts/agent-registry.test.ts`
- Create: `packages/control-plane/tests/contracts/orca-agent-provider.test.ts`

**Interfaces:**
- Consumes: `AgentDescriptor`, `AgentCapabilitySnapshot`, `AgentAdapter`, `orca agent-context --json` evidence, existing OMP/Claude adapters.
- Produces:

  ```ts
  export interface AgentRegistry {
    list(): Promise<readonly AgentDescriptor[]>;
    get(agentId: AgentId): Promise<AgentDescriptor | null>;
    probe(agentId: AgentId, revision?: ConfigurationRevision): Promise<AgentCapabilitySnapshot>;
    adapter(agentId: AgentId): AgentAdapter | null;
  }

  export interface OrcaAgentProviderPort {
    discover(): Promise<readonly AgentDescriptor[]>;
    probe(agentId: AgentId): Promise<AgentCapabilitySnapshot>;
  }
  ```

- [ ] **Step 1: Write registry contract tests**

  Cover:

  ```text
  lists known Orca provider descriptors with source evidence
  returns null for an unknown AgentId
  returns unknown instead of supported when provider discovery has no evidence
  preserves independent capability levels for launch, scheduling, worktree and session policy
  returns OMP and Claude adapters through the registry
  ```

- [ ] **Step 2: Implement the in-memory registry**

  Replace the current hardcoded client registry name with `InMemoryAgentAdapterRegistry`. Register OMP and Claude without changing their native argv or materialization behavior.

- [ ] **Step 3: Implement the Orca provider port as an injected boundary**

  The first implementation accepts a provider descriptor list captured from Orca command evidence. It must not parse human-readable terminal output. If Orca supplies no provider inventory, return descriptors with `unknown` evidence rather than inventing provider support.

- [ ] **Step 4: Wire the production composition root**

  `createProductionHarnessControlPlaneFacade` must construct one Agent registry and inject it into the existing activation boundary. Expose the registry dependency/factory shape for Task 7 to consume when it adds scheduling use cases; Task 3 runs before `scheduling.ts` exists and must not create a scheduling stub. Unknown IDs must produce typed unsupported/unknown results, not an unhandled exception.

- [ ] **Step 5: Run focused registry tests**

  ```text
  bun test packages/control-plane/tests/contracts/agent-registry.test.ts packages/control-plane/tests/contracts/orca-agent-provider.test.ts
  bunx tsc --noEmit -p packages/control-plane/tsconfig.json
  ```

- [ ] **Step 6: Commit the registry**

  ```text
  git add packages/control-plane/src packages/control-plane/tests/contracts/agent-registry.test.ts packages/control-plane/tests/contracts/orca-agent-provider.test.ts
  git commit -m "feat: 增加 Orca Agent 注册表"
  ```

### Task 4: Add schedule and dispatch domain facts

**Files:**
- Create: `packages/control-plane/src/domain/schedule.ts`
- Create: `packages/control-plane/src/domain/dispatch-operation.ts`
- Create: `packages/control-plane/src/application/ports/scheduler.ts`
- Create: `packages/control-plane/src/application/ports/dispatch-repository.ts`
- Create: `packages/control-plane/tests/domain/schedule.test.ts`
- Create: `packages/control-plane/tests/domain/dispatch-operation.test.ts`

- Consumes: `AgentId`, revision IDs, current activation operation correlation rules and Orca automation fields.
- Produces:

  ```ts
  export type ScheduleTrigger =
    | { readonly kind: 'preset'; readonly value: 'hourly' | 'daily' | 'weekdays' | 'weekly' }
    | { readonly kind: 'cron'; readonly expression: string }
    | { readonly kind: 'rrule'; readonly value: string };

  export type ScheduleTarget =
    | { readonly kind: 'repo'; readonly selector: string }
    | { readonly kind: 'workspace'; readonly selector: string }
    | { readonly kind: 'project'; readonly selector: string; readonly host?: string }
    | { readonly kind: 'runtime'; readonly selector: string };

  export type SessionPolicy = 'fresh' | 'reuse';

  export interface AgentScheduleIntent {
    readonly scheduleId: string;
    readonly agentId: AgentId;
    readonly revisionId: string;
    readonly trigger: ScheduleTrigger;
    readonly target: ScheduleTarget;
    readonly sessionPolicy: SessionPolicy;
    readonly precheckRef: string | null;
    readonly sourceContextRef: string | null;
    readonly createdAt: string;
  }

  export interface DispatchOperation {
    readonly operationId: string;
    readonly scheduleId: string;
    readonly agentId: AgentId;
    readonly revisionId: string;
    readonly target: ScheduleTarget;
    readonly phase: 'planned' | 'dispatched' | 'observing' | 'succeeded' | 'degraded' | 'failed' | 'skipped' | 'unknown';
    readonly automationId: string | null;
    readonly manifestHash: string;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly terminalReason: string | null;
  }

  export interface OrcaAutomationReceipt {
    readonly automationId: string;
    readonly provider: string;
    readonly target: ScheduleTarget;
    readonly trigger: ScheduleTrigger;
    readonly createdAt: string;
    readonly sourceEvidence: string;
  }

  export interface AgentSchedulerPort {
    create(input: AgentScheduleIntent): Promise<OrcaAutomationReceipt>;
    cancel(automationId: string): Promise<void>;
  }
  ```

- [ ] **Step 1: Write failing domain tests**

  Cover valid preset/cron/RRULE triggers, invalid blank cron/RRULE values, all four target kinds, fresh/reuse policy, stable schedule correlation, and dispatch state transitions. Assert that raw prompt/task content is not a field on either type.

- [ ] **Step 2: Implement schedule and dispatch invariants**

  Validate non-empty IDs, RFC3339 timestamps, supported trigger forms, non-empty selectors and legal phase transitions. Keep the state machine independent from Orca implementation details.

- [ ] **Step 3: Run focused domain tests**

  ```text
  bun test packages/control-plane/tests/domain/schedule.test.ts packages/control-plane/tests/domain/dispatch-operation.test.ts
  ```

- [ ] **Step 4: Commit the domain facts**

  ```text
  git add packages/control-plane/src/domain packages/control-plane/src/application/ports/scheduler.ts packages/control-plane/src/application/ports/dispatch-repository.ts packages/control-plane/tests/domain
  git commit -m "feat: 建立 Agent 调度与派发领域事实"
  ```

### Task 5: Implement the Orca scheduler and dispatch adapter

**Files:**
- Create: `packages/control-plane/src/adapters/orca/orca-command.ts`
- Create: `packages/control-plane/src/adapters/orca/orca-scheduler.ts`
- Create: `packages/control-plane/src/adapters/orca/orca-dispatch.ts`
- Create: `packages/control-plane/tests/contracts/orca-scheduler.test.ts`
- Create: `packages/control-plane/tests/contracts/orca-dispatch.test.ts`

- Consumes: `AgentScheduleIntent`, `AgentSchedulerPort`, injected command runner, Orca JSON CLI contract.
- Produces:

  ```ts
  export interface OrcaCommandPort {
    run(args: readonly string[]): Promise<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }>;
  }
  ```

- [ ] **Step 1: Write command-mapping tests**

  For each trigger and target, assert exact structured argument mapping to:

  ```text
  orca automations create --name ... --trigger ... --provider ... --repo|--workspace|--project|--host ... --fresh-session|--reuse-session --json
  ```

  Also test `precheck`, `source-context`, timezone, missed-run grace and disabled/enabled options. Do not invoke a shell command string; pass an argv array to the injected command port.

- [ ] **Step 2: Implement the Orca command adapter**

  Parse only `--json` output. Require a non-empty `automationId`, provider and creation evidence. A non-zero exit, invalid JSON or missing ID returns a typed failure; it never creates a successful dispatch fact.

- [ ] **Step 3: Implement scheduler create/cancel**

  `create` maps one schedule intent to one Orca automation. `cancel` calls the corresponding typed Orca command and reports failure if Orca does not confirm cancellation.

- [ ] **Step 4: Implement dispatch receipt correlation**

  Correlate every returned receipt to `scheduleId`, `operationId`, `agentId`, `revisionId`, target and manifest hash. Automation creation is phase `dispatched`, not `succeeded`.

- [ ] **Step 5: Run contract tests**

  ```text
  bun test packages/control-plane/tests/contracts/orca-scheduler.test.ts packages/control-plane/tests/contracts/orca-dispatch.test.ts
  bunx tsc --noEmit -p packages/control-plane/tsconfig.json
  ```

- [ ] **Step 6: Commit the Orca adapter**

  ```text
  git add packages/control-plane/src/adapters/orca packages/control-plane/tests/contracts/orca-scheduler.test.ts packages/control-plane/tests/contracts/orca-dispatch.test.ts
  git commit -m "feat: 接入 Orca Agent 调度适配器"
  ```

### Task 6: Persist schedule and dispatch facts in SQLite

**Files:**
- Create: `packages/control-plane/migrations/0004_agent_scheduling.sql`
- Create: `packages/control-plane/src/adapters/sqlite/schedule-repository.ts`
- Create: `packages/control-plane/src/adapters/sqlite/dispatch-repository.ts`
- Create: `packages/control-plane/src/application/ports/schedule-repository.ts`
- Modify: `packages/control-plane/src/adapters/sqlite/store.ts`
- Modify: `packages/control-plane/src/adapters/sqlite/activation-operation-repository.ts`
- Modify: `packages/control-plane/src/adapters/sqlite/launch-observation-repository.ts`
- Modify: `packages/control-plane/src/application/ports/index.ts`
- Create: `packages/control-plane/tests/integration/agent-scheduling-sqlite.test.ts`
- Modify: `packages/control-plane/src/domain/dispatch-operation.ts` (add persisted version field)
- Modify: `packages/control-plane/tests/domain/dispatch-operation.test.ts` (version fixture/regression)

**Interfaces:**
- Consumes: `AgentScheduleIntent`, `DispatchOperation`, `OrcaAutomationReceipt`, existing SQLite transaction and migration patterns.
- Produces:

  ```sql
  CREATE TABLE agent_schedule (...);
  CREATE TABLE dispatch_operation (...);
  CREATE INDEX idx_dispatch_operation_schedule_updated ON dispatch_operation(schedule_id, updated_at DESC);
  CREATE INDEX idx_dispatch_operation_agent_updated ON dispatch_operation(agent_id, updated_at DESC);
  ```

  `agent_schedule` persists explicit schedule/agent/revision/policy/reference columns and validated trigger/target JSON. `dispatch_operation` persists explicit operation/schedule/agent/revision/phase/automation/manifest/timestamps/reason/version columns plus controlled receipt evidence. The migration renames canonical `client_id` columns to `agent_id`; store legacy-copy SQL and both existing repositories use the renamed columns. The dispatch domain aggregate and its regression fixture include the persisted concurrency version.

- [ ] **Step 1: Write failing SQLite integration tests**

  Cover insert/read round trip, duplicate schedule ID rejection, schedule-to-dispatch foreign key, idempotent receipt import by automation ID plus operation ID, preservation of Unknown evidence, migration of existing OMP/Claude rows to `agent_id`, stale/duplicate conditional phase update rejection, no raw prompt/task/credentials/transcript persistence, and both serial duplicate plus controllable concurrent/conditional-race receipt re-read gates.
- [ ] **Step 2: Implement migration 0004**

  Use the repository's transaction migration mechanism. Keep `STRICT` tables, explicit columns, parameterized SQL and WAL. Update store migration imports/manifest/schema version, canonical-table allowlists, validation and legacy-copy SQL so renamed columns and new tables are canonical. Do not introduce an ORM or `SELECT *` projection path.
- [ ] **Step 3: Implement repositories**

  Add explicit `save`, `findById`, `listByAgent`, `updatePhase` and `appendReceipt` methods. Conditional updates include expected current phase and version so duplicate or stale dispatch updates fail closed. Receipt import uses a conditional write and, when a race loses, re-reads the stored evidence so identical receipts succeed idempotently while conflicting receipts fail closed. Serialize only validated allowlisted fields and reconstruct domain objects through validators on reads.
- [ ] **Step 4: Run integration tests**

  ```text
  bun test packages/control-plane/tests/integration/agent-scheduling-sqlite.test.ts
  bunx tsc --noEmit -p packages/control-plane/tsconfig.json
  ```
- [ ] **Step 5: Commit persistence**

  ```text
  git add packages/control-plane/migrations/0004_agent_scheduling.sql packages/control-plane/src/adapters/sqlite packages/control-plane/src/application/ports packages/control-plane/src/domain/dispatch-operation.ts packages/control-plane/tests/domain/dispatch-operation.test.ts packages/control-plane/tests/integration/agent-scheduling-sqlite.test.ts docs/superpowers/plans/2026-08-31-orca-agent-scheduling.md openspec/changes/orca-agent-scheduling/07-实施任务/实施任务.md openspec/changes/orca-agent-scheduling/task-state.json
  git commit -m "feat: 持久化 Agent 调度与派发事实"
  ```


### Task 7: Add scheduling application use cases and consume migrated OMP/Claude adapters

**Files:**
- Create: `packages/control-plane/src/application/scheduling.ts`
- Create: `packages/control-plane/tests/application/scheduling.test.ts`
- Modify: `packages/control-plane/tests/contracts/sqlite-store.test.ts` (Task 6 migration v4 expectation compatibility)


**Interfaces:**
- Consumes: `AgentRegistry`, `AgentSchedulerPort`, schedule/dispatch repositories, migrated `AgentAdapter` contract and existing activation flow.
- Produces:


  ```ts
  export async function createAgentSchedule(...): Promise<AgentScheduleIntent>;
  export async function cancelAgentSchedule(...): Promise<DispatchOperation>;
  export async function dispatchAgentSchedule(...): Promise<DispatchOperation>;
  export async function reconcileAgentDispatch(...): Promise<DispatchOperation>;
  ```

- [ ] **Step 1: Write failing application tests**

  Cover:

  ```text
  refuses scheduling for unknown Agent capability
  binds one revision and one Agent to the schedule
  creates Orca automation only after validation
  records dispatched instead of succeeded after automation creation
  maps precheck failure to skipped
  reconciles a known Agent outcome to succeeded/degraded/failed
  preserves unknown when Orca or Agent outcome cannot be correlated
  ```

- [ ] **Step 2: Implement schedule validation and creation**

  Validate Agent registry evidence, revision existence, target, trigger and Session policy before calling Orca. Persist the schedule intent before external side effects, then update the dispatch fact conditionally after the Orca receipt.

- [ ] **Step 3: Implement cancellation and reconciliation**

  Cancellation must be idempotent and operation-bound. Reconciliation must require matching schedule ID, operation ID, Agent ID, revision ID, target and manifest hash; mismatches remain `unknown` or `incomplete`.
- [ ] **Step 4: Consume migrated Agent contracts without changing native behavior**

  Task 2 owns the full Client→Agent exported symbol and callsite migration. Task 7 consumes the existing `AgentRegistry`/`AgentAdapter` contract through `SchedulingDependencies`; no composition, activation, OMP argv, Claude materialization, or Session behavior changes were required. OMP continues to pass Skill names to OMP. Claude continues invocation-scoped materialization for instructions, skills and MCP.

- [ ] **Step 5: Run application and existing contract tests**

  ```text
  bun test packages/control-plane/tests/application/scheduling.test.ts packages/control-plane/tests/contracts/agent-adapters.test.ts packages/control-plane/tests/contracts/claude-materializer.test.ts
  bun test packages/control-plane/tests
  bunx tsc --noEmit -p packages/control-plane/tsconfig.json
  ```

- [ ] **Step 6: Commit the application integration**

  ```text
  git add packages/control-plane/src packages/control-plane/tests
  git commit -m "feat: 支持 Orca Agent 调度用例"
  ```

### Task 8: Add dry-run CLI commands and evidence projection

**Files:**
- Modify: `packages/control-plane/src/cli/index.ts`
- Modify: `packages/control-plane/src/cli/render.ts`
- Modify: `packages/control-plane/src/application/scheduling.ts` (export pure validation/manifest seam)
- Modify: `packages/control-plane/src/adapters/sqlite/connection.ts` (read-only database open)
- Modify: `packages/control-plane/src/adapters/sqlite/store.ts` (read-only store mode)
- Create: `packages/control-plane/tests/cli/agent-scheduling.test.ts`
- Modify: `openspec/changes/orca-agent-scheduling/07-实施任务/实施任务.md`

**Interfaces:**
- Consumes: application scheduling use cases and Agent registry.
- Produces CLI commands:

  ```text
  configs agents list
  configs agents probe <agent-id>
  configs schedule create --agent <agent-id> --revision <revision-id> --trigger <kind:value> --target <kind:selector> --session-policy <fresh|reuse> --dry-run
  configs schedule show <schedule-id>
  configs schedule cancel <schedule-id> --yes
  ```

- [x] **Step 1: Write CLI contract tests**

  Assert stable allowlist projections, strict controlled evidence refs and exact argv/spec arrays. Assert `--dry-run` never calls the external Orca command port or creates a database through injected composition.

- [x] **Step 2: Implement agent list/probe**

  Render known, unknown and unsupported capability states distinctly. Do not list a provider as supported merely because Orca accepts the string.

- [x] **Step 3: Implement schedule dry-run and lifecycle commands**

  `schedule create --dry-run` returns the exact Orca argv/spec without creating an automation. Non-dry-run creation remains behind the explicit user confirmation path.

- [x] **Step 4: Run CLI tests and smoke the dry-run path**

  ```text
  bun test packages/control-plane/tests/cli/agent-scheduling.test.ts
  bun packages/control-plane/src/cli/index.ts agents list
  bun packages/control-plane/src/cli/index.ts schedule create --help
  ```

  Expected: commands exit 0; no Orca automation, SQLite user runtime or `.orca/` mutation is created by the dry-run; help/agents fast paths avoid store creation.

- [x] **Step 5: Commit the CLI surface**


  ```text
  git add packages/control-plane/src/cli packages/control-plane/src/application/scheduling.ts packages/control-plane/src/adapters/sqlite packages/control-plane/tests/cli openspec/changes/orca-agent-scheduling/07-实施任务/实施任务.md
  ```

### Task 9: Verify the support matrix and define provider follow-up plans

**Files:**
- Create: `openspec/changes/orca-agent-scheduling/08-验收/验收记录.md`
- Create: `work/records/2026-08-31-orca-agent-scheduling/orca-provider-matrix.json`
- Create: `packages/control-plane/tests/contracts/orca-provider-matrix.test.ts`
- Modify: `openspec/changes/orca-agent-scheduling/task-state.json`

**Interfaces:**
- Consumes: Orca `agent-context --json`, Orca runtime status, registry snapshots, OMP/Claude contract evidence and dry-run output.
- Produces: a versioned provider matrix with one row per observed provider:

  ```json
  {
    "provider": "codex",
    "orcaEvidence": "...",
    "discovery": "known|unknown",
    "probe": "supported|degraded|unsupported|unknown",
    "assembly": "supported|degraded|unsupported|unknown",
    "scheduling": "supported|degraded|unsupported|unknown",
    "dispatch": "supported|degraded|unsupported|unknown",
    "observation": "supported|degraded|unsupported|unknown",
    "recovery": "supported|degraded|unsupported|unknown",
    "evidenceRefs": []
  }
  ```

- [ ] **Step 1: Capture the provider matrix without inventing inventory**

  Use only Orca command/schema evidence and actual provider probes available on the target host. Keep Hermes as `unknown` unless an Orca provider ID and launch evidence are found.

- [ ] **Step 2: Add matrix consistency tests**

  Fail if a provider has `supported` in any later capability while discovery or probe is `unknown`; fail if a provider has scheduling `supported` without a recorded Orca automation dry-run or equivalent dispatch evidence.

- [ ] **Step 3: Write the acceptance record**

  Separate:

  ```text
  code contract verified
  Orca scheduling contract verified
  native Agent launch verified
  real Agent task verified
  ```

  Do not mark real Agent launch verified for providers whose host executable is absent.

- [ ] **Step 4: Identify follow-up provider plans**

  Create one bounded follow-up plan per provider that needs native assembly: Codex, Pi, Grok, Hermes if later confirmed, and any other provider returned by Orca. Each plan must name its native flags/files, adapter path, tests and host smoke before implementation begins.

- [ ] **Step 5: Run final verification for this slice**

  ```text
  bun test packages/control-plane/tests
  bunx tsc --noEmit -p packages/control-plane/tsconfig.json
  npx openspec validate orca-agent-scheduling --strict
  ```

  Expected: all current tests pass, typecheck exits 0, OpenSpec validation passes, and no real Orca automation was created unless a separate explicitly authorized smoke was requested.

- [ ] **Step 6: Commit evidence and close the change acceptance task**

  ```text
  git add openspec/changes/orca-agent-scheduling/08-验收/验收记录.md work/records/2026-08-31-orca-agent-scheduling/orca-provider-matrix.json packages/control-plane/tests/contracts/orca-provider-matrix.test.ts openspec/changes/orca-agent-scheduling/task-state.json
  git commit -m "test: 固化 Orca Agent 支持矩阵证据"
  ```

## Plan Self-Review

- **Spec coverage:** The approved design's registry, adapter, scheduling intent, Orca mapping, dispatch evidence, failure closure, SQLite persistence, OMP/Claude migration and provider matrix are each covered by Tasks 2–9.
- **Placeholder scan:** No task depends on a vague “handle edge cases” instruction. Unknown providers and Hermes are explicit evidence-gated states, not unfinished implementation claims.
- **Type consistency:** `AgentId`, `AgentCapabilitySnapshot`, `AgentAdapter`, `AgentScheduleIntent`, `DispatchOperation`, `AgentSchedulerPort`, `OrcaCommandPort` and `OrcaAutomationReceipt` are defined before consumers use them.
- **Scope:** This plan delivers a working Agent-neutral scheduling slice. Native assembly for each provider is intentionally split into provider-specific follow-up plans because the current Orca CLI exposes a generic provider input but does not expose a complete installed-provider inventory command.
- **Safety:** Dry-run is the default verification path; the plan explicitly avoids `.orca/` mutation and treats external Orca side effects as non-transactional.
