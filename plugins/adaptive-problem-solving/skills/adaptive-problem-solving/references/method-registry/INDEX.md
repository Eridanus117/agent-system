# 方法类型学索引

索引按“当前阶段最阻碍正确下一步的决策状态”归型，不按代码、产品、知识等任务领域分类。先保留普通路径，再只读取与主类型、风险和成本相称的候选卡。

当前证据分布：M0 18 张、M1 12 张，M2–M4 0 张；M1 仍只可在相同边界下建议。

[关联 Eridanus117/agent-control#93（问题类型学首批真实样本校准）的实证评论](https://github.com/Eridanus117/agent-control/issues/93#issuecomment-5258734377)提供 21 个真实决策时刻：严格 P1–P5 唯一归型 14/21，阶段边界歧义 4/21，P1–P5 无家但稳定落入 P6 为 3/21。下表据此校准阶段边界；它不把任务领域、事后解释或方法字段齐全当作归型成功。

## P1–P5 主索引

| 类型 | 判断信号 | 优先候选 | 备选候选 | 退出／换型 |
| --- | --- | --- | --- | --- |
| P1 问题定义型 | 两种问题解释会导向不同结果；症状、假设与方案混在一起 | [`aps-problem-modeling`](./cards/aps-problem-modeling.md)、[`outside-in-thinking`](./cards/outside-in-thinking.md) | [`structured-brainstorming`](./cards/structured-brainstorming.md)、[`cynefin-sensemaking`](./cards/cynefin-sensemaking.md) | 原始问题、期望结果、约束与当前阶段形成可检验合同；若由 P4 或审计发现旧定义失效，必须先用问题建模重建合同，不能以“已经发现错误”为退出；只缺事实则换 P3 |
| P2 价值／授权型 | 事实可查，但答案取决于谁有权决定、是否允许承担风险，以及私域或产品边界是否获准 | [`aps-alignment-questioning`](./cards/aps-alignment-questioning.md)、[`grilling-decision-tree`](./cards/grilling-decision-tree.md) | [`aps-parent-goal-acceptance`](./cards/aps-parent-goal-acceptance.md) | 形成唯一决定请求，或证明可由 Agent 在授权内处理；授权与决定权成立后仍需比较多个可行方向才换 P5；`grilling` 未获明示同意不得启动 |
| P3 证据缺口型 | 缺少一项可观测事实，取得后会翻转决定 | [`aps-bounded-research`](./cards/aps-bounded-research.md)、[`quality-of-information-check`](./cards/quality-of-information-check.md) | [`indicators-signposts`](./cards/indicators-signposts.md)、[`goal-question-metric`](./cards/goal-question-metric.md)、[`comparative-experiment`](./cards/comparative-experiment.md)、[`paired-observation`](./cards/paired-observation.md)、[`sequential-experiment`](./cards/sequential-experiment.md) | 达到决定门或取证成本超过决定价值；争点需要行动而非观察来区分时直接换 P6；事实齐全、转为攻击明确模型时换 P4，并记录换型时点 |
| P4 假设脆弱型 | 已有明确模型或方案，失败尚未发生，但隐藏假设、共识或高损失失败路径可能推翻它 | [`aps-adversarial-falsification`](./cards/aps-adversarial-falsification.md)、[`key-assumptions-check`](./cards/key-assumptions-check.md)、[`analysis-of-competing-hypotheses`](./cards/analysis-of-competing-hypotheses.md) | [`premortem`](./cards/premortem.md)、[`multi-perspective-adversarial-review`](./cards/multi-perspective-adversarial-review.md)、[`devils-advocacy`](./cards/devils-advocacy.md)、[`team-a-team-b`](./cards/team-a-team-b.md)、[`high-impact-low-probability`](./cards/high-impact-low-probability.md)、[`what-if-analysis`](./cards/what-if-analysis.md)、[`red-team-analysis`](./cards/red-team-analysis.md) | 新一轮不再产生会改变决定的攻击；对象被证伪则回 P1；争点收敛为可检验因果则换 P6；失败已经发生且瓶颈转为纠正行为、防止复发时换 P7，不把事后修正反记为 P4 已成功介入 |
| P5 多案取舍型 | 决定权与授权边界已经成立；至少两个可行方向的主要差异是收益、成本、风险与可逆性 | [`aps-roi-options`](./cards/aps-roi-options.md)、[`alternative-futures`](./cards/alternative-futures.md) | [`cynefin-sensemaking`](./cards/cynefin-sensemaking.md)、[`comparative-experiment`](./cards/comparative-experiment.md) | 推荐、置信、最强反方与翻转条件齐，且必要决定已有审阅面；授权或决定权尚未成立则先归 P2 |

## 补充类型（P6 可直接首跳）

P6 不改变 P1–P5 的主分类骨架，但获得可直接首跳的补充出口：当关键争点已经能由一次低成本、可逆行动区分时，不必先把它勉强归入 P3 或 P4。三个 P1–P5 无家样本均稳定命中 P6，且方法形状 3/3 一致；若只是缺可观察事实，仍归 P3，若只是攻击既有模型，仍归 P4。

| 类型 | 判断信号 | 候选 |
| --- | --- | --- |
| O0 明确执行型 | 目标、边界、证据与授权充分，下一步低风险可逆 | 普通执行；APS 入口检查后退出 |
| P6 因果未知型 | 关键假设可用低成本可逆行动区分 | [`aps-minimum-experiment`](./cards/aps-minimum-experiment.md)、[`preregistered-experiment-card`](./cards/preregistered-experiment-card.md)、[`sequential-experiment`](./cards/sequential-experiment.md)、[`paired-observation`](./cards/paired-observation.md) |
| P7 行为改进型 | 已出现纠正、重复失误、能力回退或抽象循环 | [`self-improvement-loop`](./cards/self-improvement-loop.md) |
| P8 实施阻塞型 | 方向明确，瓶颈是模型、工具、环境、权限或协作配置 | [`aps-execution-configuration-check`](./cards/aps-execution-configuration-check.md) |
| U 未能归型 | 两种以上类型都合理，或现有类型无法解释关键未知 | 列至多两个候选类型与一条区分证据；优先最小可逆探针，高影响分叉仍在时只问一个最小问题 |

## 与装配内其他 Skill 的分界

卡片承载的是方法的**进入条件、硬门、成本画像与退出条件**，不是执行流程。当前装配内若已有承载该方法执行流程的 Skill，命中该卡后路由到它，只保留本卡的进入／退出／成本判断，不自己再走一遍执行步骤。

已知会形成这种关系的对应（当且仅当对方在当前装配内）：

| 本登记面的卡 | 执行流程承载者 |
| --- | --- |
| `devils-advocacy`、`grilling-decision-tree` | `grilling` |

**在不在装配内由装配声明决定，不由资产是否存在决定。** 仓库里有某个组不等于当前装配里有它——装配是白名单，没声明即不存在。因此本表不是无条件生效的路由，而是"若命中且对方在装配内"的分界规则。（曾列 bmad-* 五项承载者，已随 2026-09-01 bmad 整组退库移除。）

对方不在装配内时，按卡片的执行定义直接做，不因为表里列了它就等待或降级。

## 组合上限

默认组合深度为 2：一张主卡加一张直接补足其输入或验证面的卡。`grilling-decision-tree` 的明示同意门、`self-improvement-loop` 的触发门和所有授权／写入所有权门不可被组合关系继承或绕过。把三张以上卡串成流程前，必须先证明新增卡减少的关键未知高于判断税；否则退回一张主卡或普通路径。
