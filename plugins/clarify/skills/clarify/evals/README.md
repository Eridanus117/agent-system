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

## 状态

**未验证。** 首次走通的执行者即设计者，样本量 1。真正的判据是第二次真实使用：主人下次冒出痒点时，本 Skill 有没有自己起手、有没有让人少绕路。
