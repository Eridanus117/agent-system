<!-- 生成产物：node plugins/scripts/skills-overview.ts --write。不要手改；tests/skills.test.ts 逐字节比对。 -->

# Skill 目录页

一个 skill 一个目录：`plugins/<plugin>/skills/<skill>/SKILL.md`，旁边可放 `evals/evals.json`；插件级 `evals/` 下的 `claude plugin eval` 用例也算有 evals。装配用 `sk`（源码 `packages/sk`；profile 的 manifest.json 是声明，junction 是投影）。

共 49 个 Skill，13 个 Plugin。

| Skill | Plugin | 版本 | L2 字节 | evals | description |
|---|---|---|---|---|---|
| `adaptive-problem-solving` | adaptive-problem-solving | 0.2.14 | 9389 | 无 | 用于问题含糊、关键路径选择、波次／里程碑反思、高成本或难回退动作、范围／成本变化、停滞、恢复／交接／验收／长期收口，或检查方向、方法、ROI、模型、上下文、工具、环境与 Agent 组合。恢复原问题和主瓶颈，比较普通路径与方法后组合、换路或… |
| `clarify` | clarify | 0.1.0 | 4241 | 有 | 主人冒出「想建 X／要不要搞一个／这个流程好烦」一类念头时，把「解」翻回「问题」，判断该不该做；只产出三行结论。不建则建一条 issue 写理由后以 wontfix 关闭，建则挂机会 issue。Turn an itch phrased a… |
| `flow` | flow | 0.1.5 | 10417 | 有 | 判为常规变更、或主人开场直接敲了阶段里的 skill 时读：常规变更的路线——九个阶段的门与产物、每个阶段点名的活动、改旧代码时才开的活动、会话绑定、站会记录。The route for a normal change: nine stag… |
| `architecture-decision` | flow-steps | 0.1.4 | 3045 | 有 | 常规变更改旧代码、要在既有系统上定一项新能力「系统成为什么样」时的活动：写清这轮决定什么，摆基线与未知，点名 tradeoff-analysis 出候选做两面，把暂定推荐交主人确认；确认前不实现。Architecture decision … |
| `impact-analysis` | flow-steps | 0.1.4 | 3314 | 有 | 常规变更改旧代码、某个决定缺一个数或判断时的活动：把数挂到决定上，假设单列，effect-sketch 画两跳，只为拿不准的边取证，baseline-measurement 量数，出一行带置信度的结论进那个决定；限时两小时。Impact a… |
| `legacy-code-change` | flow-steps | 0.1.4 | 2350 | 有 | 常规变更第 5 阶段、要改的旧代码没有测试或注释与实现对不上时用：先按特征化测试把现状摆给主人否，否过之后按萌芽方法在旁边加新逻辑，旧实现不动。Stage 5 activity for legacy code: characterize f… |
| `regression-evidence` | flow-steps | 0.1.4 | 2377 | 有 | 改旧代码时才开的活动「证」：改完要证明老流程没变、新流程是对的。改代码之前按 record-replay 录母版，改完按 golden-master 回放比对，三样进同一个 PR。The legacy-code activity for p… |
| `requirement-elicitation` | flow-steps | 0.1.4 | 2914 | 有 | 改旧代码时需求不清才开的活动，第 4 阶段门上定：外来需求还是一句「解」、提出方只能由主人去问时用，把解翻回问题、备好问提出方的问题、查现成，收口成三行加一句可观察的验收判据。Requirement elicitation as a sta… |
| `requirement-specification` | flow-steps | 0.1.4 | 3235 | 有 | 改旧代码时需求不清才开的活动，第 4 阶段门上定：三行加一句被主人否过之后，把需求翻成可验证的句子——大的先按用例拆，每条规则一句 EARS，每句配一条例子，主人逐句否，例子变测试。Requirement specification as … |
| `review-response` | flow-steps | 0.1.4 | 2506 | 有 | 收到 code-review 的审查报告时用：逐条对照代码核实、给建议与理由并标违例或判断题，整份报给主人，主人定了再一条一改一测；只说事实与证据。Handle a code-review report: verify each findi… |
| `rollout-observe` | flow-steps | 0.1.4 | 2423 | 有 | 常规变更第 8 阶段发布时用：按 feature-toggle 定回滚点，按 canary-release 定三档放量与观测点，每档的开关由主人拨；多数改动跳过这一阶段，留一句为什么。Stage 8 of a normal change: … |
| `system-integration` | flow-steps | 0.1.4 | 2132 | 有 | 常规变更第 5 阶段末、改动建完要接进既有系统时用：先按接口契约清单列边界写变没变，再按增量集成排每步可退的顺序并联调；主人否过之前不合分支、不动表。Stage 5 activity for wiring a finished change… |
| `verify-evidence` | flow-steps | 0.1.4 | 2157 | 有 | 要说「做成了」「通过了」时用：每条声称配一条刚跑过的命令、退出码和关键输出行，贴进对话再进 PR 正文；没跑过的标「未验证」。Turn claims into evidence: each claim gets a freshly run … |
| `worktree-baseline` | flow-steps | 0.1.4 | 3221 | 有 | 常规变更第 4 阶段开工准备时用：用 Orca 开工作树并绑 issue，把目标仓自己的检查跑一遍当基线，给出第 4 阶段门上那条消息。Stage 4 of a normal change: open an Orca worktree bo… |
| `wrap-up` | flow-steps | 0.1.4 | 2810 | 有 | 常规变更第 7 阶段收尾时用：从 issue、spec 与证据抄出 PR 正文四节，写站会记录，登记挂起物，只问主人一句「推上去开 PR，还是放着」；合并由主人做。Stage 7 of a normal change: draft the … |
| `knowledge-maintenance` | knowledge-maintenance | 0.1.3 | 6488 | 无 | 用于多来源调研、可重复实验、会影响权威／Agent 配置／重要决定的研究，或用户要求复用、复核、更新当前知识时：先找已认可知识和失效条件，只补变化、冲突与缺口，再经价值门和可信门更新。不用于低成本一次性事实、原始材料／研发过程留存、私域结构… |
| `note` | note | 0.1.0 | 2696 | 无 | 把成熟结论沉淀进本地 Markdown 知识库，或找回以前记过的结论。当用户说「沉淀到知识库」「记到 KB」「/note」「以前记过」「找回笔记」时使用。 |
| `orchestrated-collaboration` | orchestrated-collaboration | 0.2.7 | 21795 | 无 | 当用户明确要求多 Agent／多 Session／跨 Provider 协作、任务已授权委派，或活动 Session 发生共享写入碰撞时，建立目标来源、排他所有权、可追踪交付、独立验收与综合；按共享资源和 Issue 子树确定唯一协调者，只… |
| `baseline-measurement` | practices | 0.1.3 | 2984 | 有 | 一个决定缺一个运行时的数（慢多少、占多大比例、多久跑完）时用：先在同样条件下量老路径当基线，再量新路径，只量决定要的那一个数，判定规则挂在数上，没量到就留空给主人跑。Baseline measurement for one decision… |
| `canary-release` | practices | 0.1.3 | 3671 | 有 | 改动要放出去时用：三档放量（内部账号或测试模板 → 分流类别的一小部分 → 全量），每档写清放谁、停多久，进下一档由主人定；每条需求句配一个观测点，老路径看四个黄金信号（延迟、流量、错误、饱和）；档 1 放开后拿需求例子打一条冒烟。Cana… |
| `characterization-test` | practices | 0.1.3 | 3155 | 有 | 给一段没有测试的旧代码锁住现状时用：拿一条真实入参沿代码走一遍，每一步写成带中文注释的断言，期望值是实际输出不是想要的输出；注释与实现的出入单独标出，拿不出证据的行写「假设」，清单摆给主人否。Characterization test: p… |
| `code-review` | practices | 0.1.3 | 5058 | 有 | 审一条分支、PR 或在制的改动时用：以主人给的固定点取 diff，分标准与 spec 两轴各派一个子代理审，违例与判断题分开标，两份报告并排给出、各轴各自小结。Two-axis code review of the diff since a… |
| `domain-modeling` | practices | 0.1.3 | 3825 | 有 | 设计途中要敲定领域术语、建或改统一语言、记一条架构决定时用：对着词汇表挑战用词，用具体场景逼清边界，和代码对照，词一定下就写进 CONTEXT.md，只在难回头的取舍上提 ADR。Build and sharpen a project do… |
| `ears` | practices | 0.1.3 | 2833 | 有 | 把一条已收口的需求写成可验证的句子时用：EARS 五种句式，一句只装一条规则，名词只用原话与词汇表里的，出手前过 ISO 29148 的四条属性。Write requirements in EARS (Easy Approach to Re… |
| `effect-sketch` | practices | 0.1.3 | 2960 | 有 | 改动前要知道会波及谁时用：从改动点出发静态画两跳——谁调它、它调谁，连同绕过它直调更里面的——拿不准的边标出来，事实与假设分开；不画全图。Feathers' effect sketch: two static hops out from t… |
| `feature-toggle` | practices | 0.1.3 | 2764 | 有 | 改动要能秒级放开、秒级收回时用：分流开关就是发布开关，初始关；回滚就是关开关，不回滚代码，前提是老路径 diff 为零；开关由主人拨，agent 不拨。Feature toggle (Hodgson, Fowler): the routin… |
| `golden-master` | practices | 0.1.3 | 4139 | 有 | 要证明改完之后老路径一点没变、新路径是对的时用：以改动前的行为为母版（approved 文件），改后回放同一批请求逐字节比对；老类别比母版，新类别比需求例子的期望值，两类分开写；母版、回放测试、比对结果进同一个 PR。Golden mast… |
| `grilling` | practices | 0.1.3 | 3167 | 有 | 主人拿一个计划、决定或想法来要压力测试时用：把决定画成一棵树，按前提顺序一轮一题地问到没有一处被默默假设；事实自己查，决定归主人。Grill the user about a plan, decision or idea: walk the… |
| `incremental-integration` | practices | 0.1.3 | 3051 | 有 | 边界清单已定、要把改动接进去时用：排一个依赖在前、每步能单独退的接入顺序，数据先扩后缩，沿真实调用链跑一条新例子加一条老路径例子，共库只读；主人否过之前不合分支、不动表。Incremental integration: order the … |
| `interface-contract-checklist` | practices | 0.1.3 | 3229 | 有 | 改动要接进既有系统、先要摸清碰到哪些边界时用：列出上游调用方、下游依赖、开关、数据与别人同时在改的代码五种边界，每个写「不变」或「变了什么、谁要知道」，绕过入口的调用方单独标出，清单摆给主人否。Interface contract chec… |
| `record-replay` | practices | 0.1.3 | 3623 | 有 | 要把真实出入参录下来当测试输入时用：先挑一批覆盖新路径每条需求句与老路径每个主要分支的样本请主人否，再在改代码之前用手边的工具（Arthas、日志）录成一请求一文件的仓内 JSON，规整掉时间戳、随机 id 这类每次都变的字段，改后原样回放… |
| `specification-by-example` | practices | 0.1.3 | 3233 | 有 | 给需求句配例子、让例子变测试时用：每句一条真实入参加期望输出，边界两侧各一条，推不出的数交回主人，举不出例子的句子退回去；主人否过之后例子原样变成测试。Specification by Example: one concrete input… |
| `sprout-method` | practices | 0.1.3 | 3578 | 有 | 走读与改法已确认、要在旧代码旁加新逻辑时用：新逻辑放新方法或新类，旧实现一句不动，唯一改动是入口一处分流；同一条入参验证开关关闭走原路径、开启且命中走新路径、开启未命中不变。Sprout method: put the new logic … |
| `switch-interview` | practices | 0.1.3 | 3325 | 有 | 要弄清一条外来需求背后真正的问题、而提出方只能由主人去问时用：按 JTBD 的切换访谈备问题——只问过去发生过的事（上次怎么办的、现在怎么忍的、不做会怎样），答案回来后用四种力读出真正的问题。Prepare and read a Jobs-… |
| `tdd` | practices | 0.1.3 | 4324 | 有 | 测试先行地做功能或修 bug 时用：先和主人定好要测的接缝，再红到绿一次一个切片；测试只穿公共接口，期望值用独立字面值，只在系统边界 mock。Test-driven development: agree the seams first, … |
| `tradeoff-analysis` | practices | 0.1.3 | 3400 | 有 | 一件事有两条以上做法要选时用：出至少两个能落地的候选，每个各写支持、反对、最大风险、可逆性，说出什么证据会推翻推荐，暂定推荐交主人定。Trade-off analysis of design candidates: at least two… |
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
