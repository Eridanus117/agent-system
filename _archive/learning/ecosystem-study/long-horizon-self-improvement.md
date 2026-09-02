# 长程治理与自我改进环生态：从“会反思”到“有门、可恢复、可回退”

> 核验日期：2026-08-12
>
> 结构位置：[关联 #165（生态情报持续改进我们的系统）](https://github.com/Eridanus117/agent-control/issues/165) 的路线 A / A7；上位为[关联 #164（研究与学习程序）](https://github.com/Eridanus117/agent-control/issues/164)。
>
> 对照项：[关联 #178（规则与 Skill 体系复杂度收敛）](https://github.com/Eridanus117/agent-control/issues/178)。
>
> 服务的当前问题：怎样让跨任务纠偏能够积累为长期能力，同时不让模型自评、运行时快照、旧经验或新增规则越过授权、知识准入和复杂度门。
>
> 交付边界：仅作生态研究、能力缺口和带门候选；不实施，不修改权威、Skill、经营总账、研发记忆或运行时配置。

## 结论先行

生态材料不支持“让 Agent 多反思几轮，就会形成可靠的长期自我改进”这一强结论。更稳健的解释是：【I：综合下列 P/D 证据；长期效果仍为 U】

1. Reflexion 与 Self-Refine 证明了**语言反馈可以作为当前任务内的搜索算子**。【P：Reflexion arXiv v4 与 Self-Refine NeurIPS 2023 论文】它们没有证明同一模型生成的反思可以直接成为跨任务真相、验收结论或持久行为。【U：论文未覆盖我方跨任务治理边界】
2. Anthropic 与 OpenAI 的工程材料把可靠性落在**真实任务、轨迹与结果分离、多种 grader、人工校准、回归集和持续比较**，而不是单靠自评。【P：两家官方工程材料；页面水位见下文】
3. LangGraph 与 AutoGen 的 checkpoint/state 能恢复运行。【P：固定 commit 的 persistence/state 文档】它们恢复的是序列化运行状态；不能据此推出当前权威、授权、Issue 合同、写入所有权或知识有效性也被恢复。【I：框架机制与我方治理对象的边界判断】
4. 我方现有 APS、self-improvement Skill、迭代回执、经营总账、研发记忆与防漂移门，已经覆盖了大部分**语义边界**。【D：本次直接读取当前仓库与已安装 Skill】当前主要缺口不是再造一个控制器，而是缺少自然样本证明这些部件能共同完成：纠偏取证 → 候选形成 → eval 准入 → 受控落点 → 跨 Session 恢复 → 回归与回退 → 证据升级。【U：尚无自然闭环样本】
5. [关联 #178（规则与 Skill 体系复杂度收敛）](https://github.com/Eridanus117/agent-control/issues/178) 已直接量出规则重复、启动暴露与维护税，并由负责人形成 [关联 #178（规则与 Skill 体系复杂度收敛）178-D1 稳定决定回执](https://github.com/Eridanus117/agent-control/issues/178#issuecomment-5267970222)：批准“分层保留＋单一事实源”的第一批规则收敛。【D】A7 的推荐路径因此应复用现有载体，并以替换、复用和自然任务验证优先；这仍是本研究的适配判断，不是 178-D1 对 A7 实施或本 PR 整合的授权。【I】

推荐的闭环不是新的平台，而是现有组件之间的一条受门控证据路径：【I：将上述 P/D 证据映射到我方；实际收益仍为 U】

```text
真实纠偏或环境结果
  → 轨迹与最终结果证据
  → 反思／改动候选
  → APS 判断当前任务路线
  → 研发记忆保留原因、反证与未知
  → 目标 eval + 不变量／回归 eval
  → 授权与知识／行为资产准入
  → 有版本、有回退点的变更
  → 跨 Session 恢复演练
  → 自然样本复核
  → 经营总账只投影新的证据水位
```

【I】上图是候选治理关系，不表示这些步骤已经在自然任务中贯通。

这一路径至少保留三组分离：

- **反思者与验收者分离**：自生成反馈可以提出候选，不能单独批准自己的持久改变。【P：论文与 Anthropic 工程材料说明反馈／自评局限；D：我方授权门】
- **运行时状态与治理事实分离**：checkpoint 可以续跑，恢复后仍须重读当前权威、远端合同与授权。【P：固定版本框架恢复机制；D：我方当前入口】
- **候选与当前能力分离**：研发记忆和迭代回执可以保存因果，但只有通过准入的资产才能改变行为；经营总账只记录证据变化，不驱动执行。【D：当前权威与已安装 Skill】

## 证据分级与本报告水位

| 等级 | 含义 | 本报告中的使用 |
| --- | --- | --- |
| D：直接核验 | 直接读取当前仓库权威、远端 Issue、已安装 Skill 或其引用协议 | 用于陈述我方现有组件、边界和当前证据水位 |
| P：一手来源 | 论文原文、作者或产品官方工程文档 | 用于陈述外部机制、作者报告结果、已公开限制 |
| S：二手转述 | 博客转述、聚合材料、非官方解读 | 本轮未用于形成关键结论 |
| I：推断 | 由 D/P 证据映射到我方架构的判断 | 所有缺口、优先级和候选均按推断处理 |
| U：未知 | 未直接复现、没有自然样本或缺少长期数据 | 不以外部 benchmark、文档示例或当前实现替代 |

本报告最高只证明“研究交付 + 候选形成”。未复现论文 benchmark，未运行 LangGraph/AutoGen 恢复实验，也未对我方自我改进环做自然任务验收。外部性能数字即使来自论文，也只视为作者报告，不提升我方证据等级。

外部证据固定／观察水位如下：Reflexion 使用 [arXiv `2303.11366v4`](https://arxiv.org/abs/2303.11366v4)（2023-10-10 修订）；Self-Refine 使用 [NeurIPS 2023 conference version](https://proceedings.neurips.cc/paper_files/paper/2023/hash/91edff07232fb1b55a505a9e9f6c0ff3-Abstract-Conference.html)；LangGraph 文档固定到官方文档仓 [`30d6ba4`](https://github.com/langchain-ai/docs/commit/30d6ba4a0dd974c799d16297c9913af493d521da)；AutoGen 固定到 release [`python-v0.7.5`](https://github.com/microsoft/autogen/releases/tag/python-v0.7.5)／commit [`83afbf58`](https://github.com/microsoft/autogen/commit/83afbf5857aac683340d4c692194e548b1e8edda)。Anthropic 两篇 canonical 文章分别发布于 2026-01-09 与 2026-03-24；OpenAI 三篇开发者指南未提供可固定发布版本，保留 canonical URL，统一 `observedAt=2026-08-12`。下次只有候选被消费、canonical 重定向、release 变化或主张冲突时才重读对应一手来源，并与上述固定版本比较；无变化即停止。

## 生态机制：各自解决了哪一段

| 机制 | 一手证据与观察 | 可借鉴部分 | 不能推出的结论 |
| --- | --- | --- | --- |
| Reflexion | Actor 产生轨迹，Evaluator 给分或反馈，Self-Reflection 把语言反思写入有界 episodic memory；论文也报告错误测试会制造假阳性、提前停止和有害修改，去掉有效测试后代码任务表现低于其基线 | 把反思视为候选；反馈必须绑定可验证结果；记忆应有界；停止信号本身需要验证 | 反思文本是真相；同一模型可自我授权；多轮迭代必然改进；短期 memory 等于长期知识 |
| Self-Refine | 同一 LLM 迭代执行生成、反馈和改写，达到任务条件或轮次上限即停；失败分析显示多数失败来自错误定位或不合适的反馈，而非“知道正确反馈却不会修改” | 预先固定退出条件和最大轮次；先验证 feedback，再扩大修改；弱模型不宜承担整环 | 自评天然独立；更多轮次会单调提升；无外部验证也适合高影响持久变更 |
| Anthropic agent evals | 把 task、trial、grader、transcript、outcome 与 harness 分开；对随机性任务做多次 trial；组合确定性、状态、工具、轨迹与模型 grader，并以专家校准模型 grader；能力 eval 稳定后转成 regression eval | 轨迹和结果双证据；能力集向回归集晋级；grader 组合和校准；真实任务尽早进入 eval | 单次成功能证明长期能力；LLM judge 不经校准即可作为准入门；轨迹漂亮等于结果正确 |
| Anthropic 长任务 harness | 用 planner、generator、evaluator 与结构化 handoff 缓解多 Session 漂移；明确指出上下文压缩不是干净重启，生成者容易高估自己的工作，独立 evaluator 仍需清晰 rubric | 干净 Session + 结构化交接；生成与验收角色分离；按小增量恢复和检查 | 分角色自动产生客观性；checkpoint 可替代当前合同重读；框架结构自动解决产品授权 |
| OpenAI eval 指南与 trace grading | 建议尽早且持续评估、记录全部过程、使用任务特定数据、结合指标与人工判断；trace grading 对工具调用、决策与 handoff 给结构化标签，帮助定位 workflow 失败 | 把“结果是否对”和“在哪里偏离”结合；已知正确样本进入可重复比较；变更前后同集对照 | 某个托管产品就是长期架构；通用分数可以替代任务判据；自动 grader 可以取代负责人决定 |
| LangGraph persistence | checkpointer 按 thread 保存 graph state/snapshot，支持中断续跑、time travel、fault tolerance；store 承载跨 thread 的长期数据，两者明确分离；文档也提示内存 saver 会随重启丢失、checkpoint 可能无界增长 | 运行时快照与长期存储分层；恢复、分叉、重放和 pending writes；副作用前设置 interrupt | state snapshot 是权威；restore 会刷新授权；长期 store 中的内容天然有效；保留全部 checkpoint 没有成本 |
| AutoGen state | Agent/Team 可 save/load，Team state 包括参与者和 manager；官方 API 警告运行中保存可能不一致，load 会覆盖当前状态，跨版本可移植性需要调用方负责 | 保存前进入一致点；状态带版本；恢复是显式、可验证操作 | 序列化成功等于语义一致；旧状态可不经当前来源复核直接继续；框架承担迁移和治理责任 |

### 生态中的共同最小环

这些来源虽术语不同，交集可以压缩成五段：

1. **观察**：保存输入、轨迹、工具结果和环境 outcome，而不只保存模型总结。
2. **诊断**：生成反馈或反思，但保留其来源、置信度与反证。
3. **试改**：在有界轮次、成本与范围内产生候选。
4. **验收**：以预注册的任务判据、回归集、人工或独立 grader 判定；失败就停止、回退或换路。
5. **留存**：运行时 checkpoint、任务证据、长期知识和行为资产分别进入不同载体。

外部生态最容易把第 5 段简化为“把反思放进 memory”。我方边界更严格，也应保留：memory 只说明过去保存了什么，不说明今天仍然正确，更不说明当前 Session 获得了新的授权。

## 与我方现有组件逐项对照

| 我方组件 | 已有能力（D） | 生态对应 | 当前判断 |
| --- | --- | --- | --- |
| APS | 恢复原问题与瓶颈，比较普通路径和方法，控制成本、证据、授权、停止与父目标验收；它是任务内唯一方法控制器 | planner / controller / bounded refinement loop | 不缺第二个控制器；应由 APS 决定是否进入反思、实验、回退或退出 |
| self-improvement Skill | 只在纠偏、漂移、复发或抽象循环触发；冻结受影响路径，保存纠正，诊断原因，验证可复用行为改进，获得授权后才落入 prompt/Skill，并返回原任务 | reflection + candidate promotion | 语义边界已经强于多数论文原型；缺口主要在真实样本和跨组件验收证据 |
| 迭代回执 | 当前 0.1.4 已有 trigger、object、finding、route、authority、validation、landing、acceptance、recheck、roi 十字段；object 已要求版本、基线、回退点和所有权 | experiment record / checkpoint manifest / evaluation card | 已经是最小治理协议，不应复制成新表、数据库或状态机；尚未证明自然任务中可恢复、低负担、有效 |
| 经营总账 | 分离执行状态、诉求状态与证据等级；Project 只是观察面；维护不自动规划、派发或运行任务 | portfolio/evidence dashboard | 适合投影“证据水位发生变化”，不适合承载每步反思或成为事件后端 |
| 研发记忆 | 保存原始过程和可读蒸馏，区分事实、决定、纠正、未知与过时判断；明确不是权威、知识、任务状态或行为 | episodic memory / trace archive | 比 Reflexion memory 更适合保存因果与反证；仍需知识/行为准入，不能直接注入执行路径 |
| 防漂移门 | 权威 → 任务约定 → 授权 → 推进/请求决定 → 工作与证据 → 验收 → 提议更新；当前只证明交付验收 | harness + acceptance gate | 边界清楚，但尚无长期样本证明它降低漂移、恢复成本和负责人注意力 |
| A4/A6 既有研究 | 已提出轨迹/结果双证据、正负样本、judge 校准和回归候选 | trajectory eval / regression suite | A7 直接消费，不再复制 grader 体系；A7 只补“纠偏如何晋级、恢复和回退”的治理链 |
| A5 既有研究 | 已提出战略/战术上下文分离、事件驱动锚定和 handoff 验证 | context firewall / structured handoff | A7 不再提出第二套上下文协议，只检验现有回执能否在干净 Session 恢复 |
| 关联 [#178（规则与 Skill 体系复杂度收敛）](https://github.com/Eridanus117/agent-control/issues/178) | 已发现规则和 Skill 体积、重复语义与启动暴露问题；[关联 #178（规则与 Skill 体系复杂度收敛）178-D1 决定回执](https://github.com/Eridanus117/agent-control/issues/178#issuecomment-5267970222)已批准分层保留、单一事实源的第一批收敛 | governance debt / prompt surface | 决定已形成；A7 本研究仍未实施，该决定不授权本 PR 实施、转 ready 或整合 |

## 能力缺口：缺的是证据链，不是概念数量

### G1：迭代回执有实现，缺自然闭环样本

当前回执协议自己已明确：现有证据最多是实现完成，三方审阅、自然样本、产品采用和长期依赖仍需独立证据。未知项包括：新 Session 能否只靠当前 Issue 回执恢复本轮因果；十字段维护是否比重读分散材料更省时；同一评论增量更新是否会产生覆盖冲突；`recheck` 是否真的会在自然事件被消费。

这不是“再加字段”的理由，而是执行一个有停止条件的恢复演练的理由。

### G2：`validation` 有通用字段，缺“纠偏晋级回归”的固定证据关系

当前系统能记录验证，但尚未直接证明以下关系在真实纠偏中被一致执行：

```text
可复现失败
  + 针对本缺陷的目标 eval 由失败转为通过
  + 至少一个原有不变量／回归没有退化
  + grader 与最终 outcome 的关系可核验
  = 仅获得“可提交候选”资格
```

等式右侧仍不是产品采用或长期能力。它只阻止“反思听起来合理”直接变成持久行为。具体 grader、正负样本和校准复用 A4/A6 研究，不在 A7 新建一套。

### G3：框架 checkpoint 能续跑，不能证明治理恢复正确

LangGraph/AutoGen 保存的是运行时状态。即使状态完整，也可能绑定旧的 Issue 正文、旧 authority revision、旧 Skill 版本、旧 eval 集或已经失效的写入所有权。反过来，我方迭代回执 `object` 已要求这些治理字段，却还没有与一次实际暂停/恢复的 runtime state 做过一致性核验。

缺口是一次“旧快照存在，但恢复者先重读当前来源并识别差异”的演练，不是引入新的 checkpoint 数据库。

### G4：反思质量与验收独立性尚无本地校准证据

Reflexion 和 Self-Refine 都显示错误反馈会导致错误修正或错误停止；Anthropic 也明确区分 generator 和 evaluator，并要求 grader 对专家判断校准。我方边界已经禁止候选自动获得授权，但尚未用自然样本证明：哪些缺陷适合确定性检查，哪些需要人工，哪些可用独立模型 grader，哪些必须由负责人决定。

本缺口应消费 A4/A6 的 grader 校准候选；A7 不单独制造“第二评审系统”。

### G5：停止与回退写进协议，尚未证明可执行

回执要求退出条件和回退点，APS 与 self-improvement 也要求控制成本、冻结受影响路径并返回原任务。但当前没有自然证据表明行为资产变化后能够：精确识别前后版本、复跑目标与回归 eval、在失败时恢复旧行为，并且不误回退同期无关变化。

仅保存 checkpoint 不能填补这个缺口；必须把回退对象、所有权和验证结果绑定同一实际变更。

### G6：改进收益与规则增量之间缺少经验证的复杂度门

[关联 #178（规则与 Skill 体系复杂度收敛）](https://github.com/Eridanus117/agent-control/issues/178) 的直接调查说明：规则重复、入口暴露和大 Skill 已经产生现实成本。self-improvement 的 `roi` 字段会记录维护税，但尚无自然样本证明它会阻止“事故发生一次，就再加一条规则”的累积路径。

A7 与该调研的共同约束应是：行为候选优先修正现有单一来源、删除被替代语义或增加 eval；只有现有表达和门控不足有证据时，才考虑增加规则。178-D1 已决定“分层保留＋单一事实源”的第一批收敛方向；但 A7 如何消费这一边界仍是本研究推断，必须等待独立、明确的实现合同，不能由该决定或本报告直接写入系统。

## 候选改进与准入门

以下全是候选，不构成实现授权。优先级按“先减少关键未知，再考虑结构改动”排序。

| 候选 | 目标缺口 | 最小验证动作 | 通过信号 | 停止／否决门 |
| --- | --- | --- | --- | --- |
| C1（P0）用下一次真实高影响纠偏做一次回执恢复演练 | G1、G3 | 在自然触发的当前 Issue 中使用现有十字段回执；在安全暂停点由干净 Session 仅凭远端来源恢复，并对旧 runtime state 与当前 authority/Issue/asset/eval revision 做差异检查 | 恢复者无需旧聊天即可说清父目标、当前版本、授权、未决项、回退点、证据水位与下一动作；没有写入第二份状态 | 没有真实触发则等待；若需要数据库、轮询、Hook 或新状态机才可运行，停止；若回执维护成本高于直接重读，退回分散载体 |
| C2（P0）在现有 `validation` 字段试行“目标 eval + 回归不变量”准入 | G2、G5 | 对同一自然纠偏，先固定失败样本、目标判据、至少一个相关不变量和回退方法，再改行为候选；记录前后结果和未运行项 | 原失败被复现且转为通过；相关不变量未退化；回退可执行；结果只晋级为候选 | 无法得到可信 outcome、判据事后变化、grader 未校准、回归失败或回退对象不清时，不晋级 |
| C3（P1）把 A4/A6 grader 选择表用于一次自我改进样本 | G4 | 复用既有轨迹/结果双证据和 grader 校准候选，为每个判据声明确定性检查、状态检查、人工、独立模型或负责人决定中的一种 | grader 与真实 outcome 一致；分歧被显式记录并触发人工复核，不由生成者自行裁决 | 如果只是把同一模型换一个提示词充当“独立”验收，或样本不足以判断校准质量，保持未知，不新增门 |
| C4（P1）做一次精确回退演练 | G5 | 选择可逆、作用域明确的行为资产候选，绑定旧/新 revision、目标 eval、回归 eval 和恢复动作；只在已有实现授权后执行 | 失败条件触发后可恢复旧版本并复跑验证；同期无关变化不丢失 | 没有排他所有权、回退会覆盖他人变化、资产无法版本化或高风险环境无隔离时，不执行 |
| C5（P1）只在证据水位变化时投影经营总账 | G1、G6 | 若 C1/C2 产生新的当前交付或自然样本证据，按现有维护 Skill 把稳定来源投影到既有事项；回执仍留在 Issue | 总账能指出当前证据等级和稳定来源，不复制十字段、不成为任务执行器 | 仅有计划、反思或候选时不更新为已交付；若需新增重复状态字段，停止并回到现有来源 |
| C6（P1，决定已形成、本研究未实施）把复杂度预算作为行为候选的前置检查 | G6 | 重读 [关联 #178（规则与 Skill 体系复杂度收敛）178-D1 稳定决定回执](https://github.com/Eridanus117/agent-control/issues/178#issuecomment-5267970222)；仅当另有明确 A7 实现合同与写入所有权时，候选才说明复用／替换对象、净暴露变化、维护者、失效条件和为何 eval 不能单独解决 | 高价值改进不新增第二来源；重复语义减少或至少不增长；安全语义和恢复能力无回退 | 178-D1 不构成本研究的实施或整合授权；没有独立实现合同即不实施。若只能追加新规则、却无复发和 eval 证据，保持任务内修正 |
| C7（暂不采用）引入自治自我改进平台或框架 checkpoint 作为治理真相 | G1–G6 | 无 | 无当前必要性 | 会产生第二控制器、第二真相源、状态迁移和自动化维护面；外部框架状态也不能提供我方授权与知识准入 |

### 推荐顺序

先做 C1 与 C2 的同一个自然样本；只有它暴露 grader 选择问题时才进入 C3，有实际行为资产变更授权时才进入 C4。C5 只消费已经发生的证据变化。C6 采用已批 178-D1 的分层／单一事实源边界，但仍须等待独立 A7 实现合同；“决定已形成”不等于“本研究已实施”。这样可以用一次真实工作同时检查恢复、eval、回退和维护成本，而不预建平台。

## 必须保留的矛盾与我方边界

| 外部常见做法或诱因 | 矛盾 | 本报告保留的我方边界 |
| --- | --- | --- |
| 把模型反思直接写入 episodic/long-term memory | 反思可能错误、过时或只适用于当前轨迹 | 进入研发记忆时仍是候选/证据；知识与行为资产分别经过可信门、价值门、授权和验证 |
| 同一模型生成、批评、修改并判断停止 | 反馈错误会导致错误修改或假通过 | 自评只能形成候选；高影响改变需要与 outcome 对齐的 grader、人工/独立验收或负责人决定 |
| 从 runtime checkpoint 原地继续 | 快照可能绑定旧合同、旧授权、旧依赖或旧 Skill | 每次新建/恢复 Session 重读当前入口、远端 Issue 与必要权威；运行时状态不恢复写入所有权 |
| 将 long-term store 当作共享知识 | 存储可持久，不代表内容当前有效 | 知识准入仍由知识维护的价值门与可信门决定；研发记忆和总账不能替代知识 |
| 自动连续跑 eval 与自我改写 | 能快速发现变化，也会带来成本、误报、自动消费权限和隐性产品决定 | 当前只在真实任务和自然里程碑触发；不建设轮询、调度、Webhook、离线唤醒或自动派发 |
| 为每类漂移新增规则、字段或 Skill | 局部安全感会累计成全局复杂度和启动暴露 | 复用现有 APS、回执和生命周期单一来源；先替换/分层/用 eval，新增规则需单独证据和决定 |
| 用压缩摘要维持长 Session | 摘要可能保留旧假设，且生成者会美化自己的工作 | 干净恢复从当前来源重建；摘要和 checkpoint 是线索，不是权威快照 |
| 论文 benchmark 提升 | 外部任务、模型、工具和评分与我方环境不同 | 只作为机制可行性 P 级证据；我方能力必须由真实任务、当前版本和自然样本证明 |

## 路线比较

| 路线 | 做法 | 收益 | 代价／风险 | 判断 |
| --- | --- | --- | --- | --- |
| A：维持现有分散机制，不做连接验证 | APS、self-improvement、回执、研发记忆和总账各自工作 | 零新增结构，短期成本最低 | 无法知道跨 Session 因果是否可恢复，也无法证明纠偏会进入可靠回归 | 可作为没有自然触发时的等待状态，不足以验收 A7 |
| B：在现有回执中验证“证据晋级 + 恢复 + 回退” | 用一个自然样本运行 C1/C2，按需进入 C3/C4；总账只投影证据变化 | 最小化新概念；直接减少关键未知；兼容现有边界和复杂度收敛 | 依赖真实样本，短期不能制造漂亮的自动化演示 | **推荐，置信度中高** |
| C：采用 AutoGen/LangGraph 或自建平台承载整环 | 把状态、记忆、grader、恢复和迭代集中到运行时 | 演示快，技术接口丰富 | 第二真相源、迁移、自动化权限、维护税和框架耦合；不能补上产品授权和知识准入 | 当前否决；只有 B 暴露不可由现有载体解决的重复缺口时重评 |

### 最强反方

最强反方是：现有 Skill 和 Issue 工作流已经写明授权、停止、回退、验收与恢复，再做 A7 连接实验只会重复流程并增加记录成本。

这一反方成立一半。现有文本确实足够表达目标机制，因此本报告不建议新增协议；但“写明”只到实现证据，不能证明新 Session 能正确恢复，也不能证明反馈错误会被 eval 拦下。推荐路线 B 的价值只在于用一个自然样本检验现有设计，而不是扩写规则。若样本显示维护税高于减少的返工，或无法观察到额外错误拦截，候选应退出，不因已经研究过就继续建设。

### 会翻转推荐的条件

出现下列任一证据时重新比较路线：

- 两个异质自然样本均表明十字段回执比直接重读增加更多周期或负责人注意力，且没有改善恢复正确性；
- 当前 Issue + Git 历史 + 既有 eval 已能无歧义恢复所有必要对象，回执字段没有新增信息；
- 出现高频、可复现、跨任务的 runtime 恢复失败，现有 Issue/版本载体无法表达 checkpoint namespace、pending writes 或一致性边界；
- 受控实验显示某个框架可作为可替换执行适配器，并且不持有权威、授权、知识或生命周期真相；
- [关联 #178（规则与 Skill 体系复杂度收敛）178-D1 当前决定](https://github.com/Eridanus117/agent-control/issues/178#issuecomment-5267970222) 后续被负责人修订、替代，或其实施证据显示单一来源、分层或复杂度边界需要回退。

## 明确不做

- 不把 Reflexion/Self-Refine 的 verbal memory 接到当前 Agent 的自动长期记忆。
- 不让模型依据自评自动修改系统提示、Skill、知识或权威。
- 不把 AutoGen/LangGraph state 当成恢复合同或写入所有权证明。
- 不建设 eval 平台、scheduler、poller、Hook、Webhook、常驻服务或离线唤醒。
- 不新增 self-improvement 状态机、总账字段、迭代数据库或第二份回执。
- 不复制 A4/A6 的 grader 设计，也不复制 A5 的上下文与 handoff 候选。
- 不因外部托管产品的接口方便而形成平台依赖；本轮三份 OpenAI eval 指南只支持评测方法与当前产品能力，不支持“2026 年弃用／下线”主张，因此不据此推断产品生命周期，报告继续保持平台无关。
- 不把研究交付、候选形成或一次受控实验写成长期能力已成立。

## 知识维护与复核

### 本轮复用的当前知识

- [长程工作权威](../../_archive/authority/02-long-horizon-work.md)：长期任务核心风险是漂移、中断和局部目标替代原目标；当前 MVP 是防漂移闭环。
- [思考方法权威](../../_archive/authority/03-thinking-methods.md)：APS 是任务内控制器；self-improvement 只处理跨任务可复用行为改进，不能夺取知识、权威或生命周期职责。
- [研发记忆权威](../../_archive/authority/09-rd-memory.md)：研发记忆保存过程与原因，但不是权威、任务状态、知识或行为。
- [经营总账权威](../../_archive/authority/10-operating-ledger.md)：执行、诉求与证据分离；Project 只作观察面，维护不自动触发执行。
- [MVP 实现方向](../../_archive/authority/08-mvp-implementation-direction.md) 与[验证策略](../../_archive/authority/07-mvp-validation-strategy.md)：验证是否更难漂移、更早发现、更易恢复且成本更低；当前最多只有交付验收证据。
- [`A4/A6` 能力缺口研究固定段落](https://github.com/Eridanus117/agent-control/blob/36c9393147dc2701c32e4259121f9aee60422222/learning/ecosystem-study/capability-gaps.md#L44-L55) 与 [`A5` 上下文工程研究固定段落](https://github.com/Eridanus117/agent-control/blob/7b982e2e07f6979a4a7eab294c3bd291f3c60fd6/learning/ecosystem-study/context-engineering.md#L143-L219)：复用其 grader、轨迹／结果、上下文防火墙与 handoff 结论。
- 已安装 `self-improvement` 0.1.4 及其 `references/iteration-receipt.md`：作为 2026-08-12 的机器直接观察；版本变化后必须重读，不把本报告摘要当成当前 Skill。

### 价值门与可信门

- **价值门**：只有候选能减少真实漂移、返工、恢复时间或负责人注意力，并且收益高于记录与维护税，才值得进入实现讨论。
- **可信门**：论文和官方文档只证明外部机制与已报告局限；我方能力需以当前版本、可复现 outcome、真实任务和自然样本为准。
- **授权门**：本报告不授权改动任何运行机制、权威、Skill、总账或知识。后续实现需要独立、当前、明确的 Issue 合同与写入所有权。
- **复杂度门**：任何新增持久语义先证明不能由现有单一来源、字段、eval 或分层表达，并说明替换/删除对象与长期维护者。

### 仍未知

- 迭代回执在真实跨 Session 恢复中的时间成本、漏项率和冲突率。
- 当前 provider/模型在我方任务上生成 self-feedback 的错误率，以及不同 grader 与负责人判断的一致性。
- 一次纠偏转成回归样本后，未来是否真的拦住复发，还是只对原样本过拟合。
- 行为资产回退在并发 worktree、版本升级和已安装 Plugin 情况下的精确边界。
- 经营总账投影这类证据是否改善负责人可见性，还是增加重复阅读。
- 复杂度预算采用何种可维护指标；字节数、行数和启动暴露只能描述表面，不能单独衡量语义复杂度。

### 失效条件与最小复核

发生下列事件时只复核受影响部分，不做周期性全量重查：

1. `self-improvement`、APS、迭代回执、经营总账或 GitHub 生命周期 Skill 发布新版本；
2. [关联 #178（规则与 Skill 体系复杂度收敛）178-D1 当前决定](https://github.com/Eridanus117/agent-control/issues/178#issuecomment-5267970222) 被修订、替代，或其实施证据改变分层、单一事实源或复杂度门；
3. 完成第一份真实迭代回执、恢复演练、行为资产回退或自然样本复核；
4. LangGraph/AutoGen 的 checkpoint/state 语义出现破坏性版本变化，或被纳入具体实现选型；
5. 外部 eval 产品生命周期或 API 发生变化，且我方候选曾依赖该产品。

最小复核顺序：重读当前权威和远端合同 → 重读已安装 Skill/协议版本 → 只检查上述变化涉及的一手来源 → 更新对应缺口、候选门和证据等级。

## 一手来源索引

### 研究论文

- [Reflexion: Language Agents with Verbal Reinforcement Learning（arXiv 2303.11366v4，2023-10-10 修订）](https://arxiv.org/abs/2303.11366v4)
- [Self-Refine: Iterative Refinement with Self-Feedback（NeurIPS 2023 conference version）](https://proceedings.neurips.cc/paper_files/paper/2023/hash/91edff07232fb1b55a505a9e9f6c0ff3-Abstract-Conference.html)

### Anthropic 官方工程材料

- [Demystifying evals for AI agents（2026-01-09 发布；2026-08-12 观察）](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [Harness design for long-running application development（2026-03-24 发布；2026-08-12 观察）](https://www.anthropic.com/engineering/harness-design-long-running-apps)

### OpenAI 官方开发者文档

- [Evaluation best practices（canonical；2026-08-12 观察）](https://developers.openai.com/api/docs/guides/evaluation-best-practices)
- [Agent evals（canonical；2026-08-12 观察）](https://developers.openai.com/api/docs/guides/agent-evals)
- [Trace grading（canonical；2026-08-12 观察）](https://developers.openai.com/api/docs/guides/trace-grading)

### 框架官方文档

- [LangGraph persistence（docs commit `30d6ba4`）](https://github.com/langchain-ai/docs/blob/30d6ba4a0dd974c799d16297c9913af493d521da/src/oss/langgraph/persistence.mdx)
- [LangGraph interrupts / human-in-the-loop（docs commit `30d6ba4`）](https://github.com/langchain-ai/docs/blob/30d6ba4a0dd974c799d16297c9913af493d521da/src/oss/langgraph/interrupts.mdx)
- [AutoGen AgentChat state（release `python-v0.7.5`／commit `83afbf58`）](https://github.com/microsoft/autogen/blob/83afbf5857aac683340d4c692194e548b1e8edda/python/docs/src/user-guide/agentchat-user-guide/tutorial/state.ipynb)
- [AutoGen Team state API 源码（release `python-v0.7.5`／commit `83afbf58`）](https://github.com/microsoft/autogen/blob/83afbf5857aac683340d4c692194e548b1e8edda/python/packages/autogen-agentchat/src/autogen_agentchat/teams/_group_chat/_base_group_chat.py)

## 交付水位

本文件完成 A7 的生态机制梳理、我方组件对照、能力缺口、带门候选、矛盾边界、路线比较与复核条件。它没有实施任何候选，也不证明长程自我改进闭环已经在自然任务中成立。下一项有价值的证据不是更多概念，而是等待一次符合触发条件的真实纠偏，用现有回执完成 C1/C2 的有界验证。
