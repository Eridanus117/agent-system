# requirement-insight 的行为评测

**跑法、硬约束与事故记录见共享 runbook：[`plugins/docs/skill-eval-runbook.md`](../../../../docs/skill-eval-runbook.md)。** 本文只记 requirement-insight 特有的部分。

## 用例构成

6 个 case：2 个 `behavior`（应触发）+ 4 个 `trigger`（不应触发）。

两个 behavior case 是这条规程的两种真实入口：产品正式提的需求，同事口头一句「能不能加一列」。两条 prompt 都写明「路线已确认」，因为判形状、摆路线是 `workcoding` 的事，本 skill 进来时那一步已过。

**4 个不应触发的 case 就是路由边界的可执行版本**：

| case | 该归谁 |
|---|---|
| `build-a-tool-itch` | `clarify`（痒点来自主人自己，没有提出方可问） |
| `already-closed-translate` | `requirement-translation`（三行加一句已否过，不得重做洞察） |
| `plain-question` | 直接答（问的是 JTBD 切换访谈是什么） |
| `count-query` | `system-analysis`（要的是一个数） |

## 与被测 SKILL.md 的对应

| 铁律 / 工位 | 测它的断言 |
|---|---|
| 铁律 1 原话一字不改加谁提的 | `verbatim-with-source` |
| 铁律 2 对主人断言、对提出方历史行为问题 | `solution-to-problem-assertive`、`three-history-questions` |
| 铁律 3 否过之前不落盘、没证据写假设 | `existing-capability-honest`、`stops-no-translation` |
| 工位 4 三行加一句 | `three-lines-plus-cue` |

## 首轮实跑（2026-09-02，`gpt-5.6-luna`，改写后）

跑法：隔离 HOME、`--no-rules`、`--config overlay.yml`、`--mode=json`、每 case 独立空 cwd；with_skill 只装本 skill；baseline `--no-skills`。SKILL 内容哈希 `5d52e0b3950f`。跑前跑后四个仓与全部 worktree 无新增；八个 cwd 空。

### behavior：两模式对照

| case | baseline | with_skill |
|---|---|---|
| `product-requirement` | 无工具调用，直接把「按省份设偏远附加」当既定目标，输出完整需求定义：业务规则六节、界面表格、七条歧义。**没有翻回问题，没有让主人去问提出方** | 只读 `skill://requirement-insight`，输出规定的七行：原话加「产品 A」、断言草案（配送成本高于统一附加、商家承担缺口）、三个历史行为问题、查现成写「未查到」、三行（值得改标为假设）加判据、请带回原话。6 条断言全过 |
| `colleague-vague-request` | 无工具调用，列七个「口径」问题（含哪些费、展示什么、粒度、拼接、空值、历史、入口）加一段可直接发给同事的话术、验收样例表。**问的全是意见与规格，不是历史行为**；也直接给了最小可交付范围 | 只读本 skill，七行齐：原话加「同事 B」、草案标假设、三个历史行为问题、未查到、三行加判据（拿一份实际导出单据能说清附加费构成）。5 条断言全过 |

差值一句话：没有 skill 时 agent 替提出方把需求定完了；有 skill 时它备好问题停下，让主人去问。

### trigger：边界全守住

| case | 结果 |
|---|---|
| `build-a-tool-itch` | 无工具调用；按普通作答问三件事并给初始方案。没读本 skill，没有备「问提出方」的问题 |
| `already-closed-translate` | 无工具调用；直接给四句 EARS 加例子。没有重做三行、没有重备问题 |
| `plain-question` | 无工具调用；讲解切换访谈。没读本 skill |
| `count-query` | 无工具调用；给查法。没读本 skill |

### 单轮测不到的

工位 5「留」与纠偏留痕（主人带回答案、否三行之后才发生）单轮测不到。判据仍是主人下一次真实使用。

## 状态

**未验证。** 首轮实跑是设计者自己跑的隔离单轮，样本 8 次。真正的判据是在工作机上接一条真实需求走一遍，主人有没有拿着那三个问题去问提出方。
