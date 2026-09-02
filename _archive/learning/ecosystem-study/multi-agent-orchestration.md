# 多 Agent 编排生态：把框架能力收敛为有界协调协议

> - 核验日期：2026-08-12
> - 结构位置：[关联 #165（生态情报持续改进 Agent 系统）](https://github.com/Eridanus117/agent-control/issues/165) 的路线 A／A3；上接 [关联 #164（研究与学习程序树）](https://github.com/Eridanus117/agent-control/issues/164)
> - 服务决定：哪些主流多 Agent 编排设计值得迁移到 Orca orchestration、结构化派发、三方审阅与 Mode A 单临时协调者；哪些只应作为观察对象
> - 交付边界：研究与改动候选，不实施候选、不改变权威、不承诺采用任何框架
> - 当前基线：[关联 #172（协调者操作模式收敛）](https://github.com/Eridanus117/agent-control/issues/172) 已采纳 Mode A：单临时协调者、统一触发队列、单一派发权威、Session 可丢弃

## 结论先行

LangGraph／LangChain、CrewAI、AutoGen／Magentic-One 与 OpenAI Swarm／Agents SDK 的共同收敛点，不是“让更多 Agent 自由对话”，而是以下五项工程约束。【I：对下列 E1 事实的跨框架综合】

1. 在中心经理、显式图、路由和 handoff 之间明确选择控制拓扑。【E1：[LangChain 多 Agent 固定源码](https://github.com/langchain-ai/docs/blob/30d6ba4a0dd974c799d16297c9913af493d521da/src/oss/langchain/multi-agent/index.mdx)、[OpenAI Agents SDK v0.20.0 固定源码](https://github.com/openai/openai-agents-python/blob/d2bda3f3110415bf02e526a3983b0d0fa903e0d7/docs/multi_agent.md)】
2. 用结构化任务、共享或线程状态表达依赖和结果。【E1：[CrewAI 1.15.15 Task 固定源码](https://github.com/crewAIInc/crewAI/blob/28d868c4f4d2e9a17ce00db3444e99b7f41347bb/docs/v1.15.15/en/concepts/tasks.mdx)、[LangGraph 固定 Graph API 源码](https://github.com/langchain-ai/docs/blob/30d6ba4a0dd974c799d16297c9913af493d521da/src/oss/langgraph/graph-api.mdx)】
3. 把检查点、暂停／恢复和幂等边界作为运行时能力。【E1：[LangGraph 固定 persistence 源码](https://github.com/langchain-ai/docs/blob/30d6ba4a0dd974c799d16297c9913af493d521da/src/oss/langgraph/persistence.mdx)、[interrupts 固定源码](https://github.com/langchain-ai/docs/blob/30d6ba4a0dd974c799d16297c9913af493d521da/src/oss/langgraph/interrupts.mdx)】
4. 把成功、预算、超时、停滞、人工决定等停止原因显式化。【E1：[AutoGen python-v0.7.5 termination 固定源码](https://github.com/microsoft/autogen/blob/83afbf5857aac683340d4c692194e548b1e8edda/python/docs/src/user-guide/agentchat-user-guide/tutorial/termination.ipynb)、[Magentic-One 固定源码](https://github.com/microsoft/autogen/blob/83afbf5857aac683340d4c692194e548b1e8edda/python/docs/src/user-guide/agentchat-user-guide/magentic-one.md)】
5. 用事件、trace、稳定身份和人工门让运行可复读。【E1：[AutoGen Core architecture 固定源码](https://github.com/microsoft/autogen/blob/83afbf5857aac683340d4c692194e548b1e8edda/python/docs/src/user-guide/core-user-guide/core-concepts/architecture.md)、[OpenAI Agents SDK v0.20.0 HITL 固定源码](https://github.com/openai/openai-agents-python/blob/d2bda3f3110415bf02e526a3983b0d0fa903e0d7/docs/human_in_the_loop.md)】

我们的当前优势不在于复刻一个 Agent 框架，而在于已经把 GitHub 持久合同、Orca 运行事实、独占写入所有权、Mode A 单一派发权威和高门槛独立审阅分层。【E1：[当前协作权威固定版本](https://github.com/Eridanus117/agent-control/blob/7d42c49b6a5dc466cd2458e228926fa7ffd8d561/authority/04-collaboration.md#L124-L140)、[关联 #172（协调者操作模式收敛）](https://github.com/Eridanus117/agent-control/issues/172)】主要缺口是：这些约束仍有一部分只存在于 Skill／Issue 自然语言中，尚未在自然运行里证明能被稳定编码、恢复和复核。【U：尚无自然样本证明】

因此，本格推荐“协议级提取、自然运行取证、出现真实失败后再自动化”，不推荐引入第二套编排框架。【I：由 E1 框架事实与我方现状映射所得】净新增候选集中在控制拓扑、停止原因和恢复不变量；结构化派发、上下文交接、运行事实卡与退出演练则复用 A2／A5 已有候选，避免同义建设。【I：[A2-1／A2-3／A2-6／A2-7 固定段落](https://github.com/Eridanus117/agent-control/blob/36c9393147dc2701c32e4259121f9aee60422222/learning/ecosystem-study/capability-gaps.md#L36-L42)、[A5-C6 固定段落](https://github.com/Eridanus117/agent-control/blob/7b982e2e07f6979a4a7eab294c3bd291f3c60fd6/learning/ecosystem-study/context-engineering.md#L211-L219)】

## 证据读法与研究边界

- **E1｜一手核验**：官方文档、官方源码仓 README 或本仓当前权威／已核验 Skill。
- **E2｜二手转述**：非维护方论文解读、社区文章或案例汇总。本格的关键结论未依赖 E2。
- **I｜推断**：由多个 E1 事实映射到本系统的缺口、取舍或候选，尚未经过自然运行。
- **U｜未知**：当前材料不能回答，或需要真实样本才能判断。

框架文档中的“生产可用”“高性能”等自述只作为产品定位，不当作效果证据。本格未安装这些框架、未复跑其示例或基准，也未对成本、成功率作横向量化比较。

外部证据固定在 2026-08-12 的以下水位：LangChain 官方文档仓 [`30d6ba4`](https://github.com/langchain-ai/docs/commit/30d6ba4a0dd974c799d16297c9913af493d521da)、CrewAI 官方不可变 release [`1.15.15`](https://github.com/crewAIInc/crewAI/releases/tag/1.15.15)／commit [`28d868c4`](https://github.com/crewAIInc/crewAI/commit/28d868c4f4d2e9a17ce00db3444e99b7f41347bb)、AutoGen release [`python-v0.7.5`](https://github.com/microsoft/autogen/releases/tag/python-v0.7.5)／commit [`83afbf58`](https://github.com/microsoft/autogen/commit/83afbf5857aac683340d4c692194e548b1e8edda)、OpenAI Swarm commit [`6af0b4ca`](https://github.com/openai/swarm/commit/6af0b4caf37dca4526dfd98e9fbd8ce36e7eeb22)、OpenAI Agents SDK release [`v0.20.0`](https://github.com/openai/openai-agents-python/releases/tag/v0.20.0)／commit [`d2bda3f3`](https://github.com/openai/openai-agents-python/commit/d2bda3f3110415bf02e526a3983b0d0fa903e0d7)。正文外部链接均落到这些 commit 下的固定 blob；下次最小复核只需在候选被消费时重读官方 canonical／release，若 release 或 canonical 重定向变化，再对比支撑主张的固定段落，未变化即停止。

## 一、生态怎么做

| 生态对象 | 控制模型 | 状态／恢复 | 停止／人工门 | 可迁移信号 | 证据等级与来源 |
| --- | --- | --- | --- | --- | --- |
| LangChain 多 Agent | 同时提供 subagents、handoffs、router、skills 与 custom workflow；官方明确指出并非所有复杂任务都需要多 Agent。Subagents 由中心 agent 作为工具调用，handoff 改变当前活动 agent，router 做一次性分类，custom workflow 则把确定性和 agentic 步骤组合成显式图。 | LangGraph 以 state、node、edge、superstep 为基本模型；checkpointer 按 thread 保存 checkpoint，可支持故障恢复、time travel 和 human-in-the-loop。`interrupt` 恢复时会从节点起点重放，因此副作用须幂等或放入可缓存 task。 | `interrupt` 可持久等待外部输入，以 `thread_id` 和 `Command(resume=...)` 继续；图的条件边和 `Command` 决定后续路径。 | “中心经理”和“显式工作流”是不同控制语义；路由、handoff、并行 fan-out 不应只靠提示词暗示。 | E1：[多 Agent 概览](https://github.com/langchain-ai/docs/blob/30d6ba4a0dd974c799d16297c9913af493d521da/src/oss/langchain/multi-agent/index.mdx)、[subagents](https://github.com/langchain-ai/docs/blob/30d6ba4a0dd974c799d16297c9913af493d521da/src/oss/langchain/multi-agent/subagents.mdx)、[handoffs](https://github.com/langchain-ai/docs/blob/30d6ba4a0dd974c799d16297c9913af493d521da/src/oss/langchain/multi-agent/handoffs.mdx)、[router](https://github.com/langchain-ai/docs/blob/30d6ba4a0dd974c799d16297c9913af493d521da/src/oss/langchain/multi-agent/router.mdx)、[Graph API](https://github.com/langchain-ai/docs/blob/30d6ba4a0dd974c799d16297c9913af493d521da/src/oss/langgraph/graph-api.mdx)、[persistence](https://github.com/langchain-ai/docs/blob/30d6ba4a0dd974c799d16297c9913af493d521da/src/oss/langgraph/persistence.mdx)、[interrupts](https://github.com/langchain-ai/docs/blob/30d6ba4a0dd974c799d16297c9913af493d521da/src/oss/langgraph/interrupts.mdx) |
| CrewAI | Crews 提供 sequential 与 hierarchical process；hierarchical 由 manager 规划、派发、校验任务。Flows 以 `start`、`listen`、`router` 组合事件驱动的顺序、分支、循环和并行。 | Flow state 可用 Pydantic 结构化；持久化支持 SQLite 等后端、恢复和 fork。checkpoint 文档描述事件驱动保存、任务进度、输出和 lineage，已完成任务在恢复时跳过。 | Task 可声明 `expected_output`、依赖 context、异步执行、`human_input`、Pydantic／JSON 输出与 guardrail／重试。 | 自治型 Crew 与确定性 Flow 被分成两层；任务输出、依赖、校验和恢复都可成为显式合同。 | E1（release `1.15.15`／commit `28d868c4`）：[processes](https://github.com/crewAIInc/crewAI/blob/28d868c4f4d2e9a17ce00db3444e99b7f41347bb/docs/v1.15.15/en/concepts/processes.mdx)、[flows](https://github.com/crewAIInc/crewAI/blob/28d868c4f4d2e9a17ce00db3444e99b7f41347bb/docs/v1.15.15/en/concepts/flows.mdx)、[tasks](https://github.com/crewAIInc/crewAI/blob/28d868c4f4d2e9a17ce00db3444e99b7f41347bb/docs/v1.15.15/en/concepts/tasks.mdx)、[checkpointing](https://github.com/crewAIInc/crewAI/blob/28d868c4f4d2e9a17ce00db3444e99b7f41347bb/docs/v1.15.15/en/concepts/checkpointing.mdx)。效果性主张未独立核验。 |
| AutoGen AgentChat | 提供 RoundRobinGroupChat、SelectorGroupChat、Swarm handoff、MagenticOneGroupChat 等预设；官方建议先从单 Agent 开始，只有任务确需多角色时才增加 team。Selector 可由模型或自定义函数选下一发言者。 | Team 是有状态对象，可 `save_state`／`load_state`；官方警告运行中保存可能产生不一致。Core 层把 runtime、agent identity、lifecycle、消息和单机／分布式 worker 分开。 | termination condition 可按消息数、文本、token、超时、handoff、来源、函数调用或外部事件组合；外部 termination 与 cancel 的语义不同。 | “组聊形态”“选择器”“运行时身份”“停止条件”彼此独立，不能用一个聊天循环代替。 | E1（release `python-v0.7.5`／commit `83afbf58`）：[teams](https://github.com/microsoft/autogen/blob/83afbf5857aac683340d4c692194e548b1e8edda/python/docs/src/user-guide/agentchat-user-guide/tutorial/teams.ipynb)、[selector group chat](https://github.com/microsoft/autogen/blob/83afbf5857aac683340d4c692194e548b1e8edda/python/docs/src/user-guide/agentchat-user-guide/selector-group-chat.ipynb)、[termination](https://github.com/microsoft/autogen/blob/83afbf5857aac683340d4c692194e548b1e8edda/python/docs/src/user-guide/agentchat-user-guide/tutorial/termination.ipynb)、[state](https://github.com/microsoft/autogen/blob/83afbf5857aac683340d4c692194e548b1e8edda/python/docs/src/user-guide/agentchat-user-guide/tutorial/state.ipynb)、[Core architecture](https://github.com/microsoft/autogen/blob/83afbf5857aac683340d4c692194e548b1e8edda/python/docs/src/user-guide/core-user-guide/core-concepts/architecture.md) |
| Magentic-One | Orchestrator 维护 Task Ledger 与 Progress Ledger：外层形成／修订计划，内层跟踪事实、进度和下一位 worker；发现停滞时进入 replanning。 | 状态和运行继承 AutoGen team/runtime；官方同时提示容器隔离、日志、人工监督、最小工具权限、敏感数据与 prompt injection 风险。 | 由 Orchestrator 判断进展、停滞和重新规划；这是一种强中心控制器，不是无主自治群聊。 | 停滞检测与重新规划应是协调协议的一等信号，但模型判断不能自动扩大授权。 | E1（release `python-v0.7.5`／commit `83afbf58`）：[Magentic-One](https://github.com/microsoft/autogen/blob/83afbf5857aac683340d4c692194e548b1e8edda/python/docs/src/user-guide/agentchat-user-guide/magentic-one.md) |
| OpenAI Swarm | 极简抽象只有 Agent、function 与 handoff；运行循环执行工具、可切换 Agent，并由调用方携带后续状态。 | 官方 README 将其定位为实验／教育项目，client-side、stateless between calls；当前已由 OpenAI Agents SDK 取代。 | `max_turns` 限制单次运行循环，但持久恢复和治理由调用方承担。 | 可作为 handoff 最小语义的历史样本，不应成为新的采用基线。 | E1：[Swarm README 固定于 `6af0b4ca`](https://github.com/openai/swarm/blob/6af0b4caf37dca4526dfd98e9fbd8ce36e7eeb22/README.md) |
| OpenAI Agents SDK | 当前 SDK 区分 agents-as-tools（经理保持控制）和 handoff（专家成为当前 agent）；也支持代码级编排，以确定性逻辑包围 agentic 步骤。 | Run result 暴露 new items、last agent、raw responses 与可恢复 state；HITL 可序列化 RunState 后跨进程继续。 | handoff 可带结构化输入和 input filter；工具可要求 approval；input/output/tool guardrail 的覆盖边界不同，approval 以具体 tool call ID 为范围。 | “经理调用”和“转交控制”必须被区分；审批应绑定具体动作与可恢复状态，而非笼统批准整个会话。 | E1（release `v0.20.0`／commit `d2bda3f3`）：[多 Agent 编排](https://github.com/openai/openai-agents-python/blob/d2bda3f3110415bf02e526a3983b0d0fa903e0d7/docs/multi_agent.md)、[handoffs](https://github.com/openai/openai-agents-python/blob/d2bda3f3110415bf02e526a3983b0d0fa903e0d7/docs/handoffs.md)、[results](https://github.com/openai/openai-agents-python/blob/d2bda3f3110415bf02e526a3983b0d0fa903e0d7/docs/results.md)、[human-in-the-loop](https://github.com/openai/openai-agents-python/blob/d2bda3f3110415bf02e526a3983b0d0fa903e0d7/docs/human_in_the_loop.md)、[guardrails](https://github.com/openai/openai-agents-python/blob/d2bda3f3110415bf02e526a3983b0d0fa903e0d7/docs/guardrails.md)、[RunState](https://github.com/openai/openai-agents-python/blob/d2bda3f3110415bf02e526a3983b0d0fa903e0d7/docs/ref/run_state.md) |

## 二、逐格对照：生态怎么做／我们的缺口／具体改动候选

### A3-1｜把“谁保有控制权”写进任务边

**生态怎么做。** LangChain 与 OpenAI Agents SDK 都明确区分 manager-as-tools 和 handoff；LangGraph／CrewAI Flow 进一步把顺序、条件、并行和循环写成图或事件边。AutoGen 则把 selector、round-robin、handoff 与强 Orchestrator 分为不同 team 形态。【E1】

**我们的现状与缺口。** Mode A 已规定单临时协调者和单一派发权威；Orca Run／Task／Dispatch 与协作形态卡也能表达父子关系和 worker 生命周期。但一次派发究竟是“协调者保有控制的子任务”“把后续控制交给新所有者”“独立审阅”，仍主要由 Issue 与消息正文解释。恢复 Session 可以找到对象，却可能需要重新推断控制边语义。【E1：本仓协作权威、Mode A 决定与 `orchestrated-collaboration`；I：缺口判断】

**具体改动候选。** 在一次自然派发里试记只读字段 `control_edge = manager_task | ownership_handoff | independent_review`，并同时记录 `routing_basis = deterministic | model_suggested | owner_decision`。字段只描述已获授权的控制关系，不授予权限。【I】

**门。** 先手工附在现有 Task／Dispatch 合同；只有发生一次恢复歧义、重复消费或错误接管，且字段能让未参与者唯一复原控制权，才考虑加入结构化派发校验。若只是措辞问题，更新示例即可，不扩展运行时状态机。

### A3-2｜把任务语义补到现有结构化派发，不另造任务平台

**生态怎么做。** CrewAI Task 把 description、expected output、agent、tools、context、结构化输出、guardrail 和重试放进任务对象；LangGraph state／Command／Send 与 OpenAI SDK 的结构化 handoff input 让路由和数据形状可检查。【E1】

**我们的现状与缺口。** 当前协作合同已要求 `contractRepo`、`executionRepo`、`worktree`、`ownedPaths`、`delivery` 五项放置字段，并通过 GitHub Issue 保存目标、约束与验收条件；这比单纯聊天派发更适合跨 Session 恢复。尚未统一编码的是协调形态、停止原因和期望运行事件，语义仍散在 Issue／Task 文本里。【E1+I】

**具体改动候选。** 复用 [`A2-1`](https://github.com/Eridanus117/agent-control/blob/36c9393147dc2701c32e4259121f9aee60422222/learning/ecosystem-study/capability-gaps.md#L36)／[`A2-3`](https://github.com/Eridanus117/agent-control/blob/36c9393147dc2701c32e4259121f9aee60422222/learning/ecosystem-study/capability-gaps.md#L38) 的结构化能力与交接候选，在同一份派发 envelope 中增量试验 `control_edge`、`termination_contract`、`expected_events`；不新建第二套任务数据库，不把 GitHub 权威复制进 Orca。【I】

**门。** 第一轮仅生成并人工复读一个 envelope；只有自然运行证明某字段能阻止实际错派或漏验，且无法由现有字段表达，才进入 TypeScript 预检器。任何编译结果都不得扩大 Issue 授权、工具权限或写入所有权。

### A3-3｜以恢复不变量连接 GitHub 持久合同与 Orca 运行事实

**生态怎么做。** LangGraph 通过 thread checkpoint、pending writes 与 task 缓存降低恢复时的重复执行；CrewAI checkpoint 保存进度和 lineage；AutoGen team state 与 OpenAI RunState 支持保存、加载或跨进程继续。各家都隐含同一要求：恢复点、已完成工作和副作用边界必须可辨认。【E1】

**我们的现状与缺口。** GitHub 保存长期意图、授权、决定和验收，Orca 保存运行过程；Session 可丢弃，临时协调者可替换。这一分层比把全部内容塞进框架 checkpoint 更符合我们的真相源边界。但目前没有自然样本证明：更换协调者后，恢复者能同时绑定当前 Issue revision、Run／Task／Dispatch、交付物 head，并避免重复外部写入。【E1+U】

**具体改动候选。** 复用 [`A2-6`](https://github.com/Eridanus117/agent-control/blob/36c9393147dc2701c32e4259121f9aee60422222/learning/ecosystem-study/capability-gaps.md#L41) 的后端退出演练与 [`A5-C6`](https://github.com/Eridanus117/agent-control/blob/7b982e2e07f6979a4a7eab294c3bd291f3c60fd6/learning/ecosystem-study/context-engineering.md#L211-L219) 的计划性交接，在首个合适的 Mode A 自然任务中增加恢复断言：`contract_revision`、`dispatch_generation`、`artifact_head`、`consumed_event`、`side_effect_idempotency` 均可由远端重读；不新增数据库。【I】

**门。** 仅在现有任务本来就要经历协调者替换或恢复时取证，不为研究制造额外写操作。若一次自然样本全部可复读，保留为协议样例；若出现重复副作用、错绑 head 或代际不明，再单独形成实现合同。

### A3-4｜把停止、停滞和重规划分开

**生态怎么做。** AutoGen termination condition 能组合最大消息数、token、超时、handoff、指定来源、函数调用和外部停止；Magentic-One 的 Progress Ledger 负责判断停滞并触发 replanning。LangGraph 的条件边／interrupt 与 CrewAI router／guardrail 也把继续、等待、重试和换路拆开。【E1】

**我们的现状与缺口。** Issue 合同与 `adaptive-problem-solving` 已要求成功条件、停止条件、失败门和换路；Orca 能报告 worker lifecycle、消息与 Delivery。缺口不是没有停止规则，而是自然派发中缺少统一的 `stop_reason`，容易把“worker 已交付”“等待负责人”“预算耗尽”“控制假设被推翻”混成一个完成状态。【E1+I】

**具体改动候选。** 在一个自然 Run 的 Task 合同与交付回执中手工使用终止向量：`success | budget | timeout | stall | owner_decision | external_stop | superseded`，并为 `stall` 附最近有效进展与下一次检查条件。重规划仍由 APS 判断，不由计数器自动扩大范围。【I】

**门。** 只在已有停止条件无法被未参与者唯一解释时试验；连续两个自然样本显示同类误判，才考虑加入 Orca／Skill 的必填校验。阈值按任务合同决定，不从某个框架照抄固定轮数或 token 数。

### A3-5｜把框架内 critic／guardrail 与独立三方审阅严格分层

**生态怎么做。** AutoGen team 示例可加入 critic／reflection；CrewAI Task guardrail 可验证输出并重试；OpenAI Agents SDK 提供 input、output、tool guardrail 和逐 tool call approval；LangGraph interrupt 可让人在持久状态上介入。这些机制主要约束一次运行的输出或动作。【E1】

**我们的现状与缺口。** CF-6“三方审阅一致制”要求冻结同一决定包、三席独立身份、一席异族模型、先密封后公开、哈希与远端稳定键两轮核验；否决、存疑或身份不可证都回到负责人。它比同一 team 内的 critic 或多数投票承担更强的授权与独立性语义，但目前证据等级仍为 M0 静态实现，没有自然成功样本。【E1：CF-6；U：自然效果】

**具体改动候选。** 不引入框架 critic 取代 CF-6；在 G2／G3 与 C3=A 均满足的首个自然决定中，按既有 CF-6 采集 `decision_revision`、包哈希、三席稳定身份、模型族、密封 ID、最强反方、判定与转负责人原因，交由未参评者复核。【I】

**门。** 只有负责人已明确授权替代决定且普通路径真实阻塞才进入；起草者／实施者不计票，任何不一致都不消费决定。自然样本若未减少负责人问询或无法证明独立性，退回负责人直接决定，不继续叠加 reviewer。

### A3-6｜建立最小跨源事件包，而不是统一真相库

**生态怎么做。** LangGraph checkpoint／task、CrewAI event history／lineage、AutoGen runtime message／identity 和 OpenAI Agents SDK run items／trace 都把运行变成可观察事件序列。框架通常可以在自身 runtime 内统一状态与 trace。【E1】

**我们的现状与缺口。** 我们刻意把 GitHub 合同事实与 Orca 运行事实分开，Orca TUI 只是观察面。这避免把瞬时进度写成持久授权，但跨源诊断仍依赖操作者同时重读 Issue／PR 与 Run／Task／Dispatch；A2-7 已提出“合同／运行时只读事实卡”，尚无自然证据证明最小字段足够。【E1+U】

**具体改动候选。** 直接复用 [`A2-7`](https://github.com/Eridanus117/agent-control/blob/36c9393147dc2701c32e4259121f9aee60422222/learning/ecosystem-study/capability-gaps.md#L42)，不新立观测平台：在只读事实卡中试验事件包 `source`、`observed_at`、`run/task/dispatch`、`event_type`、`subject`、`artifact_head`、`cause`、`stop_reason`，并保留每个来源自己的水位和链接。【I】

**门。** 只有一次真实诊断因跨源错绑、陈旧水位或完成语义混淆而失败，且手工事件包能复原原因，才考虑持久验证器。不得把 Orca 过程状态回写成 GitHub 授权，不引入 SaaS tracing 或永久协调者。

## 三、候选汇总与优先级

| 候选 | 作用对象 | 净新增／复用 | 最小可验证信号 | 进入实现合同的门 | 当前证据 |
| --- | --- | --- | --- | --- | --- |
| A3-1 控制边语义 | Orca Task／Dispatch、Mode A | 净新增协议字段 | 未参与者能唯一判断控制权是否转移 | 出现一次恢复歧义、重复消费或错误接管 | E1+I |
| A3-2 派发 envelope 增量 | 结构化派发 | 复用 A2-1／A2-3 | envelope 能阻止真实错派／漏验 | 现有字段不能表达且自然样本有收益 | E1+I |
| A3-3 跨源恢复不变量 | Mode A 临时协调者、GitHub／Orca | 复用 A2-6／A5-C6 | 替换 Session 后无重复副作用且 head／代际可复读 | 自然恢复暴露错绑或幂等缺口 | E1+U |
| A3-4 终止向量与 `stop_reason` | Task 合同、交付回执 | 净新增协议字段 | 未参与者能区分成功、等待、停滞与替代 | 连续两个自然样本出现同类误判 | E1+I |
| A3-5 首个 CF-6 自然样本 | 三方审阅 | 复用既有 CF-6 | 三席独立性、密封、哈希与远端稳定键可复读 | G2／G3、C3=A、负责人已有替代授权 | E1+U |
| A3-6 最小跨源事件包 | 只读运行事实卡 | 复用 A2-7 | 能复原一次真实跨源诊断 | 先有错绑／陈旧水位失败，再谈验证器 | E1+U |

建议顺序：先在自然运行中手工试记 A3-1 与 A3-4；遇到真实恢复窗口时验证 A3-3；只有实际错误证明价值后再推进 A3-2／A3-6；A3-5 独立受其高门约束，不因本研究自动启动。【I：基于上表 E1 事实与 U 缺口的适配排序】

## 四、矛盾处保留我方边界

| 生态惯例或诱惑 | 我方保留边界 | 原因与证据等级 |
| --- | --- | --- |
| 让 LLM selector／handoff 自主决定下一所有者 | 模型可建议路由，但不能转移授权、写入所有权或 Mode A 的单一派发权威 | 当前权威边界；I：框架便利性不构成授权证据 |
| 把框架 checkpoint／shared state 当作唯一真相 | GitHub 继续保存持久合同，Orca 继续保存运行事实；仅以稳定键连接，不复制整层状态 | 当前协作权威 E1；框架状态只证明可恢复执行，不证明组织授权 |
| 用 critic、reflection 或多数票替代独立审阅 | CF-6 保留三席独立、异族模型、先密封后公开、全票一致与失败转负责人 | CF-6 E1；自然收益仍为 U |
| 把 agent 名称／persona 固化为长期角色 | Session 职责继续由当前 Issue 合同与写入所有权决定，临时协调者任务后退出 | Mode A 与仓库入口 E1 |
| 看到框架有 tracing 就接入托管观测平台 | 先用现有远端事实和最小只读事件包验证诊断收益；凭据、隐私、退出成本另过门 | 当前权威 E1；采用收益 U |
| 把 Magentic-One 的 stall 判断直接变成自动重规划 | stall 只作为证据；方向、范围和成本变化仍交由 APS 与负责人门处理 | 当前问题求解治理 E1 |
| 继续把 Swarm 当作当前 OpenAI 采用目标 | Swarm 只保留为极简 handoff 历史样本；当前比较基线是 Agents SDK | Swarm 官方 README E1 |
| 因框架支持分布式 worker 就建立永久协调服务 | 保留单临时协调者、Session 可丢弃与 event-first／必要时周期兜底，不建设常驻协调者 | Mode A E1；长期 ROI 尚为 U |

## 五、路线选择

| 路线 | 收益 | 代价／风险 | 判断 |
| --- | --- | --- | --- |
| A．保持现状，只依赖自然语言合同 | 零新增维护成本 | 控制边、停止原因和恢复不变量继续靠参与者推断 | 【I】可作为无真实失败时的基线 |
| B．直接采用一种多 Agent 框架 | 快速获得图、checkpoint、termination、trace 等现成抽象 | 与 GitHub／Orca 双层事实重叠，形成第二运行时和退出成本；仍不能替代授权与写入所有权 | 【I】当前不推荐 |
| C．从生态提取协议字段，在现有 GitHub／Orca 上做自然样本 | 保留现有边界，同时验证最小缺口；失败可回退为文档样例 | 自动化收益出现较慢，需要纪律性复读 | 【I】**推荐，中高置信** |
| D．自建完整图运行时／群聊框架 | 所有语义可自定义 | 成本最高，当前没有证据表明主瓶颈是缺少运行时 | 【I】不进入当前候选 |

**最强反方。【I】** 现有 Issue、Task 和 Skill 已能用文本表达这些信息；新增字段可能只制造形式负担。

**回应。【I】** 所以候选先附着在自然样本，只有能避免真实错派、误停或错绑才进入实现。

**翻转条件。【U：尚待自然任务或未来后端验证】** 若连续自然任务均可由未参与者无歧义恢复，且没有重复副作用、错误接管或停止误判，则 A3-1／A3-4 保持文档级，不进入产品实现；若未来选定的后端原生稳定提供等价字段与退出能力，则优先薄适配上游，不自建。

## 六、明确不做

- 不把研究候选写入权威，不修改 Skill、Plugin、Orca 或 GitHub 工作流。
- 不安装、接入或基准测试 LangGraph、CrewAI、AutoGen、Magentic-One、Swarm 或 OpenAI Agents SDK。
- 不建立新的任务数据库、共享状态库、常驻调度器、轮询服务或托管 tracing 依赖。
- 不让模型路由、critic、guardrail 或多数票产生授权、扩大范围或替代负责人决定。
- 不把框架的营销性效果主张升级为已验证能力。
- 不重复 A2 的能力画像／退出演练，也不重复 A5 的上下文防火墙／计划性交接；本格只增加编排协议视角。

## 七、知识维护与失效条件

### 已复用的当前知识

- 本仓 `_archive/authority/04-collaboration.md`：GitHub／Orca 真相源分层、当前 MVP 与长期依赖边界。【E1】
- [关联 #172（协调者操作模式收敛）](https://github.com/Eridanus117/agent-control/issues/172)：Mode A 已采纳的控制边界。【E1】
- `orchestrated-collaboration` 0.2.3 与 CF-6：排他所有权、结构化派发、运行事实和三方审阅协议。【E1】
- [`capability-gaps.md` 固定 commit 的 A2-1／A2-3／A2-6／A2-7](https://github.com/Eridanus117/agent-control/blob/36c9393147dc2701c32e4259121f9aee60422222/learning/ecosystem-study/capability-gaps.md#L36-L42) 与 [`context-engineering.md` 固定 commit 的 A5-C6](https://github.com/Eridanus117/agent-control/blob/7b982e2e07f6979a4a7eab294c3bd291f3c60fd6/learning/ecosystem-study/context-engineering.md#L211-L219)：A2／A5 已有候选与门；本格不把研究文件当权威。【E1：已合并研究交付】

### 本次新增、冲突与可信度门

- **新增差量**：用跨框架的一手证据把控制边、终止向量、恢复不变量和跨源事件包映射到现有组件。
- **冲突处理**：生态偏向运行时统一状态与内置自治；我们保留合同／运行事实分层、单一派发权威、独立审阅和负责人门。
- **价值门**：候选必须减少一次真实错派、重复副作用、误停、跨源错绑或负责人问询；只提高“看起来结构化”不算收益。
- **可信度门**：当前最多是 E1 支撑的设计推断，能力证据仍为 M0／U；没有自然样本前，不进入当前系统设计的已证实能力。

### 未知

- 自然任务里 control edge 与 termination vector 的误解频率是多少。【U】
- Mode A 更换临时协调者时，现有 GitHub／Orca 稳定键是否已足够避免重复副作用。【U】
- CF-6 首个自然样本能否以可接受墙钟降低负责人问询，同时保持真实独立性。【U】
- 各框架在我们的 Windows、Orca worktree、GitHub 合同和私域约束下的实际集成成本与退出成本。【U】

### 失效条件与最小复核

以下任一发生时重查本格：Mode A 或真相源边界改变；Orca 新增稳定的图／checkpoint／termination 语义；CF-6 获得首个自然样本；任一上游框架改变核心控制或持久化模型；两个自然运行出现同类错派、误停或恢复失败。

最小复核只需：重读变化框架的官方 architecture／multi-agent／state／termination 页面；重读当前协作权威、Mode A 决定与相关自然样本；不做无变化来源的定时全量重查。

## 当前停止点

A3 研究格已经回答“生态怎么做／我们的缺口／具体改动候选”，候选均有进入门、失败门或翻转条件。当前没有实施授权，也没有自然样本足以把任何候选升级为已证实能力；因此在研究交付与 Draft PR 处停止。
