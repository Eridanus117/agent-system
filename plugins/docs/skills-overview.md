<!-- 生成产物：node plugins/scripts/skills-overview.ts --write。不要手改；tests/skills.test.ts 逐字节比对。 -->

# Skill 目录页

一个 skill 一个目录：`plugins/<plugin>/skills/<skill>/SKILL.md`，旁边可放 `evals/evals.json`；插件级 `evals/` 下的 `claude plugin eval` 用例也算有 evals。装配用 `sk`（源码 `packages/sk`；profile 的 manifest.json 是声明，junction 是投影）。

共 27 个 Skill，13 个 Plugin。

| Skill | Plugin | 版本 | L2 字节 | evals | description |
|---|---|---|---|---|---|
| `adaptive-problem-solving` | adaptive-problem-solving | 0.2.14 | 9389 | 无 | 用于问题含糊、关键路径选择、波次／里程碑反思、高成本或难回退动作、范围／成本变化、停滞、恢复／交接／验收／长期收口，或检查方向、方法、ROI、模型、上下文、工具、环境与 Agent 组合。恢复原问题和主瓶颈，比较普通路径与方法后组合、换路或… |
| `clarify` | clarify | 0.1.0 | 4241 | 有 | 主人冒出「想建 X／要不要搞一个／这个流程好烦」一类念头时，把「解」翻回「问题」，判断该不该做；只产出三行结论。不建则建一条 issue 写理由后以 wontfix 关闭，建则挂机会 issue。Turn an itch phrased a… |
| `flow` | flow | 0.1.1 | 10885 | 有 | 判为改动落地、或主人开场直接敲了段里的 skill 时读：改动落地的路线——九段的门与产物、每段点名的步、可选步、会话绑定、停靠记录。The route for a change delivery: nine segments with t… |
| `review-response` | flow-steps | 0.1.0 | 2239 | 有 | 收到 code-review 的审查报告时用：逐条对照代码核实、给建议与理由，整份报给主人，主人定了再一条一改一测；不说客套话。Handle a code-review report: verify each finding against… |
| `verify-evidence` | flow-steps | 0.1.0 | 2102 | 有 | 要说「做成了」「通过了」时用：每条声称配一条刚跑过的命令、退出码和关键输出行，贴进对话再进 PR 正文；没跑过的标「未验证」。Turn claims into evidence: each claim gets a freshly run … |
| `worktree-baseline` | flow-steps | 0.1.0 | 2742 | 有 | 改动落地第 4 段开工准备时用：用 Orca 开工作树并绑 issue，把目标仓自己的检查跑一遍当基线，给出第 4 段门口那条消息。Segment 4 of a change delivery: open an Orca worktree … |
| `wrap-up` | flow-steps | 0.1.0 | 2570 | 有 | 改动落地第 7 段收尾时用：从 issue、spec 与证据抄出 PR 正文四节，写停靠记录，登记挂起物，只问主人一句「推上去开 PR，还是放着」；不做本地 merge。Segment 7 of a change delivery: dra… |
| `knowledge-maintenance` | knowledge-maintenance | 0.1.3 | 6488 | 无 | 用于多来源调研、可重复实验、会影响权威／Agent 配置／重要决定的研究，或用户要求复用、复核、更新当前知识时：先找已认可知识和失效条件，只补变化、冲突与缺口，再经价值门和可信门更新。不用于低成本一次性事实、原始材料／研发过程留存、私域结构… |
| `note` | note | 0.1.0 | 2696 | 无 | 把成熟结论沉淀进本地 Markdown 知识库，或找回以前记过的结论。当用户说「沉淀到知识库」「记到 KB」「/note」「以前记过」「找回笔记」时使用。 |
| `orchestrated-collaboration` | orchestrated-collaboration | 0.2.7 | 21795 | 无 | 当用户明确要求多 Agent／多 Session／跨 Provider 协作、任务已授权委派，或活动 Session 发生共享写入碰撞时，建立目标来源、排他所有权、可追踪交付、独立验收与综合；按共享资源和 Issue 子树确定唯一协调者，只… |
| `code-review` | practices | 0.1.0 | 4614 | 有 | 审一条分支、PR 或在制的改动时用：以主人给的固定点取 diff，分标准与 spec 两轴各派一个子代理审，违例与判断题分开标，两份报告并排给出、各轴各自小结。Two-axis code review of the diff since a… |
| `domain-modeling` | practices | 0.1.0 | 3545 | 有 | 设计途中要敲定领域术语、建或改统一语言、记一条架构决定时用：对着词汇表挑战用词，用具体场景逼清边界，和代码对照，词一定下就写进 CONTEXT.md，只在难回头的取舍上提 ADR。Build and sharpen a project do… |
| `grilling` | practices | 0.1.0 | 3050 | 有 | 主人拿一个计划、决定或想法来要压力测试时用：把决定画成一棵树，按前提顺序一轮一题地问到没有一处被默默假设；事实自己查，决定归主人。Grill the user about a plan, decision or idea: walk the… |
| `tdd` | practices | 0.1.0 | 3887 | 有 | 测试先行地做功能或修 bug 时用：先和主人定好要测的接缝，再红到绿一次一个切片；测试只穿公共接口，期望值用独立字面值，只在系统边界 mock。Test-driven development: agree the seams first, … |
| `self-improvement` | self-improvement | 0.1.7 | 8987 | 无 | 当用户指出 Agent 漂移、误解、重复犯错，要求把任务经验固化为系统改进，或讨论只增概念却不减关键未知、形成决定或可检验资产时，只暂停依赖被推翻假设的路径，重锚原问题、持久记录纠正、诊断原因，并在授权内改进入口提示词或 Skill。最小实… |
| `skill-appraisal` | skill-appraisal | 0.2.0 | 10450 | 无 | 判定一个 Skill 组该不该进当前装配、归哪些事项、与谁重叠，或对已判定过的组按节拍复核。三种进入：首次判定新候选、补判早已在用但从未判定过的组、按失效条件复核。判定单位是组不是单个 Skill；产出必须留下失效条件与下次最少复核步骤。用… |
| `skill-authoring` | skill-authoring | 0.1.2 | 7296 | 有 | 写一条自建 skill 或改一条既有自建 skill 时用：从机会 issue 或反馈 issue 走到「PR 开了、上线待办建了」，先跑基线再动笔。Author or modify a self-built skill, from an … |
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
