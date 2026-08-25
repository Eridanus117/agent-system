- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-选择配置并使用-omp.md`
  summary: `requestConfigSwitch` is not transactional across its two `LaunchPlanRepository.save()` calls -- if `prepareLaunchPlan` throws while creating the replacement plan (e.g. a future `UnsupportedClientError` reachable outside the CLI's own pre-validation), the previous plan is left stranded in `requires-restart` with no replacement plan and no compensating rollback.
  evidence: raised independently by the blind-hunter and edge-case-hunter review layers against the Story 1.2 diff; not reachable through the shipped CLI today (client is validated to `'omp'` before `requestConfigSwitch` is ever called, and a not-found/unsupported new revision does not throw -- `prepareLaunchPlan` resolves it to a `failed` plan instead), so it does not block Story 1.2's acceptance criteria, but is a real gap if `requestConfigSwitch` is ever called from a new call site or a second client becomes supported.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-选择配置并使用-omp.md`
  summary: `configs status`/`use`/`switch` silently ignore trailing/extra positional arguments (e.g. `configs status <id> <garbage>`) instead of returning a usage error, unlike the stricter validation `show`/`compare` already have from Story 1.1.
  evidence: raised by the blind-hunter review layer; a real CLI consistency/UX gap, but low severity (extra tokens are simply dropped, not misinterpreted as something harmful) and not required by any of Story 1.2's acceptance criteria.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-选择配置并使用-omp.md`
  summary: launch-context JSON files written by `FsLaunchContextWriter` (`<state-dir>/launch-context/<planId>.json`) are never cleaned up -- there is no retention policy or garbage collection, so the directory grows unbounded over the life of a machine/user.
  evidence: raised by the blind-hunter review layer; a real operational-hygiene gap, but out of Story 1.2's scope (no cleanup/observation infrastructure is required by any acceptance criterion, and Story 1.1 similarly ships no cleanup for its own on-disk artifacts).

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-选择配置并使用-omp.md`
  summary: rare application-layer failures during `runLaunchFlow` (e.g. `confirmLaunchPlan` hitting a stale confirmation, or `launchOmp` failing inside the capability-probe/context-writer calls in a way that itself throws rather than resolving to a `failed` plan) are not individually try/caught in `cli/index.ts`, so they surface through the generic top-level "configs: unexpected failure: ..." handler instead of the typed `renderLaunchFailure` view.
  evidence: raised by the edge-case-hunter review layer; these paths are already safely caught and reported (non-zero exit, no crash, no data corruption) by the existing top-level `catch` in `if (import.meta.main)`, just with a less polished message than the rest of the Story's typed failure rendering -- a genuine but cosmetic gap, not a functional defect.
  severity_reassessment (informational, second independent review pass -- annotation only, underlying gap still not fixed): a later independent code review reassessed this item's severity from "cosmetic" to "real but non-blocking" -- these paths do reach the user as an unpolished, un-typed message (`configs: unexpected failure: ...`) rather than the Story's typed `renderLaunchFailure` rendering, which is a real (if narrow) inconsistency in the CLI's failure-reporting contract, not merely a stylistic nit. It remains non-blocking for Story 1.2's acceptance criteria (no crash, no data corruption, non-zero exit still returned) and is left as documented deferred work, not fixed by this pass.

- source_spec: `_bmad-output/implementation-artifacts/spec-cli-ux-delta.md`
  summary: `src/cli/i18n.ts` 里的中文文案在全角标点和半角 ASCII 空格之间混排（例如 `指令： （未配置）`，来自 `${label} ${t('capabilityGroup.emptySingle')}`），中文排版不够地道。
  evidence: blind-hunter 审查层发现；纯文案打磨问题，不是功能缺陷，任何验收标准都未要求这一点。

- source_spec: `_bmad-output/implementation-artifacts/spec-cli-ux-delta.md`
  summary: 新增的交互式 TUI 入口（交互 TTY 下不带参数运行 `configs`）在 `USAGE`/帮助文本里完全没有提及，用户读到打印出的用法说明也无法得知它的存在。
  evidence: blind-hunter 审查层发现；是合理的体验打磨建议，但 DESIGN.md/EXPERIENCE.md 与 spec-cli-ux-delta.md 的 Tasks & Acceptance 均未要求 `USAGE` 提及 TUI（EXPERIENCE.md 的 Key Flows 里用户就是直接敲 `configs` 自然发现的）。

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-选择配置并使用-omp.md`
  summary: `openDeps()`（`packages/control-plane/src/cli/index.ts`）构造 `ompPort`/`capabilityProbe`/`contextWriter`（`new BunOmpProcessPort()` 等）的代码在保护 `configRepository`/`launchPlanRepository` 构造的 try/catch 之外——如果这三个构造函数中任意一个抛出异常，已打开的 SQLite 句柄会泄漏，异常本身也不会被捕获。
  evidence: edge-case-hunter 审查层针对 spec-cli-ux-delta.md 的 diff 提出，但核实为历史遗留问题：这个结构（端口构造在仓储 try/catch 之外）在 spec-cli-ux-delta.md 的 `openDeps()` 抽取之前，`main()` 里就已经原样存在（Design Notes："openDeps() 抽取只是把 main() 现有...行原样搬到一个可复用函数,不改变其错误处理/close顺序"）。不是 Story 1.2 或本次 CLI UX delta 故事引入的问题；归属到 Story 1.2 作为原始来源。

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-选择配置并使用-omp.md`
  summary: `validateCapabilityEntry`（`packages/control-plane/src/adapters/sqlite/repository.ts`）只校验能力条目的 `name` 字段，不校验 `sourceCategory`/`summary` 这两个同样必填的 `Fact<T>` 字段——手工改坏的行或未来某个写入路径的 bug 若产生缺失/畸形的 `sourceCategory`/`summary`，会顺利通过解析，之后在 `render.ts` 的 `formatCapabilityRef` 调用 `formatFact`/`isKnown` 时因访问 `undefined.kind` 而抛出未捕获异常，而不是走该函数文档承诺的 `ConfigUnsupportedError`/降级到 `[]` 路径。
  evidence: /code-review skill 独立审查发现，经我本人对照 `repository.ts`/`facts.ts`/`render.ts` 源码核实为真实缺口。当前所有写入路径（seed 脚本等）都不会产生这种畸形数据，不可达；但作为一个类型契约上的防御性缺口，值得后续单独修一次而不是在本次 UX delta 顺手改——这属于 Story 1.2 复盘行动项 2（`parseCapabilityJson` 校验）本身的完整性问题，不是本次 TUI/i18n/颜色改动引入的。

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-选择配置并使用-omp.md`
  summary: 同一处新增的按条目 `name` 校验，在 `findById`（严格模式）与 `listAll`（宽松模式）下对同一条脏数据反应不一致——`configs list` 会把畸形的 `hooks`/`plugins` 条目静默清空后照常显示该修订版本，而 `configs show`/`configs use` 同一个 id 会直接抛 `ConfigUnsupportedError` 拒绝显示/启动，即使出问题的字段（如 hooks）本来就不会被实际用于启动。
  evidence: /code-review skill 独立审查发现，经核实为真实的 list/show 不一致行为。修复需要先做一个设计判断（该让 list 也变严格，还是让 show/use 对不影响启动的字段变宽松），不是可以无争议地机械修的 patch，留给后续专门处理，不阻塞本次合并。

- source_spec: `_bmad-output/implementation-artifacts/spec-cli-ux-delta.md`
  summary: `application/launch.ts` 里 `applyFailure` 记录的失败原因（如 `revision-lookup: ${error.message}`、`spawn-process: ${error.message}`）是原始英文诊断文本，拼进已经本地化的 `t('failure.reason', {reason})` 句子后，在默认中文环境下会出现"原因：revision-lookup: configuration revision not found (...)"这种中英混杂的句子。
  evidence: /code-review skill 独立审查发现，经核实为真实的中文默认体验瑕疵。未修复的原因：这些诊断字符串来自 `application/launch.ts` 内部拼接以及更底层的 `ConfigNotFoundError`/`ConfigUnsupportedError` 等既有错误类（Story 1.1/1.2 遗留，非本次改动新增），要完整翻译需要动到这些错误类自身的 message，范围超出本次 UX delta 的边界；处理方式与 Design Notes 里对 `computeKnownDifferences` reason code 不翻译的既有决定一致——都被视为诊断性代码而非说明性整句，先记录，不在本次里扩大范围修。

- source_spec: `_bmad-output/implementation-artifacts/spec-cli-ux-delta.md`
  summary: `launchOmp`（`application/launch.ts`）里 `getConfigRevisionDetail` 的重新读取和 `capabilityProbe.probeStatusViewingCapability()` 两个互不依赖的调用是顺序 await 而不是并发执行，每次启动都要付出两者延迟之和而不是取两者较大值。
  evidence: /code-review skill 独立审查发现，属实但是纯性能建议、不是正确性缺陷。改成 `Promise.all` 会改变失败路径行为（revision 查询失败时探针调用现在会跳过，并发后会变成两者都执行），属于需要额外判断取舍的改动，本次不顺手改，留待后续单独评估。

- source_spec: `_bmad-output/implementation-artifacts/spec-cli-ux-delta.md`
  summary: `tests/cli/tui.test.tsx` 里的 `FakeConfigRevisionRepository`/`FakeLaunchPlanRepository`/`FakeOmpProcessPort` 等一整套 fake 实现与 `tests/application/launch.test.ts` 里已有的 fake 几乎逐字重复，两处未来任一接口变化都要同步改两份，否则会有一份悄悄过期。
  evidence: /code-review skill 独立审查发现，真实的测试维护性问题，但不影响当前正确性，属于测试基础设施重构（抽取共享 fake 模块），本次不顺手做，留待后续测试整理时处理。

- source_spec: none
  summary: configs 自更新客户端（Epic 2 / Story 2.2）——进程启动时后台检查、下载、完整性校验并原地替换本地二进制，接入 src/cli/index.ts 的启动路径。
  evidence: 本次意图（Epic 2：控制面发布与自更新）被判定为多目标，与"打包并发布 release 二进制"（Story 2.1）拆分——后者独立交付即有价值（哪怕没有自动更新，用户也能手动下载装，兑现 AD-2/AD-15 的分发要求），前者依赖后者先发布出真实、带版本号和 checksum 的 release 才能做端到端验证；负责人已确认按 [S] 拆分，Story 2.2 紧跟 Story 2.1 之后做，两者可按 Story 2.1 定的发布契约（release 资产命名/版本号来源/checksum 格式）部分并行开发。

- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-打包与发布流水线.md`
  summary: `--version` 没有 `-v`/`-V` 短别名，且出现在子命令之后（如 `configs status --version`）或带多余尾随参数时行为未特别处理，只是落进既有的 `parseCommand`/子命令自身参数解析逻辑。
  evidence: blind-hunter 与 edge-case-hunter 审查层发现；都是低影响的边缘用法，不影响 I/O 矩阵定义的四个核心场景，本次不顺手扩展 `--version` 的解析面。

- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-打包与发布流水线.md`
  summary: 没有任何机制（git hook、CI 检查）防止有人不小心把 `src/cli/version.ts` 里的 `CONFIGS_VERSION` 提交成非 `'dev'` 的值，尽管整套版本注入方案依赖这个文件在仓库里永远是 `'dev'`。
  evidence: blind-hunter 审查层发现，真实的防呆缺口，但成本收益上属于可选加固，不阻塞本次交付。

- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-打包与发布流水线.md`
  summary: 发布 job 在 `gh release create` 之前没有把 `dist/*` 上传为 workflow artifact，也没有依赖缓存；如果发布步骤失败，交叉编译出的二进制直接丢失，只能整个 job 重跑。
  evidence: blind-hunter 审查层发现，真实的运维便利性缺口，但对个人项目的低频发布节奏影响很小，本次不处理。

- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-打包与发布流水线.md`
  summary: `gh release create` 只用 `--generate-notes`，没有 changelog 文件、没有区分正式版和预发布 tag（例如 `configs-v1.2.3-beta.1` 仍会被发成正式 Release），也没有更新任何 README/文档说明 `--version` 或如何获取发布的二进制。
  evidence: blind-hunter 审查层发现，均为 spec 明确范围之外的产品/文档细节，不是本次 Story 2.1 的验收要求。

- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-自更新客户端.md`
  summary: `GithubReleaseUpdater` 直接信任仓库级 `GET /releases/latest`，不按 `configs-v` 前缀过滤——如果本仓库未来出现除 `release-configs.yml` 以外的另一个 GitHub Release 发布来源（当前核实过，仓库里只有这一处 `gh release create`），`/releases/latest` 可能返回非 configs 的 release，`isNewerVersion` 解析失败会 fail-closed 静默停止自更新（不会误更新/降级，但会悄悄失效且无提示）。
  evidence: blind-hunter 审查层（第二轮）发现。修复需要改用 `GET /releases`（列表）并按前缀筛选最新一条，这会改变 spec `Boundaries & Constraints` 里已冻结钉死的固定端点（`.../releases/latest`），需要负责人重新确认端点选择，不是本次可自行决定的机械 patch；当前不可达（仓库唯一的 release 来源就是 configs），且失败模式是安全的静默不更新，不阻塞本次交付。

- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-自更新客户端.md`
  summary: 自更新客户端没有任何退出开关（如 `CONFIGS_NO_SELF_UPDATE` 环境变量或 `--no-self-update` 参数）、没有检查节流/缓存（每次调用都实打一次未认证 GitHub API，限额 60 次/小时/IP）、失败时没有可选的调试/verbose 日志（`checkAndApply` 整体静默吞掉所有错误，用户和维护者都无从诊断"自更新为什么不生效"）。
  evidence: blind-hunter 审查层（两轮）独立发现。均为合理的运维/可诊断性增强，但 spec 的 `Boundaries & Constraints`/`Never` 明确要求"任一步失败都不得输出到 stdout/stderr/TUI"且"成功和失败都不在正常输出中提示"，加开关/日志需要先决定是否、如何在不违反这条约束的前提下开一个显式 opt-in 例外，属于需要负责人裁决的产品/安全边界问题，不在本次范围内顺手加。
  resolution (Issue #153，2026-08-24，部分解决): "没有检查节流/缓存"一项已落地——检查改为每台机器每 24 小时最多一次（`adapters/self-update/check-state.ts` 的 `SELF_UPDATE_CHECK_COOLDOWN_MS` + `$HOME/.agent-system-state/control-plane/self-update.json` 时间戳），未认证 GitHub API 限额（60 次/小时/IP）不再可能被一个终端的正常使用打满。"退出开关"与"可诊断日志"两项仍未解决，仍需负责人裁决是否开例外。

- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-自更新客户端.md`
  summary: `replaceBinary` 成功更新后产生的 `<execPath>.<旧版本号>.bak` 文件永不清理，多次更新后无限累积；且两次 `rename`（旧文件→`.bak`、临时文件→`execPath`）之间仍有极小非原子窗口——若第二次 rename 失败，`execPath` 会彻底缺失且无自动回滚，只能从 `.bak` 手动恢复；另外没有并发保护，两个同时运行的 `configs` 进程可能同时触发自更新并竞争同一个 `execPath`/`<execPath>.download` 临时文件。
  evidence: blind-hunter 与 edge-case-hunter 审查层（两轮）独立发现。第一项窗口是本次 Spec Change Log 已明确"缩小但不消除"的已知残余风险（verification-gap 审查层第二轮复核确认这是"已明确接受的残余风险，不是隐藏回归"）；`.bak` 清理、失败自动回滚和并发锁都是合理的后续加固方向，但都需要额外设计判断（清理策略、回滚语义、锁的粒度），不是本次可无争议机械修的 patch，留待后续单独处理。

- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-自更新客户端.md`
  summary: `_bmad-output/implementation-artifacts/sprint-status.yaml` 目前没有 `2-2-...` 这个 story 条目（`development_status` 下只有 `epic-2: in-progress` 和 `2-1-打包与发布流水线: done`），因为 Story 2.2 是本次直接从空白起 spec 的新故事，未经过 `bmad-sprint-planning`/`bmad-create-epics-and-stories` 生成 story 级 sprint-status 条目。
  evidence: `bmad-build` 的 `sync-sprint-status` 子步骤在找不到匹配 story_key 时按设计静默跳过（"warn the user once... and return to caller"）；本次工作流运行期间已提示过一次。留给负责人决定是否需要单独跑一次 sprint-status 生成/修复来补上这个条目，不影响本次代码交付。

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-建立新配置修订-configs-establish.md`
  summary: `packages/control-plane/src/adapters/sqlite/repository.ts` 的读路径（`normalizeCapabilityEntry`/`factOrMissing`，以及 `validateCapabilityEntry` 不校验 `kind` 是否合法）对已存在字段的值只做"是否存在"检查，不做形状/类型校验，与本 Story 新增的写路径（`application/establish.ts` 的 `parseFact`/`parseCandidateRevision`）形成不对称——写路径严格拒绝畸形值，读路径会把畸形但存在的 `sourceCategory`/`summary`/`sourceRef`/`contentFingerprint`/`kind` 原样透传。
  evidence: blind-hunter 与 edge-case-hunter 审查层（Story 3.1 第二轮）独立发现。这是读路径本就存在的宽松行为（Story 1.2 复盘行动项已记录过 `validateCapabilityEntry` 只查 `name` 的同类缺口），本 Story 只是新增了字段、没有改变读路径的校验松紧程度，因此不是本 Story 引入的新缺陷，但值得后续统一加固一次。

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-建立新配置修订-configs-establish.md`
  summary: 本 Story 新持久化的 `triggerCategory`/`evidenceRef` 目前没有任何展示出口——`renderDetail`/`configs show`/`compare` 都不显示这两个字段，而 Story 3.3 现有验收标准（epics.md）只覆盖了 `supersedes`（"替代自："）与 `sourceRef`/`contentFingerprint` 的展示，未提及 trigger/evidence 的展示。
  evidence: blind-hunter 审查层（Story 3.1 第二轮）发现。这是 Story 3.1 与 Story 3.3 之间露出的一个范围缝隙，不是 Story 3.1 自身验收标准要求的行为（AD-16/AD-21 只要求持久化，不要求本 Story 展示），留给负责人判断 Story 3.3 是否也应覆盖 trigger/evidence 的展示。

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-建立新配置修订-configs-establish.md`
  summary: `packages/control-plane/src/adapters/sources/cap-fs.ts` 为满足新扩宽的领域类型，给每条能力引用和修订分别 stamp 了占位的 `sourceRef`/`contentFingerprint`/`triggerCategory`/`evidenceRef`/`supersedesRevisionId` 值，但 `tests/adapters/cap-fs.test.ts` 对这五个新字段没有任何断言。
  evidence: verification-gap 审查层（Story 3.1 第二轮）发现并核实：当前没有任何下游代码读取这些字段（`renderDetail` 尚未展示它们），因此不构成可验证的回归风险，未作为 verification gap 上报；但这是全新的生产代码且完全未经测试覆盖，值得后续补测试。

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-建立新配置修订-configs-establish.md`
  summary: `configs establish` 在无 `--from` 时读取 stdin 只做了 TTY 快速失败判断，但对"非 TTY 但流永不关闭"（如一个打开后未写入/未关闭的管道或 socket）没有任何超时保护，理论上会无限期挂起等待 `'end'`/`'error'` 事件。
  evidence: edge-case-hunter 审查层（Story 3.1 第二轮）发现。修复需要先确定一个合理的超时时长（多短会误伤合法的大体积慢速输入，多长又不足以避免挂起观感），是需要负责人裁决的产品参数，不是可无争议机械修的 patch；spec 冻结的 Boundaries 只要求 TTY 场景快速失败，未要求覆盖这一更罕见的边缘情形。

- source_spec: none
  summary: 候选功能——`configs use`/`switch` 在真正 fresh 启动 OMP 之前，先对配置引用的 MCP 服务器做一次连通性探测（而不是只做当前已有的 schema/reachability 静态检查），避免用户确认启动后，真正开始任务时才发现某个 MCP 连不上。
  evidence: 负责人在对话中提出该诉求并已明确确认排入候选（未指定具体 Epic/Story，留待后续排期裁决）。已就 OMP（`can1357/oh-my-pi`）原生能力做过技术查证：`docs/mcp-config.md` 明确记录的诊断能力（`/mcp list`、`/mcp test <name>`、`/mcp reconnect <name>` 等）全部是 slash command，且文档原文写明在"当前会话"（"in the current session"）中生效，即必须先有一个已经跑起来的 OMP 交互会话才能调用；OMP 未提供任何独立于会话之外的 headless/dry-run/CLI 连通性校验模式。因此 AR11 的 native-first 路径在此不可行——OMP 没有可复用的原生能力。若要落地，需要 Agent System 自行实现，评估过的两个方向：(a) 自建一套探测逻辑独立验证 MCP 连通性，与架构"不持有 OMP 连接状态、避免双事实源"的既有约束冲突；(b) 在真正启动前，临时拉起一个一次性 OMP 进程执行连通性检查后立即退出，再进入用户确认后的正式启动——更贴近诉求本意，但每次确认启动会多付出一次进程拉起/退出的延迟与开销，且需评估探测本身对有副作用的 MCP 服务器（如触发计费、外部状态变更）是否安全。是否排期、选哪个方向、归入哪个 Epic，留给后续专门的 architecture/story 细化阶段裁决。

- source_spec: `_bmad-output/implementation-artifacts/spec-configs-self-update-visible-success.md`
  summary: `checkAndApply` 在每次编译二进制的进程启动时都会跑，两个几乎同时启动的 `configs` 进程可能对同一个 `execPath` 竞争 `replaceBinary` 的写入/重命名——这是 Story 2.2 就存在的既有竞态，本次改动只是让成功提示打印出来后，这个竞态第一次变得"外部可观察"（比如两个进程都打印了更新提示，或其中一个悄悄拿到 `null`）。
  evidence: blind-hunter 审查层（自更新可见提示这轮）发现。竞态本身不是本次改动引入的，只是可见度变了；修复需要引入跨进程锁或去重机制，是需要额外设计判断的加固方向，不是本次可无争议机械修的 patch。
  resolution (Issue #153，2026-08-24，缓解未根治): 检查不再发生在每次进程启动，而是由前台命令按 24 小时冷却期派发一个后台进程，且冷却时间戳在派发前写盘——两个几乎同时启动的 `configs` 只有一个会派发检查器，竞态窗口从"每次调用"缩小到"冷却期边界上的并发调用"。跨进程锁仍未引入，理论竞态仍在。

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-code-review-fixes.md`
  summary: `configs establish`（`cli/index.ts:497` 与 `config-revision-writer.ts:46`）对同一个 candidate 对象完整跑了两遍 `parseCandidateRevision` 校验，前一次的结果被直接丢弃，只为了在开库/跑迁移之前提前失败。
  evidence: spec-3-1-code-review-fixes.md 的 token 预算超出 1600 上限，负责人选择按 [S] 拆分——本项收敛方式牵涉是否放宽 `EstablishConfigRevisionParams.candidate` 目前故意保持的 `unknown` 类型契约，是一个需要负责人拍板的端口契约设计决定，不是纯粹的机械 patch，留给后续单独一轮处理。

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-code-review-fixes.md`
  summary: `SqliteConfigRevisionWriter`（`config-revision-writer.ts:31-39`）与 `SqliteConfigRevisionRepository`（`repository.ts:358-369`）的构造函数逐字重复实现了同一套连接建立逻辑（mkdir 守卫、`new Database`、两条 PRAGMA、跑迁移），应抽取共享 helper。
  evidence: 同上，随 spec-3-1-code-review-fixes.md 一起被 [S] 拆分推迟；调查还顺带发现 `launch-repository.ts` 有第三处相同重复，抽取共享 helper 时应一并纳入设计范围，不是本次 code review 6 条确认发现之一，留给同一轮后续处理。

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-code-review-fixes.md`
  summary: `parseEstablish`（`cli/index.ts:183-248`）的三个 flag 解析块"已设置"哨兵值不一致——`--trigger-category`/`--evidence` 用 `!== undefined`，`--from` 用 `!== null`——应统一约定，并同步更新 `ParsedCommand` 类型声明与 `runEstablish` 里对 `fromPath` 的比较。
  evidence: 同上，随 spec-3-1-code-review-fixes.md 一起被 [S] 拆分推迟；纯代码一致性问题，不影响当前行为正确性，不阻塞本轮 correctness 修复。

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-code-review-fixes.md`
  summary: `runConfigRevisionMigrations`（`repository.ts`）新的按语句循环把 `0003_supply.sql` 拆成逐条独立执行，不再包在单个 `db.transaction()` 里，也不再有 `alreadyMigrated` 早退——文件级原子性因此丢失（真实、非竞态的失败会留下部分迁移状态），且这两点均未在紧邻的 docstring 里说明；`splitSqlStatements` 是朴素按 `;` 切分（只去掉整行 `--` 注释），不处理字符串字面量内的分号或 `/* ... */` 块注释；`SUPPLY_ADD_COLUMN_RE` 硬编码了 `ALTER TABLE stable_config_revision ADD COLUMN` 的具体格式假设，未来若该文件格式漂移（引号/大小写变化、新表的列），真正的 `ADD COLUMN` 语句可能匹配失败，落进"已幂等无需门控"分支被无条件重跑，重新引入本轮要修的 duplicate-column-name 崩溃。
  evidence: blind-hunter 与 edge-case-hunter 审查层（Story 3.1 code-review-fixes 这轮）独立发现同一族问题。当前 `migrations/0003_supply.sql` 的实际内容不含字符串字面量分号、块注释或格式漂移，因此不可达、不是活跃缺陷；修一个通用健壮的 SQL 语句拆分器超出本轮"修 4 条 correctness bug"的范围，值得下次改动 `0003_supply.sql` 或新增迁移文件之前先处理。

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-code-review-fixes.md`
  summary: `columnExists`（`repository.ts`）把 `table` 参数直接字符串插值进 `pragma_table_info('${table}')`，而不是参数化，与本文件自己声明的 STRICT/参数化查询约定不一致；`PRAGMA busy_timeout = 5000;` 作为魔法字面量在两个构造函数（`config-revision-writer.ts`、`repository.ts`）里各写一份，未解释也不可配置；`isConcurrentMigrationRace` 靠小写子串匹配 `error.message`（延续了本文件迁移前就存在的 `(error as Error).message ?? ''` 写法），而不是结构化的 `.code`（bun:sqlite 通常暴露 `SQLITE_BUSY` 等 code），对驱动措辞变化脆弱。
  evidence: blind-hunter 与 edge-case-hunter 审查层发现。`columnExists` 当前唯一调用方传字面量，无注入风险，纯风格一致性问题；`busy_timeout` 重复与已记录的"Writer/Repository 构造函数重复实现连接逻辑"是同一根因（缺共享连接建立 helper），修那条时可以一并处理；`isConcurrentMigrationRace` 的字符串匹配模式本身是延续自本 Story 之前就有的既有写法，不是本轮改动引入的新风险。

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-code-review-fixes.md`
  summary: `tests/contracts/repository.test.ts` 新增的 `withTempDbPath` helper 与 `tests/contracts/config-revision-writer.test.ts` 已有的 `withTempDb` 几乎逐字重复（新增处的注释自己也写"Same convention as..."），应抽成一个共享测试工具而不是逐文件复制；`tests/integration/cli-establish.test.ts` 新增的真实双进程并发测试用 `Promise.all([procA.exited, procB.exited])` 等待退出，没有 `finally`/超时清理——如果测试超时或某个 promise reject，另一个已 spawn 的 `bun` 子进程不会被杀掉，可能残留。
  evidence: blind-hunter 审查层（Story 3.1 code-review-fixes 这轮）发现。均为测试基础设施质量问题，不影响当前测试的正确性或本轮 4 条 correctness 修复本身，只在测试超时/失败这类少见路径下才会体现（进程残留），本轮不顺手处理。

- source_spec: `_bmad-output/implementation-artifacts/spec-3-4-sourceref-跨机器可移植性语义.md`
  summary: `configs supply` 子命令本体——按 `<supplyRoot>/<组>/skills/<skill>/` 目录约定扫描供给库，把显式声明的组白名单变成候选 JSON 打到 stdout，由既有 `establish` 消费（新增 `src/adapters/sources/supply-fs.ts` 扫描器与目录 sha256 指纹、三个类型化错误、`parseSupply` 与 CLI 分派、zh／en i18n、九场景集成测试）。
  evidence: 与 Story 3.4 同属一个意图，但拆分后各自可独立交付且**必须按序**。3.4（sourceRef 相对根解析）当前不存在任何相对 sourceRef，是行为等价的使能改动，可单独验证；本条若先落地，会产出带相对 sourceRef 的修订而物化侧仍按绝对路径解析，结果是按 AD-10 静默全量降级——正是 AD-22 判为 critical 的失败模式。原合并 spec 估算 2441 tokens（阈值 1600，已做过一轮结构性压缩），负责人 2026-08-25 选择 [S] 拆分、先做 3.4。本条紧接其后作为 Story 3.5。

- source_spec: `_bmad-output/implementation-artifacts/spec-3-4-sourceref-跨机器可移植性语义.md`
  summary: 供给根的收敛判定是纯词法的（`path.resolve` + `path.relative`），根内的符号链接／win32 junction 指向根外时能通过全部五条规则，`cp --recursive` 随后把根外内容拷进 invocation 目录。
  evidence: 第二轮 blind-hunter 与 edge-case-hunter 独立报出。属实但**本次改动是收窄而非放宽**——Story 3.4 之前任意绝对路径都被无条件放行，现在只剩「根内相对 + 符号链接」这一条窄缝。彻底封堵需要 `realpath` 并把 `validateSupplyRelativeRef` 变成异步（它目前是纯同步谓词，被三处同步调用点共用），属独立的加固改动。

- source_spec: `_bmad-output/implementation-artifacts/spec-3-4-sourceref-跨机器可移植性语义.md`
  summary: 写路径不校验 `sourceRef` 形态——`application/establish.ts:163` 仍只用 `isString`，`configs establish`／`revise` 可以持久化一条永远无法启动的非法 `sourceRef`，错误要到 `configs use` 时才 fail-closed 暴露。
  evidence: 三个审查层均提及。本 Story 冻结区 Never 明确写了「不改 schema 或写端口」，是负责人锁定的范围切分（校验集中在解析侧一处，供给侧归 Story 3.5）。Story 3.5 落地供给命令时应一并把 `validateSupplyRelativeRef` 接到写边界。

- source_spec: `_bmad-output/implementation-artifacts/spec-3-4-sourceref-跨机器可移植性语义.md`
  summary: `application/claude-launch.ts` 的 `resolveContentGroupDelivery` 在 `required === false`（可选／degraded）分支返回 `blocked: null` 并丢弃 failure reasons——而那串文本是唯一携带非法 `sourceRef` 与生效根的地方，用户只看到通用的 `skills-content-not-materialized-in-fresh-launch`。
  evidence: 第二轮 blind-hunter 报出。本 Story 冻结区要求 `degraded`（可选）情形也须给出含值与根的原因，但 `claude-launch.ts` 不在本 Story 的 Code Map 范围内，改它属于扩大改动面；已有的 P9 测试只覆盖 required 分支。

- source_spec: `_bmad-output/implementation-artifacts/spec-3-4-sourceref-跨机器可移植性语义.md`
  summary: `cli/render.ts:94` 现在打印裸的库内相对 `sourceRef`，没有任何根的上下文——`configs show` 的装配来源输出比本 Story 之前更难据以行动（此前是可直接使用的绝对路径）。
  evidence: 第二轮 blind-hunter 与 edge-case-hunter 独立报出（后者标为 deletion-kind、confidence low）。属真实的可观察性回退，但渲染层不在本 Story 范围；合理修法是在修订渲染里显示一次当时生效的供给根，或提供一个能回答「现在的根是什么」的入口。

- source_spec: `_bmad-output/implementation-artifacts/spec-3-4-sourceref-跨机器可移植性语义.md`
  summary: 库内相对路径没有规范形式——`skills/a`、`./skills/a`、`skills//a`、`skills/./a`、`skills/a/` 全部合法且解析到同一位置，同一个引用因此有多种字符串编码，`configs compare` 之类的按字符串比较不稳定。
  evidence: 第二轮 blind-hunter 报出。`validateSupplyRelativeRef` 已经返回一个规范化后的 `ref` 字段（`path.relative` 的结果转 POSIX），基础设施已就位；缺的是在写入侧强制使用它，而写入侧改动被本 Story 的 Never 排除。

- source_spec: `_bmad-output/implementation-artifacts/spec-3-4-sourceref-跨机器可移植性语义.md`
  summary: `src/cli/supply-root.ts` 放在 `cli/` 却没有任何 CLI 消费者（唯一 importer 是 adapter），且它经 `process.env` 向 adapter 引入了隐式全局态——该 adapter 的其他协作者都是注入的 port，这也是五个测试文件现在都要保存／恢复环境变量的原因。
  evidence: 两轮 blind-hunter 均报出。仓内有 `cli/db-path` 被四个 adapter import 的先例，故不构成异常，但 `db-path` 确实有 CLI 消费者、本模块没有。可选修法：迁到 `src/config/` 或把 `supplyRoot` 提升为 `ClaudeContentMaterializerPort` 的参数（该模块已经接受 `invocationDir` 作参数），在组合根接线。

- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-configs-supply.md`
  summary: 把 `validateSupplyRelativeRef` 接到**写边界**——`application/establish.ts` 的 `parseCandidateRevision` 目前对 `sourceRef` 只做 `isString`，因此 `configs establish`／`revise` 仍可持久化一条永远无法启动的非法引用（绝对路径、空串、`..` 逃逸等），错误要到 `configs use` 时才 fail-closed 暴露。
  evidence: Story 3.4 三个审查层均提及，当时被冻结区 Never 明确划到本 Story；epic-3-context 的 Technical Decisions 也点名「供给命令必须把该实现接到写边界」。与 Story 3.5 的 `configs supply` 是两个各自可独立交付的目标：供给侧自身会自检，非法引用只能经手写候选 JSON 进入，而读侧已 fail-closed 拦住，故本条是纵深防御而非阻塞项。负责人 2026-08-25 选择 [S] 拆分、本轮只做 `configs supply`。接线时应同时强制使用谓词返回的规范化 `ref`，消除同一引用的多种字符串编码。

- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-configs-supply.md`
  summary: 物化目录布局 `materialized/plugin/skills/<name>/` **丢掉了组身份**——目标目录由 `sanitizePathSegment(reference.name)` 推导，只用 skill 叶子名。两个组的同名 skill 会落到同一目录、后者覆盖前者且 `failures: []`。
  evidence: Story 3.5 的三个审查层中有两层各自端到端复现。产出侧已在本 Story fail-closed（`SupplyDuplicateSkillNameError`），但根因在消费侧：AD-22 明写「组是装配与判定的单元」，而物化布局把它压平了。彻底修法是让物化目录带上组（如 `skills/<组>/<name>/`），那要动 Epic 4 的 `content-materializer.ts` 并重新核对 `--plugin-dir` 的真实加载语义，超出本 Story 范围。在此之前，任何绕过 `configs supply` 直接手写候选 JSON 的路径仍可触发。

- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-configs-supply.md`
  summary: `sourceCategory` 对每个扫描到的 skill 硬编码为 `'project-skill-import'`，而扫描器对该组的来源（own／fork／vendor）没有任何信号。
  evidence: Story 3.5 blind-hunter 报出。AD-8 禁止用编造的 Known 冒充事实；`cap-fs.ts` 对自研能力用的是 `'project-capability'`。诚实的做法是 `Unknown`，或读一个真实来源信号（`matters.json` 有 `origin.kind` 但产品够不着它，见 AD-22 的资产面／装配面分界）。改动牵涉「供给库要不要携带来源元数据」这一设计判断，不宜在本 Story 顺手定。

- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-configs-supply.md`
  summary: 候选完全省略 `instructions`／`mcp`／`hooks`／`plugins` 四组，`parseCandidateRevision` 会默认成 `[]`；把 supply 输出 pipe 进 `configs revise --supersedes <id>` 会产出一条静默丢掉前驱全部非 skill 能力的后继修订。
  evidence: Story 3.5 blind-hunter 报出。`cli/index.ts` 与 `supply-fs.ts` 的文档串都把输出宣传为 establish／revise 皆可消费，但只有 establish 语义正确。要么扫描器支持其余四类，要么明确声明本命令只服务 establish，二者都需要判断，未在本轮处理。

- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-configs-supply.md`
  summary: `renderQueryFailure` 的模板固定渲染成「配置 "X"：…」，而 supply 的失败主体是供给库与组，不是某个配置；`establish`／`revise` 用固定标签时同样别扭。
  evidence: Story 3.5 复验时观察到（P8 改用固定标签 `'supply'` 后渲染为「配置 "supply"：…」）。属 `render.ts` 的既有模板问题，非本轮引入，改它会同时影响三个既有命令的输出与其测试。

- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-configs-supply.md`
  summary: 供给库若合法使用符号链接（例如把一个组软链到别处），本 Story 的 P6 修复会以 `SupplyUnsupportedEntryError` 硬拒，使该库不可用。
  evidence: 实现者在 P6 里主动选择硬拒而非把链接目标纳入摘要，理由是 `cp` 复制的是链接本身而非目标、纳入会造成另一种「指纹与交付不符」。取舍成立，但代价是符号链接型供给库需要专门设计后才能支持。

- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-configs-supply.md`
  summary: P5「不吞 EACCES」这一半在 Windows 上无覆盖——唯一可移植且确定的触发方式是权限位，故该用例 `skipIf(win32)`；实现者确认在本机把 `isMissingPath` 守卫整个移除仍全绿。
  evidence: 实现者主动报告。`ENOTDIR` 那一半有可移植用例钉住，EACCES 那一半只在 POSIX／ubuntu CI 腿上验证。当前新仓 Actions 尚未运行，因此这一半实际上还没有被任何一次执行覆盖过。

- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-configs-supply.md`
  summary: `parseSupply` 是同一套手写 `--flag value` 循环的第三份近乎逐字副本（`parseEstablish`／`parseRevise`／`parseSupply`，各约 60 行）；`SupplyCandidate` 是 `CandidateConfigRevision` 可接受字段集的手工副本，无编译期关联。
  evidence: Story 3.5 blind-hunter 报出。前者可抽共享 flag 扫描器，后者可用 `satisfies` 或从 `CandidateConfigRevision` 派生，使耦合真实存在——目前 `parseCandidateRevision` 新增必填字段时 `tsc` 仍绿，只有集成测试会发现。

- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-configs-supply.md`
  summary: `runSupply` 的 stdout 未处理 EPIPE——下游消费者提前退出时会得到未处理的 rejection 而非干净退出码。
  evidence: Story 3.5 edge-case-hunter 报出。该命令的既定用法就是 pipe 进 `establish`，下游异常退出是现实场景。

- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-configs-supply.md`
  summary: 物化侧把 Skill 拷进 `materialized/plugin/skills/<name>/`（`content-materializer.ts` 用 `sanitizePathSegment(reference.name)` 推导目标），**布局里没有组这一层**——两个组含同名 skill 时后者覆盖前者、`failures: []` 并报告成功。
  evidence: Story 3.5 的三个审查层中有两层各自端到端复现。Story 3.5 已在**产出侧** fail-closed（`SupplyDuplicateSkillNameError`），但根因在消费侧：AD-22 明写「组是装配与判定的单元」，而物化产物把组扁平化掉了。修它要动 Epic 4 的 `content-materializer.ts` 与 `--plugin-dir` 的目录布局，不在本 Story 的 Code Map 内；且改布局需要重新核对 Claude 的 plugin 包格式是否允许多层 skills 目录。产出侧已堵住后，剩余可达路径只有手写候选 JSON。

- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-configs-supply.md`
  summary: `renderQueryFailure` 把标签渲染成 `Configuration "<label>"`，于是 `supply`／`establish`／`revise` 这类固定标签会输出 `Configuration "supply": …`——而根本不存在名为 supply 的配置。
  evidence: Story 3.5 的 blind-hunter 报出「用 configName 作标签会误报主体」，已按 `runEstablish`／`runRevise` 的先例改用固定标签；但 `Configuration "<label>"` 这个前缀是共享渲染器的既有形态，三个命令共有，非本 Story 引入。修法是让渲染器区分「配置标识」与「子命令标识」两类标签，属独立的措辞改动。

- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-configs-supply.md`
  summary: 候选只产出 `skills`，`instructions`／`mcp`／`hooks`／`plugins` 缺省为 `[]`；因此把 `supply` 的输出 pipe 进 `configs revise --supersedes <id>` 会产出一条**静默丢掉前驱全部非 skill 能力**的后继修订。
  evidence: Story 3.5 的 blind-hunter 报出。`cli/index.ts` 与 `supply-fs.ts` 的注释都把输出宣传为可被 `establish`／`revise` 同样消费，但只有 establish 语义正确。要么让注释只承诺 establish，要么让 supply 支持从前驱继承非 skill 组——后者需要先定「供给库如何表达非 skill 能力」，而目录约定当前只覆盖 `skills/`。

- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-configs-supply.md`
  summary: `sourceCategory` 对每个扫描到的 skill 硬编码为 `'project-skill-import'`；`summary` 硬编码为 `skill reference: <name>`，尽管 `SKILL.md` 的 frontmatter 里有真实 `description` 且指纹步骤已经读过该文件字节。
  evidence: Story 3.5 的 blind-hunter 报出。前者对一个扫描器无从判断来源的组断言了第三方导入出处，与 AD-8「不得用常量冒充已知事实」抵触，诚实的做法是 `Unknown` 或读真实信号（`matters.json` 的 own/fork/vendor 是真实信号但产品够不着）；后者让 `configs show` 的摘要列零信息。两者都需要先定「从哪里取真实信号」，非机械修复。

- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-configs-supply.md`
  summary: 指纹只覆盖 `dirent.isFile()` 的条目，**空目录、文件模式（可执行位）不在摘要内**，而 `content-materializer.ts` 的 `cp(recursive)` 会原样复现它们。
  evidence: Story 3.5 的 blind-hunter 与 verification-gap 均报出。符号链接那半已在 P6 处理（两处判断改为一致），但空目录与 mode 位仍在覆盖面之外——意味着「指纹相同」不严格等价于「物化产物相同」，作为退役第 (2) 步 parity 取证依据时需知道这个边界。要闭合需把 mode 与目录结构纳入摘要，会改变已产出指纹的取值。

- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-configs-supply.md`
  summary: `SupplyCandidate` 是 `CandidateConfigRevision` 可接受字段集的**手工副本**，无编译期关联；`parseSupply` 是 `parseEstablish`／`parseRevise` 之后同一套手写 flag 循环的第三份近乎逐字副本（各约 60 行）。
  evidence: Story 3.5 的 blind-hunter 报出。前者若 `parseCandidateRevision` 新增必填字段或改名，`tsc` 仍绿、只有集成测试会发现；后者三份副本各自带相同的 repeated／missing-value 分支，注释自己都在担心漂移。两者都是纯结构性清理，抽共享 helper 即可，但会同时触及三个既有子命令的解析路径。

- source_spec: `_bmad-output/implementation-artifacts/spec-5-1-claude-fresh-launch-credentials.md`
  summary: AC4（真实 `claude` 二进制端到端验证：fresh 启动的新进程实际带着复制进去的 `.credentials.json` 保持登录态）目前没有任何自动化测试，只有本机手工验证一条路径。
  evidence: verification-gap 与 blind-hunter 两个审查层独立发现并各自核实：`tests/integration/cli-claude-launch.test.ts` 全程用 `FakeClaudeProcessPort`，仓内唯一的真实二进制 smoke 测试先例是 `tests/omp/real-omp-smoke.test.ts`（针对 `omp`，缺席时跳过），Claude 侧没有等价物。本 Story 的 spec 本身在 Task 5 明确允许"若无真实二进制端到端用例则如实记为手工验证待办"这一结果，因此不构成对 spec 的偏离，只是把该风险正式登记为待跟踪项，供后续参照 `real-omp-smoke.test.ts` 的模式（`Bun.which('claude') === null` 时跳过）补一个真实端到端 smoke。

- source_spec: `_bmad-output/implementation-artifacts/spec-5-1-claude-fresh-launch-credentials.md`
  summary: 凭据源路径解析（`$CLAUDE_CONFIG_DIR` 优先，否则 `$HOME/.claude`，文件名固定 `.credentials.json`）与新探测方法只在本机 Windows 环境验证过；macOS 是否改用系统 keychain 而非纯文件、其余平台的目录布局是否相同，均未核实。
  evidence: spec 自身的 Never 约束与 `credentials.ts`/Story 文档的 Design Notes 已如实披露这条残留风险（"不假设非 Windows 平台凭据形态相同——无证据时 probe 返回 unknown，不默认 supported"）；探测机制本身是对磁盘的真实检查，不会在无证据时默认 `supported`，因此不构成静默错误，但目前没有任何非 Windows 平台的真实运行证据来确认这套假设在那些平台上是否成立。

- source_spec: `_bmad-output/implementation-artifacts/spec-5-1-claude-fresh-launch-credentials.md`
  summary: fresh 启动的隔离 invocation 目录（`FsClaudeInvocationDirPort.prepare` 用 `mkdirSync(dir, { recursive: true })` 创建）及其内容（包括本 Story 新增的 `.credentials.json` 副本、AD-21 的 `materialized/` 内容）从未做过显式权限加固（如限制为仅当前用户可读），依赖操作系统默认权限与目录随进程退出即被删除的生命周期来限制暴露窗口。
  evidence: blind-hunter 审查层发现，经核实为 Story 4.3 就存在的既有模式（`claude-invocation-dir.ts` 的 `prepare` 从未设置过限制性 mode），不是本 Story 新引入的缺口——本 Story 只是让这个既有目录第一次承载真正的 secret（此前只承载非敏感的物化 Skill/Instructions/MCP 内容），使潜在影响从"低"变为"值得加固"，值得后续对 `FsClaudeInvocationDirPort` 统一补一次权限加固而不是只给凭据单独打补丁。

- source_spec: `_bmad-output/implementation-artifacts/spec-5-1-claude-fresh-launch-credentials.md`
  summary: `probeCredentialsContinuity`（`capability-probe.ts`）用 `access(sourcePath, fsConstants.R_OK)` 判定"可用"，但该调用对一个同名目录（而非文件）同样会成功，理论上会把一个目录误报为 `supported` 的凭据源。
  evidence: edge-case-hunter 审查层发现。真实触发条件极不可能出现（`.credentials.json` 路径为何会是目录没有合理场景），且即使误报，下游 `materializeClaudeCredentials` 的 `cp()` 遇到目录源仍会按既有 fail-closed 路径报告失败，不会产生"看起来成功但实际未登录"的静默错误，只是 probe 阶段的证据会短暂不准确；值得后续用 `stat().isFile()` 收紧，但优先级低。
