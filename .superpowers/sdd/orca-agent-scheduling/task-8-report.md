# Task 8 实施报告

## Status

- status: completed
- scope: Agent registry CLI 投影、schedule create dry-run、show/cancel 生命周期命令；增加 application 纯验证与 manifest hash 导出 seam。
- `.orca/` 未触碰。

## Commits

- base commit: `bfdbc00 feat: 增加 Agent 调度 CLI dry-run`
- fix round 1: `6e39ebd fix: 收紧 Agent 调度 CLI 投影`
- fix round 2: `a23f7bc fix: 完善 Agent 调度 CLI 只读快照`
- regression test: `4483cf6 test: 覆盖 Agent 调度 CLI 只读成功路径`
- fix round 3: `267ad92 fix: 补齐 Agent 调度 CLI 证据`
- fix round 4: `8e7cdaf` + `049ecec` (`fix: 固化 Agent 调度时间投影`)
- fix round 5: `7defb82 fix: 完善 Agent 调度 CLI 最终门禁`
- fix round 6: `ec0cc97 fix: 严格校验 Agent CLI 时间与标签`
- fix round 7: `61b49d2 fix: 拒绝 Agent CLI 证据错配`
- evidence sync: `59af058`, `6934959`, `e2f8222`, `ca7fb7e`, `ee2b421`, `f902a02`, `e2a1df7`, `3945aaa`
## Changed files

- `packages/control-plane/src/cli/index.ts`
  - 扩展 `CliOverrides`，允许注入 registry、scheduler、schedule/dispatch repositories、configuration repository 和 clock。
  - 增加 `agents list`、`agents probe`、`schedule create/show/cancel` 参数解析和生命周期调用。
  - dry-run 只调用 application validation 和 `buildOrcaCreateArgs`，不创建 scheduler、automation、schedule 或 operation。
  - 非 dry-run create 要求显式 `--yes`；cancel 要求 `--yes`。
  - 默认 Orca command runner 只接收 argv 数组，错误不向 CLI JSON 泄露 stderr。
- `packages/control-plane/src/cli/render.ts`
  - 增加 Agent、dry-run、schedule/operation allowlist projection。
  - evidence、version、label、terminal reason 做受控投影；不序列化 raw registry/Orca object。
- `packages/control-plane/src/application/scheduling.ts`
  - 导出 `validateAgentSchedule` 和 `buildAgentScheduleManifestHash`，让 CLI 复用 Agent/revision evidence 门禁和 dispatch 使用的同一 manifest 算法。
- `packages/control-plane/src/adapters/sqlite/connection.ts`
  - 提供 readonly SQLite 连接。
- `packages/control-plane/src/adapters/sqlite/store.ts`
  - readonly dry-run 从 DB 及 sidecars 建立临时快照，关闭后清理，不修改 target。
- `packages/control-plane/tests/cli/agent-scheduling.test.ts`
  - 覆盖 brief 的 known/unknown/unsupported、probe、全部 trigger/target/policy、证据拒绝、confirmation、show、cancel 幂等、错误隔离和稳定 key set。
  - 使用 injected fakes 与 temporary database，不调用真实 Orca；补默认 readonly 路径和 sidecar 不变测试。
- `openspec/changes/orca-agent-scheduling/07-实施任务/实施任务.md`
  - Task8 标记 completed，记录实际扩展 seam 和验证门禁。
- `openspec/changes/orca-agent-scheduling/task-state.json`
  - 同步 8.1 deliverables、verification 和命令 evidence。
- `docs/superpowers/plans/2026-08-31-orca-agent-scheduling.md`
  - 同步 Task8 实际文件范围与五步完成状态。

## RED/GREEN evidence
- RED：实现 CLI production code 前运行 focused contract；首轮因测试 harness 尚未导入 `beforeEach` 失败，补齐测试 harness 后新命令测试仍全部失败（`main` 尚未提供该 contract），没有任何成功命令结果。

- GREEN focused：`bun test packages/control-plane/tests/cli/agent-scheduling.test.ts`，`15 pass, 0 fail, 134 expect() calls`。
- GREEN CLI suite：`bun test packages/control-plane/tests/cli`，`50 pass, 0 fail, 232 expect() calls`。
- GREEN control-plane package：`bun test packages/control-plane/tests`，`185 pass, 0 fail, 682 expect() calls`。
- GREEN typecheck：`bunx tsc --noEmit -p packages/control-plane/tsconfig.json`，exit 0，无 diagnostics。
- `git diff --cached --check` 通过。

## Exact CLI argv/output examples

- argv：`bun packages/control-plane/src/cli/index.ts agents list`
- stdout：`{"agents":[{"id":"omp","displayName":"omp","provider":"orca","level":"unknown","version":{"kind":"known","value":"omp/18.0.11"},"capabilities":{},"evidenceRef":"unknown","observedAt":"2026-08-31T08:43:55.989Z"},{"id":"claude-code","displayName":"claude-code","provider":"orca","level":"unknown","version":{"kind":"known","value":"2.1.241 (Claude Code)"},"capabilities":{},"evidenceRef":"unknown","observedAt":"2026-08-31T08:43:55.387Z"}]}`
- argv：`bun packages/control-plane/src/cli/index.ts schedule create --help`
- stdout：`configs schedule create --agent <agent-id> --revision <revision-id> --trigger <kind:value> --target <kind:selector> --session-policy <fresh|reuse> --dry-run`

Injected dry-run contract output has stable root keys:

`{"schedule":...,"manifest":{"hash":"<sha256>"},"argv":["orca","automations","create",...],"spec":{"argv":["orca","automations","create",...]},"externalCall":false,"evidence":...,"timestamps":...}`

## No-side-effect evidence
- 每个 dry-run case 均断言 scheduler `creates === 0`、schedule repository `saves === 0`、dispatch repository `saves === 0`。
- dry-run 使用 `validateAgentSchedule`，没有调用 `createAgentSchedule`/`dispatchAgentSchedule`，也没有实例化默认 Orca scheduler factory。
- focused tests 的 scheduler、registry、repositories 均为 injected fakes；没有真实 Orca automation。
- smoke 实际运行 `agents list` 与 `schedule create --help`，均 exit 0 且在临时 `CONTROL_PLANE_DB_PATH` 下未创建 DB；`.orca/` 未触碰。

## Compatibility evidence

- 最终 CLI suite `50 pass`；control-plane package suite `185 pass`，保留现有 `list/show/use/switch/status/recover/establish/revise/supply` 路径；历史轮次的 49/184 计数仅反映当时尚未加入最终回归用例的状态。
- `schedule cancel` 通过 application `cancelAgentSchedule`，使用持久化 operation 的精确 automation ID；重复已取消 operation 由 application 幂等返回，不重复调用 scheduler。
- `agents list` 对 unknown provider inventory 保留 `level: unknown`，即使 probe snapshot 报告 supported；不会仅因 Orca provider 字符串升级支持状态。

## Concerns

- 未执行真实 Orca schedule create/cancel；该边界按 brief 保持为 injected `AgentSchedulerPort`，本 Task 只验证 argv/spec 与 application contract。
- 默认 provider inventory 仍由 Orca provider evidence 表示为 unknown；`agents list` 会显示 OMP/Claude 的 version evidence，但顶层 inventory level 保持 unknown，符合 fail-closed 规则。
- 非 Task8 旧查询命令仍沿用原有 `openDeps` 初始化边界；本 Task 仅为默认 schedule dry-run 增加 guarded readonly 初始化并验证 missing DB exit1，未扩大旧命令错误处理范围。

## Review fix rounds

- round 1: `6e39ebd fix: 收紧 Agent 调度 CLI 投影`
  - strict evidence/label/reason/error projection and trigger/target allowlist; no-store agents/help and injected dry-run composition.
- round 2: `a23f7bc fix: 完善 Agent 调度 CLI 只读快照`
  - readonly DB/sidecar temporary snapshots with cleanup and stable missing-DB exit1; strict trigger/target/identifier inputs prevent argv/spec leakage; capabilities and probeId use controlled projections.
  - regression evidence: focused `13 pass, 0 fail, 111 expect() calls`, CLI `48 pass`, package `183 pass`, tsc exit 0; existing target sidecar bytes remained unchanged.

- round 3: `267ad92 fix: 补齐 Agent 调度 CLI 证据`
  - known SchedulingError codes preserve stable CLI errors; projectAgent emits controlled `probeId` and filters capability keys/levels; tests cover unknown probe/capability values.
  - final evidence: focused `14 pass, 0 fail, 116 expect() calls`, CLI `49 pass`, package `184 pass`, tsc exit 0.

- round 4: `8e7cdaf` + `049ecec` (`fix: 固化 Agent 调度时间投影`)
  - scalar regex guards, four-state level projection, strict RFC3339 timestamp projection with `unknown` fallback for agent/schedule/operation/timestamps; readonly snapshots reuse `BEGIN IMMEDIATE` consistency copying and tolerate Windows-locked source `-shm` by keeping the disposable snapshot isolated.
  - final evidence: focused `14 pass, 0 fail, 119 expect() calls`, CLI `49 pass`, package `184 pass`, tsc exit 0; live WAL/SHM smoke passed and temporary snapshot cleanup completed.

- round 5: `7defb82 fix: 完善 Agent 调度 CLI 最终门禁`
  - fixed sensitive display/provider/version/reason text, finite operation phase projection, impossible timestamp rejection, and guarded schedule initialization for missing DB.
  - final evidence: focused `14 pass, 0 fail, 122 expect() calls`, CLI `49 pass`, package `184 pass`, tsc exit 0.

- round 6: `ec0cc97 fix: 严格校验 Agent CLI 时间与标签`
  - canonical Date.parse timestamp comparison rejects impossible dates such as February 31; sensitive protocol/equal labels map to unknown.
  - final evidence: focused `14 pass, 0 fail, 124 expect() calls`, CLI `49 pass`, package `184 pass`, tsc exit 0.

- round 7: `61b49d2 fix: 拒绝 Agent CLI 证据错配`
  - snapshot identity must match descriptor identity; mismatches project all snapshot-derived fields to unknown.
  - only controlled `evidence://` inventory evidence can expose a probed list/probe level; malformed inventory remains unknown.
  - final evidence: focused `15 pass, 0 fail, 134 expect() calls`, CLI `50 pass`, package `185 pass`, tsc exit 0.

- round 8: `675e3a8 fix: 接受 Agent CLI Orca inventory 证据`
  - inventory evidence projection accepts controlled `evidence://` and `orca:` references; unrelated `context://` and malformed values remain unknown.
  - final evidence remains focused `15 pass, 0 fail, 134 expect() calls`, CLI `50 pass`, package `185 pass`, tsc exit 0.
