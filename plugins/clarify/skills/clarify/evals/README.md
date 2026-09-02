# clarify 的行为评测

**跑法、硬约束与事故记录见共享 runbook：[`plugins/docs/skill-eval-runbook.md`](../../../../docs/skill-eval-runbook.md)。** 本文只记 clarify 特有的部分。

## 用例构成

7 个 case：3 个 `behavior`（应触发）+ 4 个 `trigger`（不应触发）。

**4 个不应触发的 case 就是路由边界的可执行版本**：

| case | 该归谁 |
|---|---|
| `formed-plan-stress-test` | `grilling`（已成型的计划 + 显式请求压测） |
| `mid-execution-stall` | `adaptive-problem-solving`（任务已开跑） |
| `bug-annoyance` | 边界外（SKILL.md 明确排除 bug 类） |
| `already-decided-implementation` | 不得拦路——判断做完之后再提问是倒退 |

最后一条**原 SKILL.md 里没有，是写 eval 时逼出来的**。这是「写不出 eval 说明说不清」的正面例证：写 eval 当场补上了一条缺失的边界，而它本会是这个 skill 的一种死法。

## 首轮实跑（2026-09-01，`gpt-5.6-luna`）

`build-x-itch` 的两模式对照：

| | baseline | with_skill |
|---|---|---|
| 产出文件 | **2 个**（`desk/提案/` 与 `knowledge/inbox/` 各一） | **0 个** |
| 输出 | 完整首版方案 + 「建/不建/缓/继续分析」四选一 | 规定的三行，第二行判「先不判」并指明缺失的三样历史证据 |

6 条断言 5 条明确通过；`asks-history-not-opinion` 判为部分通过——单轮模式的局限，见 runbook「已知局限」。

4 个 trigger case 跑出 3 个，边界均守住（`formed-plan-stress-test` 超时无输出，未测）。

## 第二轮实跑（2026-09-02，`gpt-5.6-luna`，铁律 2 改写后）

起因：主人裁定铁律 2 原文「草案短到能一眼判错」不对——问题不在长，在没有同一语境沟通加黑话。改写后跑 `build-x-itch` 验证没把行为改坏，并新增断言 `same-object-no-jargon`。

跑法：cwd 为临时目录、`--no-rules`（切断通往真实工作区的指针，这条断言不依赖全局规则），SKILL 内容哈希 `fc0922c04391`。跑前跑后工作区均无变更，两种模式都没写文件。

| 断言 | with_skill |
|---|---|
| no-implementation-start / solution-to-problem / assertive-draft / three-line-close / no-artifact-written | 通过 |
| same-object-no-jargon | 通过——三行全程谈「知识库、标签、Markdown/frontmatter」，无占位符与自造词 |
| asks-history-not-opinion | 部分通过（单轮局限，同首轮） |

**baseline 被污染**：`--no-skills --no-rules` 下 baseline 也输出了三行收口格式（真正的问题 / 值不值得解 / 往哪个方向解），与 skill 产出几乎无差。首轮 baseline 是完整方案加四选一，本轮不是。怀疑是 omp `autolearn` 从历史 session 学到了本 skill 的产出形态。**这轮的 with_skill 与 baseline 差值不可用**，只能当作「改写没把行为改坏」的证据，不能当作「skill 有价值」的证据。已记为 runbook 候选事项：跑 baseline 时需关 autolearn 或用隔离 `--profile`。

一句结论：铁律 2 改写后单轮行为未变坏；铁律 2 本身（多轮纠偏里不失联）单轮测不到，判据仍是主人下一次真实使用。

## 状态

**未验证。** 首次走通的执行者即设计者，样本量 1。真正的判据是第二次真实使用：主人下次冒出痒点时，本 Skill 有没有自己起手、有没有让人少绕路。
