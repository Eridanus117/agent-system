# Agent System plugins

`agent-plugins` 是公开的 Codex／Claude Plugin 源码仓，保存可版本化、可审阅、可回滚的 Plugin、Skill、双端发现清单和来源符合性检查。仓库内容只证明源码状态；不证明任何机器已经安装或正在使用它。

## 开始工作

- 本仓变更只由负责人当前指令，或本仓公开、自足且经明确激活的 Issue／PR 合同授权；当前入口清理见 [Issue #11](https://github.com/Eridanus117/agent-plugins/issues/11)。
- 先读本 README、对应 Plugin manifest 与合同明确引用的文档。私有旧仓链接、迁移前编号和发布记录只作可选历史来源，不能成为理解、复现或授权的前提。
- 开发、来源验证和本机安装是三个独立状态：修改源码不会自动安装，测试通过也不证明运行端生效。安装与卸载始终由使用者在目标运行端明确执行。

## 发布记录（历史）

本批按[关联 agent-control#258（决定块权威模板落地）修正事件](https://github.com/Eridanus117/agent-control/issues/258#issuecomment-5293496974)补齐关联 agent-plugins#77（决定块三句权威模板）遗漏的发布身份：`github-collaboration` 提升到 `0.3.16`，两端 manifest、两份 Marketplace、符合性版本声明与 README 版本总览同步更新；运行端重装与三端指纹验收必须在本版进入 `main` 后另行完成，不能由源仓合并推定。

本批发布同步覆盖[关联 #75（资源观测方案 A 自然决策闭环）](https://github.com/Eridanus117/agent-plugins/pull/75)与[关联 #76（GitHub 原生硬依赖边规范）](https://github.com/Eridanus117/agent-plugins/pull/76)：`resource-observability` 与 `github-collaboration` 各提升一个 patch 版本，两端 manifest、两份 Marketplace、符合性版本声明与 README 版本总览保持一致。

本批发布同步覆盖[关联 #73（关闭前收割回执减重）](https://github.com/Eridanus117/agent-plugins/pull/73)与[关联 #74（摩擦能力面调研反事实）](https://github.com/Eridanus117/agent-plugins/pull/74)：`github-collaboration` 提升一个 patch 版本，两端 manifest、两份 Marketplace、符合性版本声明与 README 版本总览保持一致。

本批发布同步覆盖[关联 agent-plugins#68（APS 卡片暴露合同修复）](https://github.com/Eridanus117/agent-plugins/pull/68)、[关联 agent-plugins#70（12 个 Skill 常驻描述瘦身）](https://github.com/Eridanus117/agent-plugins/pull/70)与[关联 agent-plugins#71（issue-workflow 核心与按需引用拆层）](https://github.com/Eridanus117/agent-plugins/pull/71)：七个内容有变的 Plugin 均提升一个 patch 版本，两端 manifest、两份 Marketplace、符合性版本声明与 README 版本总览保持一致；本批不执行本机安装。

`adaptive-problem-solving` `0.2.10` 与 `orchestrated-collaboration` `0.2.4` 按[关联 agent-control#147（P1-1 行动前事实与决定价值双门）](https://github.com/Eridanus117/agent-control/issues/147)实施三道最小强制门：G1 对会改变行动的能力／权限／网络／版本／资源主张执行“实测或未知”，有低成本安全探针则实测，否则明示未知；G2 以负责人无回复时的下一动作、授权、风险、成本和不可逆／时限机会五项差异决定是否进入现有负责人协议；G3 只在真实阻塞、替代授权与正 ROI 同时成立时评估 CF-6。唯一规范正文收敛在 APS 第八节，与 `0.2.8` 的关键节点反思节律共段；协作主 Skill 与 CF-6 卡只路由，P0-2 可重入收口段保持原义，不形成第三承载面或第二状态机。

守恒对象是“凭印象接受负向能力主张”“问题重要即可请求负责人”“已有三席即可升级”三项隐含默认，以及 APS 各节和协作进入段的重复说明；压缩后 APS 主正文按 LF 规范化为 22825 UTF-8 字节（不高于 `0.2.8` 的 22848），协作主正文为 21777 字节（不高于 P0-2 落地后的 21823），CF-6 为 5994 字节，两个 description 均继续满足三端共同的 1000 UTF-8 字节门。现有 TypeScript 符合性测试新增行动前预注册夹具和[关联 agent-control#136（今夜自治运行的反向反思）](https://github.com/Eridanus117/agent-control/issues/136)真实触发来源；实现不新增脚本、自动化、状态字段或授权。

`orchestrated-collaboration` `0.2.2` 按[关联 #140（P0-3 类型化派发与写后核验门）](https://github.com/Eridanus117/agent-control/issues/140)把派发骨架类型化：Task 创建前核对 `contractRepo`、`executionRepo`、`worktree`、`ownedPaths`、`delivery`，其中 `contractRepo` 冻结建项前的期望 Issue 标题／语义标识；Issue 编号、原生父级、唯一交付形态或字段断言缺失即停；Dispatch 建立与 Worker 启动后分别以同一稳定身份核对实际仓库和 worktree。远端写入统一以回读后态为准，创建 Issue 后回读实际标题并与冻结值断言，已生效不重写、证明确实缺失才沿原身份幂等补齐、未知则只读查证并停止新增写入；本版只保存跨后端协议与失败分支，不复制 Orca 动态命令，也不产生自动派发、安装或合并权限。

`orchestrated-collaboration` `0.2.1` 按[关联 #128（资源投入规则两层承载落地）](https://github.com/Eridanus117/agent-control/issues/128)落实 120-D1=C：引用 `authority/05-resource-operations.md` 作为资源投入唯一原则源，以 R1–R6 就地置换“完成即扫描解锁／无依赖工作不伪串行／灵活使用产能”三条散规则，依次执行价值门、就绪队列与排他所有权、资源新鲜度、额度加速条件、验收容量与实验干扰、加派／维持／停止新增派发；不复制证据历史或动态阈值，不新增轮询、自动派发、自动停止或权益消费权限。

本批按 clean-slate 迁仓修正发布身份：仓库所有权由 `Eridanus117` 迁至 `Eridanus117`，七个 Plugin 的 `author.name` 与 `repository` 字段、两份 Marketplace（Claude 与 Codex）、符合性版本声明与 README 版本总览同步更新，七个 Plugin 各递增一个修订号。**运行端重装与三端指纹验收必须在本版进入 `main` 后另行完成，不能由源仓合并推定。**

以下发布记录保留迁移前编号以便仓库维护者溯源；其中私有链接对公共协作者不可用，只是可选历史来源。当前行为、贡献要求和验收必须在本仓公开内容中自足表达。
仓库目前包含九个可安装 Plugin：`grilling` `0.1.2`、`self-improvement` `0.1.7`、`skill-maintenance` `0.1.1`、`knowledge-maintenance` `0.1.3`、`orchestrated-collaboration` `0.2.7`、`adaptive-problem-solving` `0.2.13`、`resource-observability` `0.2.4`、`github-collaboration` `0.3.18`、`skill-appraisal` `0.2.0`。

`skill-maintenance` `0.1.1` 在明确创建、审计、修正、拆分、升级、迁移或退役 Skill 时进入：先绑定当前行为合同与授权，预注册行为判据，再同步主合同、按需 reference、全部调用者、双端发现入口、版本、生成物和复杂度预算；安全门零回退，调用者 clean cutover，方案／实施同源时必须独立审查。它不维护普通业务代码，也不替 `self-improvement` 决定一次纠正应该落到哪里。

仓库资产、Marketplace 可安装目录和当前默认装配是三个不同状态：`plugins/` 保存可发布资产，两份 Marketplace 只声明可安装来源，当前 profile 只按 `plugins/skill-imports.toml` 显式装配（此前由已退役的 `.cap/skill-imports.toml` 承载，见 Epic 4 Story 4.7）。`github-collaboration` 与 `self-improvement` 同级，都是仓内可安装资产；二者不会因为出现在 Marketplace 或插件目录中就自动进入当前 profile。

`github-collaboration` 提供六个 GitHub 协作 Skill：`issue-workflow` 推进一棵 Issue 子树并消费负责人动作；`issue-delivery` 把已就绪 Issue 交付成 Draft PR 或自足证据评论；`issue-contract-compaction` 压缩漂移的 Issue 正文；`objective-to-issues` 建立原生父子 Issue 图；`operating-ledger-maintenance` 维护经营总账观察面；`pr-integration` 按当前 head 整合 PR。

`orchestrated-collaboration` `0.2.7` 删除两个对未装配 Issue 驱动资产的直接调用：任务子树由当前合同和写入所有权确定驱动者，`worker_done` 只触发远端来源核验并把事实交回当前合同持有者；它不接管 Issue 生命周期。

`self-improvement` `0.1.4` 按[关联 agent-control#139（P0-1 迭代回执地基）](https://github.com/Eridanus117/agent-control/issues/139)承载一份按需读取的十字段迭代回执协议；`adaptive-problem-solving` `0.2.9` 在阶段合同与攻防裁决需要跨 Session 恢复时引用该协议，`knowledge-maintenance` `0.1.1` 只回填知识出口证据。回执寄生于当前 Issue 的同一条自足评论与自然里程碑，不建数据库、独立登记表或定时器；APS 继续是唯一任务内控制器，Issue 生命周期与知识准入仍各归现有机制，`orchestrated-collaboration` 不成为第二承载面。

`adaptive-problem-solving` `0.2.5` 复核两组真实决策与运营证据：`devils-advocacy` 由三方审阅机制方案中的最强可信反方、普通路径、翻转条件和负责人决定回执，在 Agent 系统高影响产品决定边界升为 M1；`goal-question-metric` 由系统运营指标基线的目标—问题—指标链及负责人选择，在人工低成本基线与复核边界升为 M1。登记面分布同步为 M0 22 张、M1 8 张；只有相似形状而没有完整执行链或卡片级复核的其他候选保持 M0，不外推为产品采用或长期依赖。

`adaptive-problem-solving` `0.2.3` 消费已完成的 70-D 裁决：以双语等义置换将 description 从 1508 压到 997 UTF-8 字节，不依赖运行端截断；符合性清单删除过期预算例外，并显式断言决定消费后该例外必须消失。方法登记面的首批基线提交水位同步修正为实际引入该资产的 `a11176f`。

`grilling` 用结构化问题压力测试计划、决定或想法。Agent 可以发现它，但只有用户直接要求，或明确接受一次建议后，才能开始问询；用户可以继续普通任务、拒绝、降级或退出。它与期待的完整“升级思考”仍有差距，不代表最终方法，也不代表未来只能使用这一种方法。

`self-improvement` 在用户指出 Agent 漂移、误解或重复犯错，或者讨论陷入只增加抽象却没有减少不确定性的循环时，帮助 Agent 停止旧路径、保存纠正、诊断断点，用最小可逆资产检验高层判断，并把值得复用的行为改进放到系统提示词或 Skill。它是完整元方法能力的第一个窄切片，不代表知识、多 Agent 或整个元方法领域都被做成了 Skill。

`self-improvement` `0.1.7` 把承载位置已确定为 Skill 的纠正交给 `skill-maintenance`，自己只负责停止漂移、诊断根因、判断长期价值和选择持久载体，不再复制来源盘点、预算、版本、clean cutover 或审查协议。

`skill-maintenance` `0.1.1` 在明确创建、审计、修正、拆分、升级、迁移或退役 Skill 时进入：先绑定当前行为合同与授权，预注册行为判据，再同步主合同、按需 reference、全部调用者、双端发现入口、版本、生成物和复杂度预算；影响行为或 description 时增加配对评估，安全门零回退，调用者 clean cutover，方案／实施同源时必须独立审查。它不维护普通业务代码，也不替 `self-improvement` 决定一次纠正应该落到哪里。

`skill-appraisal` `0.2.0` 判定一个 Skill **组**该不该收进当前体系：五道门依次是组边界（成员互相调用就不许拆）、事项归属（可跨多个）、净增量（不允许两个组覆盖同一个决定）、路由（组内每个成员的 `description` 单独可判）、来源与移植（`own`／`fork`／`vendor`，`fork` 的零改动必须可机械验证）。已收组到节拍时走复核路径而不是重判：只重跑被失效条件命中的那道门。每次判定必须留下失效条件与下次最少复核步骤，否则等于制造一个下次从零重做的负担。它只产出判定，不安装、不写配置、不改 profile；判定为「改造后收」时把执行交给 `skill-maintenance`。

`knowledge-maintenance` 在多来源调研、可重复实验或重要决定前，先复用仍成立的当前知识，只补查变化、冲突和缺口；新结论逐条通过价值门与可信门后才能进入当前知识。它不保存原始会话，不替代研发记忆，也不决定知识平台、私域结构或知识图谱。

`orchestrated-collaboration` 在已获授权的多 Agent、多 Session 或共享写入碰撞中，区分用户目标、必要约束与 Agent 假设，建立唯一协调者、写入所有权、可追踪交付、独立验收和结果综合。`0.1.2` 增加共享写入前置检查：只有仍在线的协调者和明确资源范围共同成立时才视为占用，重叠 Session 在写入前必须加入协调、隔离或退回只读。`0.1.3` 补上同源盲区：协调者参与了高价值、多 PR 的 Agent 系统能力或工作流替代的拆分或方案设计时，综合前必须由另一个未参与拆分和实现的 Agent 做父目标级只读复核，子 PR 的 Peer Review 不能替代它；详细检查项来自 `adaptive-problem-solving`，普通单 PR、低风险、容易回退的任务不强制增加这一层。`0.1.5` 优先高层受监督生命周期，并为派发完成后的资源收口给出可达且安全的判据：先读取标准释放回执，再按对象是否被回执覆盖并确认释放、回执是否要求必须执行的恢复动作、四项证明是否齐全逐个处置，不声称这些情形互斥或穷尽；标准释放未覆盖的残留 worktree，以及释放不适用或未文档且没有恢复要求的对象，都在远端持久化、干净工作树、唯一精确身份与删除连带影响四项证明齐全后才可以精确显式收口，回执要求恢复动作或任一证明缺失时一律保留，不强制删除。`0.1.6` 按 [`agent-control#44 实施已批准决定`](https://github.com/Eridanus117/agent-control/issues/44) 的 D1 精确化 Orca 运行面语义：Orca TUI 是观察面，供人观察和输入，不承载协调状态、也不是编排协议；`orca orchestration` 才是执行事实与协调后端，Run、Task、Dispatch、持久消息和交付来源链的执行事实以它为准，不以界面上看到的画面为准。被替代的表述是「Orca TUI 只作为观察和输入界面」——它只说明 TUI 不是什么，没有指明执行事实由哪个面承载。该精确化不解禁任何自动化，也不把 Orca 升级为长期依赖。它使用当前任务已经选择的真实协调后端；选择 Orca 时动态读取 orchestration 及所需终端／worktree 指南。Skill 不替系统决定长期依赖、Fork／维护还是自建协调产品，也不新建审查平台或评分系统。`0.1.7` 在协调者职责处并入两条经负责人两次实证纠偏的协调循环规则：每处理完一次交付、合并或验收，立即重新扫描任务图并派发因此解除依赖的切片，不等催促或整批收口；已有对齐工作池且资源充裕时，不得以在途任务未收口为由推迟无依赖的新工作，推迟必须指出真实依赖边、写入冲突或协调净收益为负。两条规则不扩大授权，派发仍要满足既有核对与写入所有权分区。`0.1.8` 删除 Skill 内对共享单点六类的改写，改为只引用 `agent-control/authority/04-collaboration.md` 的唯一规范源；同时把 description 压到三端共同的 1000 UTF-8 字节预算内，保留授权协作、碰撞处理、父目标复核与 Orca 动态指南路由。`0.1.9` 按 [`agent-control#80 协作方法资产化`](https://github.com/Eridanus117/agent-control/issues/80) 把五张波次回执验证过的协调方法固化为派发合同骨架、`input_accepted` 后的终端落点与提交核对、GitHub 报错后的先核验再重试，以及“产能数字是手段”的弹性用量规则；这些规则只保存跨后端语义，不复制 Orca 命令，也不新增轮询或调度。`0.1.10` 按 [关联 agent-control#94（协作形态选择模型调研）](https://github.com/Eridanus117/agent-control/issues/94) 的 94-D1=C，把第一节原有进入信号与收益散述合并置换为四条人工选择规则：用五项输入选一层执行拓扑，按需叠加质量机制与阶段承载，CF-0 直接退回普通路径；八张形态卡放在 Skill 自有 `references/`，保留样本水位、失败门和降级出口。主 Skill 不净增，description 保持不变；该版不自动选型、不复制 Orca 命令，也不产生新的授权或长期平台承诺。`0.1.11` 按 [关联 agent-control#97（继任协议承载实施）](https://github.com/Eridanus117/agent-control/issues/97) 的 95-D1=E，复用共享写入前置检查在接管场景的既有触发，把“创建或绑定 Run”的泛化条目精确置换为 K12 知识路由与双协调停止门；动态命令继续来自运行时指南。description 保持 989 UTF-8 字节，主 Skill 按 LF 规范化保持 21841 UTF-8 字节；该版不执行接管、不建调度器，也不产生新的长期依赖。`0.1.12` 按 [关联 #105（K12 继任协议停门与可发现性修复）](https://github.com/Eridanus117/agent-control/issues/105) 的 C10，把依赖当前目录的裸跨仓路径置换为指向 K12 当前版本的绝对 GitHub 链接，并压缩同段第 2、6 条维持主 Skill 体积上限；符合性检查同时要求该路由是可跨工作区解析的 HTTPS URL。95-D1=E 承载决定、双协调停止门、description、动态命令来源与不接管边界均不变。`0.2.0` 按[关联 #110（三方审阅机制修复实施）](https://github.com/Eridanus117/agent-control/issues/110)把 CF-6 就地替换为席位联合类型、机械映射、先密封后公开和状态机／时间盒四机制，并降回 M0；新增 TypeScript 只读验证器与正负夹具，历史 #90 反向绑定样本必须判失败。oc 主 Skill 与 description 均零改动；不改 #44 授权记录、不消费决定，C3 保持 A。

`adaptive-problem-solving` 是问题求解治理的薄控制循环：先恢复原始问题和当前阶段，识别最值得发力的瓶颈，比较普通处理与方法介入的价值，再选择、组合、升级、降级或退出方法，同时检查模型、推理强度、工具、上下文和协作配置。`0.1.1` 增加阶段结束与最终验收的父目标、能力回退、证据等级和负责人可见 ROI 检查；`0.1.2` 进一步要求：如果声称某项 Agent 能力能在以后或跨 Session 重复运行，必须存在持久触发、可执行行为载体、真实运行入口和可发现性证据，不能只凭页面、文件或脚本建成就宣布能力完成。关键节点检查只是入口；它不把六类方法都复制成 Skill，也不取代知识、任务状态、研发记忆或 `self-improvement`。`0.1.3` 增加“最小实验／产品最小闭环”判据表与 ROI 默认优化目标（总周期、有用吞吐和负责人注意力，不是最小改动量）。`0.1.4` 把两条路线从控制文本补成可执行资产：路线 4（攻防／反证）获得实战两次复用后固化的多视角攻防形状——轻量前置为单 Session 已失败假定预演，重型形状按角色分区、每人一条自足评论、必答结构、事实推断分开、上限时间与交叉裁决的构件表执行，以轮为推进单位并带明确启动与停止判据；路线 6（最小实验）获得预注册实验卡与收口卡字段对，成功判据开始前写死、开始后只可作废重登，解释结果前先排除测量与触发系统故障。`0.1.5` 为受限调研补上研究—选项—计划的证据分区：影响决定的主张区分本次直接验证、一手来源核验、二手转述与未核验推断，选项比较带出架构适配、假设和验证含义，计划显式保留验证面、未运行项、失败门、开放问题与完成定义；它不建立固定文件链，也不把来源核验等级混同为产品证据等级。`0.2.0` 新增按需读取的方法登记面：P1–P5 类型索引把主瓶颈映射到少量候选卡，30 张首批卡完整登记进入／退出、成本、硬门、组合、回退和两套证据等级，其中 29 张为 M0、1 张为 M1；M0 不进入默认触发，`grilling` 的明示同意门不因索引命中而改变。控制器仍只保留归型与选择规则，具体执行资产、任务样本、私域原文和权威各留原载体。同版把未经总体 ROI 比较的“渐进默认”列为与“最小 diff 默认”同类的偏差：渐进是选项，不是天然正确路线。`0.2.1` 复核两个真实任务样本，把 `premortem` 与 `key-assumptions-check` 从 M0 升为 M1，登记面分布同步为 M0 27 张、M1 3 张；两张卡都保留“只可在相同边界下建议”的选择资格，并把样本暴露的授权保护、证据锚点、状态分级与下一复核面落入卡片。`0.2.2` 复核红队实战，把 `red-team-analysis` 在私域迁移链路只读安全审查边界升为 M1，登记面分布同步为 M0 26 张、M1 4 张；同版用 21 个真实决策时刻校准 P2／P5、P3／P4 与 P4／P7 的阶段边界，正式给 P6 增加可直接首跳的补充出口，并补上攻防发现后的 P1 回建模桥、ROI 代理指标验收和后续样本介入前水位。`0.2.3` 把 description 压到三端共同的 1000 UTF-8 字节预算内，并修正登记面基线水位。`0.2.4` 以两组真实任务证据把 `comparative-experiment` 与 `aps-roi-options` 有界升为 M1，同时把后者不必要升级负责人决定的失败样本写回方法卡；证据分布变为 M0 24 张、M1 6 张，其他候选不因任务形状相似而追认使用。`0.2.5` 以负责人直接复核的三方机制决定面与运营指标基线，把 `devils-advocacy`、`goal-question-metric` 分别在原窄边界升为 M1；证据分布变为 M0 22 张、M1 8 张，未见完整执行链的其他候选保持 M0。`0.2.7` 复核两批显式方法卡实战，把 `quality-of-information-check`、`outside-in-thinking`、`paired-observation` 与 `indicators-signposts` 各自在资源投入、知识产品外部约束、精确版本三端指纹及 Issue／Project 投影重评的窄边界升为 M1，登记面分布变为 M0 18 张、M1 12 张；`what-if-analysis` 仍缺第二项范围匹配任务，`high-impact-low-probability` 仍缺事前自然运行，两者保持 M0。该版以四张卡的旧 M0 证据占位与登记面旧分布水位支付新增依据，不改方法执行定义，也不外推为 M2、产品采用或长期依赖。`0.2.8` 按[关联 agent-control#65（周期性自我反思能力设计）](https://github.com/Eridanus117/agent-control/issues/65)的 65-D1=A，把三波有效样本常规化到 APS 既有关键节点控制段：真实工作波次为常规周期，无波次长任务在重要阶段结束取样，事件信号即时旁路，连续两波成本高于收益即退回按需；不建日历调度或自动化。选择 APS 是因为它已承载当前任务的关键节点方向控制；`self-improvement` 继续只承载跨任务行为改进与按需迭代回执。置换／压缩对象是第八节原四节点、五问和固定复盘说明；主 Skill 按 LF 规范化由 22850 降至 22848 UTF-8 字节，description 由 997 降至 991 UTF-8 字节。

`adaptive-problem-solving` `0.2.13` 将主 `SKILL.md` 收敛为进入／退出、问题恢复、类型路由、共用安全门指针与结果返回；受限调研、攻防、最小实验、G1–G3 和长程验收分别移入命中条件明确的 `references/`。主控制合同从 22,537 UTF-8 字节降为 8,812 字节，五份分支协议与主合同合计仍低于拆分前基线；未命中分支不加载，授权、同意、写入所有权、M0／M1 选择资格、攻防四席下限和产品证据等级不变。

`resource-observability` 在用户询问账户容量、重置时间、Codex 重置券或单 Session Token，或者高成本／多 Agent 工作需要资源决定时，按需组合两种现有来源：账户层读取 `orca account list --json`，会话层通过固定 `ccusage` `20.0.19` 生成 Token 回执。Skill 只保留负责人需要的窗口、时间、权益、来源和失败，不输出账户标识、凭据、原始正文、路径或 stderr。`0.2.1` 将会话薄门面和直接耦合的验证资产迁移到 TypeScript，由 Node 直接运行 `.ts` 源码，保持原协议、退出码、超时、输出上限、Windows npm shim 和脱敏边界。该门面只服务会话协议，不代表完整产品。它不建设监控、轮询、自动停止、计费推断或调度，也不自动消费重置券；Orca 只是当前可替换来源，不因此成为长期依赖。

仓库分别维护两端的原生发现清单：Codex 使用 `.agents/plugins/marketplace.json`，Claude 使用 `.claude-plugin/marketplace.json`。Plugin 正文可以共享，但不能因为两端都叫 Marketplace 就假设清单格式相同。

本仓当前需求与授权只来自负责人当前明确指令，或本仓公开、自足且经明确激活的 Issue／PR。旧 Issue、私有历史和既有研究默认只作待核验来源，不能自行恢复工作。

## 安装 `grilling`

先克隆本仓，然后把仓库根目录作为本地 Marketplace 添加。下面的 `<repo-root>` 是本仓的绝对路径。

Codex：

```powershell
codex plugin marketplace add "<repo-root>" --json
codex plugin add grilling@agent-plugins --json
```

显式入口为 `$grilling`。

Claude：

```powershell
claude plugin marketplace add "<repo-root>"
claude plugin install grilling@agent-plugins --scope user
```

显式入口为 `/grilling:grilling`。

移除时先卸载 Plugin，再移除 Marketplace：

```powershell
codex plugin remove grilling@agent-plugins --json
codex plugin marketplace remove agent-plugins --json

claude plugin uninstall grilling@agent-plugins --scope user
claude plugin marketplace remove agent-plugins
```

原生 Windows 的 Codex `elevated` sandbox 在首次初始化或 marker 不兼容时可能触发 UAC；请在确认程序来自本机 Codex 后完成提升。本仓曾在无人处理 UAC 时只对受阻测试命令临时使用 `windows.sandbox="unelevated"`，随后在可处理 UAC 时确认 `elevated` 最小探针恢复正常。持久配置没有被降低，也没有关闭沙箱；若以后必须临时回退，优先只覆盖单条命令，因为 `unelevated` 的隔离强度低于 `elevated`。

安装 `self-improvement` 时使用同一个 Marketplace：

```powershell
codex plugin add self-improvement@agent-plugins --json
claude plugin install self-improvement@agent-plugins --scope user
```

安装 `skill-maintenance` 时也使用同一个 Marketplace：

```powershell
codex plugin add skill-maintenance@agent-plugins --json
claude plugin install skill-maintenance@agent-plugins --scope user
```

安装 `knowledge-maintenance` 时也使用同一个 Marketplace：

```powershell
codex plugin add knowledge-maintenance@agent-plugins --json
claude plugin install knowledge-maintenance@agent-plugins --scope user
```

安装 `orchestrated-collaboration`：

```powershell
codex plugin add orchestrated-collaboration@agent-plugins --json
claude plugin install orchestrated-collaboration@agent-plugins --scope user
```

安装 `adaptive-problem-solving`：

```powershell
codex plugin add adaptive-problem-solving@agent-plugins --json
claude plugin install adaptive-problem-solving@agent-plugins --scope user
```


安装 `resource-observability`：

```powershell
codex plugin add resource-observability@agent-plugins --json
claude plugin install resource-observability@agent-plugins --scope user
```

显式入口是 Codex 的 `$resource-observability` 与 Claude 的 `/resource-observability:resource-observability`。账户层由 Skill 调用 `orca account list --json` 并只整理 Claude／Codex 窗口与 Codex 重置券；会话层继续使用内置 TypeScript CLI 的 `session --provider codex|claude --id <id> --json|--summary`，JSON 标准输出恰好一个回执且自带 `summary_zh`。Node 直接运行该 `.ts` 入口，CLI 默认调用 `ccusage` 并固定验证 `20.0.19`，测试或非标准安装可用显式 `--ccusage-command`。当前仓库交付不自动安装、升级或移除 Orca、Node 或 `ccusage`；账户来源不可用时明确失败，不读取凭据或改走内部 HTTP。


## 检查

```powershell
bun test tools/skill_eval/tests/skill-eval.test.ts plugins/tests/skill-evaluation.test.ts
bun tools/skill_eval/skill-eval.ts validate plugins/skill-maintenance/skills/skill-maintenance/evals/evals.json
node plugins/tests/workflow-routing.test.ts
node plugins/orchestrated-collaboration/tests/verify-three-party-review.test.ts
```

它检查版本化来源本身：当前 Skill 的必需字段、双语触发说明与 1000 UTF-8 字节预算、跨 Skill 路由与验收场景、生命周期与分层成本、两端 Plugin 清单、发现目录、装配边界和 README 当前版本是否一致。通过只说明来源资产自洽，不代表任一运行端已经安装成功，也不代表方法在真实任务中产生收益。

## 这个仓负责什么

- 保存可版本化、可追溯、可回滚的方法 Plugin 资产；
- 记录上游来源、许可证和本地修改；
- 如实分开 Codex 与 Claude 的运行端差异；
- 规定各层验证证据能说明什么、不能说明什么。

这个仓不取代：

- 使用本仓 Plugin 的项目合同、任务授权与产品政策；
- 判断内容能否成为可信知识的知识库门槛；
- 某台电脑上的安装缓存和用户配置。

## 从这里开始

- 当前目标、授权和边界：读取本仓公开、自足且经负责人明确激活的 Issue／PR；没有明确合同则只做当前请求的最小范围；
- 当前可安装内容：读取本 README、两份 Marketplace 和对应 Plugin manifest；可安装不等于当前 profile 已装配；
- 当前 profile 装配：读取 `plugins/skill-imports.toml`，只有显式列出的 Skill 会进入该 profile；
- **每个 Skill 替你做什么、什么时候用，以及 L1／L2／L3 与递归维护面实测：[`docs/skills-overview.md`](docs/skills-overview.md)**（生成产物，符合性测试钉住它不会漂）；
- 「装了才算数」的部署方式、Skill 的失效条件、最少复核、退役路径与复杂度管理：[`docs/lifecycle.md`](docs/lifecycle.md)。其中「必须声明失效条件与最少复核步骤」「Skill 数量门」「分层体积必须递归、可复现」由本仓 CI 强制；

### Skill 评估闭环

参考 Anthropic `skill-creator` 的 with/without Skill 对照方法，本仓将评估作为 `skill-maintenance` 的按需分支，而不是新增 Plugin。影响新能力、核心行为或 description 触发面的变更，可在 Skill 目录提供 `evals/evals.json`，并用以下命令做确定性合同校验：

```text
bun tools/skill_eval/skill-eval.ts validate plugins/skill-maintenance/skills/skill-maintenance/evals/evals.json
bun tools/skill_eval/skill-eval.ts summarize <result-dir> --evals <skill-dir>/evals/evals.json
```

工具只校验和汇总外部运行结果，不调用模型、不读取凭据、不证明 Skill 已安装或生效。结果包中的 `baseline`、`with_skill`、`old_skill`、`unknown` 和成本差异必须如实保留；真实客户端和新会话仍按 [生命周期文档](docs/lifecycle.md) 单独验收。
- [方法资产模型](docs/asset-model.md)、[符合性检查](docs/conformance.md)、旧 Issue 和 `codex-work`：只作为历史或待核验材料，不默认指导新工作。

不要从旧交付顺序、私有历史或开放状态自行恢复工作。跨仓项目调用本仓 Plugin 时，以调用方公开合同和本仓当前可用接口的交集为边界。
