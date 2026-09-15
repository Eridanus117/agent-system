# 诉求传递链与联邦式 Session 入口研发记录

> 状态：非权威研发记忆。
> 范围：保存 `work/current.md` 收敛前的完整来源、问题演变、负责人纠正、方案替代、实验与当前实施来由；保存不等于可信、权威或授权。
> 原始快照：[`raw/current-before-migration.md`](./raw/current-before-migration.md)。

## 1. 为什么需要这次迁移

Agent 系统已经保存了长期权威和经营总账，但不能稳定地把大量未满足诉求持续转成高价值、可执行、可并发的工作。此前所有 Agent 系统 Session 都被要求读取同一份 `work/current.md`；该文件逐步同时承载当前协调状态、资源实验、被替代判断、负责人纠正、旧任务标识和全部 Worker 的启动入口。

这造成了三个直接问题：

1. 新 Session 为恢复一个窄合同，需要读取与自己无关的长篇历史；
2. 单一中央 Session 和单一 `current` 容易成为并发与方向单点；
3. 旧结论、局部工具状态或空的“就绪”队列可能反过来替代原始诉求。

负责人批准把 `current` 收敛为短活动协调快照，同时要求被移出的内容完整进入可追溯研发记忆，不能通过“缩短入口”静默删除因果历史。迁移前文件的规范化内容已原样保存在原始记录层；本文件把它组织成默认可读的因果记录。

## 2. 原始主线：从重大诉求到可并发工作的传递失败

负责人已经提出知识、长程工作、思考模式、多 Agent 协作和资源运营等长期诉求。真实失败不是“没有值得做的工作”，而是系统不能稳定地区分和连接：

```text
长期诉求／能力缺口 → 计划／实验 → 可独立交付合同 → 就绪子集 → 交付与父级回收
```

协调者曾只看到一个低优先级事项显式标为“就绪”，便推出“当前没有高价值任务”。但目标／诉求和能力缺口按经营总账设计本来就不填写执行状态。空的就绪队列只证明规划、拆解或状态维护存在缺口，不能证明没有工作。

完整问题模型、基线诊断、攻防、受限调研和负责人纠正保存在 [agent-control#19](https://github.com/Eridanus117/agent-control/issues/19)。

## 3. 资源观测与并发实验怎样暴露了同一问题

### 3.1 原始资源诉求

资源运营的原始诉求同时包含：

- Codex 与 Claude 账户的额度、已用／剩余和重置时间；
- Codex 重置券数量与过期时间；
- 单 Session 的实际 Token 消耗；
- 把账户容量、恢复时间、权益、会话成本、任务价值和并发容量一起用于启动、并行、降级、延后或停止判断。

### 3.2 第一次实现缩窄

早期 D0 逐步围绕 `ccusage`、Node 薄 CLI 和 Windows `.cmd` 调用展开。`ccusage` 只能承担会话层消耗，却一度被错误地当成完整资源观测产品；协调者还在没有负责人确认的情况下把账户层从完成门中移除。

该缩窄随后产生大量语言、Windows 调用、打包、验收和协调工作，却没有先完成账户层原始诉求。负责人纠正后，Node／Rust／PowerShell 只恢复为实现选项，不能替代产品范围判断。

### 3.3 语言与复用路径

过程中形成过 PowerShell 原型、TypeScript／Go 隔离切片和 Rust 选择。它们各自提供了局部证据，但负责人指出协调者没有先回答现成工具是否可复用。后续确认：

- `ccusage` 可统一解析 Codex／Claude 会话消耗，但不提供供应商账户剩余额度、重置时间和重置券；
- Orca `account list --json` 能提供当前账户窗口和 Codex 重置券；
- `resource-observability 0.2.0` 因此选择账户层复用 Orca CLI、会话层复用固定 `ccusage`，自有 Skill 只统一语义、脱敏、失败和资源决定提示；
- 该选择是可逆 MVP，不表示 Orca 已被产品采用或成为长期依赖。

### 3.4 并发批次与 Orca 适配证据

资源实验曾把 `agent-plugins#21` 的 Windows `.cmd` 修复和 `agent-control#18` 的协作方案交给两个独立 Session 并行。Orca `worker-start` 多次返回 `selector_not_found`，协调者改用显式 worktree／终端与低层 Dispatch；这证明当前后端存在适配和协调成本，但没有改变 GitHub 合同或文件所有权。

同一时期还出现任务正文未进入新 Claude、Worker 手工恢复大量上下文、机械验收规模膨胀和完成 capability 失效。这些首先是任务合同、确定性验证和运行适配问题，不应错误归因成“需要重写全部需求方法”。

## 4. 负责人纠正及被替代判断

### 4.1 负责人可读性漂移

负责人指出 GitHub 标题、提交、复核和方案逐步被英文流程术语主导。被替代判断是“技术工作流默认英文，只要结论正确即可”。当前表达目标是：负责人可见的标题、摘要、决定、方案、验收与 ROI 默认使用自然中文；命令、文件名、API、版本号和不可替代标识可以保留原文，但不能用缩写代替负责人需要理解的概念。

### 4.2 产品诉求被工具反向收窄

被替代判断是“固定 `ccusage` 后可以把账户动态额度暂缓”。负责人恢复了账户层、会话层和决策层的完整产品边界。后续局部实现和实验只能按局部证据评价，不能伪装成完整父目标完成。

### 4.3 重复授权增加负责人负担

负责人确认：已批准 Plugin 交付在合并后安装到既定运行端并做可逆冒烟验证，是正常整合步骤，不应机械重复授权。只有新凭据、不可逆迁移、付费／权益消费、扩大运行范围或长期采用决定才升级。

同时保留两道窄语义检查：实现前核对原始问题和能力回退；合并前绑定当前 head，核对合同、能力增减、自动验证、未知和负责人决定。普通低风险任务不进入统一重型流程。

### 4.4 纠偏被错误扩成整体冻结

负责人纠正一条路径后，协调者曾停止与该假设无关的独立机械验收。被替代判断是“发现漂移后停止整个并行任务”。当前规则只冻结：

- 依赖被推翻假设的路径；
- 存在共享写入冲突的路径；
- 会改变产品决定的路径。

有独立合同、所有权清楚且不依赖错误假设的安全工作继续。

### 4.5 看板执行状态替代原始诉求

被替代结论是“资源充足，但没有高价值工作”。当前事实是重大未满足诉求很多，缺口在需求全景、分解结果、当前执行队列和各角色最小上下文之间没有可靠衔接。没有 Issue 且需要续航时，Agent 必须返回未满足／部分满足诉求，用问题求解治理形成或选择一个有界 Issue；经营总账观察面本身不自动规划、派发或授权实施。

### 4.6 ROI 被误解为每一步最小改动

负责人指出“最小可逆资产”适合验证关键未知，不等于产品交付只能做最小 diff。此前一个中央 Session 长时间串联工作、多次依赖负责人先发现漂移，说明真正稀缺的是负责人注意力、有用吞吐、并发启动能力和纠错闭环速度。

被替代方案是“只缩短入口、收紧 `current` 并补两条窄规则”。新目标是在合理成本内尽快交付联邦式最小完整闭环，再用真实运行决定是否升级强制协调基础设施。

### 4.7 持久脚本语言的全局纠正

本次实现最初新增了 PowerShell 静态验证脚本。提交前，负责人明确把语言边界提升为全局规则：持久维护的程序、CLI、自动化和验证脚本只允许 Go、Python、TypeScript 或 Rust；不新增或保留 PowerShell、Batch 或 Shell 产品脚本。文档配置不受影响，Windows 一次性命令仍可经过 shell 宿主，但不能沉淀成脚本资产；不能以语言当前尚未安装为淘汰理由。

受影响路径只有新增验证器，因此其余入口、权威、快照和历史迁移继续。验证器改为只使用 Python 标准库：本任务主要处理 UTF-8 文本、Markdown 本地链接、Git 来源快照和静态合同，Python 在无需新增构建或第三方依赖的情况下能保持跨平台可读性和明确失败语义。选择依据是长期维护投入产出，不是本机是否已经安装 Python。范围外既有资产没有被批量重写。

### 4.8 合并前发现的作用域缩窄

初次交付虽然把上述规则称为“全局”，但版本化系统入口把语言小节放在“当任务涉及 Agent 系统”条件之后，仓库入口又只在 `agent-control` 内可见。这使新 Session 可能把规则误读为当前仓库或 Agent 系统任务的局部约束；“全局”标签本身没有形成可验证的作用域。

负责人在合并前明确纠正：凡这台电脑上的 Codex 或 Claude Code 参与维护持久资产，规则对所有仓库、Provider、Session 和 worktree 生效，不因当前仓库、仓库入口或 Agent 系统任务的触发条件而缩窄。本次修正把版本化公共规则移到条件路由之前，并同步仓库入口、权威、短快照与自动验证；它不安装用户级入口，也不把作用域澄清扩成既有资产批量重写。范围外既有资产留待后续实际触及或替换时遵守，确有不可避免的上游或引导例外仍需要明确证据和负责人决定。

## 5. 方案演变

### 5.1 被拒绝或降级的方案

| 方案 | 主要问题 | 当前地位 |
| --- | --- | --- |
| 保留单一长 `current`，只增加并发小节 | 并发越多越长，所有 Worker 继续读取全部任务和历史 | 拒绝 |
| 每个任务建立本地 `work/active/<id>.md` | 与 GitHub Issue 双写，跨主机恢复更差 | 拒绝为默认合同 |
| 完全取消 `current`，只用 GitHub | 本机未提交状态、共享配置占用和最新协调变化可能不可见 | 过度，拒绝 |
| 新增完整调度平台或强制锁 | 成本高、关键假设未验证，可能放大错误问题模型 | 暂不建设 |
| 永久中央协调者 + 专门 Worker | 中央 Session 成为吞吐和认知单点 | 只允许作为过渡 |
| 完全对等、每个 Session 自由选题 | 容易重复领取、竞争共享写入、局部最优和无人验收父目标 | 拒绝直接采用 |

### 5.2 最终批准的联邦式方向

负责人批准的首轮实现由三个面组成：

1. 产品与入口面：短活动协调快照、动态角色恢复、空队列返回诉求、局部冻结；
2. 工作流面：任意 Session 的 Issue 子树路由、合同压缩、风险分级审查、递归父级回收；
3. 真实运行面：至少三个 Session 分别承担父级局部协调和两个独立叶子交付。

角色由 Issue 合同和写入所有权决定。父 Issue Session 可以在授权内协调自己的子树；叶子 Issue Session 可以端到端交付；局部结果写回远端 Issue／父级后退出，不保留永久协调者身份。

产品与入口面由 [agent-control#20](https://github.com/Eridanus117/agent-control/issues/20) 交付；工作流面由 [agent-plugins#24](https://github.com/Eridanus117/agent-plugins/issues/24) 交付；整合验收由 [agent-control#21](https://github.com/Eridanus117/agent-control/issues/21) 交付。

## 6. 本次入口与快照迁移决定

### 6.1 三种启动模式

- **有明确叶子 Issue**：读取最小全局入口、远端当前合同、合同链接的权威和短活动快照，加载 `github-collaboration:issue-workflow` 端到端交付；
- **有明确父 Issue**：读取同一最小链，加载 `github-collaboration:issue-workflow`，只协调获授权子树；
- **没有 Issue、需要选择下一项工作**：读取短活动快照和经营总账权威，从未满足／部分满足诉求返回 `adaptive-problem-solving`，只形成或选择一个有界 Issue。

Issue 是持久任务合同，但不能覆盖当前权威、负责人更新的明确指令或有效协作派发。状态机、风险门、合同压缩和父级回收只在 Skill 内维护；入口不复制。

### 6.2 `current` 的新职责

`work/current.md` 只保留：

- 当前主线；
- 活动并行事项；
- 活动协调和共享写入所有权；
- 最新授权与边界变化；
- 下一检查点；
- 更新时间与按需来源链接。

迁移前全文进入原始记录层；本文件保存可读因果。后续 Agent 默认不读本记录，只有当前快照明确链接，或需要复查纠偏、证据、资产来由和冲突时才按需展开。

## 7. 迁移完整性映射

| 迁移前 `current` 内容 | 当前可读落点 | 原始来源 |
| --- | --- | --- |
| 当前主线问题、就绪队列错误与联邦式目标 | 本记录第 1、2、5 节；GitHub [#19](https://github.com/Eridanus117/agent-control/issues/19) | S01、S03 |
| 资源实验原始问题、D0／D1 和语言路径 | 本记录第 3 节 | S01、S04、S05 |
| 负责人可读性纠正 | 本记录 4.1 | S01、S02 |
| 资源产品范围纠正与 `0.2.0` 结果 | 本记录 3.1—3.3、4.2 | S01、S02、S04 |
| 减少重复授权与低成本审阅 | 本记录 4.3 | S01、S02 |
| 异步验收与额度速度候选 | 本记录第 8 节 | S01、S04 |
| 看板状态替代诉求与过度冻结 | 本记录 4.4、4.5 | S01、S03 |
| 授权、所有权、未授权事项 | 当前短快照；本记录第 9 节 | S01、S02 |
| 当前证据、工具失败、PR／提交和下一检查点 | 本记录第 3、8、9 节；远端 Issue／PR | S01、S04、S05 |
| 迁移前逐字内容 | `raw/current-before-migration.md` | S01 |

## 8. 未完成候选与证据边界

- `resource-observability 0.2.0` 的账户／会话入口、Windows 修复和三端安装形成局部交付证据，但不能证明额度速度、自动资源调度或长期 Orca 依赖；
- 额度消耗速度仍只是候选：自然任务批次开始／结束或资源决定点的事件式快照，比较窗口变化、时间、重置压力和已完成任务价值；不授权轮询、常驻监控、仪表盘或为消耗额度制造任务；
- Orca 当前生产化样本和故障只证明它是可用但有适配成本的薄运行后端，不决定长期直接依赖、Fork、自建或退出；
- 缩短 `current` 只预计减少无关上下文；系统提示词、工具目录和 Skill 仍有固定成本，真实验收前不宣称总 Token 已下降；
- 联邦式闭环当前最多处于实现中。只有 [#20](https://github.com/Eridanus117/agent-control/issues/20)、[#24](https://github.com/Eridanus117/agent-control/issues/24)、[#21](https://github.com/Eridanus117/agent-control/issues/21) 和父目标检查形成证据后，才可以判断当前交付验收；产品采用和长期依赖仍需负责人决定。

## 9. 授权与不做事项的来由

本轮授权覆盖两个互不重叠仓库切片中的实现、验证、提交、推送和 Draft PR，以及随后三个 Session 的受控验收。`agent-control#20` 的执行者拥有入口源、短快照、研发记忆迁移、相关权威和验证；`agent-plugins#24` 的执行者拥有工作流 Skill、测试和清单。共享安装端、用户级配置、父任务整合、经营总账整合和最终产品决定仍属于当前 Run 协调者。

本轮不授权自动合并、一级诉求状态变化、调度器、强制锁、注册中心、Hook、Webhook、常驻轮询、资源观测扩张或把动态额度写成长效知识。历史记录不能恢复这些授权。

## 10. 当前结果

本记录只完成研发记忆迁移和当前方向说明。版本化入口、短活动快照、协作权威和验证脚本由 `agent-control#20` 的同一 Draft PR 交付；详细 Issue 子树行为由并行的 `agent-plugins#24` 交付；最终真实运行和父目标验收不在本记录中预先宣称完成。

原始材料、核对方式和限制见 [`raw/index.md`](./raw/index.md)。

## 11. 在线续航实施前的重复摩擦纠正

负责人批准 [#26](https://github.com/Eridanus117/agent-control/issues/26) 的在线自然续接与联邦式派发后，当前 Session 在压缩远端合同时使用 PowerShell `ConvertFrom-Json` 读取 GitHub 的 RFC 3339 `updatedAt`。该值被隐式转换为本地 `DateTime`，再与原始 ISO 字符串比较时产生假不一致；陈旧检查安全停止，远端没有被覆盖。

负责人指出这类 PowerShell 时间问题此前已经多次发生，并进一步提出一个横向缺口：日常工具、宿主、工作流和 Agent 行为摩擦需要有低成本、跨 Session 可见的记录位置，累计次数和影响后再判断优化，而不是每次只在聊天中修正。

被替代做法是“当前命令改成 UTC 比较后继续，不留下可发现资产”。当前决定分成两层：

1. [#27](https://github.com/Eridanus117/agent-control/issues/27) 保存摩擦观察实验、记录门槛和升级门槛；一类摩擦一个 Issue，每次事件以评论追加，避免多个 Session 竞争改同一正文；
2. [#28](https://github.com/Eridanus117/agent-control/issues/28) 保存当前时间误判模式。当前可核验 1 次，负责人报告至少还有 1 次，精确历史次数未知；本次影响为中，包含一次失败、一次重试和一次负责人介入，没有共享状态损坏。

本次根因属于特定 GitHub 远端陈旧检查行为缺口，不值得把 PowerShell 时间细节加入全局系统提示词，也不值得建设通用时间 CLI。稳定行为是优先比较原始序列化标量或稳定快照；必须解析时使用显式 `DateTimeOffset`／UTC 规范化，不用本地文化格式参与一致性判断。该窄规则进入当前 `github-collaboration` 交付切片的横向验收，不把一次性 PowerShell 命令沉淀为产品脚本。

摩擦观察先人工运行 3 个真实模式或 14 天；原始事件不全部进入经营 Project，只有达到重复、高影响、累计明显成本或负责人介入门槛的优化候选才进入正式交付。当前不建设 Hook、Webhook、Runner、轮询、统计服务或自动优化。

随后在同一远端合同更新中又出现第二类模式：PowerShell 双引号 here-string 解释 Markdown 反引号，曾让 [#28](https://github.com/Eridanus117/agent-control/issues/28) 的代码围栏产生远端可见格式错误；`gh --jq .body` 的多行输出又被 PowerShell 表示为字符串数组，代码两次把它当单字符串而在写入前安全失败。该模式进入 [#30](https://github.com/Eridanus117/agent-control/issues/30)，当前有 2 个可核验事件、3 次失败／修复循环，影响为中，没有合同或关系损坏。当前只使用字面量输入、显式连接多行输出和换行规范化；到第三个跨任务／跨 Session 事件、错误合同进入远端、单次恢复超过约 15 分钟或负责人再次介入时，才比较补 Skill 与窄 Go／Python／TypeScript／Rust 工具的投入产出。

## 12. 协调运行摩擦与人工观察 MVP 的首轮 ROI

首个自然续接切片通过 Orca 交付时，第三类摩擦形成稳定模式并进入 [#31](https://github.com/Eridanus117/agent-control/issues/31)：高层 Worker 启动、读取和释放接口与低层 Task／Dispatch 生命周期不是同一可互换闭环。当前可核验事件包括：

- 高层 `worker-start` 用仓库 ID 或精确 worktree 选择器均在无副作用阶段返回 `selector_not_found`，低层显式终端与 `dispatch --inject` 可以成功派发；
- 依赖一个已经完成 Task 的审查 Task 没有自动进入就绪，需要协调者显式改为 ready；
- 独立审查 Worker 已进入空闲但未发布评论，协调者从 GitHub 复核缺口后追加一次同范围提示才完成；
- Dispatch 已 completed、capability 已 revoked 且 worktree 干净时，高层 `worker-release` 仍因参数和对象发现失败，协调者只能精确关闭终端并保留 PR worktree。

这些事件没有造成错误写入或数据丢失，但每个 Worker 增加了人工观测、失败调用和回收判断，直接削弱负责人期望的并发收益。首轮三种真实模式使 [#27](https://github.com/Eridanus117/agent-control/issues/27) 达到“样本有效”，同时说明记录本身也有成本。当前 ROI 结论是继续并修改人工 MVP：一类模式一个 GitHub Issue、重复发生只追加短事件、Project 只保留汇总计划；暂不建设 Hook、轮询或监控平台。下一候选不是统计服务，而是让 Agent 在明显摩擦发生时自动搜索 `agent-friction` 标签、复用已有模式并追加最短事件。

## 13. “中心 Session 会派发”不等于联邦式能力

agent-plugins[#28](https://github.com/Eridanus117/agent-plugins/issues/28) 的实现经过一轮修复和第二轮独立复核后，Draft PR [#29](https://github.com/Eridanus117/agent-plugins/issues/29) 在 head `9b7bd8c00bc7186303153cc376f4a88dd5b4314a` 上达到 P0=0、P1=0。两条原高优先级问题——相同本地文化时间字符串绕过校验、自然续接只由文本子串而非生命周期图覆盖——都已用独立探针和结构化路由检查关闭。剩余三条低优先级限制包括同父读—判—写竞态；完全消除后者需要锁或注册中心，当前只记录并在自然观察中验证，不突破既定产品边界。

在这一节点，负责人指出更重要的验收失败：本轮推进约 8 小时，实际指令仍主要通过当前中心 Session 下达，并发度有限。这个事实推翻了“中心协调器能够派发多个 Worker，便已接近联邦目标”的隐含判断。真正的 L2 证据必须是：至少两个新 Session 不经当前 Session 派发，只凭入口、GitHub 父 Issue 和共享写入规则，就能自行恢复目标、领取分区、协同、回写并退出。

此前 [#26](https://github.com/Eridanus117/agent-control/issues/26) 为降低接口变化风险，明确规定 agent-control[#29](https://github.com/Eridanus117/agent-control/issues/29) 必须等首个 Plugin PR 合并安装后才能实施。现在首个 head 已独立复核稳定，继续保持该限制的主要效果变成串行等待。推荐的成本调整是在负责人明确改变这条授权后，让入口 Session 基于固定候选 head 并行实施，但仍不允许提前合并或安装；两个 PR 一起进入一次负责人门，再用两个全新 Session 做真实联邦验收。该推荐已写回 [#26](https://github.com/Eridanus117/agent-control/issues/26)，但负责人尚未改变授权，因此当前只收敛证据，不提前派发入口实现。

## 14. 联邦化以后，负责人应当与事项交互而不是寻找 Agent

负责人进一步指出，多个 Agent 同时运行后会出现一个新的交互成本：负责人有时不知道应该打开哪个 Agent；虽然可以在 TUI 中寻找等待批准的终端，但这仍把临时执行者身份当成产品入口。一个 Agent 退出、Session 被清理或工作被接管后，这种入口也会失效。

问题的稳定对象不是 Agent，而是“等待决定／等待验收的事项”。当前已有的 GitHub 资产能够承载一个不新增平台的混合 MVP：

1. Agent 需要负责人时，把背景、唯一问题、推荐、少量替代、主要收益／代价和回复所需信息合并成 Issue 上的一次决定请求；
2. Project 的“等待负责人”视图汇总 `待决定` 与 `验收中`，只作为观察面，不成为授权源或事件后端；
3. 原 Agent 写回后可以退出，不需要占住终端等待；
4. 负责人可以直接在 GitHub 回复，也可以在任意 Codex／Claude Session 说“处理等待负责人事项”；该 Session 从 Project 和 Issue 恢复合同、记录负责人决定，再由任何满足所有权条件的 Session 继续；
5. 直接进入原终端只用于实时纠偏、观察过程或工具故障，不作为正常审批路径。

该方案的限制也必须外显：没有 L3 时，GitHub 回复不会自动唤醒本地 Agent；负责人仍需启动或恢复任意一个 Session，但不需要识别原执行者。多个 Agent 同时请求决定时，需要按父 Issue 合并重复问题，不能让每个 Worker 分别向负责人提问。当前推荐把最小交互路由和可验证场景并入 agent-control[#29](https://github.com/Eridanus117/agent-control/issues/29)，不建设自有看板、TUI 插件、通知服务、Webhook 或常驻调度器；只有自然样本证明 GitHub 收件箱仍不足，再评估更重交互层。

## 15. 新建／恢复 Session、提前实施授权与安装缓存异常

负责人批准了推荐的并行化调整：agent-control[#29](https://github.com/Eridanus117/agent-control/issues/29) 不再等待首个 Plugin PR 合并安装，可以基于已独立复核的固定 head `9b7bd8c00bc7186303153cc376f4a88dd5b4314a` 提前实施；两个 PR 仍须在当前提交验收后一起进入合并／安装门。负责人同时指出联邦入口有两种真实模式：启动一个全新 Session，或恢复一个已有但当前空闲的 Session。两者都必须重新读取 GitHub 远端合同和所有权，不能把旧聊天记忆、旧 Session 角色或已经失效的授权带回当前任务。

[#26](https://github.com/Eridanus117/agent-control/issues/26) 与 [#29](https://github.com/Eridanus117/agent-control/issues/29) 的正文据此从远端压缩；[#29](https://github.com/Eridanus117/agent-control/issues/29) 的原生 blocked-by 被解除，只解除实施等待，不消除最终整合依赖。Project 切到进行中后，Orca Run `run_66ae8eb4d020` 建立 Task `task_cabb7a0cbb0b`。组合式 `worker-start` 再次在无副作用阶段返回 `selector_not_found`，因此按当前动态指南创建 agent-first 独立 worktree `federated-owner-interaction`，再用低层 Dispatch `ctx_72a3a6b42dec` 注入同一任务；Worker 独占入口和验证范围，当前 Session 保留父级、Project、当前快照和 Orca 所有权。

派发前还发现一个共享状态异常：普通 Codex 的安装目录已经出现 `github-collaboration 0.3.2`，文件时间对应首轮 Worker 实施期，但关键 Skill 的 SHA-256 与已复核 head 不一致；它实际承载首轮候选，而不是修复后的提交。当前没有在线终端能说明谁拥有这次写入，因此没有猜测来源，也没有擅自覆盖。该副本不能用于安装或联邦行为验收；入口 Worker 明确不得修改它，整合门前必须比较三端安装状态、固定 head 与目标安装来源后再作最小收敛。

## 16. 动态恢复别名造成 Session 身份冲突

### 16.1 当时正在解决的问题

agent-control[#29](https://github.com/Eridanus117/agent-control/issues/29) 已形成 Draft PR [#33](https://github.com/Eridanus117/agent-control/issues/33)，独立复核在固定 head `84c1a2b3eefdee9b6e897abe008727be688fb146` 上得到 P0=0／P1=0／P2=5。协调者计划让原实现 Codex Session 处理低成本 P2，同时把它作为“恢复已有空闲 Session”的运行样本。

### 16.2 偏差与负责人纠正

原 Orca 终端已经退出 Codex TUI，`dispatch --inject` 因无法识别 Agent 而拒绝。协调者随后在该终端执行 `codex resume --last`，假设“同一个终端和 worktree”足以让 `--last` 指向原实现 Worker。负责人立即指出：并发环境中的 `last` 是动态别名，可能恢复错误 Session，应该指定精确 Session ID。

进程参数核验随后证明该纠正成立：`--last` 实际解析为 `019fdbe9-4f7e-79d1-95d4-25c7a83cff69`，这是当前根 Session 的 ID，不是原实现 Worker。错误 Dispatch 已在文件修改前被中断并判失败；PR [#33](https://github.com/Eridanus117/agent-control/issues/33) 仍为原 head，主工作树和 PR worktree 均干净。负责人随后恢复了被误伤的当前 Session。

### 16.3 第二个错误与根因

发现恢复错对象后，协调者又试图用进程号终止疑似重复进程，却没有可靠证明进程号与错误 Orca 终端、当前根 Session 的所有权关系。这个“通过更多不可靠推断修复第一次不可靠推断”的动作风险更高，并导致当前 Session 需要负责人介入恢复。

主要断点不是 Token 或一般遗忘，而是恢复协议和工具可观测性缺口：

- 任务／Dispatch 没有持久保存 Provider Session ID；
- Orca 终端 handle、OS 进程、Provider Session 和 Git worktree 之间没有一份可核验绑定回执；
- `resume --last` 是面向单会话便利性的动态选择，不适合并发调度；
- 高低级 Orca 生命周期分裂导致协调者无法通过统一的 worker fence／release 路径收敛低级 Dispatch；
- 当前规则强调重新读取远端，却没有先约束“恢复的是哪个 Session”。

### 16.4 被替代判断与当前约束

被替代判断是“同一终端／worktree 中使用 `resume --last` 足以安全恢复原 Worker”。当前候选约束是：

1. 联邦协作禁止用 `resume --last`、名称或最近时间作为恢复身份；
2. 创建 Session 时持久记录精确 Provider Session ID，并与终端 handle、worktree／分支、Issue／Task／Dispatch 建立可复核绑定；
3. 恢复前按精确 ID 启动，再核对四元绑定和远端当前合同，旧上下文、角色、授权和所有权仍不得直接继承；
4. 无法证明绑定时，废止恢复样本并改用全新 Session；
5. 无法证明 OS 进程归属时，只冻结 Dispatch、保留现场并请求负责人处理，不按进程号终止。

这组约束影响所有多 Session 恢复，价值明显高于其短规则成本；但修改系统提示词、Skill 和 Orca 产品能力仍需单独受权和当前提交验收。本次先保存纠正和冻结受影响路径，不把事故后的临时判断直接升级为已验证知识。

### 16.5 纠正后的新 Session 身份握手

负责人批准按推荐继续，但不再恢复原 Worker。协调者先尝试 Orca 高层 `worker-start`：附着现有 PR worktree 和从固定 PR head 创建 `new-top-level` 两种选择都在无副作用阶段返回 `selector_not_found`。这再次支持 [#31](https://github.com/Eridanus117/agent-control/issues/31) 的“高低级生命周期不等价”证据，但不应迫使交付退回不安全恢复。

当前动态 Orca 指南明确把 agent-first worktree + `dispatch --inject` 保留为有效低层路径。协调者据此从 `origin/Eridanus117/federated-owner-interaction` 的固定 head 新建隔离 worktree `pr33-p2-fix-fresh` 和一个全新 Codex Session，并增加编辑前身份门：Session 必须从自身运行环境读取 `CODEX_THREAD_ID`，为空则失败退出；禁止用最近时间、目录扫描、PID 或 `resume` 推断。

握手回执将以下对象绑定：

- Provider Session：`019feef5-b5d3-7143-8268-d6cc6fde5e52`；
- Orca terminal：`term_a2ff5020-bc9c-43fa-b73b-879f02710076`；
- worktree：`C:/Users/<user>/orca/workspaces/agent-control/pr33-p2-fix-fresh`，创建 head `84c1a2b3eefdee9b6e897abe008727be688fb146`；
- Task：`task_f9a8353a44ce`；
- Dispatch：`ctx_a8bed7e1a659`。

Session ID 与根 Session `019fdbe9-4f7e-79d1-95d4-25c7a83cff69` 不同；心跳来自当前 Dispatch capability，原始终端输出同时保留了环境变量读取与带 `--thread-id` 的发送命令。该证据足以让全新 Session 在自己的排他范围继续修复，但只证明“创建时身份握手可行”，不证明用精确 ID 恢复、恢复后重新取得所有权或安全退出已经成立。

## 17. 把当前任务邻域误当成整个经营组合

### 17.1 当时正在解决的问题

负责人询问当前是否还有可并发派发的事项。协调者把问题解释为“围绕 PR [#33](https://github.com/Eridanus117/agent-control/issues/33) 与当前 Orca Run，还有哪些不会重叠的旁支”，只检查了摩擦 [#32](https://github.com/Eridanus117/agent-control/issues/32)、[#34](https://github.com/Eridanus117/agent-control/issues/34) 和 `agent-plugins#19`，随后建议一个实现 Worker 加两个只读 Worker。

### 17.2 偏差与负责人纠正

负责人要求扩大视野查看整个 Board，并指出不可能没有更多并发事项。远端全量读取经营总账后，确认此前结论确实过窄：四个一级诉求均为部分满足，资源能力为未满足；知识 [#9](https://github.com/Eridanus117/agent-control/issues/9) 与思考方法 [#8](https://github.com/Eridanus117/agent-control/issues/8) 甚至没有任何下级 Issue；协作、长程、资源和摩擦子树同时存在待审、待验收、状态陈旧和可独立调查的工作。

被替代判断是“只有当前 Run 邻域的开放 Issue 才是并发候选”。正确的问题是：在整个 Agent 系统建设组合中，哪些未满足诉求当前最值得投入，哪些已经形成无依赖、可排他、协调净收益为正的有界合同；缺少就绪叶子时，应补问题建模与拆解，而不是判定没有工作。

### 17.3 根因

这是问题漂移和 Skill 路由未执行，不是看板缺数据：

- 当前 Session 受到 Orca Run、活动快照和最近事故的显著性影响，把局部协调状态提升成全局投资边界；
- 虽然入口和 `issue-workflow` 已明确写有“就绪队列为空不等于没有工作”，实际判断没有先经过经营总账和 `adaptive-problem-solving`；
- 并发判据本身没有错，但被应用在错误的候选集合上；严格筛选一个过窄集合仍会得到错误结果；
- Project 的部分状态已经落后于远端交付事实，使只看状态列进一步放大了漏项。

### 17.4 对下一步的影响

PR [#33](https://github.com/Eridanus117/agent-control/issues/33) 的独立交付不受这次纠正推翻，继续进入当前 head 复核；依赖“只看当前 Run 邻域”的并发结论废止。下一波从完整 Project 和未满足诉求形成：当前提交复核、Plugin 来源审计、Orca 生命周期审计、精确恢复协议、资源链状态收敛，以及知识和思考方法两个尚未拆解领域的有界候选。共享安装、Project 写回和真实恢复仍保持单写者或串行。

长期改进候选不是新增一条重复提示词，而是攻击现有持久路由为什么没有被执行：后续 `adaptive-problem-solving`／经营总账入口的行为验收必须包含“当前 Run 有大量活动，但 Board 另有无子项的未满足诉求”这一反例，证明候选集合先来自全局经营问题，再应用并发条件。是否修改 Skill 需先经过当前证据与独立复核，不因本次记录自动授权实现。

## 18. 首个全局联邦并发波次

负责人批准把上一节的全局候选集实际转成并发波次，并明确允许知识与思考方法各建立一个有界子 Issue。当前 Session 因此没有继续把所有工作收回一个中心 Run，而是按交付性质拆成两种协调关系：

1. PR [#33](https://github.com/Eridanus117/agent-control/issues/33) 的当前提交审查需要精确回执、当前 head 绑定和即时整合，因此留在 Orca Run `run_66ae8eb4d020` 中，由 Task `task_141616d8c26c`／Dispatch `ctx_60662b3f4c43` 监督；
2. 摩擦 [#27](https://github.com/Eridanus117/agent-control/issues/27)、资源 [#16](https://github.com/Eridanus117/agent-control/issues/16)、知识 [#35](https://github.com/Eridanus117/agent-control/issues/35)、思考方法 [#36](https://github.com/Eridanus117/agent-control/issues/36) 和联邦实验 [#21](https://github.com/Eridanus117/agent-control/issues/21) 都有稳定 GitHub 合同和互斥写入面，因此采用全量交接：启动独立 Codex／Claude Session，要求先在所属 Issue 留领取评论，之后把过程与结果写回 GitHub；它们不属于当前 Run，也不依赖当前 Session 在线等待或接收 `worker_done`。

知识 [#35](https://github.com/Eridanus117/agent-control/issues/35) 是 [#9](https://github.com/Eridanus117/agent-control/issues/9) 的原生子项，只允许在 60 分钟内找出公共知识下一项最值得投入的能力；思考方法 [#36](https://github.com/Eridanus117/agent-control/issues/36) 是 [#8](https://github.com/Eridanus117/agent-control/issues/8) 的原生子项，只允许诊断“为什么局部活动会遮住整个经营组合”并比较可复用的修正方式。两个 Issue 都只授权分析、增量核验和评论，不授权实施平台、修改系统行为、继续拆 Issue 或改变父级诉求状态。

另外三个交接范围分别是：[#27](https://github.com/Eridanus117/agent-control/issues/27) 及其五个摩擦模式的审计／归类，[#16](https://github.com/Eridanus117/agent-control/issues/16) 资源链的远端事实恢复与下一切片选择，以及 [#21](https://github.com/Eridanus117/agent-control/issues/21) 的父目标级只读验收评论。Project 中 [#27](https://github.com/Eridanus117/agent-control/issues/27) 已从陈旧的“验收中”切回“进行中”；[#35](https://github.com/Eridanus117/agent-control/issues/35) 与 [#36](https://github.com/Eridanus117/agent-control/issues/36) 已按“进行中／计划实验／尚无实现”登记。当前 Session 保留 Project、活动快照、研发记忆和 [#26](https://github.com/Eridanus117/agent-control/issues/26) 父级的整合权；没有任何 Session 取得合并、安装、关闭、权威、用户配置或自动化建设授权。

这次波次本身是一个运行实验，不是联邦能力已经成立的证明。需要观察的不是终端数量，而是：各 Session 能否只从 GitHub 恢复合同、是否越过排他边界、是否产出可复核结果、负责人是否仍需逐个找终端，以及整合成本是否低于并发收益。全量交接任务不由当前 Session 轮询终端；未来恢复只依赖远端 Issue，避免把临时 Orca 生命周期重新变成中心协调瓶颈。

五个全量交接 Session 随后都在所属 Issue 留下领取声明并复述所有权，其中 [#16](https://github.com/Eridanus117/agent-control/issues/16)、[#35](https://github.com/Eridanus117/agent-control/issues/35) 和 [#36](https://github.com/Eridanus117/agent-control/issues/36) 还明确记录了从远端恢复合同的路径；这证明提示确实进入了独立 Agent，而不只是终端输入被接受。它仍不能证明最终交付质量或整合成本，后续只从 GitHub 结果验收。

PR [#33](https://github.com/Eridanus117/agent-control/issues/33) 的受监督审查绑定 head `5da04bff4ff9814fd80925794a09aa99de69104f` 返回 P0=0／P1=0／P2=3，上一轮五项 P2 全部关闭，95/95 入口验证和 6/6 Python 单测通过。三个剩余 P2 都说明静态“包含正确语句”无法阻止同一入口额外加入相反规则；其中自然触发闸门的自相矛盾绕过最值得在整合前评估，继续堆字符上限和同义词黑名单的收益更低。复核 Task 已成功交付并确认消息，但 `worker-release` 再次对已完成低层 Dispatch 返回 `dispatch_not_found`，因此仍按 [#31](https://github.com/Eridanus117/agent-control/issues/31) 保留精确运行事实，不关闭终端伪造生命周期收口。

整合级 ROI 选择据此收敛为：只修第一个 P2。它会直接改变是否错误触发自主续接，已有合同三的极性检查可以复用，预期是一个低成本、可逆的小修；另外两个 P2 需要继续扩张字符限制、固定词表或通用语义分析，判断税和维护成本更高，暂不追求静态验证的虚假完备。全新 Codex Session 从固定基线创建，Task `task_04ea3abc6892`／Dispatch `ctx_5bbd0760ad1d` 只拥有 PR 五个文件中 P2-1 所需范围，30 分钟停止；该决定沿用 [#29](https://github.com/Eridanus117/agent-control/issues/29) 已有实现／审查反馈授权，不包含合并或安装。

P2-1 修正最终只改两份 Python 验证文件并普通 fast-forward 到 head `c8561f0a9c70911131bbc10ff53665ae1ae1f5d0`。未参与实现的原审查者对 10 类否定、例外、可选、错 Skill、放宽父级和缺失授权等变异逐项攻击，10/10 被三份镜像的结构化整句合同拦截；当前 95/95、6/6、旧投影、镜像与导入链均通过，P0=0／P1=0／新增 P2=0。两个已延后 P2 未恶化。该证据支持进入整合决定门，不支持自动合并、安装或父目标完成。

## 19. 负责人—Agent 的决定协议不能让负责人承担解析成本

### 19.1 真实样本

资源 [#16](https://github.com/Eridanus117/agent-control/issues/16) 与 agent-plugins[#21](https://github.com/Eridanus117/agent-plugins/issues/21) 各自形成一条很长的复核／决定评论。负责人使用 GitHub 的引用回复功能：整段报告被复制进新评论，真正的新文字分别只有 `B` 和“同意”。这两条对人是自然且明确的，但持久记录和 Agent 解析出现三个成本：引用内容被重复保存；Agent 可能把引用里的旧建议或旧授权误当成新指令；后续合同压缩需要从数千字中抽取一个字符或两个字。

负责人提出应规范自己的回复方式和 Agent 的格式。被替代的方向不是“要求负责人填写更严格表单”，而是让系统把结构化成本放在 Agent 侧，同时保留负责人自然短回复。

### 19.2 首次可逆试行

当前 Session 使用一个非对称三段式协议处理这两个真实回复：

1. Agent 决定请求应有稳定编号、一句话问题、少量互斥选项、推荐、主要代价、授权边界和最短回复示例；长证据与决定请求分开；
2. 负责人可以回复 `批准 D16-B`、`B`、`同意`、带条件批准、否决或澄清，不需要填写长表；只有唯一紧邻决定能被绑定时才解释极短回复；
3. Agent 忽略引用块的授权效力，只从未引用新文字解释意图，然后回写短“决定回执”，明确已授权、未授权、下一动作和纠正入口；无歧义时不重复索要批准。

[#16](https://github.com/Eridanus117/agent-control/issues/16) 的引用后 `B` 被唯一绑定为方案 B，agent-plugins[#21](https://github.com/Eridanus117/agent-plugins/issues/21) 的引用后“同意”被绑定为关闭建议。当前 Session 在 GitHub 写入决定回执 `D16-20260811-1` 后关闭了已由 PR [#23](https://github.com/Eridanus117/agent-control/issues/23) 事实满足的 agent-plugins[#21](https://github.com/Eridanus117/agent-plugins/issues/21)，并让原资源 Session 从 GitHub 重读决定后继续 B 的两项剩余工作。引用内容没有被用来扩大授权。

### 19.3 载体判断与边界

这不是关于“当前什么是真的”的知识，也不应成为所有任务都加载的长系统提示词。它是 GitHub 决策节点的条件性多步骤行为，候选载体是 `github-collaboration:issue-workflow` 的决定请求／解析／回执段和相应路由场景；短入口只负责加载 Skill。候选已写回 [#29](https://github.com/Eridanus117/agent-control/issues/29)，未塞入正在验收的 PR [#33](https://github.com/Eridanus117/agent-control/issues/33)，避免改变当前提交合同。

后续最小完整切片应至少覆盖：唯一决定后的 `B`／“同意”正向样本、多决定并存时“同意”必须澄清的反向样本、引用块不能授权、带条件批准缩小范围，以及回执后不再重复请求同一批准。当前试行只证明协议能处理两个真实样本，不证明跨 Session 产品能力已经成立；正式 Skill 修改和安装仍需独立授权与验收。

为降低下一轮批准成本，当前 Session 随后在 [#26](https://github.com/Eridanus117/agent-control/issues/26) 发布了稳定编号 `PACK-20260811-1`：把联邦基础合并／可追溯安装、正式公共知识入口、全局并行波次路由和决定协议 Skill 化分为 A／B／C／D 四组，列明依赖、预授权门与明确不做，并提供整包、部分批准、修改和否决四种最短回复。这是协议的第二个真实试行；负责人尚未回复，因此它不是授权，三个新交付 Issue 也尚未创建。

## 20. 决定请求不应只让负责人确认 Agent 已经偏好的方案

### 20.1 新纠正

负责人对 `PACK-20260811-1` 回复“批准全部”，同时指出四组都看不出不批准的理由，因而难以作出有信息含量的判断，并要求后续携带 Agent 的分析建议。这暴露出第二次协议试行虽然降低了回复格式成本，却仍把主要判断成本留给负责人：请求完整解释了“为什么做”和实施保护，但几乎没有说明“为什么可能不做”“什么证据会改变推荐”。

### 20.2 被替代判断与原因

被替代判断是“只要把范围、依赖、风险门和推荐列清楚，负责人就足以判断”。这对单纯授权门可能成立，但对包含多个产品切片的组合决定不够。没有最强可信反方时，负责人无法区分 Agent 是经过攻防后仍推荐，还是只陈列了自己想推进的事项；所有选项都写成正收益也会制造形式选择、实质默认批准。

本次其实存在可信反方：一次批准同时覆盖两个基础整合和三个行为交付，会增加整合／排错面，并让数个变化在同一观察期内相互干扰。当前推荐仍是全部批准，因为已有顺序和边界缓解了耦合：A 先整合，B 写入面隔离且可并行，C／D 等 A 后实施；每项最多一个 Issue 与一个 PR，当前提交独立审查，P0／P1 或产品边界变化即停止。固定 PR head 已复核，资源快照也不支持因额度稀缺而串行化。

会使推荐翻转的事实包括：固定 head 在合并前变化；安装来源无法核验；B／C／D 无法保持一个 PR 和排他所有权；C／D 必须复制状态机或越过产品边界；实际协调成本或负责人注意力明显高于预计。当前没有这些事实，因此“全部批准”是 Agent 的明确建议，而不是四个未经判断的中性选项。这段分析本应出现在批准请求中，而不是由负责人追问后补充。

### 20.3 可复用行为候选

后续有实质后果的决定请求至少区分两类：

1. **授权门**：方案已经有唯一明显路径，只需要确认是否允许产生外部或共享状态变化。Agent 应直接推荐批准或不批准，说明普通执行路径和真实停止条件；不存在可信替代时明确说没有，不制造假选择。
2. **产品取舍**：多个方向会产生不同收益、成本或边界。Agent 除推荐外，必须给出最强可信反对／延后理由、会使推荐翻转的事实与当前证据置信度。

两类都维持负责人自然短回复和显式决定回执。该行为候选进入已获批准的决定协议 D，不单独扩张系统提示词，也不因此新增审批层。

## 21. 整包授权进入一次依赖图执行

负责人批准 `PACK-20260811-1` 全部四组后，当前 Session 没有为 A／B／C／D 逐项重复索要授权。先在 [#26](https://github.com/Eridanus117/agent-control/issues/26) 写入包含 Agent 推荐、最强可信反方与翻转条件的决定回执，再执行已确认依赖图。

A 的两个 PR 在合并前重新确认 head 未变化：`agent-plugins#29@9b7bd8c` 合并为 `9a802b5`，`agent-control#33@c8561f0` 合并为 `69d9499`。`github-collaboration 0.3.2` 随后安装到普通 Codex、Orca Codex 和 Claude；每端 14 个文件与合并源码逐项一致，三份真实入口与版本化来源规范化后一致。完整来源、路径与哈希回执留在 [#27](https://github.com/Eridanus117/agent-control/issues/27#issuecomment-5250151576)。

全新非交互 Codex Session `019fefa6-c892-7803-bf7b-90c49633ee8a` 从实际 `0.3.2` Skill 路径重读 [#26](https://github.com/Eridanus117/agent-control/issues/26)、决定回执与活动快照，只接受一条评论写入权；随后使用这个 UUID 精确恢复同一 Session，环境 ID 精确匹配，再次从远端恢复合同和 Project，并明确没有继承旧父级、安装或 Project 所有权。两次评论分别为 [A-FRESH](https://github.com/Eridanus117/agent-control/issues/26#issuecomment-5250117905) 与 [A-RESUME](https://github.com/Eridanus117/agent-control/issues/26#issuecomment-5250138073)。命令未使用 `resume --last`。这支持来源／身份／所有权门的当前交付验收，不证明 Session 是自主发现工作，也不证明联邦父目标整体完成。

B／C／D 分别形成原生交付子项 `agent-control#37`、`agent-control#38` 与 `agent-plugins#30`。[#38](https://github.com/Eridanus117/agent-control/issues/38) blocked-by [#29](https://github.com/Eridanus117/agent-control/issues/29)，[#30](https://github.com/Eridanus117/agent-plugins/issues/30) blocked-by agent-plugins[#28](https://github.com/Eridanus117/agent-plugins/issues/28)；A 收口后两条原生依赖解除。三个 Agent-first worktree 和低层 Dispatch 取得互斥范围：知识只写 `authority/01-knowledge.md` 与 `knowledge/**`，全局波次只写三份入口和两份 Python 验证，决定协议只写 `github-collaboration` 的 Skill 与必要包装／路由测试。当前 Session 保留 Project、共享安装和最终整合权。该结构提高并发，但三个 Session 仍由当前 Session 主动派发，因此不冒充 L2 联邦目标的强证据。

## 22. 负责人观察面出现假等待与执行现场残留

负责人从移动端观察 GitHub Project 和 Orca 后指出两个问题：`等待负责人` 中存在点开后无需其采取行动的事项；Orca 的 worktree 列表无法一眼回答数量、活动任务与已结束现场。该纠正说明“已建设观察面”不等于“负责人能低成本取得正确行动信息”，也说明本轮交付后的生命周期收口没有跟上并发扩张。

只读复核时，Project 的 `等待负责人` 实际包含 [#20](https://github.com/Eridanus117/agent-control/issues/20)、[#27](https://github.com/Eridanus117/agent-control/issues/27)、[#35](https://github.com/Eridanus117/agent-control/issues/35)、[#36](https://github.com/Eridanus117/agent-control/issues/36)。[#27](https://github.com/Eridanus117/agent-control/issues/27) 的安装回执已按整包授权完成，[#35](https://github.com/Eridanus117/agent-control/issues/35)／[#36](https://github.com/Eridanus117/agent-control/issues/36) 的推荐已被接受并分别进入 [#37](https://github.com/Eridanus117/agent-control/issues/37)／[#38](https://github.com/Eridanus117/agent-control/issues/38)，三项仍保留 `待决定`；[#20](https://github.com/Eridanus117/agent-control/issues/20) 只有旧的“当前交付验收”陈述，没有一个当前、明确、未消费的负责人问题。现有权威本来要求 `待决定` 表示下一步确实依赖负责人、证据等待负责人接受时才进入 `验收中`，因此这是状态收口失败，不是负责人理解错误。

同一时点 Orca 列出 9 个 worktree、12 个终端。真正处于 `working` 的只有 [#38](https://github.com/Eridanus117/agent-control/issues/38) 与 agent-plugins[#30](https://github.com/Eridanus117/agent-plugins/issues/30)；[#37](https://github.com/Eridanus117/agent-control/issues/37) 已产生 Draft PR [#39](https://github.com/Eridanus117/agent-control/issues/39) 并结束执行。至少 `federated-owner-interaction`、`pr33-p2-fix-fresh`、`pr33-trigger-polarity-fix`、`autonomous-continuation` 四个干净 worktree 对应已合并或已结束旧路径，却仍未归档，且 `workspaceStatus` 全部显示 `in-progress`。根因不是单纯命名：本轮多次因组合式 `worker-start` 失败而退到 Agent-first worktree + 低层 Dispatch，这条回退路径不受 `worker-release` 生命周期管理；任务完成、终端结束、PR 合并和 worktree 清理没有形成同一闭环。

当前候选改进分两层，尚未获得实施授权：第一层先把负责人视图定义成“存在一个当前、明确、未消费的负责人动作”，决定回执与执行状态切换必须同一次收口；先修现有条目和行为规则，不立即增加重复字段。第二层把 Orca 定位为运行现场而非历史看板：新现场使用 Issue 编号和中文短名，完成交付后先证明工作树干净且远端已保存，再关闭精确终端并移除／归档 worktree；高层 Worker 成功时走 `worker-release`，低层回退必须有等价显式清理。先做一次清理与自然样本，若移动端仍不能表达活动数量／状态，再评估 Orca 上游功能或自有汇总层，不先建设新 UI。

## 23. 规范化包从四个实现收敛为当前交付

负责人批准 `NORMALIZE-20260811-1` 后，四个互斥切片按依赖完成，并没有为每个合并／安装门重复请求批准：

| 切片 | 远端结果 | 当前证据 |
| --- | --- | --- |
| 公共知识入口 | agent-control PR [#39](https://github.com/Eridanus117/agent-control/issues/39)，merge `c09d55e344a22b8da646e28218127de0787ede4a` | [#37](https://github.com/Eridanus117/agent-control/issues/37) 完成／当前交付验收 |
| 持有 Issue 时扩大并行波次 | agent-control PR [#40](https://github.com/Eridanus117/agent-control/issues/40)，merge `3844ae1` | [#38](https://github.com/Eridanus117/agent-control/issues/38) 完成／当前交付验收 |
| 负责人决定协议 | agent-plugins PR [#31](https://github.com/Eridanus117/agent-plugins/issues/31)，merge `04f92518f924aed0cfa299b4fca04a70c200a115` | [#30](https://github.com/Eridanus117/agent-control/issues/30) 完成／当前交付验收 |
| 低层 Dispatch 资源收口 | agent-plugins PR [#33](https://github.com/Eridanus117/agent-plugins/issues/33)，merge `ba763cfb1fccf2d96b105d780835dbc21712a692` | [#32](https://github.com/Eridanus117/agent-control/issues/32) 完成／当前交付验收 |

[#32](https://github.com/Eridanus117/agent-control/issues/32) 暴露了本轮最重要的一次过程纠错。协调者起初把未文档的 `worker-release: dispatch_not_found` 加四项证明误判成正向验收，并删除了资源；独立审查指出候选规则既没有覆盖这个回执，也没有给标准释放后残留 worktree 可达出口。该样本被公开降级为失败样本，合并冻结。修复把判断改为逐对象检查“是否被回执确认释放、是否存在必须执行的恢复动作、四项证明是否齐全”，随后新 head `6bf5d0d` 经独立终审 P0=0／P1=0／P2=2，42 个场景通过后才合并。

受控反向样本确实验证了工作树不干净时对象会被保留；但协调者在清理后错误评论“没有终端或其他进程”，而实际列表仍有 Orca 回退 PowerShell 终端。远端事实随后再次公开纠正：这个样本只支持“证明缺失时保留”，不支持其清理半段过程合规。两个修复后的 Agent 终端／worktree 样本仍提供正向证据。最终无数据丢失，但“最终没有残留”不能替代过程证明。

## 24. 安装来源、新 Session 发现与真实入口

合并后，普通 Codex 和 Orca Codex 的本地 Marketplace 直接解析 `agent-plugins/main`，均报告 `github-collaboration 0.3.3` 与 `orchestrated-collaboration 0.1.5`。Claude 缓存从 `0.3.2／0.1.4` 更新为同一版本；两个代表 Skill 的来源／Claude 缓存 SHA-256 分别一致为 `9EEB48DD5D269638C6228B2AC83B8AABF8AF8788571A7BCA4631B9DB01B3FBF9` 与 `25BBDF3F47CE1FF6FB3C07B361B7BE8B22192A1CDC5706917E398FDD66D97D22`。

普通 Codex 的一次性全新 Session 同时发现 `github-collaboration:issue-workflow` 与 `orchestrated-collaboration:orchestrated-collaboration`。Claude 的普通自然语言询问不会暴露技能目录，因此第一次泛问得到“不可发现”；这不能区分安装失败与调用模型差异。改用两个真实显式斜杠调用后，新 Claude 进程分别成功加载两个 Skill。当前恢复后的 Orca Codex 系统清单也已注入新版。这个差异说明跨 Provider 的“发现”验收必须按各自真实调用方式设计，不能强求同一种目录行为。

PR [#40](https://github.com/Eridanus117/agent-control/issues/40) 合并后的版本化入口比三份实际入口多“持有 Issue 时扩大并行波次”一节。同步只补该已合并段落；普通 Codex、Orca Codex、Claude 三份实际入口规范化为 LF 后与 `entrypoints/agent-system.md` 的字符数和 SHA-256 完全一致：`4432` 字符，`F8DC9595FD96B4D47D1BA67240074025BC2D5EA864DBFD22C272087F0255DD9B`。物理哈希差异只来自实际入口保留 CRLF。

## 25. Orca 协调与资源生命周期的新证据

当前 Run 从 `agent-control` 跨仓调用高层 `worker-start`，即使显式给出 `agent-plugins`、新顶层 worktree 和基线，仍在创建资源前返回 `selector_not_found`。低层 `worktree create --agent` 加 `dispatch --inject` 可以交付，但多个 completed Dispatch 的标准 `worker-release` 返回 `dispatch_not_found` 且无恢复动作。错误码只保留为 Orca 1.4.177 现场证据，Skill 合同保持后端中立。

本轮还确认 Orca 消息交付是持久 Delivery 批次：未 `ack` 的旧批次会让 `orchestration check` 重放旧结果，而新结果可能只在 inbox 可见。正确做法是处理完整 Delivery 后显式 `--ack`，后续用 `check --wait` 等待，而不是循环轮询 inbox。完成确认和精确清理后，Orca 只剩两个 main worktree 与当前根终端，没有活动 Worker 现场。

GitHub CLI 已安装在 `C:\Program Files\GitHub CLI\gh.exe`，机器 PATH 也已经包含其目录；当前 Orca 进程仍找不到 `gh` 的根因是宿主在安装前启动并继承了旧环境，不是 PATH 配置缺失。为避免重复项，本轮只使用绝对路径，待全部状态持久化后重启 Orca，再在全新 Session 验证版本与认证读取。

## 26. 一次性 PowerShell 与 CLI 适配摩擦继续累积

本轮只读整合中，两次把 PowerShell `foreach` 的输出直接接到管道，均触发 `An empty pipe element is not allowed`；命令安全失败，没有写入。此前 [#30](https://github.com/Eridanus117/agent-control/issues/30) 已记录多行正文、反引号与字符串数组的三次失败／修复循环，本轮说明即使不沉淀 PowerShell 产品脚本，复杂一次性对象／管道组合仍会重复消耗上下文和重试成本。短期规则是把查询拆成简单命令，优先用 `gh --jq` 输出稳定 JSON；一旦逻辑需要复用或多步变换，改用允许的 Go、Python、TypeScript 或 Rust 小工具，而不是继续增长 PowerShell 片段。

另一次兼容摩擦来自 `gh project item-edit`：当前版本把旧式“项目 `--id` + `--item-id`”改为“item `--id` + `--project-id`”。Issue [#32](https://github.com/Eridanus117/agent-control/issues/32) 已先成功关闭，看板更新随后因未知参数安全失败；读取当前帮助后重试成功，并从远端确认“完成／当前交付验收”。该事件没有状态损坏，但说明 CLI 调用必须以当前帮助为准，不把旧会话命令形态当长期合同。

这些事件支持继续人工记录并收窄命令复杂度；它们还不自动授权通用 Shell 包装器、Hook 或调度器。是否形成窄跨平台工具，要结合后续同类事件的累计恢复时间和自然复用 ROI 再决定。

## 27. 父目标复核没有把子项完成误判成联邦能力完成

四个规范化切片整合后，当前 Session 按父目标门使用一个未参与拆分与实现的 Claude Session 对 [#26](https://github.com/Eridanus117/agent-control/issues/26) 做独立只读复核。高层 `worker-start` 在同仓仍于创建前返回 `selector_not_found`，因此降级到精确 worktree `parent-review-26-20260811` 和低层 Dispatch `ctx_ded75d7d689d`。首次 `dispatch --inject` 虽报告成功并生成 capability，Claude 终端仍停在等待提示；同范围唤醒一次后才开始工作。这进一步证明“派发 API 返回成功”不能单独代表执行者已经取得任务。

复核评论为 [#26 父目标级独立只读复核](https://github.com/Eridanus117/agent-control/issues/26#issuecomment-5251678848)。结论是 P0=0、P1=4、P2=5：三个原生交付子项和后续行为切片已经达到“当前交付验收”，可以以“规则已交付、联邦自主性未验证”的受限形式进入自然观察；[#26](https://github.com/Eridanus117/agent-control/issues/26) 必须保持开放，不能升到“样本有效”、产品采用或长期依赖。Project 已把 [#26](https://github.com/Eridanus117/agent-control/issues/26) 从“尚无实现”校正为“当前交付验收”，agent-plugins[#28](https://github.com/Eridanus117/agent-plugins/issues/28) 也从“实现完成”校正为同一级；执行状态和诉求状态没有改变。

四项未满足成功条件是：

1. A-FRESH／A-RESUME 只证明恢复合同与安全拒绝继承；领取真实分区并交付的 Session 都由中心 Session 启动，没有同一个样本完成“不经中心启动 → 领取 → 执行／派发 → 回写退出”；
2. L1“形成可执行子 Issue”分支零真实触发，也没有一次自然发生的“准入不成立 → 正确退出”反向样本；
3. 现有决定请求与回执没有记录写入者 Session 身份，跨 Session 决定腿无法从远端核验；
4. 本批次没有统一记录启动到恢复合同时间、负责人介入、完成／遗弃、纠正、误触发、共享写入异常和 Token，ROI 只能定性。

[#26](https://github.com/Eridanus117/agent-control/issues/26) 正文已压缩为当前合同，并规定下一次真实样本不为证明方案制造任务：负责人直接新建或精确恢复 Session，中心 Session 不代派发；领取评论记录启动方、Session ID、分区和停止条件；`work/current.md` 先让出该分区；同一批次按最小口径记录运行指标，跨 Session 决定需要另一 Session 显式记录身份后恢复继续。

### 27.1 本次复核又暴露两个运行摩擦

低层 Dispatch 的 `dispatch-show` 能看到 capability hash，但被派发终端发送 `heartbeat` 和 `worker_done` 时均被 Orca 拒绝为 `dispatch_capability_invalid`（capability missing）；普通 status 和 Delivery 仍可送达，被拒绝的 `worker_done` 正文也进入高优先级消息。复核评论没有丢失，但 Task／Dispatch 不能正常 settle。事件已追加到 [#31](https://github.com/Eridanus117/agent-control/issues/31#issuecomment-5251708510)。该终端报告 `ORCA_APP_VERSION=1.4.176`，与先前记录的 1.4.177 环境不同，版本按现场原值保留。

Claude 的 Marketplace 来源配置实际指向 `C:\Users\<user>\workspace\agent-plugins`，本次 Skill 从源码目录加载；版本化缓存仍存在且与源码哈希一致。当前没有偏差，但源码工作树未提交修改或分支切换可能改变新 Session 行为，而缓存版本继续显示正常。事件已追加并压缩到 [#32](https://github.com/Eridanus117/agent-control/issues/32#issuecomment-5251708961)；后续安装回执必须同时核验 Marketplace 来源、实际解析路径、提交、工作树和缓存哈希。

标准 `worker-release` 再次返回 `dispatch_not_found` 且没有恢复动作。远端评论持久化、工作树干净、单 pane 终端／worktree 身份唯一、删除连带影响四项证明齐全后，当前 Session先精确关闭该 tab，再无 force 删除 worktree并复查；最终只剩两个 main worktree 和根终端。

### 27.2 复核时间也发生了同类纠正

复核者把 Orca 无时区内部时间直接标为 America/New_York，产生错误的“09:45–10:15”区间；GitHub 评论的带时区锚点是 `2026-08-11T10:00:17Z`，即本地 `06:00:17-04:00`。原评论保留，[事实纠正](https://github.com/Eridanus117/agent-control/issues/26#issuecomment-5251742364)明确该区间无效且不影响审查结论。该事件作为 [#28](https://github.com/Eridanus117/agent-control/issues/28) 的第三个明确时间语义样本写入 [E03](https://github.com/Eridanus117/agent-control/issues/28#issuecomment-5251742718)，达到优化比较门；达到门槛仍不自动授权实现。

## 28. 环境收口通过，同时出现 Skill 描述预算信号

首次 Orca 重启确实更换了 GUI、Runtime 和 1.4.177 终端守护进程，但重启助手由旧终端启动，先继承旧 Process PATH；新 Orca 又继承该旧值，因此仍找不到注册表 Machine PATH 中已经存在的 GitHub CLI。第二次重启前，隐藏的一次性助手先从注册表重建 Machine+User PATH，再启动 Orca。恢复精确线程 `019fdbe9-4f7e-79d1-95d4-25c7a83cff69` 后，`Get-Command gh`、gh 2.97.0、Eridanus117 认证和 `agent-control` 仓库读取全部通过。该过程没有新增持久脚本、PATH 重复项或凭据修改；根因是第一次重启方法继续传播旧环境，不是 Orca 重启本身没有发生。

恢复时 Codex 同时提示 Skill descriptions 因上下文预算被缩短。当前实际启用 20 个 Plugin，其目录下 45 份 Skill 的 frontmatter description 合计约 15,790 字符；`github-collaboration 0.3.3` 约 5,455 字符，旧 `issue-to-merge 0.1.0` 约 3,510 字符，两者合计约 56.7% 且存在明显能力重叠。缓存中的 84 份 `SKILL.md` 不是实际启用数。官方文档只确认 Codex CLI 可以在 Plugin 浏览器开关已安装 Plugin且新 Session 才加载变化，没有给出该提示的公开阈值。当前只有一次提示、完整 Skill 仍可按需读取、没有错误路由样本，因此只形成“压缩自有 GitHub 路由描述，并在停用旧工作流前核对能力回退”的候选；不随机禁用其他能力。

### 28.1 已有正确规则仍被当前执行绕过

准备把上述结论压缩回 [#27](https://github.com/Eridanus117/agent-control/issues/27) 正文时，首次陈旧检查使用 PowerShell `ConvertFrom-Json`，随后把自动解析后的时间值与原始 RFC 3339 字符串比较，产生假变化并在写入前安全停止。远端正文、11 条评论、父级和 6 个子项实际都没有变化。这个错误与 [#28](https://github.com/Eridanus117/agent-control/issues/28) 已记录模式相同，而且 `issue-contract-compaction` 已明确要求比较原始标量、禁止本地化时间参与一致性判断。

根因不是提示词或 Skill 缺少规则，而是当前执行没有遵守已经加载的具体步骤；继续增加一条重复系统提示只会恶化本次刚观察到的上下文预算。当前纠正是把这次陈旧检查改为 `gh --jq` 输出原始标量，并把重复事件追加到 [#28](https://github.com/Eridanus117/agent-control/issues/28)；不把一次执行错误扩张成新的全局规则、脚本或自动化。

纠正后的原始标量检查确认 [#27](https://github.com/Eridanus117/agent-control/issues/27) 仍为 11 条评论、Parent [#6](https://github.com/Eridanus117/agent-control/issues/6) 和 6 个原生子 Issue，随后正文压缩成功；[#28 E04](https://github.com/Eridanus117/agent-control/issues/28#issuecomment-5252564055)与其当前正文把根因、无副作用事实和后续观察门持久化。#27／#28 均保持开放，Project 状态和证据等级没有因一次 Skill 预算提示或一次执行未遵守而改变。

## 29. “自然观察”再次被误解为等待负责人提供任务

上一批收口后，当前 Session 报告“负责人无需操作；下一项真实任务出现时再由新建或恢复 Session 承接”。负责人纠正：系统应该主动派生一个可继续事项并观察，而不是让负责人先知道有哪些事情可做。负责人当前看不见候选工作，本身正是经营总账、问题求解和联邦续接需要解决的产品问题。

被替代的判断是“没有新的外部任务就应退出等待”。当前入口已经明确规定：被要求选择下一项工作时，要从经营总账的未满足／部分满足诉求回到 `adaptive-problem-solving`，形成或选择一个有界 Issue；“就绪”为空不能推出没有工作。根因因此不是规则缺失，而是执行者没有在收口时正确触发已有路由，并把“不要制造证明样本”过度扩大成“不能主动选择真实有价值工作”。

当前改进不再增加重复提示词。根 Session 先从远端经营总账比较真实候选，形成或复用一个具备正向 ROI、独立写入所有权和清楚停止条件的 Issue，再通过真实协作后端交给独立 Session；根 Session 只观察、验收与父级回收。该自然运行同时检验 [#26](https://github.com/Eridanus117/agent-control/issues/26) 的未满足条件，但任务本身必须有独立产品价值，不能只为证明联邦能力而制造。

## 30. 从局部并发修补重新界定为联邦经营产品

根 Session 派发 [#41](https://github.com/Eridanus117/agent-control/issues/41) 后，负责人进一步指出：目标不是让四五个 Session 仅仅“不互相覆盖文件”，而是让负责人看到组织现状、ROI 优先级和当前可并发事项，由系统建议或直接派发多个 Agent／Session，持续形成良性循环。当前依赖 `work/current.md` 和集中研发记录的模式本身也会产生共享写入热点；只修并发保护会把产品继续缩窄。

当前恢复出的产品问题是：如何让负责人以低注意力成本经营一个多 Provider、多 Session 的 Agent 组织，同时让系统完成诉求发现、组合排序、有界派发、并发隔离、观察验收和下一轮回收。它至少包含诉求与工作图、组合与优先级、负责人交互面、执行派发、并发控制、验收学习六层；不能再用单个状态字段、单个协调 Skill 或单个共享文件替代完整闭环。

负责人已确认第一条产品边界：系统可以自动形成并派发低风险、已有授权、写入互斥的任务；只有产品取舍、授权扩大、高风险操作或真实冲突才集中请求负责人决定。该决定改变后续需求分析，但不自动授权新增调度器、锁、Hook、Runner、Project 字段或其他实现。[#41](https://github.com/Eridanus117/agent-control/issues/41) 继续作为只读证据任务，实施前先完成老板交互面、任务选择、并发所有权和验收循环的逐层对齐。

负责人随后确认老板交互面的默认模型：系统提供一个经营入口，首先呈现当前运行、推荐下一波、等待负责人、自然观察、异常与偏航；完整诉求树、Issue 和研发过程只在需要时下钻。MVP 可以优先复用 GitHub Project，但这不是提前锁定技术方案；只有实际证据显示 GitHub 观察面不足且自建 ROI 成立时，才建设新的 UI。该决定排除了“让负责人阅读仓内 current 文件或完整 Issue 树才能理解状态”的默认交互。

负责人同时确认任务选择与 ROI 的产品原则：候选先通过诉求贡献、授权、依赖、写入隔离、验收与停止条件、未决产品取舍等准入门，再按核心诉求贡献、解阻塞与复用价值、时间／Token／协调／负责人注意力成本、不确定性、风险／可逆性和并发适配组成下一波。系统优化的是单位墙钟时间与负责人注意力形成的可验收进展；额度利用率只是资源约束和次级加分项，额度临近过期可以提高有价值任务的并发度，但不能成为制造低价值工作的理由。

## 31. “共享视图单写者”被纠正为按资源分区

讨论经营入口维护时，根 Session 首先提出“各执行者即时维护局部事实，共享经营视图由事件触发的单写者投影”。负责人指出，这可能要求一个协调组竞争全局锁；即使当前 Token 充足，也会形成新的串行瓶颈。该质疑推翻了把整个 Project 或经营视图视为一个共享写入单元的设计。

当前候选改为：每个 Issue／Project 条目和真实共享资源分别拥有写入所有权，不同条目可由不同 Session 即时并发维护；全局经营视图优先通过查询组合已有事实，不持续写一份集中汇总。只有两个执行者需要修改同一合同、同一父级决定或同一共享配置时，才在该最小范围使用显式转交、条件更新或短期互斥。协调角色按任务子树和重叠资源临时成立，不建设永久中央协调者或 Project 全局写锁。低频对账可以发现状态漂移，但不承担日常事件串行化。

## 32. 元方法有路由文本，但没有充分改变实际求解行为

负责人指出，方法调研、建模和元方法已经投入接近两天，但当前对齐仍表现为连续提问，实际可感知的具体方法似乎只有 `grilling`。重新读取当前权威和 `adaptive-problem-solving 0.1.3` 后确认：系统已经定义需求／问题建模、对齐与结构化问询、受限调研、攻防／反证、ROI／选项与边界决策、最小实验／MVP 验证六类路线；但该 Skill 自身明确只是薄控制循环，不是方法库。除 `grilling` 外，其他路线还没有形成足以稳定驱动行为、产生标准可审阅产物和跨 Session 复用的具体方法资产。

因此，“已经列出六类路线”不能作为上位能力已经实现的证据。当前修正不是再做无边界的方法目录调研，也不是立即把六类都建成 Skill，而是在正在处理的联邦经营产品上显式组合三种方法：先完成需求与系统建模，再用攻防反证寻找错误边界和失败路径，最后用 ROI／MVP 分层收敛。每一步形成负责人可直接审阅的产物；只有真实运行显示某一步可复用且行为差异明显，才进入 Skill 或其他行为资产准入。

## 33. 联邦经营产品需求模型 v0 获确认

根 Session 不再逐题盘问，先给出一份完整且可反驳的产品模型。原始问题被界定为：负责人仍然承担组织记忆、任务发现、调度、冲突处理和最终验收，Agent 数量增加没有转化为自主吞吐，反而增加负责人注意力。期望结果是多个 Provider、Session 和 Agent 在负责人给出目标、边界与资源政策后，持续完成“未满足诉求 → 候选任务 → 准入与 ROI 组合 → 任务／资源认领 → 多 Agent 执行 → 审查验收 → 更新诉求与证据 → 下一波”；负责人只通过一个经营入口处理真正需要人的产品决定和异常。

模型把负责人、规划者、派发者、执行者、审查者和维护者定义为随当前合同成立的角色，而不是固定 Session 身份。GitHub Issue／PR 承载诉求、合同、授权、决定和交付证据，Project 提供经营投影，Orca 和资源观测工具提供实时运行态，仓库承载权威／知识／行为资产／分区研发记忆；`work/current.md` 降级为临时恢复缓存，不再作为实时协调总线。模型同时加入六类反向约束：不制造自指元任务、不伪造精确 ROI、避免重复领取、区分持久事实与运行态、按风险收取流程税、自动派发不越过授权，以及不把审阅压力集中给负责人。负责人已确认该 v0 模型，下一步推导多状态机、并发协议并用单 Session、五 Session、协调者消失三种场景反证。

## 34. 四个反例触发五 Session 双轮攻防

负责人没有接受状态机与并发草案直接进入方案比较，而是补充四个会改变架构的反例。第一，纯 ROI 排序可能让长期观察、暂缓或即时收益较低的事项永久饥饿。第二，正常人类协作既有事前划界，也会在可合并工作上乐观并行、事后协调；全部事前认领可能僵化，混合协议又可能增加几何复杂度。第三，精确 resume 的首要价值是恢复同一个对话参与者，保留需要来回三四轮的上下文；它不能被“新 Session 从 Issue 恢复任务”替代，误关终端也不应自动释放 Session 身份。第四，`work/current.md` 可能完全可以被仓外 Issue／Project 与 Orca 状态取代，继续把它作为每个 Session 的入口会制造共享写热点。

根 Session 接受这些反例，撤回“现有状态与并发模型可以直接作为下一阶段基线”的结论。负责人要求多个 Session 反复攻防后敲定，因此建立 [#42](https://github.com/Eridanus117/agent-control/issues/42) 作为 GitHub 审阅合同：第一轮五个独立 Session 分别攻击任务饥饿、混合并发、Session 生命周期、控制面/current 去留和整体产品 ROI；第二轮至少两个未参与者交叉检查组合一致性与尽量不自建的替代。所有执行者本地只读，每人只向 [#42](https://github.com/Eridanus117/agent-control/issues/42) 发布一条带轮次和角色的评论；根 Session 只观察、验收、回收与综合。第一轮使用 `run_e8e032ab6ae6` 同时派发五个 Claude／Codex Session，各 30 分钟上限，不创建额外 worktree。

## 35. 从单一控制面攻防扩大到 Agent 系统全局研究

负责人观察到当前讨论仍主要受既有联邦控制面草案限制，要求把视野扩大到当前 Agent 系统的全部事项，并允许讨论本身多次拆分。被替代的判断是“等 [#42](https://github.com/Eridanus117/agent-control/issues/42) 两位裁决者把五份攻防压成一个模型后，再围绕该模型继续”；它可能只得到既有局部设计的内部一致解，遗漏知识、方法、长程工作、资源运营、配置治理和外部产品复用之间的全局取舍。

当前采用两条互补路径。[#42](https://github.com/Eridanus117/agent-control/issues/42) 继续完成第二轮，专门暴露并裁决旧草案中的组合冲突；新建 [#43](https://github.com/Eridanus117/agent-control/issues/43) 作为全局研究与创新合同，按研究、创新、交叉审查三阶段推进。研究阶段八个独立 Session 分别覆盖需求／产品、知识／研发记忆、方法／自我改进、长程工作／Session、协作／并发、资源／度量、配置／Skills／Plugins 和平台／外部生态，只记录事实、约束、现有能力、缺口与证据，不先给方案。研究基线完成后，新的 Session 再提出彼此真正不同的整体架构；最后由未参与方案提出的 Session 从全局一致性与能力回退、复用／自建 ROI、负责人注意力与真实吞吐三个方向交叉攻防。

这里的“全局”是搜索边界，不是假定可以数学证明唯一最优。停止条件是三阶段完成后给出可追溯的帕累托边界、当前推荐、被拒绝方案、关键未知和分阶段投资门；不进入第四轮无界元讨论。负责人此次授权不包含实施、修改权威、改变 Project 产品语义或关闭 [#42](https://github.com/Eridanus117/agent-control/issues/42)／[#43](https://github.com/Eridanus117/agent-control/issues/43)。根 Session 独占非权威研究／创新工作文件和综合评论；所有研究者本地只读，只写各自一条远端评论，避免扩大共享写入冲突。

## 36. 协调权交接给 Fable 5 Session 与 R 阶段收敛

负责人于 2026-08-11 指定一个新的 Claude（Fable 5）Session 接管 Agent 系统全局研究与方案创新的协调；原 Codex 根 Session 退为只读后备与故障接管。绑定动作由后备 Session 代为完成：`run_dcd99bacfc80` 的 coordinator_handle 变更为 Fable 5 终端 `term_30a4317a-79a0-4ead-84bb-9692496ca347`，consumer_generation=2。新协调者按入口完整重读 README、authority/00-map、current、[#42](https://github.com/Eridanus117/agent-control/issues/42) 与 [#43](https://github.com/Eridanus117/agent-control/issues/43) 远端正文及全部评论后，在 [#43](https://github.com/Eridanus117/agent-control/issues/43) 留下交接确认，不沿用交接提示中的旧事实覆盖远端。

负责人同时新增四条原则并被持久化到交接确认与 current：多视角攻防寻找全局最优与帕累托边界、本轮必须收敛并交付重评触发条件、自我反思是周期性能力、codex-marketplace 渐进脱离作为研究候选纳入 [#43](https://github.com/Eridanus117/agent-control/issues/43)。第四条使 R7／R8 已记录的 marketplace 事实（无仓级 LICENSE、非官方 schemas、issue-to-merge 改写自第三方、Claude 无等价物）从背景事实升级为 I／C 阶段必答项。

R 阶段按合同完成：八个研究 Session 全部交付单条自足评论并 worker_done。[#42](https://github.com/Eridanus117/agent-control/issues/42) 第二轮 F／G 也在同窗口交付。运行资源收口再次复现既有断裂：标准 `worker-release` 对低层 Dispatch 在本批返回 4 次 `dispatch_not_found`（F、R5、R4、R8；累计 10 次），全部按"交付已持久化、无 Worker worktree、终端身份唯一"三查后精确关闭 tab，共关闭 9 个终端；该模式已写入研究基线跨域约束，成为架构创新的输入而不再只是摩擦记录。

综合产物分两层：完整压缩基线（八条 R 评论＋[#42](https://github.com/Eridanus117/agent-control/issues/42) 七条攻防评论索引、十一条跨域约束、分级未知、验证面 X1–X7、[#42](https://github.com/Eridanus117/agent-control/issues/42) 已裁决候选）写入被 Git 忽略的 research.md；可追溯短摘要发布为 [#43](https://github.com/Eridanus117/agent-control/issues/43) 评论。综合时的关键编辑判断是把"低层收口断裂、写入安全纯合同、身份四层断裂、原子认领不存在、出口债先于入口机制"这五组分散在不同评论中的事实提升为跨域约束，因为它们同时约束全部六类候选架构；I 阶段方案被要求显式声明依赖哪些未知，避免把未验证能力当作已有基础。

本批次同时是一次真实的跨 Provider 协调权交接样本：交接确认、Run 绑定复核、收件箱清空、资源收口、持久状态更新在同一 Session 内完成；但绑定由后备 Session 代为执行，且交接双方的身份链仍只存在于 Run coordinator_handle 与 current 文本中，与基线跨域约束 3（身份四层断裂）一致。

## 37. I 阶段六案收敛与派发路径新证据

I 阶段按合同派发六个未参与 R 的新 Session（四 Claude 二 Codex），全部经高层 `worker-start --worktree current` 完成，六案在约 15 分钟并行窗口内全部交付自足评论。六案形成真实设计分歧而非局部变体：I1 把 GitHub 设为唯一持久控制面并把无 CAS/无强制门写成公开边界；I2 把执行事实与意图事实分家（Orca 记执行、Issue 记意图、单向投影），断言约束 4 是"抽象齐全但 worker-abandon 从未被走过"；I3 主张机制面单调收缩并显式声明规模上限；I4 以负责人注意力为唯一被控变量建三段闭环，发现 orca automations 第一方调度器与 --precheck 天然满足 X5；I5 提出可替换生态内核与 Orca MIT Fork 主运行时，给出 17 个外部 Skill 的完整能力族映射；I6 把渐进投入原则升级为能力×承载层投资表加三不变量与波次计数重评泵，直接机制化负责人的周期性重评原则。判别轴、共识面、K1–K8 冲突与 28 项边界修改请求已综合进 innovate.md 并发布对比摘要。

派发过程本身产生三条会改变架构判断的运行证据。第一，高层 worker-start 本批 9/9 成功（I 六个 + C 三个），worker-release 对高层 Dispatch 正常释放并自动关闭终端归档 transcript——R5 记录的低层路径 10 次 dispatch_not_found 断裂在高层路径不存在，"人工精确关 tab 是唯一可靠收口"的结论从此只适用于低层注入路径。第二，发现新竞态：worker-start 的 input_accepted 只是注入受理回执，Claude TUI 有 5/6、Codex 有 1/3 出现任务文本停在输入框未提交，负责人肉眼发现首例，协调者以 terminal send --enter 补交后全部恢复；对策（派发后核对终端标题）已写入 current。第三，被 terminal send 干预过的终端 worker-release 可能返回 retained 需手动关闭（I2/I4），但非绝对（I3 正常 released），语义未完全归因。另有两条契约面发现：dispatch --dry-run --return-preamble 使 X1 可无副作用化；worktree ps 的 agents[].agentType 已填充，R5 F15 的"agentKind 全 null"只成立于 terminal list 面。

C 阶段三个交叉审查 Session（C-A 一致性/claude、C-B 复用 ROI/codex、C-C 注意力吞吐/claude）已随即派发，Enter 竞态在三个终端再次出现（含 Codex 首例）并全部补交恢复。协调 Session 在等待窗口完成了 X1 前半（preamble 可重产）与 X2（4/4 观察中条目可写合格唤醒谓词）两项近零成本核查，结果连同 X3 口径草案与本波注意力样本存档于会话 scratchpad，将并入 C 阶段综合。

## 38. C 阶段收敛与本轮停止

C 阶段三个未参与 R/I 的 Session（C-A 一致性/Claude、C-B 复用 ROI/Codex、C-C 注意力吞吐/Claude）在约 20 分钟内交付三条交叉审查，全部经高层路径正常收口。三案在推荐组合上独立收敛到同一形态（C-B 的点 A、C-C 的 P1⊕P2 出口段、C-A 的五层组合是同一答案的三种切法），并各自贡献了单案无法自查的发现：C-A 发现四案引用的「五项共享单点清单」实为四份互不相同的外延且都不等于入口正文六类、三案独立收敛到波次回执对象、约束 4 只被 I2 一案正面回答；C-B 把 28 项边界请求压到 2 个决定包并统一 marketplace 七步协议；C-C 用一条只读命令产出本波一手度量（34:1 压缩比、200 秒并行落地窗口），以控制理论理由否决 I4 全案（AIMD 分母在本波未定义、整定时间长于系统漂移周期），并证明 X3 分母侧可从远端零成本派生。

最终综合把三案合并为：唯一推荐组合「GitHub 持久主干＋分层治理＋窄运行适配」、最强替代修正版 I3、D1–D6 负责人最小决定集（28 项修改请求合并去重）、六项授权内立即动作、明确不做清单、三类重评触发。综合刻意保留三条未消解张力而不是假装收敛：C-C 的最强反方指出负责人本波行为模式（主动发起波次、要求扩大并发）更像「注意力充裕、吞吐受限」，若 X3 分类证实则全部「少打扰」式裁决方向反转；C-A 指出高层路径 6/6 成功可能使约束 4 只是低层用法错误的残影（S-2 一条命令可裁）；C-A 同时自曝「能力回退」在无度量系统里不可证伪，全部保守裁决须在 X3 落地后重检。

本轮方法论样本：负责人四条新增原则全部被机制化——多视角攻防产出了真实帕累托前沿而非单方案；收敛以 D1–D6＋触发条件的形式落地而非无限元循环；周期性重评被写成由外部事实激活的可判定触发；codex-marketplace 处置从「倾向」变成有零调用证据、统一协议和单件决定门的渐进路径。全轮 17 个执行 Session、约 20 万字符一手评论压缩为负责人入口约 1.2 万字符，R→C 总墙钟约 70 分钟。本 Session 现在停止推进，等待负责人对 D1–D6 决定；协调所有权与后备关系维持 current 所述。

## 39. D1–D6 批准消费与负责人可读性纠偏

负责人回复「D1-D6 6项批准」，同时给出一条行为反馈：最终综合的中间部分能看懂，但最后部分「黑话有点多」、读起来吃力，虽不影响授权意愿，但对负责人不够友好，甚至设想「找个 agent 一起带着我读」。决定按 issue-workflow 消费：白话版决定回执发布至 [#43（每项决定配一句「批准了什么、系统会怎么变」）](https://github.com/Eridanus117/agent-control/issues/43)，旧等待清除；实施合同 [#44](https://github.com/Eridanus117/agent-control/issues/44) 建立为 [#6](https://github.com/Eridanus117/agent-control/issues/6) 原生子 Issue（Project 的 Auto-add sub-issues 内建规则自动将其收入观察面——顺带实证了 R8 记录的内建 workflow 确实生效），七个分片 S1–S7 覆盖六项决定与全部授权内动作。

可读性反馈按 self-improvement 流程处理。被推翻的假设是「对 Agent 高效的压缩写法（内部编号、代号引用）同样适合负责人审阅面」——C-C 曾把 34:1 压缩比记为注意力贡献，但压缩优化的是信息密度，没有区分受众；R/I/C 中间产物受众是 Agent（编号互引合理），最终综合的首要受众是要做决定的负责人，却沿用了工作面写法。根因定为 Skill 缺口：github-collaboration 的决定请求规范只约束结构（背景/推荐/替代/收益代价/所需回复），不约束语言与受众。修 Skill 无当前授权，因此本轮只做三件事：本 Session 立即切换写法（决定回执即第一个真实样本）；候选规则（内部编号当场白话解释、开头或结尾无术语总览、只读总览即可决定）作为 [#44](https://github.com/Eridanus117/agent-control/issues/44)-S7 挂负责人确认；证据入本记录。这条反馈与 C-C 的 T1 张力（注意力 vs 吞吐）同源互补：负责人愿意授权说明决定通道是通的，吃力的是解码成本——X3 口径里「打扰次数」之外，单次打扰的解码成本是隐藏分量，S7 规则如获确认将直接压低它。

### 39.1 负责人审阅面语言的第二轮校准

负责人对首版白话决定回执给出再纠偏：过于直白，必要上下文有所丢失，整体语言不够信达雅。两轮反馈合起来框定了负责人审阅面的收敛区间——第一轮排除术语堆砌（编号密写、代号互引），第二轮排除过度口语化（以「小票」「路标」等生活化比喻替代正式概念名，牺牲了准确性与专业质感）。收敛点是专业书面语：信（保留正式概念名与完整上下文）、达（编号首次出现即内联说明、正文自足）、雅（行文书面、密度适中、附可独立支撑决定的总览）。[#44](https://github.com/Eridanus117/agent-control/issues/44) 的 S7 候选规则已按此定型；本次不再重写既有回执（决定已消费，重写只制造噪音），修正只作用于规范本身与后续文本。方法论记录：受众校准是区间搜索而非单向修正，单轮反馈后的矫枉过正是可预期的中间态，第二轮反例到达后才应定型规则——这一样本支持 S7 规则文本中「术语堆砌与过度直白同为偏差」的双向表述。

## 40. 实施第一波收口：D1–D6 全部落地与三项行为纠偏

D1–D6 批准后的首个实施波以七个交付分片全部合并收口：权威文本批（PR [#45](https://github.com/Eridanus117/agent-control/issues/45)）、入口生成器（PR [#47](https://github.com/Eridanus117/agent-control/issues/47)，合并当日即完成首次真实运转——检出并刷新三份过期安装拷贝）、current.md 降级为 659 字节指针壳（PR [#48](https://github.com/Eridanus117/agent-control/issues/48)，与 [#47](https://github.com/Eridanus117/agent-control/issues/47) 的验证脚本冲突按合并后实测值解决）、语言规范与旧表述同步（agent-plugins [#34](https://github.com/Eridanus117/agent-plugins/issues/34)/[#35](https://github.com/Eridanus117/agent-plugins/issues/35)，三端安装逐端指纹核验）、插件盘点与探测批两条档案。首张波次回执（D3 首次实测）发布于 [#44](https://github.com/Eridanus117/agent-control/issues/44)：打扰负责人 14 次、交付 7 项、出口债 0、异常 3 项全处置。

本波沉淀三类跨 Session 教训。其一，协调循环缺陷：任务依赖解锁后未立即派发（S1 合并后 S2 等了负责人催促），根因是处理循环缺「完成即扫描解锁」步骤；当场修正并记入回执，复发则升级共享流程资产。其二，负责人可见面语言连续四个样本（综合术语过密、白话矫枉过正、Worker 英文 PR、Issue 无人话定义）收敛为 S7 信达雅规范并已安装生效；派发合同显式加入「负责人可见面一律中文」。其三，两个平台陷阱：GitHub 关闭关键词解析不识别否定句（「does not close [#44](https://github.com/Eridanus117/agent-control/issues/44)」照样关闭 [#44](https://github.com/Eridanus117/agent-control/issues/44)，对策=引用合同禁用关键词模式）；Claude 端 plugin install 对已安装项是无操作、必须先 uninstall 才真正升级（假阳性陷阱，W7 发现）。派发提交竞态（Claude 10/11）按 D6「先上游」策略提交为 stablyai/orca#13821——依赖策略的第一个自然实例。

负责人行为信号持续指向吞吐优先（主动催促 8 次 vs 被动决定 4 次，连续第四波），Fable 5 全额度指示已生效为派发默认；T1 张力的正式翻转检验挂在下一波 X3 数据。Orrery 外生任务经调研（10 源注册表、509 篇实测、12 项脱离要素、三案骨架）后由负责人决定搁置，成果持久化于 [#46](https://github.com/Eridanus117/agent-control/issues/46)，X4 样本回到待选。

负责人波次收口后补充一条运行面惯例：Orca worktree 命名改为「issue-<编号>-<中文slug>」（如 issue-44-权威文本批），提高侧边栏可读性；下一波派发起生效。

## 41. 调研与治理波：外部印证、非中心样本与一次协议级错绑定

负责人指示「额度将刷新、调研未来必做、现在就做」后，本波以十余路 Fable 5 并发完成：八分区外部调研（元方法四路线资产、有效性度量、自我改进前沿、记忆产品全景、编排生态）交付跨域综合——五项自有核心设计（知识两门准入、注意力事件计数、人门控沉淀、GitHub 持久+运行时可替换、禁伪造 ROI）全部获得独立外部证据印证，其中 METR 随机对照实验的「自评与客观测量方向性背离」与四大记忆产品「无写入门+基准互相揭短」是最有力的两条。正式知识库经首批教训准入从 1 条扩到 6 条；方法资产批把攻防构件表、预注册实验卡与两条协调循环规则写入三个共享 Skill 并三端安装——负责人两次「催一下动一下」的纠偏就此从会话记忆升格为系统行为。影子对照第一批同时拿下两个里程碑：非中心派发的首个完整样本（局部协调者自建 Run、自派 Codex Worker、验收释放全链自主），以及影子方法的价值实证（外部对照抓出自有研究一处实质误报；共同命中的 fence 解析缺陷经修复批闭环合并）。知识召回对照实验用三波真实语料给负责人的域结构+混合召回设计做了首次实测：向量 17/20、词法与向量失误完全互补、理想融合 20/20，GitHub 原生搜索 3/20 双重失败——三层分工设计（过程层/蒸馏层/检索层）随之成文待确认。

治理线由负责人两个判断驱动：「Project 乱是 Issue 乱的投影」经调研实证为六个可计数模式（18 种前缀风格、双分类法漂移、label 未用、父子链散文化、粒度混排、正文无压缩水位），产出七类前缀闭集+两维 label+原生子链+生命周期规范的候选包并获负责人四项批准，存量清理切片随即派发；「合同满足不该问我」固化为预授权关闭谓词并首批消费八项（含挂账一天的 agent-plugins[#19](https://github.com/Eridanus117/agent-plugins/issues/19) 与四个验收中条目），Project 经全量对账恢复 48 条目一致。

本波唯一协议级失误：负责人「D-a 同意，D-b 选 A…」被错误绑定到三层设计的决定点（实际为治理调研——其建议回复模板与负责人回复逐字一致），已双侧回执更正。根因是两组同格式编号并存时决定协议的「唯一紧邻」判据失效；修复候选为决定点编号全局唯一化，列入 Skill 维护批次。该样本与波次回执一并作为决定协议的第一个真实反例入档。

## 42. 治理落地与外部插件终局

治理清理切片把负责人批准的四决定落为现实：15 个类型/领域 label、11 个标题按七类闭集统一、17 个开放 Issue 双维打标、9 个默认 label 删除——Issue 列表自此一眼可读、可按维度过滤。三层设计的四个决定点经负责人批评（「分析太少、看不到备选比较」）撤回重构：按决定协议完整形态重发（备选含维持现状、逐项比较、推荐置信、最强反方、翻转条件、一手来源升级与召回实验修正），负责人一次批过全部四点——决定质量与决定效率同步提升的正循环样本。该批评连同错绑定反例催生 Skill 维护批次三（gc 0.3.6 三端安装）：三条件关闭预授权谓词、决定编号 Issue 前缀唯一化、决定请求五要素转呈验收成为系统行为。

codex-marketplace 三件插件走完「盘点→影子对照→吸收核对→卸载」全程：21 个 Skill 通读后的三项独立重写清单（research 验证纪律分节、code-quality 检查维度、PR 判据与分支维护链）落档待下批实施，两个 Codex 运行面的插件、marketplace 注册与缓存全部移除并复核，9add1cf 内容快照固定为回滚依据——负责人原则④从「倾向脱离」到彻底完成，全程零能力回退（吸收清单在手、回滚可逆）。模型分配经负责人指出后修正：本波 Codex 承担五分之二执行路，「审查类优先异族」进入协调实践。

本波一起协调者事故入档：给 Status 字段加「长期」选项时未携带既有选项 id，ProjectV2 的全量替换语义清空 40 条状态值，负责人现场发现；40/40 按已关闭状态与维护批快照重建，教训（选项更新必须携带全量 id；共享单点破坏性写先验证接口语义并小样本演练）列为知识准入头号候选。连同前一波的决定错绑定，本 Session 的两起协议/操作级失误都遵循了同一处理链：当场恢复、根因入档、规则化修复进入共享资产——失误在这套系统里的正确归宿被两次实践验证。

## §43 决定落地与治理同构波（2026-08-11 第四波）

- 44-Db／44-Dc 由权威批次 Worker 按五要素成稿、负责人「同意」后消费，PR [#59](https://github.com/Eridanus117/agent-control/issues/59) 落 `00-map.md`：守恒律基线更新为对账基线 10314 字节（注明 S1 固化值＋S2 合法净增 73 构成与「未批净增默认回退」）；CODEX_HOME 末句改为 Junction 单份存储事实句附失效条件。
- 负责人指令两次澄清：先纠正「80% 周限」是消耗目标而非风险提醒——由此立规「指令入档必附逐字原话，解释与原话分开写」；后澄清动因为 Codex 刷新券当日过期，执行面改为 Codex 一律优先。
- 治理三件套齐备：七份中文 Issue 模板两仓完全一致（PR [#57](https://github.com/Eridanus117/agent-control/issues/57)、agent-plugins[#40](https://github.com/Eridanus117/agent-plugins/issues/40)）；gc 0.3.8 建 Issue 骨架统一任何 Skill 路径的前缀闭集／双 label／「关联 #N」／原生子 Issue／Project 投影（agent-plugins[#39](https://github.com/Eridanus117/agent-plugins/issues/39)）；14 个 label 两仓对齐。
- [#44](https://github.com/Eridanus117/agent-control/issues/44) 分片审计定案：S1–S5、S7 收口，S6 转原生子 Issue [#58](https://github.com/Eridanus117/agent-control/issues/58)；正文分片表退役为收口摘要。
- 知识两道门首次拦截上游错误：K4 增补 Worker 复核发现本方验收记录「两端均保留历史副本」过宽，实测收窄为 Claude 保留多版本、Codex remove+add 清除旧版（两次观察一致）；勘误后入 K4（PR [#61](https://github.com/Eridanus117/agent-control/issues/61)）。K7 ProjectV2 全量替换包同波入库（PR [#56](https://github.com/Eridanus117/agent-control/issues/56)）。
- X3 四波趋势：单波打扰 14→约10→8→5，单波合并交付约 3→4→5→8，每交付打扰约 4.7→0.6；判定支持 T1（吞吐受限而非注意力受限），重评触发已写入第四张回执。
- 过程新样本：回车竞态 Codex 端 1 例（复现即愈）；`user_takeover→retained` 释放语义首次观察；平行评估 Session（负责人另授权，挂 [#7](https://github.com/Eridanus117/agent-control/issues/7)）无冲突协作首例。

## §44 扩产能与体系化波（2026-08-11 第五、六波合记）

- 负责人方向：「我想继续」→枚举总账（[#10](https://github.com/Eridanus117/agent-control/issues/10) 唯一未满足）→三合同波；「ABC D＝知识库建回来、Orrery 准备废弃」→四路扩产能；「grilling 是标准」「排查各面方法学缺口」→跨域体系化。
- 知识域：K8–K10 入库；[#69](https://github.com/Eridanus117/agent-control/issues/69) 设计发现 kb-note-v1 为检索投影（非无损源档）→双通道迁出定案；69-D1..D5 全批；authority/01 检索层重审为公共／私域两条并列边界（PR [#72](https://github.com/Eridanus117/agent-control/issues/72)）；[#46](https://github.com/Eridanus117/agent-control/issues/46) 重开为重建主合同，M0 命令级清单等 Mac 执行。
- 元方法域：[#65](https://github.com/Eridanus117/agent-control/issues/65) 反思节律（65-D1 批准，三波预注册实验启动，首卡随第五张回执）；[#70](https://github.com/Eridanus117/agent-control/issues/70) 方法模型（类型学五型、方法卡 schema、五层承载；70-D1..D3 入合并决定包）。
- 攻防审计：16 项→确认 10（高 4：L1-1 双现在时、L2-F1 非 PR 出口、L3-1 授权身份绑定、L4-3 描述预算）、存疑 4（带补证设计）、驳回 2；修复权威批＋Skill 批（gc 0.3.9／oc 0.1.8）在途；入口批待负责人点头。
- 资源域：[#63](https://github.com/Eridanus117/agent-control/issues/63) 首报（17%@13:59 EDT、券 8-12 14:03 过期）；[#67](https://github.com/Eridanus117/agent-control/issues/67) 预注册实验首次兑现「测量失效分支」价值（快照缓存+并发污染→拒绝假映射）。
- 协作样本：Worker 首次自主消费关闭谓词（plugins[#41](https://github.com/Eridanus117/agent-control/issues/41)）；跨 Session PR 验收顺序失误一例（[#71](https://github.com/Eridanus117/agent-control/issues/71) 先并后批，对方知情接受；教训=先查对方合同未消费决定点）；调研类三连落谓词枚举外（与 L2-F2 同源，入修复批）。
- X3 五波趋势：打扰 14→10→8→5→5，交付 3→4→5→8→11，每交付打扰 4.7→0.45；T1 持续成立。

## §45 体系化完工与夜间自治启动（2026-08-11 第六波）

- 元方法域从「最薄」到完工：30 张方法卡登记面（aps 0.2.0）、authority/03 边界案文、「渐进默认＝偏差」入 ROI；negative→positive 用时一天。
- 攻防审计 16 项全处置：存疑四项补证（驳回 1/确认 2/缩限 1，含 L4-1 四臂实验读取省 15.8%）；修复四批全落（权威/Skill 六/入口/总图索引化——总图 −37.6%、54 块逐段搬迁）。
- 负责人夜间授权三方审阅批准制（原话逐字入 [#44](https://github.com/Eridanus117/agent-control/issues/44) 授权记录）；协调者设三条专属底线（改授权本身/不可逆对外/金钱）；巡检切目标导向（券 8-12 14:03 EDT 前尽量用完周限）。
- 教训：entry_sync generate 属整合步骤不得进 Worker 分支合同（预合并分叉一例）；「Ready 终端＝交付待收」第三次复现定型为稳定信号。
- 79-D1 五主两情境指标口径生效，第六张回执首行落数（M1=16、M2≈0.81、M7=1）。
- 夜间在途：[#85](https://github.com/Eridanus117/agent-control/issues/85) 预演实战、[#86](https://github.com/Eridanus117/agent-control/issues/86) 假设检查实战、[#87](https://github.com/Eridanus117/agent-control/issues/87) 蒸馏批二。

## §46 夜间自治收官（2026-08-11 夜第七波）

- 负责人授权三方审阅批准制后就寝；纯自治段打扰 0，约 18 项交付闭环。
- 三方审阅制经两例运转（90-D1 M43、94/95-D1 承载）后，被协调者主动发起的 [#100](https://github.com/Eridanus117/agent-control/issues/100) 攻防审计证伪其身份链/盲评可执行性（C1/C2/C3）；据此冻结机制/授权类三方消费、留负责人 P0 授权批（[#44](https://github.com/Eridanus117/agent-control/issues/44) issuecomment-5259434014），纯技术 bug（C8 假绿/C6 水位/C9-C10 K12）自主修。
- C8 修复恢复守恒律真实性：此前 description 预算检查被 70-D 过期例外「假绿」旁路，aps 1508→997 字节、断言反转。
- 检索双实验（[#98](https://github.com/Eridanus117/agent-control/issues/98) 11 包、[#102](https://github.com/Eridanus117/agent-control/issues/102) 50-800 篇）一致负结论：结构化技术语料向量对 BM25 无稳定净增益、不设篇数阈值→K14；快照缓存语义→K13；知识库达 14 包。
- 65-D1 三波反思实验收官：三卡分别在负责人指出前捕获 PR 验收顺序、入口 generate 排序、三方身份缺陷，零新增打扰→按预注册判定反思卡有效；常规化归负责人。
- 燃烧天花板诚实记录：Codex 单任务消耗限制使 1%/40min，外推不达 80%，停止凑数造任务。

## §47 夜间自治整夜复盘（2026-08-11 夜 ~ 08-12，第五波后至今）

**授权转折**：负责人授予三方审阅批准制后就寝，协调者进入夜间自治（三条专属底线：改授权/不可逆对外/金钱留负责人）。

**核心里程碑**：
- **三方审阅制自审→自修闭环**：协调者主动发起 [#100](https://github.com/Eridanus117/agent-control/issues/100) 攻防审计审自建资产，审出三方机制自身 C1/C2（身份链不同构、非盲评）缺陷并主动叫停冻结机制类三方消费；起草 P0 方案（[#109](https://github.com/Eridanus117/agent-control/issues/109)）→负责人亲批 109-D1（C3=A）→实施 [#110（CF-6 0.2.0 四机制+TS 验证器，#90 反向绑定样本判失败回归通过）](https://github.com/Eridanus117/agent-control/issues/110)→授权状态更新生效。系统能审出并修复自己核心机制缺陷。
- **攻防 C1–C11 全清**：C6/C8(假绿)/C9/C10(K12)/C7(去重)技术修复合并；C1/C2/C3(P0)机制修复生效；C5(CF-6 降 M0)含在 [#110](https://github.com/Eridanus117/agent-control/issues/110)；C11(巡检唯一定位面 [#113](https://github.com/Eridanus117/agent-control/issues/113))。
- **知识域三负结论收敛**：[#98](https://github.com/Eridanus117/agent-control/issues/98)/[#102](https://github.com/Eridanus117/agent-control/issues/102)/[#121](https://github.com/Eridanus117/agent-control/issues/121) 一致——结构化技术语料 BM25 词法足够，向量层等真实改述漏检再评；省一次可能白建的向量层。知识库 K1–K16（+K15 自审/K16 机械身份），README 十组导航。
- **方法卡验证率 13%→27%**：四批实战全程有据升级（M0 22/M1 8），缺证据的如实保持 M0 不硬升。

**多次自我纠偏（教训）**：①凑数→诚实收敛→过度保守→起草准备是正当工作（等待≠停止思考能做什么）；②「Codex 不能联网」未核验假设被 [#115](https://github.com/Eridanus117/agent-control/issues/115) 实测证伪（能联网）——能力假设必须实测；③状态同步滞后（[#66](https://github.com/Eridanus117/agent-control/issues/66)/[#63](https://github.com/Eridanus117/agent-control/issues/63) 验收中、[#95](https://github.com/Eridanus117/agent-control/issues/95)/[#44](https://github.com/Eridanus117/agent-control/issues/44) 陈旧）被负责人两次发现——消费/关闭后立即同步全状态面；④价值门：推荐维持现状、不决策即默认的（112-D1/121-D1）不升级为负责人决策点；⑤三方审阅用于「需批准的决定」，非常规交付验收（概念澄清）；⑥不为凑 ≥5 稀释「真实」标准（守住真核心）。

**未解决（诚实）**：X4 外生样本 [#58](https://github.com/Eridanus117/agent-control/issues/58) 空（对真实工作有用未验证）；有效性多停当前交付验收无产品采用；三方新机制 CF-6 M0 无自然样本；K12 无真实继任；L3 离线唤醒缺失（[#117](https://github.com/Eridanus117/agent-control/issues/117) 调研 A）；单点 Orca 依赖（[#112](https://github.com/Eridanus117/agent-control/issues/112) 维持上游优先）；Codex 快照刷新间歇卡住（燃烧读数不可靠）。

**当前状态（复盘时）**：fleet 收敛至 1（[#125](https://github.com/Eridanus117/agent-control/issues/125) 转换器压测），真核心工作枯竭；待负责人决定 117-D1(L3)/120-D1(资源规则)；Codex 券 08-12 14:03 EDT 过期（约 16h）。协调者判断：向内自建设已近尽头，向外证明（X4/知识库迁入/L3）钥匙在负责人手，比继续烧券更有价值。

## §48 三方审阅首个真实样本 + 竞争力定位 + 知识库产品决定（2026-08-12 凌晨）

**三方审阅 CF-6 首个真实自然样本（补 §47「CF-6 M0 无自然样本」）**：P0-1（迭代回执 [关联 agent-plugins[#59](https://github.com/Eridanus117/agent-plugins/issues/59)]）与 P0-3（类型化派发 [关联 agent-plugins[#60](https://github.com/Eridanus117/agent-plugins/issues/60)]）两个系统优化地基走修复后的三方审阅。协调者密封判定（先封存后揭示，sha 846967f3 / 2a3bf38d）均为「认可」，但独立评审席给出两个**成立的否决**：
- P0-1：实现悄改 [#135](https://github.com/Eridanus117/agent-control/issues/135) 十字段权威协议——把 `validation`（预注册判据）、`roi`（返工/注意力税）折入 `acceptance`，另擅加 `parent_goal`/`evidence_level`，符合性测试只固定改写后清单，无授权 schema 改写。协调者逐字段复核（[#135](https://github.com/Eridanus117/agent-control/issues/135) 原集 trigger/object/finding/route/authority/validation/landing/acceptance/recheck/roi）确认 divergence 属实，且折叠掉的正是证据诚实核心，实质回退。
- P0-3：标题错配仍确定漏检——断言核对的是终端标题而非「实际 Issue 标题对独立冻结期望值」，P0-3→P0-1 误传可让编号/父级/五字段/写后回读全通过（今晚 [#140](https://github.com/Eridanus117/agent-control/issues/140) 正是这样被误标）。两独立席 2 认可+1 否决，真实分歧非橡皮图章。

处置：两 Issue 各发「先揭示密封、后裁决」评论（诚实承认协调者认可为错），派修复席按否决点精确修订（P0-1 对齐 [#135](https://github.com/Eridanus117/agent-control/issues/135) 十字段、P0-3 冻结期望标题+负向测试），修订后原否决席复核；三席一致才落地。**价值**：机制在第一个真实样本就挡住起草席与协调者双漏的实质缺陷，CF-6 M0→M1 一手证据。**教训（可跨任务复用）**：协调者评审「结构看起来成立」不能替代「逐条核验被断言的具体事实」——我在密封判定里白纸黑字写「忠实于 [#135](https://github.com/Eridanus117/agent-control/issues/135) 十字段」却未核验。

**外部框架竞争力定位（答负责人问，证据=公开资料核验未实测）**：我方独特点非运行时更强（LangGraph/Letta/AutoGen/CrewAI/Agents SDK 皆有 checkpoint、跨线程 store、durable state、恢复），而是 **GitHub 存意图/授权/决定/验收、Orca 只存活跃执行事实、Project 只作观察面——运行面消失后新 Session/模型仍按合同续接**；且我们独特地治理「Agent 系统自身如何改变」（权威根、共享单点单写者、规则置换律、三方审阅身份绑定、先密封后公开，分离工具许可/产品授权/事实可信度）。诚实定位=**治理型长程协作操作系统原型**，非更强运行时、记忆平台或全自动自治系统。应借鉴三项：可审计 checkpoint/fork/replay+队列、typed memory+共享/私域 scope+自动候选提取、trace/数据集回归/审批 UI。（来源：orchestration task_d23a8f963d72）

**知识库产品方向决定（委派授权内，证据上限=小样回放有效）**：采纳**「结构化触发登记 + BM25」，不建语义层**。小样回放：三张检索卡（K2 派发回执 / K4+K6 三端指纹 / K13 快照新鲜度）对今晚两项真实任务的决策点 BM25 top-1 命中（25.7/30.5/19.9，次名皆远低）；裸自由文本出现一次改述误排（卡 A 2.639 略压卡 C 2.525）→ 必须先按 stage/object 硬筛再 BM25 取一张最短卡注入，改述型 top-3 漏检才按 K14 起语义对照。发现 **K2 缺 contractRepo/executionRepo/Issue 标题身份**=对错仓/标题错配覆盖缺口（与 P0-3 修复同向，互相印证）。已派 kb-cards-build 落为真实知识资产（knowledge/retrieval-cards.md，schema=stage/object/operation/signals/one-line-action/source/evidence/invalidates）。（来源：orchestration task_400909d023c7）

## §49 巡检 worktree 清理误删活跃 fix worker（教训，2026-08-12 凌晨）

**事件**：巡检孤儿清理时，我按分支名模式（`issue-139-p01`/`issue-140-p03`）筛选待删 worktree，误以为是旧起草孤儿。但这两个分支名正是**活跃 fix worker 通过 `gh pr checkout 59/60` 检出的 PR head 分支**——fix-p01-schema 与 fix-p03-title 的 worktree 分支即 issue-139-p01/issue-140-p03。筛选因而命中活跃 worker 的 worktree，我在其实施中途 `worktree rm` 了 agent-plugins/fix-p01-schema 与 fix-p03-title，两终端被杀。

**为何损失最小（靠时机运气）**：两 fix worker 在被删前已完成并推送到各自 PR 分支（[#59](https://github.com/Eridanus117/agent-control/issues/59) head 749e3988「对齐十字段」、[#60](https://github.com/Eridanus117/agent-control/issues/60) head 7e23c8df「拦截标题错配」），worker_done 也已送达，成果安全在远端。但若它们尚在实施早期，未提交的修复会随 worktree 一起丢失。

**根因**：孤儿检测以**分支名模式**为判据，而非**活跃 worker 绑定**。分支名会撞车：PR head 分支与"旧起草孤儿"可能同名；fix worker 检出 PR 分支后，其 worktree 显示的正是该分支名。今夜这是第二起 worktree 清理事故（首起=EOF 悬空空号），而清理每次巡检都发生。

**正确程序（可复用，即刻内化）**：删除任何 worktree 前，先由 `terminal list` 构造排除集＝{每个活跃终端的 worktreePath}；只删除 path 不在该集合、且绑定任务为 completed/released/failed 的 worktree；**永不按分支名匹配**。本轮之前我已取到 terminal 的 worktreePath（用于确认 fix worker 位置），却仍按分支名筛，是"有信息未用对"——程序缺陷而非信息缺失。

## §50 操作模式漂移纠偏 + 研究学习程序结构化 + 操作架构问题（2026-08-12）

**负责人纠偏（逐字）**："我们的issue和事项都应该是成体系结构的,我现在一说你就直接开始干活。我不是让你做了需求理解和分析吗？" 及 "看起来我们当前的推进模式也是存在问题的，俩调度器+主session持续长跑可能是有问题的，值得调研正确模式"。

**根因（比"信息过载"更深）**：触发器不对称——系统有丰富战术触发（5min巡检、消息通知）+ 在"路径选择/负责人纠正"时触发框定纪律，但①对负责人**来件请求**没有框定触发（随口"研究X"绕过框定门直接执行，框定只在事后纠正时点火）；②没有**周期性战略触发**。→ 负责人被迫当"最后一道框定触发器 + 战略调度器"。过载是**放大器不是起源**（全新 session 拿同样战术化入口照样漂）。

**会话级修复（已生效，cron 24a3dcb6，会话内存态——重启即失）**：巡检重写三层——A 战术维护（精简）/ B 战略回锚（每约30min或波次边界，从持久源锚定，四问：成体系？服务框定目标？优化结构还是代理指标？下一结构动作？）/ C 派发纪律（未框进结构就 HOLD，绝不凑数散派）。**持久化缺口**：该修复需入口/Skill 置换（守恒律）才能扛过 reset，走三方审阅——尚未做。

**操作架构问题（负责人提，未决）**：两调度器（5min 巡检 cron + Orca 编排）+ 长跑不重置主 session = 上下文无界→过载；巡检 cron 实际在对抗权威"新建/恢复 session 等价、从持久源回锚"。候选正确模式：临时协调者+持久回锚 / 战术战略分离 / 事件驱动 vs 轮询 / 单调度器。派 study-operating-mode(task_a779eaff5967) 研究喂**架构决定**（归负责人或三方，不反射式改）。**A5 上下文工程研究 [#168](https://github.com/Eridanus117/agent-control/issues/168) 已印证**：组合模式（战略/战术隔离+战术卸载+事件驱动回锚+预算/交接）优于单周期回锚。

**研究学习程序结构化（负责人定"两路线都要"）**：建 [#164](https://github.com/Eridanus117/agent-control/issues/164) 目标：研究与学习程序 → [#165](https://github.com/Eridanus117/agent-control/issues/165) 诉求A 生态情报→系统能力 / [#166](https://github.com/Eridanus117/agent-control/issues/166) 诉求B 个人学习+KB；taxonomy A1–A7 / B1–B3 在 [#164](https://github.com/Eridanus117/agent-control/issues/164) 正文；7 个散落研究 PR 按叶子折进路线正文（非逐叶建 Issue，避免 spam）。

**本波结构化交付（Draft，held）**：[#167](https://github.com/Eridanus117/agent-control/issues/167) A 路线综合（21 能力缺口/改动候选，一手核验，父 [#165](https://github.com/Eridanus117/agent-control/issues/165)）；[#169](https://github.com/Eridanus117/agent-control/issues/169) B1 单一思考工具箱（并 [#161](https://github.com/Eridanus117/agent-control/issues/161)+[#163](https://github.com/Eridanus117/agent-control/issues/163)，16 项，登记 K21，28+12 测试过，supersede 候选 [#161](https://github.com/Eridanus117/agent-control/issues/161)/[#163](https://github.com/Eridanus117/agent-control/issues/163)，父 [#166](https://github.com/Eridanus117/agent-control/issues/166)）；[#168](https://github.com/Eridanus117/agent-control/issues/168) A5 上下文工程（6 缺口+8 候选，父 [#165](https://github.com/Eridanus117/agent-control/issues/165)）。在跑：study-vllm-infra(B2)、study-operating-mode(架构决定)。

**pending（下一协调者接续）**：① [#169](https://github.com/Eridanus117/agent-control/issues/169) 合并 + 处置 [#161](https://github.com/Eridanus117/agent-control/issues/161)/[#163](https://github.com/Eridanus117/agent-control/issues/163) 实现去散碎；② 21+6 能力缺口结构化 triage（哪些改我们系统，别反射式实施）；③ 入口置换持久化战略节律（三方审阅）；④ opmode 研究→架构决定（归负责人）。**证据等级**：结构骨架实现完成；交付当前验收前；操作模式候选=选项层未决。

## §51 决定面自足性纠偏（2026-08-12）

**负责人纠偏（要点）**："board 我点进去 issue，根本不知道我要拍板什么……只有选项给我，我咋拍板啊"——两批决定（[#172](https://github.com/Eridanus117/agent-control/issues/172)/[#174](https://github.com/Eridanus117/agent-control/issues/174)）都只给选项标签＋引用，实质在 Draft PR 文件或后补评论里，负责人无法在决定面第一屏拍板，被迫反问。

**根因**：决定请求写成"协调者备忘录"而非"负责人决策件"，假设读者持有协调者上下文。README 已要求"背景＋明确问题＋推荐＋替代＋收益代价"合并写回，但执行中把"实质"压缩成标签＋链接；决定块落在评论流，board 跳转先看到过时正文。

**决定面三律（本 Session 即刻生效，持久化候选）**：
1. **自足**：每个决定项＝实质一句＋批了会怎样＋推荐与理由＋回复格式；禁止只给选项名或链接；
2. **置顶**：待决定块编辑进 Issue 正文顶部（评论只做历史），board 一跳第一屏即可拍板；
3. **负责人成本显性**：选项代价必须包含负责人时间／参与成本，不只 Agent 成本。

**样本**：[#174](https://github.com/Eridanus117/agent-control/issues/174) 正文按三律重写（edit history 可对照）。**pending**：持久化载体待 self-improvement 判定（issue-workflow／operating-ledger-maintenance 的"等待负责人"段 vs 仅任务记录）。

## §52 需求侧纠偏：从"系统建设自己"到"公司化找订单"（2026-08-12）

**负责人战略挑战（要点）**："做事之前有按 ROI 考虑过吗""我很早就提过要像公司一样运营，现在很明显无法扩大""没有抓到高价值的事项"；并在协调者给出三因诊断（需求侧空/价值排序缺/协调者反应式）后指出更深一层："2、3 不正是 1 的需求？如果我直接问你，你的新需求就是找到需求呢？更深层次就会构建出复盘、可观测、反刍"。

**关键翻转**：①需求发现是公司核心职能，不是负责人的供给义务——纠偏、提问、研发记忆、注意力流向都是需求信号源，缺的是采集器；②复盘/可观测/反刍不是内务，是从"找订单"派生的必要能力；现有雏形（研发记忆/经营总账/B层四问）的病是**朝内看流程**而非朝外看负责人价值——掉头即可，不建新塔；③研究"便宜快且已框定"→天然填满产能=低边际成本库存生产，看似忙碌实为代理指标。

**成本假设翻转（[#46](https://github.com/Eridanus117/agent-control/issues/46)）**：负责人实测"知识调研极快、重建成本不高"——R0/R1/R2 门按旧成本设计，成本降一个量级后"等自然证据"保护过度→权威修订候选（两道门只留公共知识，私域按需求清单主动生产）。

**首批需求信号（单 session 挖出 8 条）**：述职报告🔥/职业叙事资产化/学习铺开/KB 主动生产/投资 KB（悬置）/交互质量观测/产能利用率/需求发现本身。**防坑**：每轮挖掘必须以"排序订单表被派发消费"收口，否则=反刍上瘾（§50 抽象循环变体）。

**pending**：负责人「立」→ 需求发现与价值排序入总账为正式诉求＋首批订单建卡；KB 门修订候选走方案面。

## §53 负责人个人事项边界（2026-08-12，负责人明确指令）

**原话要点**："不要深入到我个人的事项里面来""1 2 4 5 不做""不要拉我做具体的事情,但可以沉淀知识\资产\方法论"。

**边界规则（即刻生效，权威候选）**：①系统不进入负责人个人事项的具体执行（述职本体、职业材料、投资等）；②不向负责人发起"给我素材/列清单/参与某事"类请求——负责人主动给的除外；③被允许的价值形态＝通用知识、资产、方法论的沉淀（如说服文档方法论入库先例）；④需求发现（§52 第8条）范围收窄为：负责人对系统的纠偏与提问信号，产出限知识/资产/方法论形态；⑤学习（教学席）由负责人自主节奏，系统不催不排。

**被替代**：§52 中"采集负责人真实需求库存（工作/生活/职业）作为营收面"的表述按本节收窄；首批 8 条中 1/2/4/5 划掉，3/6/7 留在既有结构，8 待负责人自行决定是否立。[#164](https://github.com/Eridanus117/agent-control/issues/164) taxonomy 悬置项"投资 KB 待负责人定"按本指令消费为不做。W6-S1 继续（纯系统测试，产出通用骨架，无负责人个人信息）。

## §54 试点收口＋能力评估（2026-08-12）

负责人指令：vLLM 教学试点收口（2 轮，「效果还行」，时间优先级截断——去写述职，本人执行，系统不介入 §53）；「6 7 8 可以做」「如果觉得事项少，那就建设发现事项的能力」→ [#183](https://github.com/Eridanus117/agent-control/issues/183) 诉求立项（需求发现与价值排序，带 §53 硬边界）；「运营\度量\管理能力都有欠缺，值得优化演进」→ 能力缺口登记（当日实证：扫描窗错漏、引链错、产能点名、价值结构失衡）。178-D1 批准（方案A）→ [#181](https://github.com/Eridanus117/agent-control/issues/181)/[#182](https://github.com/Eridanus117/agent-control/issues/182) 两实施合同立项待派。试点翻转门评估=既不翻转也不铺开：机制有效、时间成本主约束；资产归档（[#177](https://github.com/Eridanus117/agent-control/issues/177) 合并），按需再启用。
