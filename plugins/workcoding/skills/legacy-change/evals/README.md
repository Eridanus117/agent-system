# legacy-change 的行为评测

**跑法、硬约束与事故记录见共享 runbook：[`plugins/docs/skill-eval-runbook.md`](../../../../docs/skill-eval-runbook.md)。** 本文只记 legacy-change 特有的部分。

## 用例构成

7 个 case：2 个 `behavior` + 5 个 `trigger`。2026-09-02 的实跑保留为旧版历史证据；当时的「零 diff」与格式断言不再作为现行判据。

两个 behavior case 分别覆盖改法未确认与已确认：前者用真实输入走读到旧结果33，提出可关闭的分流并等待改法确认；后者已有明确配置开关，期望关闭时33、开启且命中时41，非目标类别不变。旧业务实现不改，既有代码唯一允许的修改是入口分流；不要求改过入口的整个旧文件零 diff。

**5 个不应触发的 case**：

| case | 该归谁 |
|---|---|
| `greenfield-new-class` | 暂无规程——纯新增没有既有路径要动，不得套「萌芽」（PR #33 纠偏） |
| `incoming-requirement` | `requirement-insight` |
| `count-query` | 直接处理静态查询，不自动进入分析规程 |
| `plain-question` | 直接答（讲接缝是什么） |
| `clear-local-fix` | 直接修正明确低风险错误，不引入新旧并存与开关 |

## 与被测 SKILL.md 的对应

| 铁律 / 工位 | 测它的断言 |
|---|---|
| 铁律 1 以走读为准、每步能对照入参 | `step-format-with-fields`、`comment-vs-code-flagged`、`correct-result` |
| 改法确认前不改生产实现 | `waits-before-production-change` |
| 旧行为、新行为与唯一入口分流 | `old-behavior-preserved`、`bounded-routing`、`observable-new-behavior` |
| 走读关联真实输入，不夸大分支覆盖 | `observable-walkthrough` |
| 关闭分流回原入口，已确认后继续 | `rollback-aware-plan`、`no-relitigation` |

## 首轮实跑（2026-09-02，`gpt-5.6-luna`）

跑法：隔离 HOME、`--no-rules`、`--config overlay.yml`、`--mode=json`、每 case 独立空 cwd；with_skill 只装本 skill；baseline `--no-skills`。SKILL 内容哈希 `ccd94f418228`。跑前跑后四个仓与全部 worktree 无新增。`build-after-veto` 两种模式都在各自的空 cwd 里写了 `FeeCalculator.java` 与测试并用 javac 编译运行——那是 prompt 要求「把代码写出来」的正常产物，跑后已删。

### behavior：两模式对照

| case | baseline | with_skill |
|---|---|---|
| `walkthrough-and-plan` | 5 次工具调用（todo、读不存在的文件、用 Python 算数），**直接在老方法中间插了一个 if 分支**，算出 41，没有走读、没有请主人否 | 只读本 skill，输出规定形态：入参、四步走读（每步看哪个字段、进哪个分支、数怎么变，两处注释与实现不符都标出且以实现为准）、结果 33、假设单列（calc 是否唯一入口）、改法三句、请否、「此阶段未修改代码」。6 条断言全过 |
| `build-after-veto` | 12 次工具调用，写文件并编译运行。**把老方法体整个搬进新的私有方法 `calcStandardFee`，老可执行路径 diff 不为零** | 12 次工具调用，写文件并编译运行。分流判断在 `calc` 入口第一行；老方法既有语句一句未动；新方法 `calcRemoteFee` 只新增；测试用走读那条入参、每步一行中文注释、期望 41；说明静态检查老路径未引用新方法。4 条断言全过（`test-uses-walkthrough-input` 部分：只断言了新路径 41，没单独断言老路径 33） |

差值一句话：没有 skill 时 agent 改老方法本身（插分支或搬方法体）；有 skill 时老方法一句不动、分流只在入口。

### trigger

| case | 结果 |
|---|---|
| `greenfield-new-class` | 无工具调用，直接写类，没有萌芽、分流、diff 为零这些词 |
| `incoming-requirement` | **读了本 skill**，但输出的是需求拆解与十条待定规则，并明确说「当前不能做代码走读：没有代码，也没有一条真实请求」。读了没按它行动——边界守住一半 |
| `count-query` | 无工具调用，直接给查法 |
| `plain-question` | 无工具调用，直接讲接缝 |

### 单轮测不到的

工位 3 人否之后的纠偏留痕、否三次停下拆、工位 6 留。更重要的：这段示例代码只有 15 行，**圈复杂度上百、注释与实现不符的真实代码上能否给出可否的现状，证据仍为零**（`notes/方法论模型.md` 证据边界）。

## 状态

当前 7 条合同已通过结构校验；本轮没有重跑 Java 计费行为用例。示范代码的历史隔离结果不证明复杂生产代码适用，真实遗留修改仍需真实输入与行为证据。
