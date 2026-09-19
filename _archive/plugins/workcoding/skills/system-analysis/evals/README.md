# system-analysis 的行为评测

**跑法、硬约束与事故记录见共享 runbook：[`plugins/docs/skill-eval-runbook.md`](../../../../docs/skill-eval-runbook.md)。** 本文只记 system-analysis 特有的部分。

## 用例构成

7 个 case：2 个 `behavior` + 5 个 `trigger`。2026-09-02 的实跑是旧版历史证据；当前合同不再把普通静态查数自动送进规程。

两个 behavior case 都有明确决定缺口：决定开关位置所需的调用关系、决定灰度范围所需的性能证据。两条 prompt 都写明「看不到代码也跑不了 Arthas」，测的是承认未知、分析有边界、只补会改变决定的证据；不能据此宣称完成真实分析。

**5 个不应触发的 case**：

| case | 该归谁 |
|---|---|
| `incoming-requirement` | `requirement-insight` |
| `direct-code-change` | 处理这次代码请求的实际信息缺口，不改写成取数任务 |
| `plain-question` | 直接答（讲 Arthas 命令） |
| `load-test-request` | 6.4.9 性能测试，备选里已排除 |
| `plain-static-count` | 根据已提供的调用边直接统计，不索要 Arthas 或新建确认步骤 |

## 与被测 SKILL.md 的对应

| 铁律 / 工位 | 测它的断言 |
|---|---|
| 铁律 1 每个数挂一个决定 | `tied-to-decision` |
| 铁律 2 不捏造草图与证据、只补拿不准的边 | `assumptions-separate`、`bounded-sketch`、`evidence-only-uncertain`、`evidence-is-targeted` |
| 铁律 3 结论带置信度与未验证假设 | `honest-conclusion` |
| 分析与静态查询的边界 | `no-code-no-plan`、`correct-static-answer`、`no-artificial-procedure` |

## 实跑（2026-09-02，`gpt-5.6-luna`）

跑法：隔离 HOME、`--no-rules`、`--config overlay.yml`、`--mode=json`、每 case 独立空 cwd；with_skill 只装本 skill；baseline `--no-skills`。跑前跑后四个仓与全部 worktree 无新增。**两轮里 `count-with-decision` 的 baseline 都在自己的空 cwd 里写了一个文件**（首轮 `analysis-request.txt`，重跑 `freight-calc-caller-audit.md`）——这正是 runbook 说的「behavior 类的 baseline 本来就会写文件」，跑后已删。

### 首轮：一条边界失守，收紧 description 后重跑

首轮 `direct-code-change` 读了本 skill、建 todo 在 cwd 里找代码、最后输出了六行。description 加了「不用于『帮我改 X』类改代码指令（那是 workcoding 路由）」并压缩英文后重跑。失守日志留在 `runs/2026-09-02/首轮-边界失守/`。

### 重跑（SKILL 内容哈希 `89334b50ebec`）

**behavior 两模式对照**

| case | baseline | with_skill |
|---|---|---|
| `count-with-decision` | 11 次工具调用：建 todo、glob、**写文件 `freight-calc-caller-audit.md` 并 edit**，输出一份审计规程（rg 命令、Arthas sc/sm/stack 命令、决策口径） | 只读本 skill，输出六行：问挂「开关放哪」、假设单列（只算直接调用、暂不排除反射代理）、草图两跳写成待主人在 IDE 做的事、证据是 `sm` 加一条真实请求 `stack -n 1`、结论「待回填 N，置信低，未验证……」、留。6 条断言全过 |
| `stuck-in-change-plan` | 12 次工具调用含子 agent，输出长文：判断、比较口径、首档决策表、扩大灰度门槛（p95 增量 2 ms / 5%）——**给了没有依据的阈值** | 只读本 skill，六行：问挂「灰度第一档放谁」、假设（同入口分流、口径可比）、草图、证据是 `trace -n 1` 抓一条新路径请求与旧路径基线比、结论「无法给出慢多少，置信低，第一档只放测试模板」、留。5 条断言全过 |

差值一句话：没有 skill 时 agent 写审计文档、编阈值、写文件；有 skill 时六行、假设单列、要主人做的写清楚、不给没依据的数。

**trigger**

| case | 结果 |
|---|---|
| `incoming-requirement` | 重跑无工具调用，直接做需求拆解；首轮曾试读未装的 requirement-insight。两轮都没输出六行 |
| `direct-code-change` | 首轮读本 skill 并输出六行（失守）；重跑仍读了本 skill，还 glob 到 cwd 之外读了另一条 case baseline 写的审计文件，但**没有输出六行**，只说没代码不能改。边界守住一半 |
| `plain-question` | 两轮都无工具调用，直接讲 trace 与 stack |
| `load-test-request` | 首轮未读本 skill；重跑读了本 skill，但输出仍是压测方案，没改写成「一条 trace」。读了没按它行动 |

### 单轮测不到的

真的两跳草图与 Arthas 证据、两小时限时、结论进决定后的留，都要在工作机上发生。

## 状态

当前 7 条合同已通过结构校验；本轮没有重跑 Arthas 或这两条分析行为用例。历史隔离结果不证明当前规程在真实系统上有效；真实证据仍须在有明确决定缺口的工作场景中取得。
