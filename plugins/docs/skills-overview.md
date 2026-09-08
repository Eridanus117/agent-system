<!-- 生成产物：node plugins/scripts/skills-overview.ts --write。不要手改；tests/skills.test.ts 逐字节比对。 -->

# Skill 目录页

一个 skill 一个目录：`plugins/<plugin>/skills/<skill>/SKILL.md`，旁边可放 `evals/evals.json`。装配用 `sk`（源码 `packages/sk`；profile 的 manifest.json 是声明，junction 是投影）。

共 17 个 Skill，9 个 Plugin。

| Skill | Plugin | 版本 | L2 字节 | evals | description |
|---|---|---|---|---|---|
| `adaptive-problem-solving` | adaptive-problem-solving | 0.2.14 | 9389 | 无 | 用于问题含糊、关键路径选择、波次／里程碑反思、高成本或难回退动作、范围／成本变化、停滞、恢复／交接／验收／长期收口，或检查方向、方法、ROI、模型、上下文、工具、环境与 Agent 组合。恢复原问题和主瓶颈，比较普通路径与方法后组合、换路或… |
| `clarify` | clarify | 0.1.0 | 7312 | 有 | 主人冒出「想建 X／要不要搞一个／这个流程好烦」一类念头时，把「解」翻回「问题」，判断该不该做；只产出三行结论，不落文件。Turn an itch phrased as a solution back into a problem and … |
| `knowledge-maintenance` | knowledge-maintenance | 0.1.3 | 6488 | 无 | 用于多来源调研、可重复实验、会影响权威／Agent 配置／重要决定的研究，或用户要求复用、复核、更新当前知识时：先找已认可知识和失效条件，只补变化、冲突与缺口，再经价值门和可信门更新。不用于低成本一次性事实、原始材料／研发过程留存、私域结构… |
| `note` | note | 0.1.0 | 2633 | 无 | 把成熟结论沉淀进本地 Markdown 知识库，或找回以前记过的结论。当用户说「沉淀到知识库」「记到 KB」「/note」「以前记过」「找回笔记」时使用。 |
| `orchestrated-collaboration` | orchestrated-collaboration | 0.2.7 | 21795 | 无 | 当用户明确要求多 Agent／多 Session／跨 Provider 协作、任务已授权委派，或活动 Session 发生共享写入碰撞时，建立目标来源、排他所有权、可追踪交付、独立验收与综合；按共享资源和 Issue 子树确定唯一协调者，只… |
| `self-improvement` | self-improvement | 0.1.7 | 8987 | 无 | 当用户指出 Agent 漂移、误解、重复犯错，要求把任务经验固化为系统改进，或讨论只增概念却不减关键未知、形成决定或可检验资产时，只暂停依赖被推翻假设的路径，重锚原问题、持久记录纠正、诊断原因，并在授权内改进入口提示词或 Skill。最小实… |
| `skill-appraisal` | skill-appraisal | 0.2.0 | 10450 | 无 | 判定一个 Skill 组该不该进当前装配、归哪些事项、与谁重叠，或对已判定过的组按节拍复核。三种进入：首次判定新候选、补判早已在用但从未判定过的组、按失效条件复核。判定单位是组不是单个 Skill；产出必须留下失效条件与下次最少复核步骤。用… |
| `skill-maintenance` | skill-maintenance | 0.1.1 | 4363 | 有 | 创建、审计、修正、拆分、升级、迁移或退役 Skill，或其合同／入口已漂移时，先恢复行为、授权与预算，再同步正文、调用者、版本、生成物和验证。普通业务维护、纯格式修正、承载位置未定的纠正不触发。Use for explicit Skill … |
| `architecture-design` | workcoding | 0.1.0 | 6743 | 有 | 在既有系统上设计一项新能力、要定领域模型和承载方式时用：摆现状与未知，比较至少两个候选，做支持／反对攻防，形成待主人确认的架构决定。Design a new capability on an existing system: compare… |
| `evidence-regression` | workcoding | 0.1.0 | 7278 | 有 | 要证明老流程没变、新流程是对的时用：改代码前把真实出入参录成仓内母版，改后回放逐字节比对（Golden Master／Approval Testing）。触发语「怎么证明没改坏」「回归」「出入参采集」。Golden-master regre… |
| `integration` | workcoding | 0.1.0 | 7207 | 有 | 改动做完要接进复杂既有系统时用：列出每个边界、写变没变、定可单独回退的接入顺序、预发沿真实调用链联调。触发语「怎么接进去」「联调」「集成」。Wire a finished change into an existing system bou… |
| `legacy-change` | workcoding | 0.1.0 | 9068 | 有 | 复杂遗留代码且已选定新旧路径并存（Feathers）时用：真实输入走读、特征化测试、确认改法、入口一处分流、验证旧行为。Characterize legacy behavior and sprout a new path beside th… |
| `release-observe` | workcoding | 0.1.0 | 7244 | 有 | 改动要放出去时用：分流开关当灰度开关，定放量三档、回滚点、每条需求句一个观测点加老路径四个黄金信号、线上比对。触发语「怎么灰度」「怎么发布」「发布后看什么」。Ship behind a toggle in three tiers, with… |
| `requirement-insight` | workcoding | 0.1.0 | 7399 | 有 | 外来需求的实际问题、现有做法或验收判据还没收口时用：保留原话、提出问题假设、核实历史行为、查现成、收口成一句可观察的验收判据。Clarify an unresolved incoming requirement down to an obs… |
| `requirement-translation` | workcoding | 0.1.0 | 7250 | 有 | 把已收口的外来需求翻成可验证表述：大的先按用例拆，每句 EARS 配一条真实例子，主人逐句否，例子变测试。触发语「把需求写清楚」「拆一下这个需求」「这个需求怎么验收」。Translate a closed requirement into … |
| `system-analysis` | workcoding | 0.1.0 | 6504 | 有 | 某个明确改动决定缺影响、耗时或流量证据时，做一次有边界的分析：问题与假设、两跳影响草图、只核实不确定的边、带置信度的结论。One-shot, bounded impact analysis for a concrete change dec… |
| `workcoding` | workcoding | 0.1.0 | 7895 | 有 | 复杂既有系统的未决需求、架构取舍、遗留改造、集成、回归证据或发布，按缺口选必要规程；用户说「先摆路线／按 workcoding」时也用。Pick the necessary procedures for unresolved enginee… |
