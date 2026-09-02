# 上下文工程生态：从周期回锚走向战略／战术上下文隔离

> 核验日期：2026-08-12<br>
> 结构位置：关联 [#165（生态情报持续改进我们的系统）](https://github.com/Eridanus117/agent-control/issues/165) 的 A5「上下文工程」，上承关联 [#164（研究与学习程序）](https://github.com/Eridanus117/agent-control/issues/164)。<br>
> 服务的决定：怎样缓解单协调者在长跑中被 Task、Delivery、worker、worktree 和看板维护噪声淹没，导致战略视角被稀释。<br>
> 交付边界：只调研、映射和提出改动候选；不修改 `authority/`、Skill、Plugin、Orca、Project 或运行配置，不实施本文建议。<br>
> 证据边界：外部事实来自官方文档、官方工程文章和论文原文；没有安装或对比运行外部产品，也没有复跑厂商评测。当前系统事实来自本仓当前权威／知识，以及本次派发给定的运行观察；后者未由本 worker 独立进入协调 Run 复核。

## 结论先行

**有比“周期性战略回锚”更好的设计，但不是用另一种摘要替换它。** 推荐把周期回锚降为兜底，把主机制升级为：

```text
持久真源（authority／Issue／PR／Orca 当前执行事实）
        │
        ├─ 按需检索、只取本轮相关增量
        ▼
战略控制上下文（目标、授权、成功条件、关键假设、决定、风险、下一门）
        ▲
        │ 只接收少量、结构化、可追溯的事件与引用
上下文防火墙
        ▲
        │
战术维护 worker（任务巡检、Delivery 分类、运行状态、worktree 核验、长工具输出）
```

这套设计把问题从“协调者多久提醒自己一次战略”改成“哪些信息有资格进入战略上下文”。它同时使用五个手段：**战略／战术分面、战术卸载、事件驱动回锚、显式上下文预算、按需检索与计划性交接**。周期回锚仍保留，用于发现漏报和机制失效，但不再承担清除全部战术污染的主责任。

推荐强度为**改动候选，粗粒度置信中高**。生态的一手材料充分支持各构件；“它们组合后会优于我方现行周期回锚”仍是本文推断，必须用自然运行波次验证，不能写成已经生效的系统能力。

## 证据读法

本文逐项使用以下标记：

- **E1｜一手核验**：本次直接读取产品官方文档、官方工程文章、论文原文，或本仓当前权威／正式当前知识；厂商自己的效果数字另标“厂商自述”，不等于独立复现。
- **E2｜二手转述**：第三方整理、媒体文章或无法回到原始材料的转述。本次关键结论未依赖 E2；若正文提及，只能作为发现线索。
- **I｜本文推断**：由多条 E1 材料映射到我方问题后的判断，不是来源原话，也不是已获准产品决定。
- **U｜未知**：现有材料不足，或尚未取得我方自然任务样本。

证据等级回答“主张从哪里来”，不回答能力是否已经被产品采用。本文整体最多支持**研究交付／改动候选**。

## 一、为什么“更长的上下文”与“定时回锚”都不够

1. **长窗口不是无损注意力。** TACL 论文 [Lost in the Middle](https://aclanthology.org/2024.tacl-1.9/) 直接测试多文档问答与键值检索，发现相关信息位于长上下文中部时性能会显著下降；Anthropic 也把上下文描述为边际收益递减的有限注意力预算。[E1]
2. **摘要会丢失后来才显得重要的细节。** Claude Code 官方说明，自动压缩会先清理旧工具输出、再总结会话，但早期详细指令可能丢失；因此持久规则应放在 `CLAUDE.md` 等可重新注入的外部载体，而不是只依赖聊天历史。[E1]
3. **周期回锚只能纠正已发生的污染。** 如果每条心跳、工具输出、状态变化和 worktree 维护都已进入同一协调上下文，回锚只是定时把目标重新放到噪声之上，没有减少下一周期继续注入的噪声。[I]
4. **固定时间不是最有信息量的触发。** 里程碑、决定形成、关键假设失效、任务波次收口和上下文预算逼近，通常比“又过了若干分钟”更能说明需要重建战略视图。固定周期仍可发现漏报，但不应成为唯一触发。[I]

因此，根因控制的顺序应是：**先阻止低价值战术信息进入，再按需检索；仍然过载时压缩或计划性交接；最后才靠周期回锚兜底。**

## 二、生态做法：七种互补机制

### 2.1 压缩与摘要：先删低价值工具结果，再压缩会话

| 项目 | 真实做法 | 适用边界 | 证据 |
| --- | --- | --- | --- |
| Claude Code | 接近窗口上限时先清除旧工具输出，再总结会话；`/compact` 可指定关注点；根级 `CLAUDE.md`、自动记忆等从磁盘重新注入。官方还明确列出压缩后哪些内容会丢失、何时重新加载。 | 适合保持同一对话的连续性；不能保证早期细节无损，也不能把摘要当合同。 | [Claude Code 工作原理](https://code.claude.com/docs/en/how-claude-code-works)、[上下文窗口](https://code.claude.com/docs/en/context-window) [E1] |
| Cursor | 长对话到达上下文窗口上限时自动总结，也可用 `/summarize` 主动释放空间；`@folders` 可把目录加入上下文，文件或目录过大时界面会显示未完整纳入的提示。 | 适合延续对话与代码导航；被摘要或未完整纳入的内容不能视为仍被完整保留。 | [Cursor 1.6：Summarization triggers](https://cursor.com/changelog/1-6#summarization-triggers)、[Cursor 0.50：Include your entire codebase in context](https://cursor.com/changelog/0-50#include-your-entire-codebase-in-context) [E1] |
| LangChain Deep Agents | 自动总结在模型上下文约 85% 时触发；也可让 Agent 在任务边界主动调用压缩工具，而不是等硬阈值。 | 85% 是该实现的产品默认，不是可直接复制到我方的通用最佳阈值。 | [Deep Agents 上下文工程](https://docs.langchain.com/oss/python/deepagents/context-engineering) [E1] |

共同模式不是“生成一篇万能摘要”，而是三段式：**可安全丢弃的原始工具结果 → 带明确保真字段的阶段摘要 → 从外部真源重新注入长期规则和当前事实**。[I]

### 2.2 子 Agent 卸载：隔离高体积工作，只回传结果或引用

- Claude Code 建议把测试输出、文档抓取、日志处理等高体积操作交给拥有独立上下文的 subagent；主会话只接收相关摘要。官方同时警告：大量 subagent 若各自返回详细结果，仍会反向填满主上下文。[E1]
- LangChain Deep Agents 让 subagent 使用全新上下文独立完成任务，主 Agent 不接收中间几十次工具调用；官方示例要求研究 worker 返回 500 词以内摘要，并把大结果写入文件、由主 Agent 按需读取。[E1]
- Anthropic Research 的 lead／subagent 架构把搜索视为压缩：subagent 在各自窗口里探索，再把高价值 token 返回 lead。其工程文章进一步建议让 subagent 直接把结构化产物写入持久 artifact，只把轻量引用交给协调者，减少多跳转述和复制开销。[E1]

Anthropic 报告多 Agent 研究在其内部评测中相对单 Agent 提升 90.2%，但多 Agent token 约为普通聊天的 15 倍；该数字是**厂商自述且任务域偏广度研究**，只能支持“隔离可能换来容量，且成本很高”，不能支持所有协调任务默认多 Agent 化。[E1｜厂商自述]

### 2.3 检索增强上下文：索引常驻，正文即时取回

Anthropic 将 Claude Code 描述为混合策略：`CLAUDE.md` 等少量稳定信息预先进入上下文，路径、查询、链接等轻量标识常驻；文件和数据通过 grep、glob、查询工具即时取回。它强调 progressive disclosure：先看目录、名称、时间等低成本信号，再逐层加载正文。[E1]

这与静态 RAG 的差别在于，Agent 可以根据前一步发现继续检索；代价是运行时更慢，也可能误用工具或走入死路。因此合理形态通常是**稳定高信号锚点预载 + 词法／结构过滤 + Agent 按需展开**，而不是把所有材料提前塞入，也不是无条件上向量库。[E1]

### 2.4 长程记忆分层：工作记忆、索引与长期材料分开

| 项目 | 分层方式 | 关键启发 | 证据 |
| --- | --- | --- | --- |
| Claude Code | 根级指令；自动记忆的 `MEMORY.md` 索引；按需读取的主题文件。`MEMORY.md` 启动只载前 200 行或 25KB，详细内容移到主题文件。 | 给常驻入口明确预算，让详细记忆保持可发现但不常驻。 | [Claude Code 记忆](https://code.claude.com/docs/en/memory) [E1] |
| LangGraph／LangChain | 短期消息历史与跨 thread Store 分开；长期记忆再分 semantic（事实）、episodic（经历／示例）、procedural（规则／行为）。 | “记住什么”必须按用途分层；事实、经验与行为不能成为同一种记录。 | [LangChain Memory 概览](https://docs.langchain.com/oss/python/concepts/memory) [E1] |
| MemGPT | 借鉴操作系统虚拟内存，在有限上下文与更慢的外部存储之间移动信息，形成多级“虚拟上下文”。 | 不追求把全部历史放在模型窗口内，而是治理换入／换出。 | [MemGPT 论文 v2](https://arxiv.org/abs/2310.08560v2) [E1｜论文原文] |
| Cursor | Memories 按项目保存会话中可供未来引用的事实；1.2 版说明后台生成的记忆需要用户批准。 | 记忆可以旁路当前会话进入持久层，但仍需要信任与审计边界。 | [Cursor 1.0：Memories](https://cursor.com/changelog/1-0#memories)、[Cursor 1.2：Memories GA](https://cursor.com/changelog/1-2#memories-now-ga) [E1] |

共同模式是：**常驻内容必须小而稳定；详细材料保留在外部；记忆写入与检索是两个独立治理问题；摘要／自动记忆不能自动升级成可信知识。**[I]

### 2.5 战术／战略角色分离：外层重规划，内层只推进一步

AutoGen 的 Magentic-One 是最清楚的现成样本。Orchestrator 维护两本账：

- **Task Ledger（外层）**：任务、事实、猜测和总体计划；在持续停滞时重建计划；
- **Progress Ledger（内层）**：每一步检查当前进展、是否完成以及下一位执行者。

官方明确把 Orchestrator 的工作分成更新 Task Ledger 的外循环和更新 Progress Ledger 的内循环，并建议外层规划使用更强推理模型。[AutoGen Magentic-One](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/magentic-one.html) [E1]

Anthropic Research 也让 lead 先把研究计划写入 Memory，subagent 执行独立搜索，lead 只综合结果和判断是否需要下一波；复杂长对话在阶段结束时把必要内容写入外部记忆，再继续新阶段。[Anthropic 多 Agent 研究系统](https://www.anthropic.com/engineering/multi-agent-research-system) [E1]

二者都没有证明“一个永远在线的战略协调者”是必要条件。相反，它们支持：**战略状态应有独立、紧凑、可恢复的载体；战术轨迹不应全部驻留在战略推理上下文。**[I]

### 2.6 上下文预算：既控制窗口，也控制下属回传和任务投入

生态中的预算不是单一 token 上限，而是多层预算：

1. Claude Code 用 `/context` 展示类别占用，允许提前设置自动压缩窗口，并为压缩后重新注入的 Skill 设单项与总量上限。[E1]
2. Deep Agents 用 85% 自动压缩阈值，同时建议把 subagent 回报限定在 500 词以内。[E1]
3. Anthropic Research 给不同复杂度规定不同 subagent 数量与工具调用范围，避免简单查询生成过多 worker；其文章把这种 effort scaling 视为控制多 Agent 成本的关键。[E1｜厂商实践]
4. Claude Code 建议把每份 `CLAUDE.md` 控制在约 200 行以内，并用 path-scoped rule 让细节按需加载；这说明指令预算也属于上下文预算。[E1]

这些数值不可直接成为我方阈值，但证明预算需要同时覆盖：**常驻指令、当前会话、单次战术回报、worker 数量／工具调用和进入下一阶段前的压缩或换 Session 条件。**[I]

### 2.7 周期回锚：生态更常用语义事件和失效信号

本次没有找到把“固定墙钟周期”作为主要长程上下文治理机制的一手实现。更常见的是：

- 任务边界前主动压缩，而不是只等 85% 窗口阈值（Deep Agents）；
- 阶段完成后把关键状态写入外部记忆（Anthropic Research）；
- Progress Ledger 每步检查，连续停滞才回到 Task Ledger 重规划（Magentic-One）；
- 压缩后从磁盘重新注入持久规则和记忆（Claude Code）；
- 切换无关任务时直接清空旧会话，避免旧历史继续挤占新材料（Claude Code）。

因此，生态证据更支持**事件驱动回锚 + 容量阈值 + 周期兜底**，而不是单独依赖固定周期。[I]

## 三、映射到我方：已有能力、六项缺口

### 3.1 已有能力，不应重建

| 我方已有能力 | 对应生态模式 | 当前证据与边界 |
| --- | --- | --- |
| GitHub 合同／Orca 执行事实／Provider 会话三层恢复；六项压缩存续锚点 | 外部真源、结构化 note、压缩后重新注入 | [K12 协调者压缩存续与继任协议](../../_archive/knowledge/coordinator-succession-protocol.md) [E1]。强于单一聊天摘要；但尚无真实协调者继任样本。 |
| 意图、授权、决定、验收与过程执行态分面 | 战略状态与战术状态分离 | [协作权威的产品事实三分](../../_archive/authority/04-collaboration.md#产品事实三分) [E1]。持久真源已经分开，当前问题主要发生在单一协调 Session 的读取与注意力面。 |
| 父／叶 Issue 联邦式推进，任务完成后退出永久协调身份 | 子 Agent／worker 卸载与局部闭环 | [协作权威的联邦式 Session 入口](../../_archive/authority/04-collaboration.md#联邦式-session-入口的后续确认) [E1]。架构已经反对永久中央协调者，但夜间运行仍形成一个长期巡检协调热点。[I] |
| 原始研发记录／可读研发记录双层；权威、知识、任务状态另行分层 | 长期记忆分层 | [研发记忆权威](../../_archive/authority/09-rd-memory.md) [E1]。分层语义成熟，不需要再建一个混合“万能记忆”。 |
| 当前公共知识入口；词法优先，真实改述漏检出现后才评估向量 | JIT retrieval 与渐进披露 | [公共知识检索 K14](../../_archive/knowledge/public-knowledge-retrieval-activation.md) [E1]。现有实验不支持按篇数预建向量层。 |
| 无条件入口与 Skill description 有预算／置换约束 | 常驻上下文预算 | [权威总图的守恒律](../../_archive/authority/00-map.md#守恒律与受限自清理) [E1]。当前预算管静态资产，尚未覆盖协调会话的动态摄入。 |
| APS 已在关键假设变化、自然波次和阶段结束做薄反思 | 事件驱动回锚 | [思考方法权威](../../_archive/authority/03-thinking-methods.md)与当前 `adaptive-problem-solving` 行为 [E1]。语义事件触发已有载体，缺的是把它与协调运行事件、上下文摄入和预算联结，而不是再建一套反思控制器。 |
| 周期性从持久源战略回锚、去数字化派发 | 阶段回顾、effort scaling | 本次派发给定的当前运行缓解 [E1｜任务给定，worker 未独立复核]。方向正确，但仍主要在同一上下文内补救。 |

### 3.2 六项能力缺口

| 编号 | 能力缺口 | 为什么它仍会让协调者过载 | 证据等级 |
| --- | --- | --- | --- |
| G1 | **战略与战术虽在持久载体上分面，却在协调者注意力里重新合流。** | 唯一协调 Session 同时看战略、Task／Delivery、heartbeat、worker、worktree 与看板；载体分层没有形成运行时上下文防火墙。 | E1｜任务给定 + I |
| G2 | **战术维护没有专用所有者与窄回传协议。** | worker 可隔离实现上下文，但巡检、状态分类、长输出和资源维护仍由协调者亲自消费；`worker_done` 的三句摘要只约束结算，不约束日常战术事件的摄入。 | I |
| G3 | **没有协调上下文的动态预算与升级梯度。** | 入口／Skill 有静态字节预算，但没有对主会话占用、未压缩战术事件、单批回传、何时计划性交接的可观察门。 | E1 + I |
| G4 | **APS 已有语义事件反思，但尚未与协调运行事件、上下文预算形成同一触发链。** | 关键假设失效与自然波次已有治理；正常战术噪声、高体积回传和预算逼近却未必触发战略视图刷新，周期检查又会在无变化时产生检查税。 | E1 + I |
| G5 | **缺少只组装“本轮战略增量”的检索面。** | 当前可从 authority、Issue、Project、Orca 和知识恢复，但协调者仍要自行判断哪些来源变了；可发现不等于低成本组装。 | E1 + I |
| G6 | **压缩与继任侧重可恢复性，尚未验证战略保真与自然换班。** | K12 明确无真实继任样本；只证明协议可读，不证明长跑压缩后关键假设、反方和战略权衡零丢失，也不证明换新协调 Session 的总成本低于继续长跑。 | E1 + U |

## 四、八项具体改动候选

以下均为候选，不产生实施授权。编号用于本文件内比较，不是新的任务状态机。

### C1｜P0：战略控制胶囊

从现有真源按需生成一份短“战略控制胶囊”，只含：原始问题、当前阶段、授权边界、成功条件、关键假设及翻转条件、尚未消费的决定、最高风险、下一门、来源链接与观察水位。它是**可重建投影**，不是第二真源；任何字段都必须能回到 authority／Issue／PR／Orca 当前事实。

**对应缺口**：G1、G5、G6。

**验收信号**：新协调 Session 只读胶囊与其来源即可复述当前战略；逐项回读没有把推断升级为决定。

**失败门**：胶囊需要人工重复维护、与真源分叉，或读取它仍必须先恢复大段历史。

### C2｜P0：专用战术维护 worker

把运行巡检、Delivery 首轮分类、heartbeat 聚合、Task／Dispatch 状态核对、worktree 清理候选证据收集交给一个有明确所有权的战术 worker。它只能输出事实、异常和引用，不能作产品决定、改变授权、自动派发、清理资源或写 Project；需要动作时仍由具备合同与权限的执行者处理。

**对应缺口**：G1、G2。

**验收信号**：协调者不再读取正常心跳与完整工具轨迹；战术 worker 的漏报、误报和维护成本可计。

**失败门**：worker 只是把同样噪声换一种格式转发，或成为新的永久中央单点。

### C3｜P0：协调者上下文防火墙

只有五类事件进入战略上下文：**负责人决定、关键假设／授权变化、所有权或安全冲突、里程碑／失败门、交付后的父目标增量**。正常心跳、重复状态、原始日志和详细研究直接留在 Orca、GitHub、文件或 worker artifact；协调者只接收事件摘要、差异和稳定引用。

**对应缺口**：G1、G2、G5。

**验收信号**：同一波次中战略输入条目远少于战术事件，且发生异常时仍能沿引用恢复证据。

**失败门**：过滤造成关键失败或授权变化漏报；一旦出现，先降级为“转发但分区”，不继续加黑盒过滤。

### C4｜P1：事件驱动回锚，周期只作兜底

复用 APS 的薄控制循环，不建立第二套反思控制器；只补充协调面触发映射。在以下语义事件后重建战略胶囊：任务波次收口、关键假设或授权变化、负责人决定被消费、连续停滞触发换路、上下文预算进入升级区、计划性交接前。固定周期只检查“是否漏掉这些事件、真源是否变化”，无变化就不重复生成全文。

**对应缺口**：G4、G6。

**验收信号**：战略变化在同一事件后可见；无变化周期检查的 token／判断税下降。

**失败门**：事件检测不可靠，或周期兜底频繁发现漏报。

### C5｜P1：多层上下文预算与升级梯度

先观测而不复制厂商阈值，至少分四层：

1. **静态预算**：继续使用入口／Skill 守恒律；
2. **战术回传预算**：摘要正文上限、详细 artifact 只传引用；
3. **战略上下文预算**：监测当前会话类别占用与未压缩战略事件；
4. **投入预算**：按任务复杂度限制 worker 数、工具调用和波次。

预算进入预警区先卸载／按需取回，进入压缩区执行高召回阶段压缩，仍无法恢复高信号比例时进入计划性交接。具体比例必须由自然样本预注册，不照搬 85%、500 词或 200 行。

**对应缺口**：G2、G3、G6。

**验收信号**：每次升级能指出命中的预算与采取的动作；压缩或换班后战略事实回归通过。

**失败门**：预算只能统计 token 却不能预测漂移，或为测量引入更高协调税。

### C6｜P1：计划性交接优先于无限续跑

当战略胶囊稳定、同批 Delivery 已处理、写入所有权可明确交出且上下文预算持续超标时，按 K12 做计划性交接：新协调 Session 从真源和胶囊恢复，旧协调者停止继续摄入。不能证明单一协调者、Run 代次和写入所有权时保持只读，不把“新开一个 Session”当作自然获得协调权。

**对应缺口**：G3、G6。

**验收信号**：首个自然交接中 Task／Dispatch 零重复、Delivery 零遗漏、关键战略字段零无来源变化。

**失败门**：恢复成本、遗漏或双协调风险高于继续压缩当前 Session。

### C7｜P2：战略上下文按需组装器

以活动 Issue、父级成功条件和上次观察水位为查询入口，先用明确关系、路径和词法过滤，返回“自上次回锚后会改变战略的来源差异”；只有自然任务出现正式知识 top-3 改述漏检，才按 K14 评估向量或融合。不把 Project／Orca 运行态复制进新的持久数据库。

**对应缺口**：G5。

**验收信号**：同一战略问题的恢复阅读量下降，关键来源召回不退化。

**失败门**：组装结果隐藏来源、产生陈旧缓存或成为第二真源。

### C8｜P2：自然波次 A／B 验证

选择两个复杂度相近、真实发生的协调波次，对比：

- A：现行周期战略回锚；
- B：战略胶囊 + 战术 worker + 上下文防火墙 + 事件驱动回锚，周期仍兜底。

预先记录父目标理解错误／纠正次数、关键决定遗漏、协调者读取的战术事件量、上下文占用或压缩次数、恢复耗时、总周期、负责人注意力和 worker 漏报／误报。不为实验制造任务，也不把单样本胜出升级为产品采用。

**对应缺口**：G1–G6。

**验收信号**：B 在战略错误不增加的前提下，显著减少战术摄入与恢复成本。

**失败门**：样本不可比、观测本身主导成本，或 B 把延迟／遗漏转移到战术 worker。

## 五、选项比较：哪一种优于周期回锚

| 选项 | 主要收益 | 主要代价／风险 | 当前判断 |
| --- | --- | --- | --- |
| A. 仅维持周期战略回锚 | 无新增机制；容易理解 | 继续在同一污染上下文内补救，无法控制噪声摄入 | 可作普通路径与对照组，不足以处理根因 [I] |
| B. 周期回锚 + 更频繁压缩 | 实施成本较低；能延长同一 Session | 摘要丢失、压缩抖动和“压后继续灌噪声”仍在；频率提高还会增加判断税 | 适合作为短期缓解，不推荐为目标形态 [I] |
| C. **战略／战术分面 + 上下文防火墙 + 事件回锚 + 预算／交接** | 在噪声进入前隔离，战略上下文更小且可恢复；各构件已有生态一手实践 | 需要设计事件协议、战术 worker 所有权、漏报回退和首个自然样本 | **推荐，置信中高；先人工有界验证** [I] |
| D. 全自动 RAG／长期记忆平台／常驻调度 | 理论上可进一步降低人工检索与连续性成本 | 建设与维护税高，可能形成第二真源、自动写入错误和长期依赖；我方检索证据尚不支持 | 当前排除；只有自然漏检与正 ROI 才重审 [E1 + I] |

**最强反方**：当前已有联邦 Issue、K12、周期回锚和去数字化派发；增加战术 worker 与事件协议可能把一个协调上下文问题升级成分布式状态一致性问题。

**回应**：因此推荐方案不新增持久状态库，不让战术 worker拥有决定权，只让它把已存在的运行事实压成带引用的少量事件；第一步必须是人工窄协议与可见回退，而不是常驻自动化。[I]

**翻转条件**：如果 A／B 自然样本已能在低协调成本下保持战略错误近零，或 C 的漏报、恢复与所有权成本抵消全部收益，则维持现行设计并只保留静态预算优化。

## 六、建议实施顺序与明确不做

若后续获得独立实施合同，建议按以下依赖推进：

```text
C1 战略控制胶囊 ──┬─→ C3 上下文防火墙 ─→ C4 事件回锚
                   └─→ C2 战术维护 worker
C5 上下文预算 ───────────────→ C6 计划性交接
以上稳定后 ──────────────────→ C8 自然 A／B
真实检索缺口出现后才考虑 ───→ C7 按需组装器增强
```

本次明确不做：

- 不实施任何候选，不改当前权威、入口、Skill、Plugin、Orca 或 Project；
- 不新增自动调度、轮询、离线唤醒或自动清理；
- 不把战术 worker 设为永久协调者，也不让它消费负责人决定；
- 不复制 Orca 过程执行态到 GitHub、Project 或新的数据库；
- 不把自动摘要、Cursor Memory 或 Agent 自写记忆直接升级为当前知识；
- 不照搬外部阈值，不因语料篇数或“上下文很长”预建向量层；
- 不用更大窗口替代真源分层、权限、所有权和验收。

## 七、知识维护结论、未知与下次最少复核

### 7.1 本次复用了什么，补查了什么

- **直接复用的当前知识**：K12 的三层恢复、六项压缩锚点和无真实继任样本边界；K14 的词法优先、自然改述漏检才评估向量边界。[E1]
- **直接复用的当前权威**：长程目标；GitHub／Orca／Provider 分工；联邦式 Session；研发记忆双层；入口与 Skill 守恒律。[E1]
- **增量补查**：Claude Code、Cursor、LangChain／LangGraph、AutoGen Magentic-One、Anthropic Research 与 MemGPT 的压缩、隔离、检索、记忆、预算和战略／战术分面。[E1]
- **没有复用的材料**：未列入 `knowledge/README.md` 的旧研究、普通历史记录与二手生态榜单没有被当成当前知识。

### 7.2 价值门与可信门

生态事实会直接影响“怎样缓解协调者上下文过载”，后续较可能复用，**通过价值门**。官方机制事实具备对象、日期、来源和边界，可作为研究证据；但八项候选尚无我方自然运行样本，**不能通过‘当前有效系统设计’的可信门**，因此本文留在 `learning/`，不进入 `knowledge/` 或 `authority/`。

### 7.3 仍未知

- 当前单协调者的上下文类别占用、压缩前后遗漏率和战略错误基线没有可重复量化；“200+ 编排 task”来自任务给定观察，本 worker 未取得目标 Run 的独立计数。
- 战术 worker 对正常事件的压缩率、关键异常漏报率和维护成本未知。
- 当前 Orca 消息是否已有足够字段直接生成五类战略事件，需在版本匹配的动态指南和真实 Delivery 中验证。
- 首个自然计划性交接是否比继续压缩更便宜，K12 已明确没有真实样本。
- 事件驱动回锚是否会因事件过密退化成另一种高频回锚，需以自然波次观测。

### 7.4 失效条件与最少复核

出现以下任一变化时，只补查受影响部分：Claude Code／Cursor／Deep Agents 改变压缩或记忆语义；AutoGen 改变 Ledger／Orchestrator 架构；我方权威改变 GitHub／Orca 真源分工；K12 获得真实继任样本；K14 出现自然 top-3 改述漏检；协调运行改为多个排他战略协调面。

下次最少复核步骤：

1. 重新打开本文引用的六组官方入口，只核对压缩触发、subagent 隔离、记忆加载上限、Ledger 分工和长程交接语义；
2. 从一个自然高负载 Run 只读统计战略事件／战术事件、单批回传长度、压缩与纠正，不建立常驻采集器；
3. 若形成实施合同，先只试 C1＋C3 的人工协议，再决定是否需要 C2；
4. 只有 C8 取得可比自然样本，才提炼可复用结论并重新过知识可信门。

## 八、来源索引

主要主张已在正文就近引用；本节只为复核导航。仓内相对引用按 `main@602d81b`（完整 SHA `602d81b31204674e0cb7b0590aa255ced18b5954`）复核：正文共 7 个链接，指向 6 个文件，其中 `authority/04-collaboration.md` 有两个显式锚点。

- [Anthropic：Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Anthropic：How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Claude Code：How Claude Code works](https://code.claude.com/docs/en/how-claude-code-works)
- [Claude Code：Explore the context window](https://code.claude.com/docs/en/context-window)
- [Claude Code：How Claude remembers your project](https://code.claude.com/docs/en/memory)
- [Claude Code：Create custom subagents](https://code.claude.com/docs/en/sub-agents)
- [Cursor 1.6：Summarization triggers](https://cursor.com/changelog/1-6#summarization-triggers)；[Cursor 0.50：Include your entire codebase in context](https://cursor.com/changelog/0-50#include-your-entire-codebase-in-context)
- [Cursor 1.0：Memories](https://cursor.com/changelog/1-0#memories)；[Cursor 1.2：Memories GA](https://cursor.com/changelog/1-2#memories-now-ga)
- [LangChain Deep Agents：Context engineering](https://docs.langchain.com/oss/python/deepagents/context-engineering)
- [LangChain：Memory overview](https://docs.langchain.com/oss/python/concepts/memory)
- [Microsoft AutoGen：Magentic-One](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/magentic-one.html)
- [MemGPT: Towards LLMs as Operating Systems v2](https://arxiv.org/abs/2310.08560v2)
- [Lost in the Middle: How Language Models Use Long Contexts](https://aclanthology.org/2024.tacl-1.9/)
