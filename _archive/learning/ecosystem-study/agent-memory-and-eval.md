# Agent 记忆与评估生态：从「记住更多」走向「可治理地记住、可复查地变好」

> 核验日期：2026-08-12
> 研究对象：Mem0、Letta、Zep／Graphiti、cognee、LangSmith、Braintrust，以及 OpenAI／Anthropic 公布的 Agent eval 方法。
> 适用问题：我方治理型长程协作系统怎样吸收外部记忆、检索、追踪和评估设计，同时守住 GitHub 合同真源、Orca 运行面、三方审阅、守恒律，以及知识／研发记忆分层。
> 证据边界：本次只读官方仓库、文档、论文／工程文章和本仓当前权威；没有安装、接入或运行上述产品，也没有复跑厂商基准。文中的性能、规模和效果主张若来自厂商，只视为「厂商一手自述」，不写成我方实测。

## 先给结论

记忆产品真正竞争的不是「有没有向量库」，而是四件事：**写入时怎样提炼、冲突怎样演化、检索时怎样组装、派生结论怎样回到来源**。Mem0 把它包装成低门槛记忆 API，Letta 把它放进长寿命 Agent 的自管理上下文，Zep／Graphiti 把时间与来源做成图的第一等属性，cognee 则把构建记忆做成可替换的流水线。

评估产品真正竞争的也不是「有没有仪表盘」，而是能否闭合：**真实轨迹 → 可诊断失败 → 可复现数据集 → 版本化实验 → 生产反馈 → 新回归用例**。LangSmith 强在 trace／run／thread 与 LangChain 生态的连续体验，Braintrust 强在日志和实验共用数据模型、不可变实验快照与生产数据回流。

对我方最重要的判断是：

1. **保留控制面与数据面的分离。** GitHub Issue／PR 继续承载意图、授权、决定与验收；Orca 继续承载过程执行态；记忆或 trace 产品只能作为派生数据面，不能反向成为合同或授权。
2. **先借鉴写入治理，再考虑新存储。** 来源、观察时间、有效时间、替代关系、失效条件和最少复核步骤，比换成图数据库更能直接改善我方知识与研发记忆。
3. **把评估单位从「最终回答」提高到「合同—轨迹—结果」。** 结果是否满足成功条件、执行轨迹是否越界、父目标能力是否回退，应分别评分，不能揉成一个总分。
4. **三方审阅与 LLM judge 不是同一种东西。** 我方三方审阅是受授权约束的决定机制；自动评分只是证据生产器，不能通过多数票产生授权，也不能替代负责人专属决定。
5. **当前不宜立即引入记忆平台或评估 SaaS。** 我方尚未出现足以推翻现行 Markdown／GitHub 方案的自然检索漏失或大规模人工评估瓶颈；先做一个自然任务中的最小证据闭环，ROI 更高。

## 证据读法与本次样本

本文使用四种标记：

- **一手核验**：本次直接读取官方仓库、官方文档、官方工程文章或本仓当前权威。
- **厂商自述**：来源是一手，但效果、性能或基准由厂商自己发布，未由我方复跑。
- **综合判断**：由多条一手材料推导出的架构或产品判断，明确不是产品方原话。
- **未知**：当前材料不足，或不同官方页面存在冲突。

2026-08-12 通过 GitHub API 读取的开源生态快照如下；star 只说明可见关注度，不证明产品质量、企业采用或适合我方：

| 仓库 | star 快照 | 许可证 | 证据含义 |
| --- | ---: | --- | --- |
| [Mem0 官方仓库](https://github.com/mem0ai/mem0) | 63,094 | Apache-2.0 | 社区关注度很高；不等于托管平台能力已被独立验证。 |
| [Letta 官方仓库](https://github.com/letta-ai/letta) | 24,208 | Apache-2.0 | MemGPT／stateful agent 路线有较强开发者心智。 |
| [Graphiti 官方仓库](https://github.com/getzep/graphiti) | 29,837 | Apache-2.0 | 时间图记忆的开源核心有显著关注度。 |
| [cognee 官方仓库](https://github.com/topoteretes/cognee) | 29,968 | Apache-2.0 | 本地可运行、图＋向量和 Agent 集成路线有显著关注度。 |

本仓已有可直接复用的结论包括：[当前知识权威](../../_archive/authority/01-knowledge.md)、[公共知识检索边界](../../_archive/knowledge/public-knowledge-retrieval-activation.md)、[研发记忆权威](../../_archive/authority/09-rd-memory.md)和[三方审阅知识](../../_archive/knowledge/three-party-review-consensus.md)。本次外部调研补的是产品机制、共同模式与可迁移设计，不改变这些权威。

---

## 一、Mem0：把记忆压缩成 `add/search/update/delete` 的产品接口

### 是什么，怎样工作

Mem0 是一个独立于 Agent 框架的记忆层，面向用户偏好、会话事实、目标和反馈的跨会话复用。它最有吸引力的地方是把复杂流程藏在少数 API 后面：调用 `add` 写入对话，调用 `search` 取回相关记忆，再用 `update`／`delete` 维护生命周期。[官方新增记忆说明](https://docs.mem0.ai/core-concepts/memory-operations/add)把默认写入流程描述为：

```text
消息
→ LLM 提取关键事实／决定／偏好
→ 查询既有记忆并处理重复或矛盾
→ 写入向量存储（可选图存储）
→ 后续按 user_id／agent_id／run_id 检索
```

`infer=True` 时由模型抽取和消歧；`infer=False` 时原样保存，重复保护也随之消失。检索侧把自然语言转成 embedding，再叠加作用域过滤、阈值和可选 reranker。[官方记忆类型说明](https://docs.mem0.ai/core-concepts/memory-types)把记忆按 conversation、session、user、organization 分层，核心作用域是 `run_id` 与 `user_id`。

### 架构与关键设计

根据[官方记忆评估说明](https://docs.mem0.ai/core-concepts/memory-evaluation)，Mem0 当前材料展示了三类存储和多信号检索：

- 向量库保存记忆文本、embedding、元数据与时间；
- entity store 保存实体及其关联记忆；
- SQL 保存写入历史和滚动消息窗口，供审计与抽取去重；
- 检索并行使用 semantic、BM25 keyword 与 entity signal，再做 rank fusion。

这说明 Mem0 的实质不是「一个向量库封装」，而是一个写时压缩器、冲突处理器、作用域模型和读时排序器的组合。

本次还发现一项需要保留的**官方材料冲突**：

- [新增记忆说明](https://docs.mem0.ai/core-concepts/memory-operations/add)写的是检查重复或矛盾，使较新的事实成为当前结果；
- [记忆评估说明](https://docs.mem0.ai/core-concepts/memory-evaluation)又把当前架构描述为 ADD-only，新旧事实并存，旧事实不被覆盖或删除。

两种语义可以通过不同版本、产品层或索引层同时成立，但官方页面没有在本次读取范围内给出足够版本映射。故本文把「冲突事实究竟怎样落盘」标为**未知**；任何采用评估都必须用具体版本、具体后端做写入—检索—历史回读实验。

### 为什么流行或独特

- **一手核验**：API 面很小，且同时有托管和 OSS 路径，容易嵌入现有 Agent。
- **一手核验**：作用域、metadata、过滤、rerank、图增强都被放进同一产品面，避免用户先拼装多套组件。
- **综合判断**：63k 级 GitHub 关注度、框架集成和「几行代码获得个性化」的叙事共同降低了试用门槛。
- **独特处**：与 Letta 的「Agent 自己维护上下文」相比，Mem0 更像应用外部的 memory service；与 Zep 相比，它优先优化接入简单，而不是让时间图成为中心抽象。

### 对我方可借鉴的点

| 可借鉴点 | 为什么适合我方 | 最小第一步 |
| --- | --- | --- |
| 1. 写入必须显式区分「抽取」与「原样保存」 | 对应我方 `knowledge/` 与研发记忆原始层，避免把自动摘要当成原始证据 | 在下一次自然蒸馏样本中，为每条候选加 `source_mode=verbatim|derived` 的人工对照栏，只记录一例，不改公共 schema。 |
| 2. 作用域是检索硬门，不只是排序特征 | 我方可映射为 repo／Issue 子树／用户私域／公共知识，先筛作用域再召回 | 用一个真实查询手工比较「全库搜索」与「先按正式入口＋主题筛选」的 top-3，记录误入来源。 |
| 3. 冲突处理应成为独立、可观察步骤 | 当前知识已经要求旧结论失效退出；可进一步明确替代链 | 在下一次知识更新中手工记录 `supersedes`、旧结论退出理由和回读结果，不引入数据库。 |
| 4. 维护操作需要写后回读 | Mem0 官方 update／delete 流程都要求验证；与我方远端写后核验一致 | 选择下一次自然知识替换，逐条核对入口、正文和旧结论状态，保留最小回执。 |

### 我方已经更好，或不宜照搬

- 我方「保存即可信」和价值门／可信门，比自动抽取后直接进入可检索记忆更适合治理型系统。自动记忆可以形成候选，不能绕过准入。
- GitHub 合同、当前权威、知识和研发记忆已有明确职责；不应压扁成 `user_id`／`run_id` 下的一组同质 memory records。
- 官方冲突语义尚未被我方实测，不能以高 star 或厂商基准决定采用。
- 对私域数据、删除、不可变记忆和托管边界仍需单独审计；本次没有验证合规与退出成本。

**最大启发：记忆服务最有价值的不是「记住」，而是把写入、冲突、作用域和删除做成显式生命周期；我方可以先吸收这套生命周期，而不引入服务。**

---

## 二、Letta：让 Agent 自己管理持续存在的上下文

### 是什么，怎样工作

Letta（源自 MemGPT）把 Agent 视为长期存在的有状态实体，而不是每次请求都重新拼 prompt 的函数。它的核心抽象是 [memory blocks](https://docs.letta.com/guides/core-concepts/memory/memory-blocks)：带 label、description、value、字符上限和读写权限的结构化上下文块。块在挂载时始终可见，并以前缀形式进入 prompt；Agent 通过 memory tools 自己重写内容。

[上下文层级说明](https://docs.letta.com/guides/core-concepts/memory/context-hierarchy)进一步把数据分成：

1. memory blocks：小而重要、持续在上下文、可由 Agent 编辑或设为只读；
2. files：部分打开、可 grep／semantic search 的只读材料；
3. archival memory：不常驻上下文、由工具写入与搜索；
4. external RAG／MCP：更大规模的外部数据。

这是一种「重要度决定离模型多近」的分层，而不只是短期／长期二分。共享 block 可以挂到多个 Agent；只读 block 可以承载组织政策；attach／detach 可以在任务切换时改变上下文。

### 架构与关键设计

- **Agent-managed memory**：description 告诉模型怎样使用某一块，模型负责整理与重写。
- **always-visible 与 retrieval 分工**：最重要内容直接占用上下文；大材料通过文件或归档工具按需取回。
- **共享与只读权限**：同一 block 可被多个 Agent 共享，且可阻止 Agent 修改。
- **可移植状态**：[AgentFile](https://docs.letta.com/guides/core-concepts/agent-file)试图把 system prompt、消息历史、memory blocks、工具、模型配置等序列化，支持检查点与版本化。
- **长期实体与会话分离**：[Letta Agent SDK 仓库](https://github.com/letta-ai/letta-agent-sdk)区分持久 Agent、conversation 和当前 session。

版本边界必须特别注明：[Letta 主仓当前 README](https://github.com/letta-ai/letta)已经说明该仓保存 legacy V1 server，活跃开发迁往新的 Letta Agent／App Server 路线。因此旧 API 文档与新 SDK 的边界可能继续变化，本次没有证明所有上述能力在新旧路径完全等价。

### 为什么流行或独特

- **独特处**：把「记忆」提升为 Agent 自我构成的一部分；persona、human、policy、scratchpad 都可以成为第一等 block。
- **一手核验**：block 的共享、只读、动态挂载以及 AgentFile 的可移植性，形成了从记忆到多 Agent 协调的完整叙事。
- **综合判断**：MemGPT 的研究心智、约 24k star 和开发者可直接观察／编辑 memory block，使长期 Agent 比黑盒向量记忆更易理解。
- **风险也是特色**：能力来自允许 Agent 重写自己的长期上下文；同一机制也会放大错误固化、权限越界和共享写冲突。

### 对我方可借鉴的点

| 可借鉴点 | 为什么适合我方 | 最小第一步 |
| --- | --- | --- |
| 1. 按「是否必须常驻上下文」分层 | 守恒律要求无条件入口有预算；重要度应决定载入方式 | 对现有入口做一次只读分类：必须常驻、任务按需、仅追溯三类；只报告候选，不改入口。 |
| 2. 每个记忆块必须有用途描述与写权限 | description 决定模型如何使用，read-only 守住政策 | 在下一项新增可复用记录中同时写「用途／谁能改／何时失效」，观察是否减少误用。 |
| 3. attach／detach 比永久塞入 prompt 更适合任务切换 | 可降低上下文税，又保持明确发现路径 | 选择一个自然任务，记录实际加载的最窄权威集合与未加载材料，验收是否足够恢复。 |
| 4. Agent 状态需要可移植检查点 | 长程任务会跨模型、Session、主机恢复 | 用现有 GitHub 合同＋Orca 身份＋仓库提交构造一张只读「恢复包映射」，验证新 Session 能否逐项定位。 |

### 我方已经更好，或不宜照搬

- 我方把权威、合同、过程态、知识和研发记忆分开；这比让一个 Agent 自己维护混合长期状态更能防止历史事实反向产生授权。
- 共享 memory block 是共享单点，若允许多个 Agent 直接编辑，会重新引入我方已显式治理的单写者问题。
- 始终可见的 block 会直接消耗上下文，且可能把暂时经验固化成行为。守恒律要求先证明常驻价值。
- AgentFile 的可移植思想值得借，但完整历史、工具源码、环境变量等打包也带来秘密泄露与陈旧状态恢复风险；我方不能默认导出完整状态。

**最大启发：上下文工程的首要问题不是「怎样召回」，而是「什么必须始终在场、什么只能按需出现、谁有权改它」。**

---

## 三、Zep／Graphiti：把「事实何时成立、从哪里来」做成图结构

### 是什么，怎样工作

Graphiti 是 Zep 开源的 temporal context graph 引擎；Zep 是围绕它提供用户／线程管理、上下文组装、治理和托管性能的产品层。[Graphiti 官方仓库](https://github.com/getzep/graphiti)把数据建模为：

- entity nodes：人、产品、政策、概念等实体；
- fact edges：实体之间的关系与事实，并带有效时间窗；
- episodes：原始对话、文本或 JSON，作为派生事实的来源；
- custom types：预定义或从数据学习的 ontology。

写入新 episode 时，系统增量抽取实体与关系，判断旧事实是否失效，并保留历史，而不是重算整个图。[事实说明](https://help.getzep.com/facts)给每条 fact 四个时间：

| 字段 | 含义 |
| --- | --- |
| `created_at` | 系统何时得知该事实 |
| `valid_at` | 事实在现实中何时开始成立 |
| `invalid_at` | 事实在现实中何时不再成立 |
| `expired_at` | 系统何时得知它已经失效 |

这实质上区分了「现实有效时间」与「系统观察时间」。[episode 说明](https://help.getzep.com/episodes)又保证原始输入可逐字取回，让派生 fact 可以回到来源。

### 架构与关键设计

- **时间是 schema，不是 metadata 装饰**：旧事实失效但保留，可回答当前与历史问题。
- **provenance 一等化**：entity／edge 都能回到 episode，避免只剩不可审计摘要。
- **增量图构建**：持续吸收消息、文档和结构化业务数据，不要求批量重算。
- **混合检索**：[图搜索说明](https://help.getzep.com/searching-the-graph)组合 semantic、BM25 与图遍历，并提供 RRF、MMR、cross encoder 等 reranker。
- **context assembly 产品化**：[上下文检索说明](https://help.getzep.com/retrieving-context)可以自动用最近两条消息查询整个 user graph，组装 user summary、facts、entities、episodes 等；也支持模板和完全自定义组装。

官方文档同时说明一个重要现实边界：图摄入可能延迟数分钟，因此仍建议把最近 4–6 条原始消息作为短期上下文；Zep context block 是长期上下文，不替代最新原文。

### 为什么流行或独特

- **独特处**：四时间字段和 episode provenance 直接面向「事实变化」与「后来才得知变化」的问题，强于普通向量库的最后写入覆盖。
- **一手核验**：Graphiti 开源、支持多种图后端，并提供 MCP；Zep 提供托管 context assembly 和用户／线程层。
- **综合判断**：约 29.8k star 表明「时态图＋Agent memory」叙事有显著吸引力；它尤其适合用户偏好、账户状态、组织关系等会变化的事实。
- **厂商自述边界**：Zep 的延迟和 benchmark 数字没有在本次复跑，不能与 Mem0／cognee 的自报数字直接横比。

### 对我方可借鉴的点

| 可借鉴点 | 为什么适合我方 | 最小第一步 |
| --- | --- | --- |
| 1. 分开观察时间与有效时间 | 我方已有 `observedAt`，但知识结论还可更明确记录何时开始／停止适用 | 下一次发生真实权威替代时，手工记录 `observed_at`、`valid_from`、`valid_to`，核对两者是否真的不同。 |
| 2. 派生结论必须可回到原始 episode | 对应研发记忆原始层与可读层 | 选择一条可读研发结论，检查它能否定位原始评论／工具输出；缺失只登记，不补造。 |
| 3. 失效而不抹除历史 | 与我方知识「退出为历史证据」一致，可强化替代链 | 在一次自然知识更新中保留旧提交定位、退出原因和新结论来源，不把旧正文继续列为当前包。 |
| 4. 混合检索先做 rank fusion，再谈单一神奇模型 | 与 K14 的 BM25 基线和 RRF 边界吻合 | 只有出现真实改述漏检后，按 K14 用同一查询集比较 BM25、向量和实际融合。 |
| 5. context assembly 要显式带有效期 | 防止 Agent 把历史事实当成现在 | 下一次人工组装上下文时，把一条已失效事实明确标成历史，观察 Agent 是否仍误用。 |

### 我方已经更好，或不宜照搬

- GitHub 远端合同已经天然保存时间线、作者、评论和 diff；对合同与决定再建一份知识图会形成第二真源。
- 图抽取依赖模型，会产生实体合并、关系误判和时态推断错误；对授权、验收与负责人决定不能自动入图后直接消费。
- 我方公共知识当前没有足够检索漏失证据来授权图数据库；K14 已直接证明篇数本身不是启动向量层的信号，图层更不应由篇数触发。
- Zep 默认偏高召回且摄入有延迟；治理任务更需要精确作用域、最新合同和明确失败门，不能把 context block 当成权威快照。

**最大启发：真正值得从图记忆借来的不是「图」，而是双时间和来源链；这两项用 Markdown／Git 也能先验证价值。**

---

## 四、cognee：把记忆构建做成可组合的 ECL／Task／Pipeline

### 是什么，怎样工作

cognee 是一个开源 memory control plane，把原始数据转成可搜索、可关联的记忆。[核心概览](https://docs.cognee.ai/core-concepts/overview)显示其 v1.0 主接口是：

```text
remember → recall → improve → forget
```

旧的 `add → cognify → search/memify` 仍作为较低层构件存在。`remember` 可以写入永久图记忆或 session memory；`recall` 做 session-aware 与 graph-backed 检索；`improve` 丰富记忆并可把 session 经验桥接进永久图；`forget` 按 item／dataset／user 删除。

[Cognify 说明](https://docs.cognee.ai/core-concepts/main-operations/legacy-operations/cognify)把图构建展开成六步：文档分类、权限检查、切块、LLM 抽取图、摘要、写入 DataPoints 与 embedding。它强调的是「把记忆编译出来」，而不是单次聊天中的即时抽取。

### 架构与关键设计

- **三存储**：relational 保存文档、chunks 与 provenance；vector 做语义相似；graph 保存实体与关系。
- **三构件**：DataPoints 是结构化知识单元，Tasks 是单步转换，Pipelines 编排多个 Tasks。
- **可替换后端**：本地轻量默认与生产后端通过接口切换。
- **数据集与权限**：[Pipeline 说明](https://docs.cognee.ai/core-concepts/building-blocks/pipelines)把 user、dataset、read/write/delete/share 权限和处理状态放进执行层。
- **内建评估**：[评估框架说明](https://docs.cognee.ai/integrations/eval-framework)提供 corpus builder → answer generation → evaluation → dashboard，能比较图检索、无图检索等策略，并保留逐题答案、上下文、分数和 judge 理由。

### 为什么流行或独特

- **独特处**：相比 Mem0 的黑盒简化，cognee 把提取、图构建、摘要、存储和自定义任务暴露成可组合流水线。
- **一手核验**：本地默认、后端适配、ACL、ontology、MCP／Agent 集成和内建 eval 形成完整开发面。
- **综合判断**：约 30k star、六行 quickstart 和「GraphRAG 可定制」兼顾了入门叙事与架构可塑性。
- **当前演化快**：[官方 release](https://github.com/topoteretes/cognee/releases)在 2026 年仍持续增加 topic index、truth subspace、feedback reranking 等能力；这也是版本与维护风险信号。

### 对我方可借鉴的点

| 可借鉴点 | 为什么适合我方 | 最小第一步 |
| --- | --- | --- |
| 1. 把蒸馏拆成可验收阶段 | 我方已有过程层→蒸馏层，但可进一步观察每一步输入输出 | 在下一条知识候选上记录「来源定位→主张抽取→冲突检查→可信门→入口写入」五个手工状态。 |
| 2. DataPoint 要同时带内容与 provenance | 适合知识卡和研发记忆可读层 | 用一条现有结论演示最小字段：claim、source、scope、observedAt、invalidates；仅作研究示例。 |
| 3. Pipeline task 应可单独测试和替换 | 便于比较词法、向量、图抽取，而不替换整套系统 | 下一次真实漏检只替换检索臂，保持同一数据集、金标和其他步骤不变。 |
| 4. 检索系统应带自己的评估工件 | cognee 保留逐题上下文与分数，便于诊断 | 对下一次检索对照保存逐查询 top-3、金标、失败类型和耗时，而不只保留总 hit@k。 |

### 我方已经更好，或不宜照搬

- cognee 的「truth subspace」是检索／反馈术语，不等于我方通过价值门与可信门的当前知识；命名不能产生可信地位。
- 三种数据库、pipeline cache、后台队列与 adapter 会带来显著运维面；我方当前 Markdown 语料与自然漏检证据不足以证明该成本合理。
- 自动 `improve` 或 session→永久图桥接会绕过我方知识准入；在治理系统中只能产出候选。
- 内建 HotPotQA 等检索评估适合 QA，不直接覆盖合同恢复、授权守恒、协作身份和父目标验收。

**最大启发：记忆不是一张表，而是一条可替换、可观测、可逐段验收的编译流水线；我方应先把现有人工蒸馏过程显式化，再决定是否需要引擎。**

---

## 五、LangSmith：把 Agent 的每一步变成 trace，再把 trace 变成评估材料

### 是什么，怎样工作

LangSmith 是 LangChain 团队的可观测与评估平台，但并不限于 LangChain。[可观测概念](https://docs.langchain.com/langsmith/observability-concepts)的数据模型是：

```text
Project
└─ Trace：一次端到端操作
   └─ Run：LLM、retriever、tool、parser 或自定义步骤

Thread：用 session_id／thread_id／conversation_id 串联多轮 Trace
```

run 可以附 feedback、tags 和 metadata；数据可以通过框架集成自动采集，也可以用 decorator、context manager 或低层 RunTree 手工埋点。trace 回答「发生了什么」，feedback 回答「某一 run 在某一标准上怎样」。

[评估类型说明](https://docs.langchain.com/langsmith/evaluation-types)把评估分成：

- offline：benchmark、unit test、regression、backtesting、pairwise；
- online：实时监控、异常检测、生产反馈回流；
- evaluator：LLM-as-judge、code、composite、summary、pairwise。

[Annotation Queues](https://docs.langchain.com/langsmith/annotation-queues)又提供单 run 与 pairwise 人工审阅，让专家反馈成为自动 evaluator 的校准材料或新数据集。

### 架构与关键设计

- **trace/run/thread 三层**同时覆盖单步、端到端与多轮对话；
- **同一 trace 可用于调试、反馈、数据集与实验**，降低证据搬运成本；
- **offline／online 打通**，生产异常可以进入离线回归；
- **自动与手工埋点共存**，既有低门槛又能精确界定关键步骤；
- **数据保留分层**：官方文档写明 SaaS trace 默认保留 400 天，而进入 dataset 的样本长期保存。这说明「原始观察」与「被选择的评估资产」是不同生命周期。

### 为什么流行或独特

- 与 LangChain／LangGraph 紧密集成，Agent 工具调用、retrieval 和 thread 天然可视化。
- 评估不只看最终文本，也能对中间 run、整条 trace 或 thread 打分。
- backtesting 与生产 feedback loop 把真实失败变成回归样本，形成持续改进叙事。
- **综合判断**：对已经使用 LangGraph 的团队，接入成本和诊断摩擦很低，这是主要优势；对我方则未必，因为 GitHub／Orca 已有自己的对象模型。

### 对我方可借鉴的点

| 可借鉴点 | 为什么适合我方 | 最小第一步 |
| --- | --- | --- |
| 1. 用 trace／span 思维分解长程工作 | 我方可把 Issue 子树视为合同图，把一次 Dispatch 视为 trial，把关键工具动作视为步骤证据 | 选下一次自然失败，手工画出「合同→Dispatch→关键动作→远端结果」四层，不建设采集器。 |
| 2. feedback 必须绑定稳定对象 ID | 对应我方 run／task／dispatch／comment／commit 联合身份 | 检查一条现有审阅意见能否唯一绑定当前 head 和执行尝试；不能就标为证据缺口。 |
| 3. 生产失败回流为离线回归样本 | 我方研发记忆中已有真实事故，可逐步形成回归用例 | 下一次真实纠偏只选一例，写成输入、预期守恒、失败轨迹和可重复检查。 |
| 4. pairwise 比绝对分更适合开放结果 | 适合比较两个方案／Prompt／工作流版本 | 在一个低风险候选中盲化 A/B 顺序，让评审只比较冻结的父目标贡献与回退。 |

### 我方已经更好，或不宜照搬

- 我方 GitHub 合同和 Orca 运行面分别是真源与执行事实；LangSmith project／trace 不能成为第三份任务状态。
- Trace 保存得再完整也只是观察证据，不产生授权、验收或负责人决定。
- 自动采集 prompt、工具输入输出会接触私域、秘密与长上下文，必须先有数据边界和退出方案。
- 仪表盘能看见失败，不等于 grader 测对了问题；需要逐条合同与父目标核验。

**最大启发：可观测的价值不在于保存更多日志，而在于让每条反馈稳定绑定到一次尝试、一个版本和一条可复现轨迹。**

---

## 六、Braintrust：让生产日志与离线实验共用同一种数据结构

### 是什么，怎样工作

Braintrust 是面向 AI 应用的观测与评估平台。[系统化评估说明](https://www.braintrust.dev/docs/evaluate)给出的完整循环是：

```text
Playground 快速试验
→ 提升为不可变 Experiment 快照
→ CI/CD 回归
→ 生产在线评分
→ 从生产 Trace 选样本回流 Dataset
```

每个 eval 至少包含 data、task 和 scorers；scorer 可以是内建 autoeval、LLM judge 或自定义代码。[实验说明](https://www.braintrust.dev/docs/evaluate/run-evaluations)强调 playground 是可变迭代面，experiment 是不可变、可比较、可分享的运行快照。

[观察说明](https://www.braintrust.dev/docs/observe)最关键的设计是：生产 logs 与 experiments 使用同一数据结构，因此同一套 instrumentation、score 和 feedback 可以跨开发与生产复用，生产 trace 也可直接成为数据集。

### 架构与关键设计

- **统一 trace schema**：一次端到端执行包含嵌套 spans；span 类型包括 eval、task、llm、function、tool、score。
- **不可变实验快照**：将一次值得保留的配置与结果冻结，支持跨版本 diff。
- **评分器是代码资产**：[Scorer 说明](https://www.braintrust.dev/docs/evaluate/write-scorers)把 deterministic、judge 与内建 scorer 放在同一接口下。
- **在线／离线同构**：生产评分与离线实验使用相同数据形状，减少转换损失。
- **互操作**：[OpenTelemetry 集成](https://www.braintrust.dev/docs/integrations/sdk-integrations/opentelemetry)支持 OTel processor、OTLP 和跨服务 trace context。
- **逐步诊断**：[Trace 检查说明](https://www.braintrust.dev/docs/observe/examine-traces)可按层级、时间线、对话查看 token、延迟、工具调用和 scorer 理由。

### 为什么流行或独特

- **独特处**：日志与实验的同构、mutable playground 与 immutable experiment 的明确分工，很适合高速迭代又要保留证据的团队。
- **一手核验**：远程 eval、CI、在线 scoring、human review、OTel 和生产回流都在同一产品面。
- **综合判断**：它更像「评估优先的开发平台」，LangSmith 更像「Agent 可观测与评估连续体」；两者重叠但产品重心不同。
- Topics／Loop 等自动聚类和分析可帮助发现盲区，但属于模型生成的观察候选，不能直接作为真值。

### 对我方可借鉴的点

| 可借鉴点 | 为什么适合我方 | 最小第一步 |
| --- | --- | --- |
| 1. 区分快速试验与不可变证据快照 | 对应我方研发探索与已冻结实验／决定包 | 下一次实验开始前冻结输入、版本、判据；结束后保存一个不可改写的结果定位。 |
| 2. 生产与评估使用同一事件 schema | 可减少 Orca 运行事实、GitHub 回执和评估表之间的手抄错配 | 先为一例自然任务做只读映射：taskId、dispatchId、commit、PR、成功条件、评分，不建设同步器。 |
| 3. score 也要作为 span，有自己的输入和理由 | 便于审计 LLM judge 及三方意见 | 对下一条自动或人工判定记录 rubric 版本、judge／reviewer 身份、理由和 Unknown 出口。 |
| 4. OTel 作为出口而非平台锁 | 若未来需要多后端，可保留可替换采集语义 | 只有出现真实跨服务 trace 需求时，先验证一个 OTel 导出样本，不直接选定 SaaS。 |

### 我方已经更好，或不宜照搬

- 我方已经用 Git 提交、PR head、评论和冻结决定包提供不可变／可回读证据；无需为这个能力立即迁入 SaaS。
- Braintrust 的 score 是质量信号，不等于我方证据等级、产品采用或授权状态；不能用一个 composite score 抹平这些类别。
- 生产日志回流数据集需要隐私、保留期、成本和删除策略，本次没有相关授权。
- 自动 Topics 适合找候选，不适合决定经营总账诉求或 Agent 系统方向。

**最大启发：把「观察样本」升级成「可比较实验」必须经过一次显式冻结；没有冻结的漂亮曲线只是可变开发现场。**

---

## 七、Agent eval 方法：评估结果、轨迹与系统，而不只评估一句回答

### 共同方法框架

[Anthropic 的 Agent eval 工程文章](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)给出了一组非常适合我方的定义：task 是带输入与成功标准的测试；trial 是一次尝试；grader 是评分逻辑；transcript／trace 是完整轨迹；outcome 是环境最终状态；evaluation harness 负责运行、记录和聚合；agent harness 是让模型行动的脚手架。评估「Agent」时，实际评估的是**模型＋harness＋工具＋环境**。

[OpenAI 的 Agent 工作流评估说明](https://developers.openai.com/api/docs/guides/agent-evals)也区分两个阶段：仍在调试行为时先看 trace grading；明确「好」的定义后，再进入 dataset 与重复 eval run。需要注意，[OpenAI 旧 Evals API 文档](https://developers.openai.com/api/docs/guides/evals)在 2026-08-12 已公告旧平台将于同年进入只读并终止服务，新工作应优先看 Datasets 路线。这本身说明：**方法应稳定，平台接口必须可替换。**

### 一套可迁移到我方的评估结构

以下是综合判断，不是外部产品原样映射：

| Eval 概念 | 我方可对应对象 | 真值来源 |
| --- | --- | --- |
| Task | 冻结的 GitHub Issue 合同及成功条件 | GitHub 远端当前正文、有效决定、当前 head |
| Trial | 一次 Orca Dispatch／执行尝试 | Orca Run／Task／Dispatch 与实际 worktree 身份 |
| Transcript／Trace | 工具动作、消息、终端输出、提交与评论链 | Orca 运行面＋Git／GitHub 可回读证据 |
| Outcome | 文件、测试、远端对象、用户可见后态 | 直接命令、测试、远端回读，不以 Agent 自述代替 |
| Grader | 确定性检查、模型判定、独立人／Agent 审阅 | rubric、版本、身份、判定理由与 Unknown 出口 |
| Suite | 一组能力题与回归题 | 真实任务、事故、边界例和冻结基线 |

### 关键设计原则

1. **Outcome grader 与 trajectory grader 分开。** 代码能跑、PR 存在、Issue 状态正确是 outcome；是否越权、是否沿错误来源、是否误用共享写入是 trajectory。终态正确不能证明路径安全，路径漂亮也不能证明交付有效。
2. **确定性检查优先，模型评分补充，人类校准兜底。** Anthropic 把 grader 分为 code-based、model-based、human；OpenAI 也建议把指标与人类判断结合，并用人类标签校准 judge。
3. **能力集与回归集分开。** 能力题应保留有提升空间；已稳定高通过的能力才转为持续回归。把二者混在一个平均分里，会同时掩盖饱和与能力回退。
4. **多次 trial 才能讨论稳定性。** Agent 行为有随机性；单次成功最多证明一个样本有效，不应外推长期可靠性。
5. **任务必须可通过且 grader 公平。** 任务正文没有写清却被测试暗中要求的条件，是 eval 缺陷，不是 Agent 缺陷。
6. **正例与负例都要有。** 只测「该搜索时搜索」会诱导过度搜索；只测「该询问时询问」会诱导打扰。必须同时测不应触发的镜像案例。
7. **读 transcript 是 grader 校准的一部分。** 分数异常时要区分 Agent 失败、grader 误判、harness 限制和任务歧义；只看总分无法完成这一步。
8. **生产失败进入回归，回归不替代生产观察。** 自动 eval、生产监控、用户反馈、A/B 与人工审阅共同形成完整证据。

### 对我方可借鉴的 5 点与最小第一步

| 可借鉴点 | 最小第一步 |
| --- | --- |
| 1. 建立「合同—trial—outcome」三联表 | 在下一项自然交付中只选 3 条成功条件，分别绑定 Dispatch、直接验证命令和远端结果。 |
| 2. 为守恒律增加镜像负例 | 给一条正向触发规则配一个「条件相似但不应触发」的历史或合成案例，先人工回放。 |
| 3. 将真实纠偏蒸馏为回归用例 | 下一次负责人纠偏后，保存最小输入、错误动作、期望守恒和可重复检查；原始记录仍留研发记忆。 |
| 4. 校准模型 judge，而不是信任多数票 | 选 5–10 条已有人工结论，盲化顺序比较 judge 与人工；分歧逐条读轨迹，不追求统计显著。 |
| 5. 分别量父目标、能力回退、证据等级与负责人注意力 | 下一次父任务验收把四项分别写结论，禁止合成一个「总体 0.87」分数。 |

### 我方已经更好，或不宜照搬

- 我方已有证据等级、父目标贡献、能力回退和负责人可见 ROI，比通用 eval 平台的单一 quality score 更贴合治理目标。
- K18 三方审阅已有明确授权、回避、密封、联合身份和一致消费门；它不是「multi-judge consensus」的普通实现，不能降格为三个模型平均分。
- 我方 Issue 成功条件与远端回读天然适合作为 outcome grader；不必先建设独立 harness 才能开始评估。
- 平台提供的在线 evaluator、自动聚类或 anomaly detection 只能生成候选；改变权威、授权和产品方向仍按现有协议。
- 当前 OpenAI 旧 Evals 平台的退场公告进一步说明，不应把长期方法绑定到某个厂商对象名或 API。

**最大启发：Agent eval 的核心不是给模型打分，而是证明「任务写清了、尝试可追溯、结果可直接验证、评分器本身也经得起复查」。**

---

## 八、跨产品综合：我方应吸收的架构，而不是采购清单

### 1. 记忆四层模型

综合四个记忆方案后，可把我方现状理解为四层；这是研究分析，不是新增权威：

```text
原始事实层
  GitHub 评论、工具输出、会话／实验原始记录
        ↓ 可追溯抽取
候选记忆层
  研发记忆可读层、自动或人工提出的主张
        ↓ 价值门＋可信门＋冲突／时态检查
当前知识层
  knowledge/ 中可直接复用的结论
        ↓ 任务作用域选择与最少复核
上下文组装层
  本次任务实际加载的权威、知识、合同与运行事实
```

Mem0 主要启发候选的抽取／冲突生命周期；Letta 启发上下文组装与常驻预算；Zep 启发双时间／来源；cognee 启发把层间转换做成可验收流水线。

关键守恒是：**只有候选通过我方两道门才能进入当前知识；只有 GitHub 当前合同与有效决定才能产生任务授权。** 无论外部产品怎样命名 memory、truth 或 context，都不能产生旁路。

### 2. 评估五面模型

```text
合同正确性：是否评估了真正的任务与成功条件
执行正确性：是否沿正确身份、权限和来源行动
结果正确性：直接后态是否满足成功条件
能力守恒：是否静默丢失基线或被替代方案能力
运营 ROI：是否减少总周期、返工和负责人注意力
```

LangSmith／Braintrust 可以很好地承载执行轨迹与评分，但合同正确性、能力守恒和授权边界仍需要我方领域模型。故未来即便引入平台，也应通过 adapter 写入上述五面，而不是让平台默认 schema 重新定义产品目标。

### 3. 对 KB、三方审阅和研发记忆的具体启发

#### 对 KB

- 借 Zep：加入观察时间／有效时间／替代关系的候选验证，不急于建图。
- 借 Mem0：明确 infer／verbatim 与冲突处理，自动抽取只进入候选。
- 借 cognee：把蒸馏拆成可重复阶段，检索策略使用同一数据集比较。
- 借 Letta：正式知识、任务权威和临时上下文按重要度／大小分层加载。
- 保留我方优势：`knowledge/README.md` 唯一入口、价值门／可信门、自然漏检触发检索升级。

#### 对三方审阅

- 借 eval 平台：每席判定绑定冻结 revision、稳定身份、rubric 和证据动作；保留完整轨迹以诊断 grader。
- 借 pairwise：在两个可信方案之间盲化顺序，减少绝对分虚假精度。
- 借生产回流：真实否决与后续被证伪的假阳性分别进入回归样本。
- 保留我方优势：三方审阅只替代已授权决定，三席一致也不能产生授权；密封与联合身份高于普通多 judge 投票。

#### 对研发记忆

- 借 Zep episode：原始记录尽量逐字保留，派生结论必须回到原定位。
- 借 Braintrust experiment：重要实验结束时冻结版本、输入、判据与结果快照。
- 借 LangSmith trace：把工具动作、判断与后态按稳定对象串起来，便于失败诊断。
- 借 Mem0／cognee：从原始过程自动抽取候选可以探索，但不能自动升级为当前知识或行为资产。
- 保留我方优势：原始层／可读层边界已经明确，且保存不等于可信、权威或授权。

---

## 九、建议的有界下一步

### P0：现在就能在自然任务中验证，不引入新依赖

1. **运行一个「双时间＋来源」样本。** 等下一次真实知识更新，手工记录 source、observed_at、valid_from、valid_to、supersedes、最少复核步骤。成功判据是后续 Agent 能区分旧事实、当前事实和系统何时得知变化。
2. **运行一个「合同—轨迹—结果」评估样本。** 在下一项自然 Issue 中选择 3 条成功条件，绑定 Dispatch、直接命令／测试和远端后态；再人工读一次轨迹，区分 outcome 成功与过程越界。
3. **把一条真实纠偏变成镜像回归对。** 一条应该触发治理规则，一条条件相似但不应触发；观察是否同时减少漏报和误触发。

### P1：只有出现信号才升级

1. 公共知识出现经核验的改述型 top-3 漏检后，按 K14 比较 BM25、向量与实际融合；没有信号时不因篇数或厂商热度升级。
2. 手工评估样本多到难以比较、或真实 trace 诊断成本成为瓶颈时，再对 LangSmith、Braintrust 和 OTel 自有出口做一轮同数据集比较。
3. 真实任务反复需要跨实体、跨时间查询，且 Markdown 手工替代链无法满足时，再比较 Zep／Graphiti 与轻量关系投影；先证明图的增益，不先选图数据库。
4. 自动蒸馏候选量显著增长、人工管线吞吐成为瓶颈时，再比较 Mem0 与 cognee 的写入／pipeline 语义；必须先跑冲突、删除、来源和退出实验。

### 明确暂缓

- 不把 GitHub 合同、Orca 运行面或权威镜像进第三方 memory／trace 平台作为第二真源。
- 不自动把 session 经验、LLM 摘要、三方意见或在线 score 升级为知识。
- 不因 GitHub star、厂商 benchmark、现成集成或「图更先进」直接采用。
- 不建设常驻 trace 收集、自动评分、自动投票、自动知识图或定时全量重评。

## 十、一句话收口

**最大的生态启发是：我方已经拥有比多数记忆／评估产品更清楚的治理控制面；下一步不是用平台替换它，而是从这些产品借来双时间、来源链、显式写入生命周期、不可变实验和轨迹评估，让现有控制面产生更可靠的数据证据。**

## 主要一手来源

### 记忆

- [Mem0 官方仓库：通用 Agent 记忆层](https://github.com/mem0ai/mem0)
- [Mem0 官方文档：新增记忆](https://docs.mem0.ai/core-concepts/memory-operations/add)
- [Mem0 官方文档：搜索记忆](https://docs.mem0.ai/core-concepts/memory-operations/search)
- [Mem0 官方文档：记忆类型](https://docs.mem0.ai/core-concepts/memory-types)
- [Mem0 官方文档：记忆评估与架构](https://docs.mem0.ai/core-concepts/memory-evaluation)
- [Letta 官方文档：Memory blocks](https://docs.letta.com/guides/core-concepts/memory/memory-blocks)
- [Letta 官方文档：上下文层级](https://docs.letta.com/guides/core-concepts/memory/context-hierarchy)
- [Letta 官方文档：AgentFile](https://docs.letta.com/guides/core-concepts/agent-file)
- [Letta 官方仓库：有状态 Agent 与当前迁移说明](https://github.com/letta-ai/letta)
- [Letta Agent SDK 官方仓库：Agent／conversation／session](https://github.com/letta-ai/letta-agent-sdk)
- [Graphiti 官方仓库：时态 Context Graph](https://github.com/getzep/graphiti)
- [Zep 官方文档：Graph 概览](https://help.getzep.com/graph-overview)
- [Zep 官方文档：Facts 与四时间](https://help.getzep.com/facts)
- [Zep 官方文档：Episodes 与来源](https://help.getzep.com/episodes)
- [Zep 官方文档：检索上下文](https://help.getzep.com/retrieving-context)
- [Zep 官方文档：图搜索与 reranker](https://help.getzep.com/searching-the-graph)
- [cognee 官方仓库：Memory control plane](https://github.com/topoteretes/cognee)
- [cognee 官方文档：核心概览](https://docs.cognee.ai/core-concepts/overview)
- [cognee 官方文档：Pipelines](https://docs.cognee.ai/core-concepts/building-blocks/pipelines)
- [cognee 官方文档：Cognify](https://docs.cognee.ai/core-concepts/main-operations/legacy-operations/cognify)
- [cognee 官方文档：内建评估框架](https://docs.cognee.ai/integrations/eval-framework)

### 评估与可观测

- [LangSmith 官方文档：可观测数据模型](https://docs.langchain.com/langsmith/observability-concepts)
- [LangSmith 官方文档：离线／在线评估类型](https://docs.langchain.com/langsmith/evaluation-types)
- [LangSmith 官方文档：人工 Annotation Queues](https://docs.langchain.com/langsmith/annotation-queues)
- [Braintrust 官方文档：系统化评估闭环](https://www.braintrust.dev/docs/evaluate)
- [Braintrust 官方文档：不可变 Experiments](https://www.braintrust.dev/docs/evaluate/run-evaluations)
- [Braintrust 官方文档：Scorers](https://www.braintrust.dev/docs/evaluate/write-scorers)
- [Braintrust 官方文档：生产观察与数据回流](https://www.braintrust.dev/docs/observe)
- [Braintrust 官方文档：Trace 结构与诊断](https://www.braintrust.dev/docs/observe/examine-traces)
- [Braintrust 官方文档：OpenTelemetry 集成](https://www.braintrust.dev/docs/integrations/sdk-integrations/opentelemetry)
- [Anthropic 工程文章：Agent eval 方法](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [OpenAI 官方文档：评估 Agent 工作流](https://developers.openai.com/api/docs/guides/agent-evals)
- [OpenAI 官方文档：Trace grading](https://developers.openai.com/api/docs/guides/trace-grading)
- [OpenAI 官方文档：评估最佳实践](https://developers.openai.com/api/docs/guides/evaluation-best-practices)
- [OpenAI 官方文档：旧 Evals API 退场边界](https://developers.openai.com/api/docs/guides/evals)
