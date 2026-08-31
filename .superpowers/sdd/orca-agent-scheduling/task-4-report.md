# Task 4 报告：Agent 调度与派发领域事实

## status

completed

## commits

- `db38bd6` — `feat: 建立 Agent 调度与派发领域事实`
- `7c8f1b2` — `fix: 收紧 Agent 调度领域事实边界`
- `d6fe87e` — `fix: 收紧 Agent 调度引用与事件边界`

## changed files

- `packages/control-plane/src/domain/schedule.ts`
  - 增加 preset/5-field cron/RRULE trigger、repo/workspace/project/runtime target、fresh/reuse policy。
  - 增加 `AgentScheduleIntent`、`OrcaAutomationReceipt` 及其构造/校验合同。
  - 校验非空 ID、受控引用、RFC3339 时间戳、trigger/target 变体；构造时只保留领域字段，不保留 raw prompt/task。
- `packages/control-plane/src/domain/dispatch-operation.ts`
  - 增加 `DispatchOperation`、事件类型、构造器、校验器、终态判断和显式 fail-closed 状态转换。
  - 保留 operation/schedule/agent/revision/target/manifest correlation；automation receipt 只允许进入 `dispatched`，不会推导 Session 成功。
- `packages/control-plane/src/application/ports/scheduler.ts`
  - 增加 `AgentSchedulerPort`。
- `packages/control-plane/src/application/ports/dispatch-repository.ts`
  - 增加 `DispatchOperationRepository` 读写/条件更新/receipt 端口。
- `packages/control-plane/tests/domain/schedule.test.ts`
  - 覆盖 trigger、target、policy、correlation、空值/时间戳和 raw prompt/task 排除。
- `packages/control-plane/tests/domain/dispatch-operation.test.ts`
  - 覆盖 planned→dispatched→observing→succeeded、skipped/degraded/failed/unknown 终态、非法转换和 operation 不变量。

## commands and observed outputs

1. `bun test packages/control-plane/tests/domain/schedule.test.ts packages/control-plane/tests/domain/dispatch-operation.test.ts`
   - RED：`0 pass, 2 fail, 2 errors`，两个新模块尚不存在。
2. `bun test packages/control-plane/tests/domain/schedule.test.ts packages/control-plane/tests/domain/dispatch-operation.test.ts`
   - GREEN：`9 pass, 0 fail, 68 expect() calls`。
3. `git diff --cached --check`
   - 通过，无 whitespace 错误。
4. `git commit -m "feat: 建立 Agent 调度与派发领域事实"`
   - 成功创建提交 `db38bd6`。

## invariant/test evidence

- trigger 只接受四种 preset、五字段 cron 或非空 RRULE；空 cron/RRULE 被拒绝。
- target 只接受 repo/workspace/project/runtime，selector 非空，project host 若提供则非空。
- schedule 与 dispatch 均显式保留 AgentId、revisionId、schedule/operation correlation；ID、manifest hash、受控引用不得为空。
- createdAt/updatedAt 必须为合法 RFC3339 时间戳。
- dispatch 状态转换使用显式允许边；planned→skipped 可在无 automationId 时完成 precheck fail-closed 收口；dispatched/observing→skipped 保留既有 automation correlation，缺失 correlation 的非法事实返回类型化失败结果。
- trigger/target、schedule/dispatch、OrcaAutomationReceipt 顶层与嵌套对象均执行合同字段 allowlist；构造器复制嵌套对象，成功返回受控对象，不保留 raw prompt/task/credentials/transcript。
- `precheckRef`、`sourceContextRef`、`sourceEvidence` 使用 ASCII controlled-reference 语法和 scheme allowlist，拒绝空格及 prompt/task/secret/credential/transcript scheme。
- 未实现 Orca CLI adapter、SQLite persistence、application scheduling use cases 或 CLI commands；未创建真实 Orca automation。
- `.orca/` 仅保持原有未跟踪用户状态，未纳入提交或修改。

## concerns

- repository 和 scheduler 仅定义 ports，未在本任务接入 adapter、SQLite 或 application wiring，符合 Task 4 范围；后续任务需通过 ports 实现这些边界。

## fix round 1

### status

completed

### commit

- `7c8f1b2` — `fix: 收紧 Agent 调度领域事实边界`

### changed files

- `packages/control-plane/src/domain/schedule.ts`
  - 对 schedule intent、trigger、target 和 automation receipt 实施严格合同字段校验；构造器复制并归一化嵌套对象。
  - 新增 `createOrcaAutomationReceipt`，receipt validator 拒绝顶层及嵌套未知字段。
  - controlled references 使用明确 ASCII pattern，拒绝 raw prompt、secret、credential、task、transcript 形态。
- `packages/control-plane/src/domain/dispatch-operation.ts`
  - 允许 planned→skipped 生成 `automationId: null`；dispatched/observing→skipped 保留 automation correlation。
  - transition 对非法 operation/结果返回 `{ ok: false }`，不向调用方暴露 uncaught validation throw；dispatch target 构造时复制。
- `packages/control-plane/tests/domain/schedule.test.ts`
  - 新增嵌套 allowlist、receipt validator/constructor、controlled-reference boundary 测试。
- `packages/control-plane/tests/domain/dispatch-operation.test.ts`
  - 新增 planned→skipped、dispatched/observing correlation、缺失 correlation fail-closed 和嵌套 target 注入测试。

### commands and observed outputs

1. `bun test packages/control-plane/tests/domain/schedule.test.ts packages/control-plane/tests/domain/dispatch-operation.test.ts`
   - RED（新增 fix tests）：`4 pass, 4 fail`，planned→skipped 触发 `skipped dispatch must have an automation id`，dispatched/observing skip 不通过，controlled-reference/receipt constructor 尚未实现。
2. `bun run --cwd packages/control-plane typecheck`
   - GREEN：`tsc --noEmit` 成功，无 diagnostics。
3. `bun test packages/control-plane/tests/domain/schedule.test.ts packages/control-plane/tests/domain/dispatch-operation.test.ts`
   - GREEN：`17 pass, 0 fail, 100 expect() calls`。
4. `git diff --check`
   - 通过，无 whitespace 错误。

### invariant/test evidence

- planned precheck failure 进入 `skipped` 且 `automationId` 为 `null`；非法 dispatched/observing 无 automation correlation 返回 `invalid-operation`，不抛异常。
- dispatched/observing→skipped 保留 automationId；终态仍不可继续转换。
- trigger/target 的嵌套 prompt/task/credentials/transcript 注入、receipt 顶层及嵌套注入均被拒绝；构造成功对象只含合同字段且嵌套对象为受控副本。
- `evidence://precheck-1`、`context://source-1`、`orca:automation:automation-1` 保持合法；空格和 forbidden raw-text schemes 被拒绝。
- 未触碰 `.orca/`，未引入 Orca/Bun/SQLite/process/filesystem/projection imports。

## fix round 2

### status

completed

### commit

- `d6fe87e` — `fix: 收紧 Agent 调度引用与事件边界`

### changed files

- `packages/control-plane/src/domain/dispatch-operation.ts`
  - 在读取事件类型前验证 runtime event shape；null、undefined、非对象及未知类型统一返回 `{ ok: false, reason: 'invalid-event' }`。
- `packages/control-plane/src/domain/schedule.ts`
  - controlled reference 从 denylist 收紧为 positive ASCII scheme allowlist，仅接受 `evidence://...`、`context://...` 与 `orca:...`。
- `packages/control-plane/tests/domain/dispatch-operation.test.ts`
  - 新增 null、undefined、string、number、空对象 malformed event 边界测试。
- `packages/control-plane/tests/domain/schedule.test.ts`
  - 新增 `foo://x`、`http://x` arbitrary scheme 边界测试，覆盖 schedule refs 与 receipt source evidence。

### commands and observed outputs

1. `bun test packages/control-plane/tests/domain/schedule.test.ts packages/control-plane/tests/domain/dispatch-operation.test.ts`
   - RED：`16 pass, 2 fail`；malformed null event 抛 TypeError，`foo://x` 未被拒绝。
2. `bun run --cwd packages/control-plane typecheck`
   - GREEN：`tsc --noEmit` 成功，无 diagnostics。
3. `bun test packages/control-plane/tests/domain/schedule.test.ts packages/control-plane/tests/domain/dispatch-operation.test.ts`
   - GREEN：`18 pass, 0 fail, 113 expect() calls`。
4. `git diff --check`
   - 通过，无 whitespace 错误。

### invariant/test evidence

- malformed event 在 `nextPhaseFor` 前被拦截，不会因 `event.type` 解引用向调用方抛出 TypeError。
- controlled reference 只接受 positive scheme allowlist；未知 `foo`/`http` scheme、空格和 raw forbidden scheme 被拒绝。
- 前一轮 planned→skipped 无 automationId、dispatched/observing correlation、nested allowlist/clone 与 receipt validator 行为保持通过。
