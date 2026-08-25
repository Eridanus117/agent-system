# Story 5.1: 修复 Claude fresh 启动的登录态丢失

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 使用 Claude Code 的个人实践者，
I want fresh 启动的新 Claude Code 会话保留我当前的登录态，
so that 我不必每次用 `configs use --client claude-code` 都重新登录。

## Acceptance Criteria

1. **Given** 用户执行 `configs use <revisionId> --client claude-code` 并完成唯一一次确认
   **When** 新 Claude Code 进程 fresh 启动
   **Then** 该进程保留用户当前真实的登录态，不要求用户重新登录
   **And** 登录凭据只在调用作用域的隔离目录内只读复制，不写入 SQLite、投影、manifest、plan 或 receipt（AD-6、AD-23）。

2. **Given** 调用作用域内的凭据副本
   **When** 本次启动达到任一终态（`succeeded | degraded | failed | incomplete`）
   **Then** 凭据副本随 invocation 目录一并清理，清理时机不早于 Claude 进程及其显式 spawn 的子进程已知不再读取该目录期间（复用 `ClaudeInvocationDirPort.cleanup` 既有清理节点，不新发明一个）
   **And** 不产生可被读者观察到的半写或残留状态（复用 `writeToSameDirTempFile` 的同目录临时文件原子替换纪律）。

3. **Given** 当前登录凭据文件不可读、不存在或格式无法识别
   **When** launch 阶段尝试复制凭据
   **Then** 按 AD-10 fail-closed，将该次 fresh 启动记为失败（`applyFailure`），受影响能力标注为新增的 `claude.credentials-continuity` capabilityId
   **And** 不产生"看起来成功、实际未登录"的部分状态——即不允许在凭据复制失败的情况下继续 spawn。

4. **Given** 一次真实的 `configs use <revisionId> --client claude-code`（真实 `claude` 二进制，非 fake port）
   **When** 新进程 fresh 启动完成
   **Then** 该新进程的 `CLAUDE_CONFIG_DIR`（即隔离 invocation 目录）下存在一份可被 Claude Code 识别为已登录凭据的 `.credentials.json`
   **And** 该文件内容与启动前 `$HOME/.claude/.credentials.json`（或当前生效的 `CLAUDE_CONFIG_DIR/.credentials.json`）一致。

## Tasks / Subtasks

- [ ] Task 1：Probe 扩展——新增 `claude.credentials-continuity` capability（AC 3）
  - [ ] 在 `packages/control-plane/src/adapters/clients/claude/capability-probe.ts` 的 `BunClaudeCapabilityProbe.probeHardControlCapabilities()` 里新增一个私有探测方法，风格参照 `probePluginDirDelivery`/`probeAppendSystemPromptDelivery`（`hasFlag` 式的二元判定，而非枚举比对）——但这条**不是** `--help` 文本探测，是**真实文件系统探测**：检查凭据源文件（见 Task 2 的路径解析规则）是否存在且可读。`required: true`。
  - [ ] `evidenceRef` 只描述"文件是否存在于该路径"，绝不读取或转述文件内容（AD-6）。
- [ ] Task 2：实现凭据源路径解析（AC 1, 4）
  - [ ] 新建 `packages/control-plane/src/adapters/clients/claude/credentials.ts`（或并入 `content-materializer.ts`，由实现者决定，但建议独立文件，因为它读取的是宿主环境状态，不是 `sourceRef`，语义上与 `materializeClaudeContent` 不同源）。
  - [ ] 解析规则：`process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude')`，凭据文件名固定为 `.credentials.json`（已在本机 `~/.claude/.credentials.json` 实测确认存在，509 字节，顶层字段：`claudeAiOauth`、`accessToken`、`refreshToken`、`expiresAt`、`refreshTokenExpiresAt`、`scopes`、`subscriptionType`——只需要按字节整体复制，不需要解析/理解这些字段）。
  - [ ] **不要重新发明凭据发现逻辑**——如果发现 `claude --help`/文档暴露了官方的凭据路径解析方式（例如 `CLAUDE_HOME` 或类似环境变量），优先复用官方语义而不是硬编码 `os.homedir()`。
- [ ] Task 3：实现凭据物化（AC 1, 2, 4）
  - [ ] 复用 `content-materializer.ts` 里已有的 `writeFileAtomic`（或其底层 `writeToSameDirTempFile`，见 `adapters/system/atomic-write.ts`）做同目录临时文件原子替换；复制目标写入 `<invocationDir>/.credentials.json`（**invocation 目录根**，因为该目录本身就是新进程的 `CLAUDE_CONFIG_DIR`，Claude Code 需要在其根下找到 `.credentials.json`——注意这与 AD-21 的 `materialized/` 子目录规则不同：AD-21 的物化内容不能写根，是因为根同时是 `cwd`；但凭据文件必须写根，因为 Claude Code 就是从 `CLAUDE_CONFIG_DIR` 根下读 `.credentials.json`，这是两条不同的约束，不要混淆）。
  - [ ] 用 `cp`（`node:fs/promises`）做字节级复制，不解析/重新序列化 JSON——避免任何格式漂移风险。
  - [ ] 新增一个端口接口，参照 `ClaudeContentMaterializerPort`（`application/ports.ts:593`）的既有模式（`Epic 4 retro fix` 引入的教训：真实 IO 协作者必须走注入端口，不能被 `claude-launch.ts` 直接调用自由函数）——建议 `ClaudeCredentialsPort`，方法签名类似 `materialize(invocationDir: string): Promise<ClaudeCredentialsMaterializationResult>`。
- [ ] Task 4：接入 `launchClaudeFresh`（AC 1, 2, 3）
  - [ ] 在 `packages/control-plane/src/application/claude-launch.ts` 里，`LaunchClaudeFreshDeps` 接口（第 74-81 行）新增 `readonly claudeCredentialsPort: ClaudeCredentialsPort;`。
  - [ ] 在 `launchClaudeFresh` 函数内，**invocation 目录已创建之后、`claudeContentMaterializer.materialize` 调用之前或之后均可**（与 AD-21 内容物化并列，不依赖顺序），插入凭据物化调用；失败时走与既有 `content-materialization-blocked` 分支同样的 `applyFailure` + `outcomeFor` 模式（第 543-560 行是现成的参照写法），但用一个新的失败前缀（例如 `credentials-continuity-blocked`），不要复用 `content-materialization-blocked` 这个字符串（那个专指 AD-21 的 Instructions/Skills/MCP 物化，混用会让 `affectedCapabilities`/日志语义变得不可区分）。
  - [ ] `adapter-plan.ts` 的 `compileClaudeAdapterPlan`（第 206-228 行）里 `generatedFiles` 数组可以新增一个 `purpose: 'credentials'` 的声明性条目（`ClaudeAdapterPlanGeneratedFile.purpose` 联合类型需要相应扩展，第 126 行），保持"只声明意图、不带路径/内容"的既有纪律（AD-19）——是否做这一步由实现者判断，AC 里没有强制要求 plan 层面暴露这个声明，只要求实际行为正确；如果不加，需要在 Dev Notes 里如实说明"为什么这次没有和其他三种内容物化一样在 plan 里声明"。
- [ ] Task 5：测试（覆盖全部 4 条 AC）
  - [ ] `tests/adapters/`（新建 `claude-credentials.test.ts`，参照 `claude-content-materializer.test.ts` 的写法）：单测凭据源路径解析规则、复制成功、源文件不存在/不可读时的失败上报。
  - [ ] `tests/application/claude-launch.test.ts`：新增/扩展用例覆盖 AC 1-3（fake `ClaudeCredentialsPort` 场景：成功、失败阻断整个启动、失败原因正确进入 `applyFailure`）。
  - [ ] `tests/integration/cli-claude-launch.test.ts`：如果该文件已有真实 `claude` 二进制的端到端用例，扩展它验证 AC 4（隔离目录下确实出现 `.credentials.json` 且内容与源一致）；如果目前只有 fake port 覆盖，在 Dev Notes/Completion Notes 里如实说明"AC 4 的真实二进制验证尚未自动化，是手工验证的"，不要假装自动化覆盖了它。
  - [ ] `tests/adapters/claude-capability-probe.test.ts`：新增 `claude.credentials-continuity` 探测方法的单测（存在/不存在两种真实文件系统场景，用临时目录，不依赖 `~/.claude` 真实内容）。

## Dev Notes

- **根因（已核实，非推测）：** `application/claude-launch.ts:592`，`launchClaudeFresh` 里 `spawnResult = await deps.claudeProcessPort.spawn({ argv: finalArgv, env: { CLAUDE_CONFIG_DIR: invocationDir }, cwd: invocationDir })`——`CLAUDE_CONFIG_DIR` 被整体指向一个全新、空的隔离目录（`adapters/system/claude-invocation-dir.ts` 的 `FsClaudeInvocationDirPort.prepare`），而 Claude Code 的登录凭据就存在 `CLAUDE_CONFIG_DIR` 下的 `.credentials.json`，新目录里没有这个文件，新进程因此无登录态。
- **凭据文件的真实位置与形态（2026-08-25 已在本机 Windows 环境实测确认，不是文档声称）：** 默认 `CLAUDE_CONFIG_DIR`（即 `$HOME/.claude`）下的 `.credentials.json`，509 字节的单一 JSON 文件（不是 OS keychain，不是多文件），顶层字段为 `claudeAiOauth`（内嵌 `accessToken`/`refreshToken`/`expiresAt`/`refreshTokenExpiresAt`/`scopes`）与 `rateLimitTier`/`subscriptionType`。**这条实测结果满足 AD-23 `[PROPOSED]` 状态要求的"probe 核实"前提之一**——Story 落地时请把这条实测结果写进 AD-23，把状态从 `[PROPOSED]` 转 `[ADOPTED]`（Architecture Spine 文件：`_bmad-output/planning-artifacts/architecture/architecture-agent-system-2026-08-22/ARCHITECTURE-SPINE.md`，AD-23 在 AD-22 之后）。
- **AD-23 的完整约束原文（本 Story 的权威合同）：** 凭据只读复制到调用作用域隔离目录，不写入 SQLite/投影/receipt/manifest/plan（AD-6 边界不变）；清理时机复用 AD-9/AD-21 既有节点，不早于进程仍可能读取期间；凭据不可读/格式无法识别时按 AD-10 fail-closed，不产生部分应用状态。
- **已知未核实的边界（残留风险，如实记录）：** 上面这条凭据位置实测**只在本机 Windows 环境做过**。`.credentials.json` 是否是 macOS/Linux 上同样的形态（尤其 macOS 是否改用系统 keychain 而非纯文件）**未核实**——如果实现环境是跨平台的，Task 2 的路径解析需要按平台分支处理，或者在 probe 阶段对不支持的平台诚实返回 `unknown`（AD-10 fail-closed），不要假设 Windows 的实测结果可以直接套用到其他平台。
- **不要做的事：**
  - 不要把凭据内容读入内存后做任何形式的日志/console 输出（哪怕是调试用途）——凭据文件应该只经过 `cp`/流式复制，代码路径上不应该出现 `JSON.parse(credentialsContent)` 这类操作。
  - 不要把凭据路径或存在性判断结果写入 `evidenceRef` 之外的任何持久字段。
  - 不要在 `content-materializer.ts` 现有的 `materializeClaudeContent` 函数里直接加凭据逻辑——那个函数的输入是 `revision.instructions/skills/mcp`（来自 `sourceRef`），凭据不是 `CapabilityReference`，混进去会破坏该函数"只读 `sourceRef`"的既有前置条件（其内部文档明确写"Read-only over `revision`'s references"）。

### 需要读的既有文件（UPDATE 目标，实现前必须读完）

- `packages/control-plane/src/application/claude-launch.ts`（645 行，全文已在本次 Story 创建过程中读完）：`launchClaudeFresh` 函数（392-642 行）是主要改动点；`LaunchClaudeFreshDeps` 接口（74-81 行）需要新增字段；`computeClaudeKnownDifferences`（107-132 行）**可能**需要评估是否要为"凭据未延续"新增一个差异项（当前 AC 没有强制要求，但如果实现时发现某个边缘场景会导致"部分成功但凭据没接上"，应该在这里补一条差异，别让它悄悄消失）。
- `packages/control-plane/src/adapters/system/claude-invocation-dir.ts`（40 行，全文已读）：`FsClaudeInvocationDirPort.prepare`/`cleanup`，凭据物化复用同一个 `invocationDir`，不需要新建目录逻辑。
- `packages/control-plane/src/adapters/clients/claude/content-materializer.ts`（284 行，全文已读）：`writeFileAtomic`（111-115 行）与 `writeToSameDirTempFile`（`adapters/system/atomic-write.ts`）是要复用的原子写入原语；`sanitizePathSegment`（67-70 行）等辅助函数**不需要**复用（凭据文件名是固定的 `.credentials.json`，不涉及用户可控的名字清洗）。
- `packages/control-plane/src/adapters/clients/claude/capability-probe.ts`（382 行，全文已读）：`probePluginDirDelivery`/`probeAppendSystemPromptDelivery`（332-381 行）是新探测方法的最佳模板——注意它们是"检查 `claude --help` 里有没有某个 flag"，而本 Story 的新探测是"检查某个文件是否存在于磁盘"，探测机制不同，但返回值 `ClaudeCapabilityProbeResult` 的 shape、`required`/`status`/`validationMethod`/`evidenceRef`/`observedAt` 字段语义完全一致，照抄 shape 就行，别照抄探测逻辑本身。
- `packages/control-plane/src/adapters/clients/claude/adapter-plan.ts`（228 行，全文已读）：`envKeys = ['CLAUDE_CONFIG_DIR']`（第 208 行）是固定值，AD-19 明确"persisted plan 只含环境键，从不含真实值"——凭据物化不改变这条既有约束，凭据文件本身不经过 `ClaudeAdapterPlan` 持久化，只在运行期 `RuntimeLaunchSpec` 层面存在。
- `packages/control-plane/src/application/ports.ts`：`ClaudeContentMaterializerPort`（593-595 行）、`ClaudeInvocationDirPort`（564-578 行）、`ClaudeProcessPort`（448-452 行）是三个可参照的端口定义模式；本 Story 新增的 `ClaudeCredentialsPort` 应该紧邻 `ClaudeContentMaterializerPort` 放置。

### Project Structure Notes

- 新文件建议落在 `packages/control-plane/src/adapters/clients/claude/`（与 `content-materializer.ts`、`capability-probe.ts`、`adapter-plan.ts` 同级），符合 `ARCHITECTURE-SPINE.md` 结构种子里 `adapters/clients/claude/` 的既有边界（probe、plan、launch/resume、interpret 都在这里）。
- 端口接口（`ClaudeCredentialsPort`）加在 `application/ports.ts`，符合既有的"端口定义集中在 `application/ports.ts`，实现在 `adapters/`"分层（AD-3：应用层是唯一产品状态变更入口，adapter 不做产品决定）。
- 未发现与本 Story 冲突的既有结构；`domain/` 层不需要改动（这条能力不涉及领域实体或状态机变更，`LaunchPlan` 的 AD-18 转换表不需要新增状态——凭据复制失败复用既有 `applying → failed` 转换）。

### References

- [Source: `_bmad-output/planning-artifacts/architecture/architecture-agent-system-2026-08-22/ARCHITECTURE-SPINE.md#AD-23`]（本 Story 新增的权威合同，`[PROPOSED]` 状态）
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-agent-system-2026-08-22/ARCHITECTURE-SPINE.md#AD-6`]（secret 只存在于调用作用域）
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-agent-system-2026-08-22/ARCHITECTURE-SPINE.md#AD-9`]（invocation 目录清理节点、同目录临时文件原子替换）
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-agent-system-2026-08-22/ARCHITECTURE-SPINE.md#AD-10`]（fail-closed）
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-agent-system-2026-08-22/ARCHITECTURE-SPINE.md#AD-21`]（内容物化模式，本 Story 的姊妹机制但源头不同）
- [Source: `_bmad-output/planning-artifacts/epics.md#Story 5.1`]（本 Story 的 Epic 级来源，AC 与本文件一致）
- [Source: GitHub Issue #9]（真实复现证据：`configs use --client claude-code` 真实执行后新会话丢失登录态）
- [Source: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-25-epic-4-post-delivery-fixes.md`]（本 Story 的 correct-course 决策记录）

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

### Completion Notes List

### File List
