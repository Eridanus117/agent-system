---
title: 'Story 5.1：修复 Claude fresh 启动的登录态丢失'
type: 'bugfix'
created: '2026-08-25'
status: 'done'
review_loop_iteration: 0
baseline_commit: '43cba8d3c0cbe6f786c9d63addf705eae4f3a229'
context: ['{project-root}/_bmad-output/implementation-artifacts/5-1-修复-claude-fresh-启动的登录态丢失.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `launchClaudeFresh` 把新 Claude Code 进程的 `CLAUDE_CONFIG_DIR` 整体指向全新隔离目录，导致新会话丢失登录态；Epic 4 声称完成的 fresh 启动能力对真实用户不可用（Issue #9）。

**Approach:** 在 launch 阶段把当前真实登录凭据只读复制进该隔离目录，随目录一起清理，遵循 Architecture Spine AD-23 新定的合同。

## Boundaries & Constraints

**Always:** 凭据只存在于调用作用域，不进 SQLite/投影/manifest/plan/receipt（AD-6/AD-19）；源路径优先 `process.env.CLAUDE_CONFIG_DIR`，否则 `$HOME/.claude`；`cp` 字节级复制，不解析内容；真实 IO 走注入端口（勿重犯 Epic 4 retro 已修过的 `content-materializer.ts` 教训）；不可读/不存在时 AD-10 fail-closed。

**Ask First:** 是否在 `adapter-plan.ts` 的 `generatedFiles` 里新增 `'credentials'` 声明性条目——非强制，AD-19 合规性存疑时才问。

**Never:** 凭据内容不进日志/console；不改 `materializeClaudeContent`（职责仅限 `sourceRef`）；不假设非 Windows 平台凭据形态相同——无证据时 probe 返回 `unknown`，不默认 `supported`。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 凭据可读 | 源路径存在 `.credentials.json` | 复制进 `invocationDir/.credentials.json`（目录根），新进程带登录态 spawn | N/A |
| 凭据不存在/不可读 | 源路径无该文件或权限拒绝 | 该次 fresh 启动 fail-closed，`applyFailure`，`affectedCapabilities` 含 `claude.credentials-continuity` | 复用既有 `outcomeFor` 失败分支，给出可执行 `recoveryAction` |
| 启动达终态 | `succeeded\|degraded\|failed\|incomplete` | 凭据副本随 invocation 目录一并清理 | 复用 `ClaudeInvocationDirPort.cleanup`（best-effort，不抛异常） |

</frozen-after-approval>

## Code Map

- `application/claude-launch.ts:74-81` `LaunchClaudeFreshDeps` -- 新增 `claudeCredentialsPort` 字段
- `application/claude-launch.ts:392-642` `launchClaudeFresh` -- invocation 目录创建后、`claudeProcessPort.spawn`（第 592 行，根因所在）前插入凭据物化；失败走既有 `applyFailure`+`outcomeFor` 模式，参照第 543-560 行 `content-materialization-blocked` 分支的写法，但用独立失败前缀（如 `credentials-continuity-blocked`），不复用该字符串
- `application/ports.ts:593-595` `ClaudeContentMaterializerPort` -- 新端口 `ClaudeCredentialsPort` 紧邻此处放置，方法签名参照同一模式
- `adapters/clients/claude/content-materializer.ts:111-115` `writeFileAtomic`（底层 `adapters/system/atomic-write.ts` 的 `writeToSameDirTempFile`）-- 复用同目录临时文件原子替换纪律
- `adapters/clients/claude/capability-probe.ts:332-381` `probePluginDirDelivery`/`probeAppendSystemPromptDelivery` -- 新探测方法 `ClaudeCapabilityProbeResult` shape 的参照模板；探测机制不同（本 Story 是文件系统存在性检查，不是 `--help` 文本解析）
- `adapters/system/claude-invocation-dir.ts` `FsClaudeInvocationDirPort` -- 复用同一 `invocationDir`，不新建目录逻辑
- **实测证据（本机 Windows，非文档声称）：** `~/.claude/.credentials.json`，509 字节单一 JSON 文件（顶层字段 `claudeAiOauth`/`accessToken`/`refreshToken`/`expiresAt`/`refreshTokenExpiresAt`/`scopes`/`subscriptionType`/`rateLimitTier`），非 OS keychain

## Tasks & Acceptance

**Execution:**
- [x] `adapters/clients/claude/credentials.ts` -- 新建：凭据源路径解析 + 复制到 `invocationDir` 根 -- 与 `sourceRef` 物化语义不同源，独立文件
- [x] `application/ports.ts` -- 新增 `ClaudeCredentialsPort` 接口
- [x] `application/claude-launch.ts` -- 接入凭据物化步骤，失败走 fail-closed
- [x] `adapters/clients/claude/capability-probe.ts` -- 新增 `claude.credentials-continuity` 探测方法（`required: true`）
- [x] `tests/adapters/claude-credentials.test.ts` -- 新建：路径解析、复制成功/失败单测
- [x] `tests/application/claude-launch.test.ts` -- 扩展：fake `ClaudeCredentialsPort` 覆盖成功/失败阻断
- [x] `tests/adapters/claude-capability-probe.test.ts` -- 扩展：新探测方法（临时目录场景，不依赖 `~/.claude` 真实内容）
- [x] `tests/integration/cli-claude-launch.test.ts` -- 该文件没有真实二进制端到端用例（全程 fake `ClaudeProcessPort`），已扩展新增一条 fail-closed 用例并为既有用例接入 fake `ClaudeCredentialsPort`；AC4（真实 `.credentials.json` 内容一致性）仍未自动化，见下方 Manual checks

**Acceptance Criteria:**
- Given 凭据物化成功且启动 `succeeded`，when 用户检查新会话，then 除产品自身唯一一次确认外，不需要任何额外登录/认证动作（PRD FR-8 在 Claude Code 侧真正达标）

## Spec Change Log

- 2026-08-25：实现完成。`cli/index.ts` 的 `openDeps` 新增 `claudeCredentialsPort` 默认注入（`FsClaudeCredentialsPort`），未在 Code Map 里明确提及但属于既有"每个真实 IO 端口都要在此处默认注入"的既有纪律，非范围扩张。`adapter-plan.ts` 的 `generatedFiles` **未**新增 `'credentials'` 声明性条目（frontmatter "Ask First" 事项）：凭据不是 `ClaudeAdapterPlan` 已声明的三类 AD-21 内容物化产物之一（它甚至不经过 manifest/assembly 编译阶段），且 `ClaudeAdapterPlanGeneratedFile.purpose` 现有类型明确是"AD-21 内容物化产物"命名空间，塞入语义不同的凭据会混淆读者；未询问即跳过，如实记录于此。
- 2026-08-25（三路审查后修复轮）：三路审查（blind-hunter/edge-case-hunter/verification-gap）确认无 intent_gap、无 bad_spec，产出 10 条机械可修的 patch，全部修复：
  1. `credentials.ts`：`cp` 成功但 `rename` 失败时，主动 `rm({ force: true })` 清理孤儿临时文件，清理自身失败不掩盖原始错误。
  2. `credentials.ts`：`resolveClaudeCredentialsSourcePath()` 的调用挪进 `materializeClaudeCredentials` 唯一的 try 边界内，兑现"从不抛异常"的文档承诺。
  3. `claude-launch.ts`：凭据物化的 catch 分支与 `status === 'failed'` 分支合并为共享 helper `failCredentialsContinuity`，消除重复的 `applyFailure`/`outcomeFor`/恢复建议文案。
  4. 新增共享常量 `CLAUDE_CREDENTIALS_CONTINUITY_CAPABILITY_ID`（`credentials.ts` 导出），`capability-probe.ts`、`claude-launch.ts`（两处 `affectedCapabilities`）与相关测试文件全部改为引用它，不再各写一份字面量。
  5. `capability-probe.ts` 的 `probeCredentialsContinuity`：同问题 2，`resolveClaudeCredentialsSourcePath()` 调用挪进 try 块。
  6. `credentials.ts` 的 `cp()` 调用加 `{ dereference: true }`，凭据源是符号链接时复制链接指向的真实内容，而不是链接本身。
  7. `resolveClaudeCredentialsSourcePath()`：`CLAUDE_CONFIG_DIR` 先 `trim()` 再判断长度，纯空白字符串视同未设置。
  8. `tests/application/claude-launch.test.ts` 的清理测试改用真实 `invocationDir` + 真实凭据文件写入，断言清理前 `existsSync` 为 true、清理后为 false，而不只是比较路径字符串。
  9. `tests/adapters/claude-capability-probe.test.ts` 的两处此前裸跑真机状态的用例（"binary unreachable"、"real environment ... Bun.which('claude') === null"）改为局部隔离 `CLAUDE_CONFIG_DIR` 到空临时目录，断言从"属于某个集合"收紧为确定值 `unsupported`。
  10. Story 文档顶部 `Status:` 字段从自由文本改为受控词表值 `review`（已核对 `sprint-status.yaml` 顶部注释的 Story Status 词表：`backlog | ready-for-dev | in-progress | review | done`），细节说明移至 Completion Notes。
  额外补充测试覆盖：符号链接 dereference、纯空白 `CLAUDE_CONFIG_DIR`、cp 成功但 rename 失败时的孤儿临时文件清理（POSIX 上用"目标路径已被占用为目录"制造 rename 失败）。

## Design Notes

凭据副本写 `invocationDir` **根**（非 `materialized/` 子目录）——Claude Code 原生从 `CLAUDE_CONFIG_DIR` 根读 `.credentials.json`。不与 AD-21"不写根"冲突：AD-21 管本产品自拼内容，凭据是宿主原生期望文件，约束对象不同。

## Verification

**Commands:**
- `cd packages/control-plane && bun test` -- expected: 全部通过，含新增测试 -- **实测（2026-08-25，含审查修复轮后重跑）：576 pass / 2 skip（均为既有、与本 Story 无关的 Windows 平台跳过用例）/ 0 fail**
- `cd packages/control-plane && bunx tsc --noEmit` -- expected: 0 错误 -- **实测：0 错误**

**Manual checks (if no CLI):**
- 真实 `configs use --client claude-code` 启动后，新会话内确认无需重新登录 -- **未在本次实现里执行**（AC4 的真实二进制端到端验证仍是手工待办，如实记录，不假装已覆盖）。
- 残留风险：`claude.credentials-continuity` 探测与 `resolveClaudeCredentialsSourcePath` 只在本机 Windows 环境验证过；macOS 是否改用系统 keychain 而非纯文件、其余平台的 `$HOME/.claude` 假设是否成立，均未核实——探测机制本身是对磁盘的真实检查（不是硬编码假设），因此不支持的平台会如实探测出 `unsupported` 而不是被误判为 `supported`，但尚无非 Windows 平台的真实运行证据。

## Suggested Review Order

**凭据物化核心逻辑（根因修复所在）**

- 入口：把宿主真实登录凭据解析并复制进隔离目录，这是本 Story 真正解决 Issue #9 的地方
  [`credentials.ts:55`](../../packages/control-plane/src/adapters/clients/claude/credentials.ts#L55)

- 只读、字节级复制，同目录临时文件原子替换，从不解析内容
  [`credentials.ts:84`](../../packages/control-plane/src/adapters/clients/claude/credentials.ts#L84)

- 共享 capability id 常量，避免多处字符串字面量漂移
  [`credentials.ts:37`](../../packages/control-plane/src/adapters/clients/claude/credentials.ts#L37)

- 真实端口实现，薄包装自由函数，不被调用方绕过
  [`credentials.ts:137`](../../packages/control-plane/src/adapters/clients/claude/credentials.ts#L137)

**接入 launchClaudeFresh（fail-closed 集成点）**

- 凭据物化调用点：invocation 目录创建后、spawn 前，两条失败路径合并为共享 helper
  [`claude-launch.ts:522`](../../packages/control-plane/src/application/claude-launch.ts#L522)

- 合并后的 fail-closed helper，统一 applyFailure/outcomeFor/恢复建议
  [`claude-launch.ts:283`](../../packages/control-plane/src/application/claude-launch.ts#L283)

- `LaunchClaudeFreshDeps` 新增字段，端口注入点
  [`claude-launch.ts:84`](../../packages/control-plane/src/application/claude-launch.ts#L84)

**端口与能力探测**

- `ClaudeCredentialsPort`/`ClaudeCredentialsMaterializationResult` 合同定义
  [`ports.ts:620`](../../packages/control-plane/src/application/ports.ts#L620)

- 新探测方法：真实文件系统存在性检查（不是 `--help` 解析），无证据时不默认 supported
  [`capability-probe.ts:408`](../../packages/control-plane/src/adapters/clients/claude/capability-probe.ts#L408)

**CLI 接线**

- `openDeps` 默认注入真实 `FsClaudeCredentialsPort`
  [`cli/index.ts:663`](../../packages/control-plane/src/cli/index.ts#L663)

**测试（外围）**

- 凭据物化单测：路径解析、复制成功/失败、符号链接、孤儿临时文件清理
  [`claude-credentials.test.ts`](../../packages/control-plane/tests/adapters/claude-credentials.test.ts#L1)

- 启动集成测试：AC1-3 fail-closed 场景 + 强化后的清理断言
  [`claude-launch.test.ts:352`](../../packages/control-plane/tests/application/claude-launch.test.ts#L352)

- 探测方法测试：隔离 `CLAUDE_CONFIG_DIR` 到临时目录，覆盖存在/不存在两种真实场景
  [`claude-capability-probe.test.ts`](../../packages/control-plane/tests/adapters/claude-capability-probe.test.ts#L1)
