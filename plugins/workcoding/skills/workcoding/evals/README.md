# workcoding 的行为评测

**跑法、硬约束与事故记录见共享 runbook：[`plugins/docs/skill-eval-runbook.md`](../../../../docs/skill-eval-runbook.md)。** 本文只记 workcoding 特有的部分。

## 用例构成

12 个 case：5 个 `behavior` + 7 个 `trigger`。当前合同在 `evals.json`，2026-09-02 的旧版实跑保留为历史证据，不再作为现行路由判据。

| 边界 | case / 可观察结果 |
|---|---|
| 未决需求或架构取舍 | `incoming-requirement`、`modify-existing-code`、`design-existing-system-capability`：指出具体缺口，不臆定实现策略或默认整套规程 |
| 普通只读与低风险任务 | `count-query`、`readonly-workspace-review`、`clear-low-risk-fix`、`plain-question`：利用已有证据直接完成，不人为增加确认 |
| 已确认工作 | `mid-procedure-stall`、`route-already-confirmed`：继续当前工作，不重开路线 |
| 显式要求与高风险动作 | `explicit-route-request`、`one-line-high-risk-change`：保留用户这次要求的确认，以及未授权高风险动作的边界 |
| 自建工具痒点 | `build-a-tool-itch`：先判断实际问题，不直接立项 |

## 实际 OMP 多轮对照

`run-runtime.ts` 使用已安装的 OMP、`openai-codex/gpt-6-astra` 与 `high`，比较改前快照和当前 daily 11 个技能。四个合成场景是只读审查、真实文件中的小修复、未决生产结算变更、显式路线确认后继续。

两组共享工作区 AGENTS 副本、工具边界和合成上下文；通过真实 RPC 会话记录技能来源/hash、模型、工具调用、文件变化和 final。不是只把 SKILL 文本交给 completion，也不是原样生产环境：临时 HOME、受限工具，关闭记忆等外部能力，具体差异写进结果 JSON。第二轮确认与第一轮在同一会话内。

结构校验通过不等于行为通过；原始输出须人工判读，小修复代码由宿主审阅后执行示例。原始记录可能包含被读取的私人规则，发布前须检查内容；本次原文仅保存在私有 desk 仓库，公开仓库只保留判读结论和证据 SHA-256。运行错误、被阻止的越界写入与正常完成分开记录。

## 首轮实跑（2026-09-02，`gpt-5.6-luna`，改写后）

跑法：隔离 HOME（使用 `$EVAL_HOME`）、`--no-rules`、`--config overlay.yml` 关 autolearn 与 memory、`--mode=json`、每个 case 独立空 cwd；with_skill 装工作树里的全部 9 个 workcoding skill（不只装路由，才测得出「摆完路线停住、不进规程第 1 步」）；baseline `--no-skills`。SKILL 内容哈希 `7494fd74f589`。跑前跑后四个仓与全部 worktree 的 `git status` 逐行比对无新增；十个 cwd 里没有任何文件。

### behavior：两模式对照

| case | baseline | with_skill |
|---|---|---|
| `incoming-requirement` | 13 次工具调用：建 todo、glob、`git status`，找不到代码后逐项 block，最后给一段实现方向。**没有摆路线，没有等确认** | 读 `skill://workcoding`、读 `skill://requirement-insight`（只读，没做它的步骤），输出规定的四行：形状点名「fizzbuzz-report 要支持按类别设置可选附加项」，路线七条无跳过，请确认。5 条断言全过 |
| `modify-existing-code` | 24 次工具调用：起子 agent 找 `ReportBuilder`，glob 到 cwd 之外读了评测目录里的 overlay.yml 与另一条 case 的原始日志，找不到后 block。**直接进实施态** | 只读 `skill://workcoding`，四行：形状点名 `ReportBuilder.build` 与 alpha/beta 类别的可选附加项，路线含 legacy-change 且在两条需求规程之后，明确说「暂不跳过任何一条，因为当前看不到代码」。5 条断言全过 |
| `count-query` | 无工具调用，给一份「怎么查」的五步计划（LSP 引用、AST、排除测试），直接开查的口吻 | 只读 `skill://workcoding`，四行：形状「查数」，路线 `system-analysis` 一次并列出跳过的五条规程与理由。4 条断言全过 |

差值一句话：没有 skill 时三条输入都被当成「现在就做」；有 skill 时三条都停在路线那一段。

### trigger：边界全守住

| case | 结果 |
|---|---|
| `build-a-tool-itch` | 试图读 `skill://clarify`（未装，报 Unknown skill），随后按普通作答给出 MVP 方案。**没读 workcoding，没摆路线**——它选了 clarify 而不是自己，正是 description 里那句「那是 clarify」在起作用 |
| `plain-question` | 读了 `skill://requirement-translation` 后直接列五种 EARS 句式。没读 workcoding |
| `mid-procedure-stall` | 读 `skill://legacy-change`，就着第 4 步的超时给判断（不要放弃分流，先定位超时在分流前后哪段）。**没有重新判形状或要求再确认路线** |
| `route-already-confirmed` | 无工具调用，直接给出改后的句子 |

### 单轮测不到的

铁律 3 的「纠偏留痕」（主人否了路线后记「原摆 A，裁为 B」）与工位 4「交棒后同一条改动里不再出现」需要多轮，本轮只用 `mid-procedure-stall` 与 `route-already-confirmed` 两条单轮近似。判据仍是主人下一次真实使用。

改写前旧版的实跑记录保留在 `runs/2026-09-02-改写前/`，对照用：旧版 with_skill 起了路由后直接进了 requirement-insight 的第 1、2 步。

## 状态

**本批四类合成边界已实跑通过，不能据此宣称全面优于旧版。** 2026-09-06 固定 `gpt-6-astra:high`，改前／改后共 8 个场景、10 轮；小修复代码经宿主执行，两例均正确。只读、小修和确认续接在旧版也通过；可观察差异是复杂待决变更从先确认整套路线、再读取材料，变为先核实材料、再指出具体业务与授权缺口。没有越界写入尝试。没有验证真实生产、工作机或 Multica daemon。

原始记录在 [私有 desk 证据](https://github.com/Eridanus117/desk/blob/c9b4062/agent/evidence/2026-09-06-skill-routing/runtime-results.json)，人工判读在 [`runtime-review.json`](runs/2026-09-06/runtime-review.json)，其中记录原始文件的 SHA-256。改前 11 个技能源及其 SHA-256 保存在 [`baseline.zip`](runs/2026-09-06/baseline.zip)；这 11 个源均已核对与公开 main 的改前版本一致。解压后可作为 `run-runtime.ts --baseline <目录> --output <私有目录中的新结果.json>` 的输入。每次运行都重新记录模型、规则和装载证据；不能把不同环境的重跑当成本次原样复现。
