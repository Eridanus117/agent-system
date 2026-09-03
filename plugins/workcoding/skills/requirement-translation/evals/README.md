# requirement-translation 的行为评测

**跑法、硬约束与事故记录见共享 runbook：[`plugins/docs/skill-eval-runbook.md`](../../../../docs/skill-eval-runbook.md)。** 本文只记 requirement-translation 特有的部分。

## 用例构成

6 个 case：2 个 `behavior`（应触发）+ 4 个 `trigger`（不应触发）。

两个 behavior case 对应规程的两个入口：一句话装得下的需求（收口后直接翻）、装不下的大需求（先拆用例再翻）。

**4 个不应触发的 case 就是路由边界的可执行版本**：

| case | 该归谁 |
|---|---|
| `not-yet-closed` | `requirement-insight`（还没有三行加一句） |
| `plain-question` | 直接答（讲 EARS 本身） |
| `after-acceptance-integrate` | `integration`（例子已变测试并通过） |
| `direct-code-change` | `workcoding` 路由（「帮我改 X」） |

## 与被测 SKILL.md 的对应

| 铁律 / 工位 | 测它的断言 |
|---|---|
| 铁律 1 没有例子的句子不算需求句 | `example-per-sentence`、`ears-with-examples` |
| 铁律 2 名词只用原话与术语表 | `no-invented-nouns` |
| 铁律 3 逐句否之前不落盘不变测试 | `asks-line-by-line-veto`、`no-tests-no-files` |
| 拆不拆 | `split-decision`、`splits-into-use-cases` |

## 实跑（2026-09-02，`gpt-5.6-luna`）

跑法：隔离 HOME、`--no-rules`、`--config overlay.yml`、`--mode=json`、每 case 独立空 cwd；with_skill 只装本 skill；baseline `--no-skills`。跑前跑后四个仓与全部 worktree 无新增；cwd 无文件。

### 首轮：两条边界失守，收紧 description 后重跑

首轮（description 只写了「不用于还没收口的需求」与「不用于讲解 EARS」）里 `direct-code-change` 读了本 skill 并输出了一句 EARS 加例子，`after-acceptance-integrate` 也读了本 skill。于是 description 加了两条「不用于」：「帮我改 X」类改代码指令（那是 workcoding 路由）、例子已变测试之后的集成与发布。两份失守的日志留在 `runs/2026-09-02/首轮-边界失守/`。这是「写 eval 逼出边界」的又一例：旧版 description 没写这两条。

### 重跑（SKILL 内容哈希 `9ff15bd16653`）

**behavior 两模式对照**

| case | baseline | with_skill |
|---|---|---|
| `translate-closed-requirement` | 无工具调用，输出一份八节需求文档（背景、目标、方案、字段表、计费规则、业务影响、验收标准、非目标），**没有一句配例子，也没请主人否** | 只读本 skill，输出规定形态：原话加提/验、拆不拆（不拆，一个使用者一个目标）、四句 EARS 各带例子、请逐句否。7 条断言中 `example-per-sentence` 部分通过：例子有但没带具体数字（「运费计算结果包含该偏远附加」），第 4 句把验收判据「连续两周」写成了系统需求 |
| `big-requirement-split` | 无工具调用，输出「先冻结十条口径 + 八个子需求」的长文档，含方案 A/B 取舍 | 只读本 skill，拆成 4 个用例各标使用者与目标，5 句 EARS 每句带具体例子（仓 A 北京、仓 B 上海、收货天津），补一张决策表，请业务 B 逐句否。4 条断言全过 |

差值一句话：没有 skill 时 agent 写的是需求文档；有 skill 时写的是可逐句否、可变测试的句子加例子。

**trigger**

| case | 结果 |
|---|---|
| `not-yet-closed` | 首轮未读本 skill、直接指出「还不是可开发需求」；重跑时读了本 skill，输出「只是方向」加八条待产品确认的候选规则。两轮都没把它当收口需求直接翻成最终清单，但重跑那次的候选规则已经是 EARS 形态——**边界守住一半** |
| `plain-question` | 两轮都未读本 skill，直接讲五种句式（旧版 description 时这条会读 skill） |
| `after-acceptance-integrate` | 两轮都读了本 skill，但输出的是集成面清单，没有重翻需求。读了没按它行动 |
| `direct-code-change` | 首轮读本 skill 并输出 EARS 句（失守）；重跑未读本 skill，在空 cwd 里找代码后请求提供代码 |

### 单轮测不到的

逐句否后的纠偏留痕、工位 5 留、工位 6 例子变测试，单轮测不到。

## 状态

**未验证。** 隔离单轮两轮共 16 次。真正的判据是在工作机上接一条真实需求走一遍，主人有没有逐句否、例子有没有原样变成测试。
