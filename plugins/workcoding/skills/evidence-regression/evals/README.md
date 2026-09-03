# evidence-regression 的行为评测

**跑法、硬约束与事故记录见共享 runbook：[`plugins/docs/skill-eval-runbook.md`](../../../../docs/skill-eval-runbook.md)。** 本文只记 evidence-regression 特有的部分。

## 用例构成

6 个 case：2 个 `behavior`（应触发）+ 4 个 `trigger`（不应触发）。

两个 behavior case：改代码之前的常规入口（怎么证明老流程没变），以及一个最容易犯的错——改完了才想起没采母版（测铁律 2 的降级：分流开关关着即改前）。

**4 个不应触发的 case 就是路由边界的可执行版本**：

| case | 该归谁 |
|---|---|
| `rollout-question` | `release-observe`（线上放量） |
| `unit-test-request` | 普通单测，不是母版回放 |
| `incoming-requirement` | `requirement-insight` |
| `plain-question` | 直接答（Golden Master 与 Approval Testing 的关系） |

## 与被测 SKILL.md 的对应

| 铁律 / 工位 | 测它的断言 |
|---|---|
| 铁律 1 证据是仓里的文件 | `repo-files-same-pr` |
| 铁律 2 母版改前采、改后的不算 | `capture-before-change-with-normalization`、`refuses-post-change-master`、`uses-closed-toggle-as-before` |
| 铁律 3 老类别逐字节、新类别对期望值 | `old-byte-equal-new-expected` |
| 工位 1 样本覆盖句与分支 | `samples-cover-sentences-and-branches` |
| 否过之前不采集不写测试 | `waits-for-veto` |

## 首轮实跑（2026-09-02，`gpt-5.6-luna`）

跑法：隔离 HOME、`--no-rules`、`--config overlay.yml`、`--mode=json`、每 case 独立空 cwd；with_skill 只装本 skill；baseline `--no-skills`。SKILL 内容哈希 `76b3d6b317e8`。跑前跑后四个仓与全部 worktree 无新增；cwd 无文件。

### behavior：两模式对照

| case | baseline | with_skill |
|---|---|---|
| `prove-old-path-unchanged` | 无工具调用，输出一份相当完整的基线冻结方案：Arthas `sc`/`sm`/`watch` 命令、每用例热身与重复次数、需求样例表、按重量维度的旧分支矩阵——**这一条 baseline 本身就接近规程**，差在没有「主人否过样本之前不采集」、没有仓内布局与同 PR 入仓、把 traceId/calcTime 说成「分别验证格式」而不是规整掉 | 只读本 skill，第一句「先冻结样本，不采集、不改代码」；老路径六个样本各标场景名与覆盖分支，新路径两个样本标期望 26/18；「不能把新旧两类混成一个比较规则」；改前用 `watch` 一次一条采集。5 条断言中 `repo-files-same-pr` 与 `capture-before-change-with-normalization` 的规整部分在截断的后半段，按精简日志判为通过 |
| `forgot-to-capture-before` | 无工具调用，给出另一条合法路：从改动前提交或制品重建母版，三组运行（baseline / candidate-off / candidate-on）并要求如实标注 `baseline_type: reconstructed`——正确，但没用「开关关着即改前」这条更便宜的路 | 只读本 skill，「现在补采，不把改后输出冒充母版」；依据是开关关闭且老路径 diff 为零，当前分支可作改前等价基线；要求标注「改前等价采集」而不是伪装成改前；样本清单未确认前不采集。3 条断言全过 |

差值一句话：这条规程 baseline 已经不差；skill 加上的是「否过之前不采」「同一个 PR」「开关关着即改前」这三条主人裁过的约束。

### trigger

| case | 结果 |
|---|---|
| `rollout-question` | 无工具调用，给通用灰度方案。没读本 skill |
| `unit-test-request` | 无工具调用，直接写 Vitest 用例，没提母版 |
| `incoming-requirement` | 无工具调用，做需求拆解。没读本 skill |
| `plain-question` | **读了本 skill**，但输出是对两个术语关系的讲解，没有样本清单。读了没按它行动——边界守住一半 |

### 单轮测不到的

Arthas 采集、回放测试真的跑、母版进 PR，都要在工作机上发生。

## 状态

**未验证。** 隔离单轮 8 次。真正的判据是在工作机上对一条真实改动采一批母版、改后回放，母版文件有没有真的进 PR。
