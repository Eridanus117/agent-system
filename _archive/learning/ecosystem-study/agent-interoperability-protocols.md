# A3 增量｜A2A v1.0.1 与 MCP Tasks：Orca 的互操作边界

<!-- markdownlint-disable MD013 -->

> - 核验时间：2026-08-12T16:57:11Z
> - 结构位置：[关联 #165（生态情报持续改进我们的系统）](https://github.com/Eridanus117/agent-control/issues/165) 的路线 A／A3
> - 服务决定：外部 Agent 互操作标准是否应改变 Orca orchestration／远端 placement 的当前边界；若将来确有外部执行器，优先使用 A2A、MCP Tasks 还是继续使用 Orca 原生协议
> - 交付边界：只研究协议与形成改动候选；不接入外部端点，不修改 Orca、Skill、Plugin 或权威，不把候选写成采用决定

## 结论先行

截至本次核验，A2A 已发布稳定版 `v1.0.1`，把独立、不透明的远端 Agent 抽象为可发现的 Agent Card、带版本的接口、异步 Task、Message 与 Artifact；MCP `2026-07-28` 则把长运行工作放进 `io.modelcontextprotocol/tasks` 扩展，以每请求能力声明、耐久 task handle、轮询、`input_required`／`tasks/update` 和协作式取消扩展 `tools/call`。【E1】

两者与 Orca 当前承担的层次不同：【E1+I】

- **A2A** 面向跨框架、跨服务的独立 Agent；当一个外部端点应当被视为不透明合作者而非我方进程时，它是更贴近语义的候选。
- **MCP Tasks** 面向可长时间运行的工具调用；它适合“同一 host 调用一个异步能力”，当前只覆盖 `tools/call`，不能因为名字同为 Task 就替代多 Agent 协调合同。
- **Orca orchestration** 面向本机／联邦环境中的受监督执行者、终端、worktree、Run／Task／Dispatch 和 worker 资源收口；GitHub 另行保存意图、授权、决定与验收。

因此当前推荐是：**保留 Orca 原生路径，不建设通用适配器；把 A2A 作为未来“独立外部 Agent”边界，把 MCP Tasks 作为未来“异步工具”边界。首次真实需求出现时，先做一张有界协议翻译卡和一轮恢复演练，再决定是否接入。**【I，中高置信】

这项结论不把“暂不接入”写成永久拒绝。它把翻转条件写清，使未来可以用真实端点、授权、生命周期和恢复证据换路，而不是因协议热度或字段相似就新增第二套运行时。

## 证据读法与本次增量

- **E1｜一手核验**：协议维护方的固定 release／commit、当前 Orca runtime 的只读探针，或本仓当前权威／已合并研究。
- **I｜推断**：把一手协议事实映射到我方边界、缺口与候选；尚未经过外部端点自然运行。
- **U｜未知**：本次材料无法回答，必须由真实集成或恢复实验取得。

### 复用的已有结论

- [A3 多 Agent 编排研究](./multi-agent-orchestration.md)已经比较框架内的控制拓扑、恢复、终止、独立审阅和跨源事件包；推荐“协议级提取、自然运行取证”，不引入第二套框架。【E1】
- [协作权威](../../_archive/authority/04-collaboration.md)已经确认：GitHub 保存持久合同，Orca 保存过程执行态；Orca 是当前成熟的可选后端，但长期依赖、自建或退出仍未决定。【E1】
- [A 路线候选清单](./capability-gaps.md)已有 A2-1 能力画像、A2-3 窄交接、A2-6 退出演练与 A2-7 跨源事实卡；本次不重建这些候选。【E1】

### 本次只补的变化与缺口

现有 A3 横评没有覆盖开放互操作协议。本次增量只回答两个在其后端替换翻转条件里仍为空的问题：【I】

1. A2A `v1.0.1` 与 MCP `2026-07-28`／Tasks 扩展分别能稳定表达什么；
2. 若 Orca 将来需要连接外部执行器，哪些语义可以薄映射，哪些仍必须留在 GitHub／Orca，不能被协议对象冒充。

## 一、固定证据水位

### A2A

- 稳定 release：[`v1.0.1`，发布于 2026-05-28](https://github.com/a2aproject/A2A/releases/tag/v1.0.1)，固定 commit [`33035925`](https://github.com/a2aproject/A2A/commit/3303592588e388e62e0f69f701af531d2f4e3991)。【E1】
- 固定规范：[A2A specification 第 1.4 节](https://github.com/a2aproject/A2A/blob/3303592588e388e62e0f69f701af531d2f4e3991/docs/specification.md#L103-L110)把 `spec/a2a.proto` 声明为数据对象与请求／响应的唯一权威规范定义，但固定提交中该路径不存在；仓库实际文件位于 [`specification/a2a.proto`](https://github.com/a2aproject/A2A/blob/3303592588e388e62e0f69f701af531d2f4e3991/specification/a2a.proto)，同一规范后文也改用这个实际路径。本文保留这一上游路径不一致，不把两者静默改写成同一路径。【E1】
- 固定迁移说明：[v1.0 变化](https://github.com/a2aproject/A2A/blob/3303592588e388e62e0f69f701af531d2f4e3991/docs/whats-new-v1.md)；固定边界说明：[A2A 与 MCP](https://github.com/a2aproject/A2A/blob/3303592588e388e62e0f69f701af531d2f4e3991/docs/topics/a2a-and-mcp.md)。【E1】

### MCP 与 Tasks

- MCP 正式版本：[`2026-07-28`](https://github.com/modelcontextprotocol/modelcontextprotocol/tree/5f5440bb26a62e2cf3440b92da5a667efa03b267/docs/specification/2026-07-28)，固定 commit [`5f5440bb`](https://github.com/modelcontextprotocol/modelcontextprotocol/commit/5f5440bb26a62e2cf3440b92da5a667efa03b267)；维护方的[版本说明](https://blog.modelcontextprotocol.io/posts/2026-07-28/)明确把 Tasks 从实验性 core 移到 `io.modelcontextprotocol/tasks` 扩展。【E1】
- Tasks 固定 commit [`2c1425d9`](https://github.com/modelcontextprotocol/ext-tasks/commit/2c1425d9a288b9b1f489430fe1e00bb392b47e48)；[概览](https://github.com/modelcontextprotocol/ext-tasks/blob/2c1425d9a288b9b1f489430fe1e00bb392b47e48/index.md)与[规范](https://github.com/modelcontextprotocol/ext-tasks/blob/2c1425d9a288b9b1f489430fe1e00bb392b47e48/specification/draft/tasks.md)是本次任务语义依据。【E1】

### 当前 Orca

- `orca status --json` 于上述核验时间直接返回 runtime `1.4.180`、`state=ready`，并声明 orchestration federation、worker launch preferences 与 contract v1 等能力。【E1：本次直接验证】
- `orca skills get orchestration --full` 的版本匹配指南表明：当前协议使用 Run／Task／Dispatch、结构化消息、`worker_done`、question／reply、heartbeat、远端 placement，以及 release／retain／stop／abandon 的资源与生命周期动作；指南同时要求 GitHub 等持久合同在运行面之外保存。【E1：本次直接验证】
- 这些是当前 runtime 的可用事实，不是稳定公共 API 承诺；下次比较必须重新读取动态指南，不能只复用本文字段名。【E1】

## 二、三个协议层次不能按同名字段合并

| 维度 | A2A v1.0.1 | MCP 2026-07-28 Tasks | 当前 GitHub＋Orca | 对我方的含义 |
| --- | --- | --- | --- | --- |
| 交互对象 | 独立、不透明的远端 Agent／agentic system | MCP server 暴露的长运行 `tools/call` | 受监督 Agent 进程、终端、worktree 与远端 placement | 外部对象是“合作者”才选 A2A；只是异步能力则选 MCP Tasks；受控 worker 继续用 Orca。【E1+I】 |
| 发现与能力 | Agent Card 声明 identity、skills、security、带协议版本的 `supportedInterfaces`；客户端先校验可选能力 | 客户端在每个请求声明扩展，server 可经 `server/discover` 声明；是否创建 Task 由 server 决定 | Task 合同与 worker launch receipt 记录放置；A2-1 能力画像仍是候选 | 未来外部接入必须钉住实际能力快照与版本，不允许静默降级；卡片不能产生授权。【I】 |
| 工作身份 | server 生成 Task ID，可用 context 关联多轮；Task 是有状态工作单元 | server 生成耐久 task ID；返回前必须可由 `tasks/get` 取得 | GitHub Issue 是持久合同；Orca Task／Dispatch 是运行事实 | 三类 ID 只能绑定，不能互相冒充；外部 task ID 不能成为需求或写入所有权真源。【E1+I】 |
| 进度与追加输入 | 轮询、stream、push；非终态可继续 Message；Task 状态可要求输入／认证 | `tasks/get` 轮询；`input_required` 通过 `tasks/update` 回填；可选 task notification | heartbeat、question／reply、escalation、Delivery | 任何映射都要区分进度、阻塞、负责人决定与授权；收到输入不等于获得更大权限。【I】 |
| 输出 | Message 用于通信，Artifact 承担任务输出；规范警告 Message 历史与断线流不是关键事实的可靠交付面 | terminal Task 在 `result` 或 `error` 中带最终结果；task 可因 TTL 被删除 | Draft PR／证据评论保存可复核交付；`worker_done` 是运行回执 | 我方持久交付层更强；协议消息或可过期 task 不能替代 PR／证据评论。【E1+I】 |
| 取消与资源 | `CancelTask` 受状态与服务端语义约束 | `tasks/cancel` 只表达意图，协作式且可能最终不是 `cancelled` | worker stop／abandon 与 release／retain 分开，且不自动删除 worktree | “请求取消”“执行停止”“资源释放”“Issue 生命周期”必须保持四件事，不能折成一个状态。【E1+I】 |
| 历史与恢复 | Task history 可选，重要 Message 不保证全留；协议版本按接口协商 | task ID 耐久但有 TTL；没有 `tasks/list`，以免越权枚举 | GitHub 允许离线恢复合同；Orca 运行态可丢 | 跨 Session 恢复仍以 GitHub 为根；外部协议只补运行定位符和结果，不成为第二真源。【E1+I】 |
| 安全与授权 | Agent Card 宣告 security scheme，凭据在带外取得；服务端每次请求做鉴权与授权 | task ID 需不可猜；没有 list；input request 仍按普通 elicitation／sampling 信任模型处理 | Issue／负责人决定给授权；Dispatch capability 给运行期生命周期权限 | 传输鉴权、运行 capability 与组织授权是三层，任一协议都不能把前两层提升成第三层。【E1+I】 |

## 三、能力缺口与有门候选

### A3-P1｜协议翻译卡：先证明一次无损绑定，再谈适配器

**缺口。【I】** 当前 Orca federation 能放置受控 worker，但没有自然样本证明一个不透明外部 Agent／异步工具能与 Issue、Dispatch、授权和交付物无歧义绑定。A2A 与 MCP Tasks 的同名 Task 反而增加“字段看似相同、语义实际不同”的错配风险。

**候选。【I】** 首个真实外部端点出现时，在该任务的现有研究／交付回执中手工记录一张协议翻译卡：

```text
protocol + exact version
remote endpoint identity + capability snapshot/digest
GitHub contract + local Dispatch + remote task ID
authorization source + transport auth context
state mapping: exact | lossy | unrepresentable
artifact/result binding + stable GitHub carrier/head
cancel, stop, abandon, resource-cleanup semantics
recovery probe + minimum recheck
```

**进入门。** 同时具备：一个负责人已授权使用的真实外部端点；当前 Orca placement 不能直接表达该对象；合同已给凭据与外部写入边界。缺任一项就只保留本文，不造 mock adapter。

**验收。** 新 Session 只读 GitHub 合同与翻译卡即可找到同一远端 task／结果；断开重连不重复执行；任一有损状态被明确标出；协议 capability 不改变 Issue 授权。

**失败门。** 无法证明端点身份、授权来源、结果持久性或取消／清理责任时停止，不用更多映射字段掩盖边界缺失。

### A3-P2｜按对象选择协议，不建设统一 Task 抽象

**缺口。【I】** A2A、MCP Tasks 与 Orca 都有 Task、状态和取消，但对象、信任、结果和资源语义不同。过早做统一 schema 会丢掉差异，并把协议升级成本扩散到现有稳定路径。

**候选。【I】** 在首次真实需求中先按下表选择唯一适配方向；只实现当次所需最窄绑定，不把现有 Orca worker 迁到新协议：

| 真实对象 | 首选路径 | 必须保留的我方边界 |
| --- | --- | --- |
| 我方可启动、监督和回收的 Agent 进程／远端环境 | Orca orchestration | GitHub 合同、Dispatch lifecycle、worktree 与资源收口 |
| 独立服务上的不透明 Agent，需要发现、协商、多轮与 Artifact | A2A | Issue 授权、写入所有权、外部 Agent Card／版本钉定、结果回写 GitHub |
| MCP server 上的长运行、工具形能力 | MCP Tasks | 每请求 capability、TTL／无 list、协作式取消、最终结果回写 GitHub |

**进入门。** 同一类型真实对象在一个有界任务中出现，且直接调用会失去恢复、输入或结果语义。协议只是因为流行、已有 SDK 或字段相似时不进入。

**翻转信号。** 同一外部边界在两个独立任务中重复出现、薄绑定反复复制，或供应方把该协议作为唯一受支持接口时，才把共用适配器提交为新的产品方案；在此以前不建立通用运行时。

## 四、路线比较

| 路线 | 收益 | 代价／风险 | 当前判断 |
| --- | --- | --- | --- |
| A．继续只用 Orca 原生协议 | 零新增运行时，现有监督、资源收口和 GitHub 恢复保持完整 | 无法直接连接独立 A2A 服务或异步 MCP 工具 | **当前推荐基线**；当前没有真实外部端点需求。【I】 |
| B．需要独立外部 Agent 时增加 A2A 薄边界 | 使用稳定 discovery／version／Task／Artifact 语义，不要求暴露远端内部实现 | 仍需自行绑定授权、写入所有权、持久交付和 Orca 资源；远端可靠性未知 | **条件式推荐**；只在 A3-P1 门命中后评估。【I】 |
| C．把长工具调用接为 MCP Tasks | 对断线、轮询、mid-flight input 与最终 result 有窄协议；不必把工具伪装成 Agent | 仅支持 task-augmented `tools/call`；TTL、无 list 与协作式取消要求 host 自己治理 | **条件式推荐**；只用于异步工具，不用于通用多 Agent。【I】 |
| D．立即把 Orca／GitHub 统一到 A2A 或 MCP Task schema | 表面上减少字段种类，未来可能易接生态 SDK | 丢失当前合同、授权、审阅、资源与生命周期差异；形成第二真源和迁移成本 | **不推荐**；没有证据表明当前瓶颈是协议缺失。【I】 |

**最强反方。【I】** A2A 已进入稳定 `1.x`，MCP Tasks 也已从实验 core 迁到独立扩展；若现在不接入，Orca 专有语义继续增长，未来互操作成本可能更高。

**回应。【I】** 这足以支持“现在冻结翻译边界”，但不足以支持“现在建设适配器”。没有真实端点，就无法验证鉴权、版本漂移、取消、Artifact、TTL 与断线恢复；实现只能证明本地 mock 对本地 schema。A3-P1 保留未来换路所需的最小合同，又不新增长期运行面。

**会改变推荐的证据。【U】** 出现负责人已授权的外部 Agent／异步工具；同一边界被两个独立任务重复需要；Orca remote placement 无法表达必要对象；供应方只提供 A2A／MCP Tasks；或真实恢复表明现有 GitHub＋Orca 稳定键不足。反方向上，若协议发生新的 breaking major、官方 SDK／TCK 无法支持目标语言与 transport，或端点要求的凭据／数据边界不被授权，则继续保持原生路径。

## 五、知识维护、证据上限与最少复核

- **价值门：通过。** Orca 的长期依赖仍未决定，开放互操作边界会直接影响未来外部执行器选择；把对象判据与翻转条件写清能减少重复全景调研。【I】
- **可信门：协议事实通过，运行收益未通过。** A2A 与 MCP 主张来自固定一手版本，当前 Orca 来自本次直接探针；但未运行 A2A／MCP SDK、TCK 或真实端点，任何适配收益仍是推断／未知。
- **去向。** 本文保留在 `learning/` 作为 A3 增量研究和候选，不进入 `authority/`，不声称产品采用或长期依赖。
- **证据上限。** 研究资产已经实现：本文件、两条候选及目录索引均已形成；这不等于互操作能力已经实现。当前没有适配器或真实端点运行证据，也不声称当前交付已经验收、样本有效或产品采用。
- **未知。** 目标外部端点、实际 auth scheme、官方 SDK 的目标语言／transport 互通、A2A TCK 表现、MCP Tasks host 支持、断线与取消的真实后态均未知。
- **失效条件。** A2A major 版本、MCP Tasks 扩展生命周期、Orca federation／worker lifecycle 或 GitHub／Orca 真源边界发生变化；或者首次真实外部端点出现。
- **下次最少复核。** 只重读 A2A 最新 release 与规范差异、MCP 最新 spec 与 Tasks 固定仓、当前 `orca skills get orchestration --full`，再核对目标端点的 Agent Card／MCP capabilities；无差异即停止，不做定时全量扫描。

## 当前停止点

本切片已经把新增协议事实落成“我们的能力缺口＋改动候选”，并把它绑定到“Orca 是否增加外部 Agent／异步工具互操作边界”的系统决定。当前没有真实端点与接入授权，A3-P1／P2 的实施门均未命中；因此停止在研究资产与 Draft PR，不创建适配器、任务数据库、轮询服务或新的负责人决定请求。
