# workcoding 的行为评测

**跑法、硬约束与事故记录见共享 runbook：[`plugins/docs/skill-eval-runbook.md`](../../../../docs/skill-eval-runbook.md)。** 本文只记 workcoding 特有的部分。

## 用例构成

7 个 case：3 个 `behavior`（应触发）+ 4 个 `trigger`（不应触发）。

三个 behavior case 各对应一种形状：外来需求（改既有代码）、「帮我改 X」（改既有代码）、「查个数」（查数）。「从零新建」与「只改规则或文档」没有 behavior case：前者暂无规程可交棒，后者的探针写不出来——凡「改一下某份文档」的 prompt 都会诱导 agent 去工作区找对象（runbook 硬约束 2）。

**4 个不应触发的 case 就是路由边界的可执行版本**：

| case | 该归谁 |
|---|---|
| `build-a-tool-itch` | `clarify`（痒点来自主人自己） |
| `plain-question` | 直接答（没有要动的对象） |
| `mid-procedure-stall` | `adaptive-problem-solving`（活已在 `legacy-change` 第 4 步里跑着，不回路由） |
| `route-already-confirmed` | 不得拦路——路线确认之后再摆路线是倒退 |

后两条是按 clarify 形态改写时逼出来的：旧版 SKILL.md 只写「等主人确认」，没写「确认之后本 skill 退场」，多轮里就有反复要求确认的死法。

## 与被测 SKILL.md 的对应

| 铁律 / 工位 | 测它的断言 |
|---|---|
| 铁律 1 主人点头前不动手 | `waits-for-confirmation`、`no-artifact-written` |
| 铁律 2 跳过要说 | `route-listed`（跳过写理由）、`route-is-system-analysis-only` |
| 铁律 3 贴具体对象不用黑话 | `shape-with-real-object`、`shape-is-count` |
| 工位 4 交棒后退场 | `no-rerouting`、`no-relitigation` |

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

**未验证。** 首轮实跑是设计者自己跑的隔离单轮，样本 10 次。真正的判据是主人在工作机上拿一条真实改动走一遍：路线那一段有没有让主人一眼判对错、跳过的有没有说。
