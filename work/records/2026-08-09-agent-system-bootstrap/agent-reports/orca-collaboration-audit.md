# Orca／多 Agent 协作能力只读核验与 Skill 候选

> 状态：非权威候选报告；供主 Agent 与负责人综合、复查。
> 日期：2026-08-09。
> 范围：只读核验当前权威、当前 Orca、多 Agent 工具、Codex／Claude 可见能力及旧 `orchestration` Skill；没有运行新的协作实验，没有修改权威、入口或正式 Skill。
> 本报告只创建本文件。

## 结论

可以形成一个最小协作行为 Skill，但不应把“多 Agent 协作”整个领域 Skill 化，也不应把 Orca 命令手册复制进新的正式 Skill。

当前最小候选应是一个窄的 **`delegate-and-synthesize`（委派与整合）** Skill：在用户、系统或当前任务已经允许多 Agent 时，负责判断是否值得委派、怎样划分不冲突的工作包、怎样要求独立可读报告、怎样核对证据并整合结果。实际的启动、通信、等待、生命周期、并发、隔离、原始记录和跨 Session 持久性继续由运行工具提供。

Orca 适合承担需要监督、跨 Codex／Claude、任务／Dispatch provenance、可恢复消息和 worker 生命周期的运行后端。当前 Codex 原生协作工具适合本 Session 内快速拆出独立的小任务。两者不是同一个 provenance 系统，不能互相冒称。

本次并行批次实际使用的是 Codex 原生 `collaboration` 工具，不是 Orca orchestration：`collaboration.list_agents` 显示 `/root` 及四个 worker；但当前终端执行 `orca orchestration run-current --json` 返回 `run: null`。因此本批次可以通过各 Agent 的独立报告和 Git 产物事后核查，但没有 Orca Run／Task／Dispatch 记录。无需为了补标签重跑，只需如实记录；下一个确实需要 Orca provenance 的批次应在派工前创建或绑定 Run。

## 权威边界

本报告遵守以下已确认边界：

- 问题领域不整体 Skill 化，只把条件性、多步骤、可复用行为 Skill 化；
- 当前 MVP 以人和 Agent 可直接阅读的版本化文件为中心、先人工运行；
- 自动多 Agent 调度仍是暂缓方向；本轮只允许核验和候选报告；
- 权威决定什么可以改变、谁可以决定；协作工具和 Skill 都不能扩大授权；
- 已确认的研发记忆采用原始记录层与可读记录层，两者都不自动成为权威或可信知识。

读取的当前权威为：

- `README.md`
- `authority/00-map.md`
- `work/current.md`
- `authority/03-thinking-methods.md`
- `authority/01-knowledge.md`
- `authority/08-mvp-implementation-direction.md`

旧 Skill 只用于核验现状、识别可复用机制与漂移风险，没有用于反向定义需求。

## 当前能力事实

### 1. 本 Session 的 Codex 原生协作

本 Session 暴露的协作工具包括：

- `spawn_agent`：创建有稳定 canonical task path 的子 Agent，可选择继承多少会话上下文；
- `send_message`：向运行中的 Agent 发送消息；
- `followup_task`：给已存在 Agent 新任务并重新触发；
- `interrupt_agent`：中断当前 turn；
- `list_agents`：查看当前 Agent 树和状态；
- `wait_agent`：等待消息或完成通知。

当前工具契约还明确：最多 16 个并发槽位；所有 Agent 共享当前目录和文件系统；子 Agent 可以继续创建子 Agent；子 Agent 的 final 会返回父 Agent。

这意味着它已经能完成快速的同环境并行分析、独立报告和分层委派，但共享文件系统本身不提供写入隔离。Skill 必须要求唯一写入所有权或唯一报告路径，否则并行编辑会互相覆盖。当前工具也没有向本报告证明跨 Session 的 durable Run／Task／Dispatch、可读取的完整 worker transcript、显式 typed outcome、资源释放状态或跨 Codex／Claude 调度；不能把这些能力从 Orca 反向假定给原生工具。

当前 Session 的 Available Skills 中没有 `orchestration`。当前 `CODEX_HOME` 为 `C:\Users\<user>\AppData\Roaming\orca\codex-runtime-home\home`；其 `skills` 目录只有 `.system`，而 `orchestration` 也不在当前插件 Skill 清单中。因此“Codex 运行在 Orca 宿主里”不等于“Codex 已加载 Orca orchestration Skill”。Codex 仍可从 shell 调用 `orca`，但若要正确使用，应先读取二进制提供的版本匹配指南。

### 2. 当前 Orca

只读 `orca status --json` 显示：

- Orca app 正在运行，runtime 为 `ready`、可达；
- app version 为 `1.4.177`；
- runtime 声明 `orchestration.contract.v1`、federation、worker launch preferences 等能力。

当前 `orca orchestration --help` 与 `orca skills get orchestration --full` 表明，Orca 现有运行原语包括：

- Run：创建、绑定、列出和查看一个持久命名空间／协调者 inbox；
- Task／Dispatch：任务、依赖、派发状态与注入的 worker 生命周期契约；
- worker：启动 Codex 或 Claude、查看状态、读取受限 transcript／terminal 输出、停止、abandon、retain、release；
- 消息：持久消息、FIFO Delivery、显式 ack、worker question／coordinator reply；
- 决定与完成：gate、typed `worker_done`、明确 succeeded／failed outcome、`files-modified` 与 `report-path`；
- 位置：当前／现有／新 worktree，以及已连接的 Orca server。

当前指南同时明确：Run 不负责调度或冲突判断；Agent 仍要决定任务拆分、placement 和并发。这个事实正好划清边界：Orca 提供可核验运行机制，行为 Skill 提供何时和怎样使用这些机制的方法。

当前 `run-list` 只显示 2026-08-01 及更早的 Run；当前终端没有绑定 Run。没有证据表明本次 2026-08-09 并行批次创建了 Orca orchestration provenance。

### 3. 当前 Claude

- `claude --version` 返回 `2.1.221`；
- `C:\Users\<user>\.claude\settings.json` 中 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`；本机存在历史 `teams` 和 `tasks` 状态目录；
- `C:\Users\<user>\.claude\skills\orchestration` 是指向 `C:\Users\<user>\.agents\skills\orchestration` 的 junction；因此 Claude 当前有 Orca orchestration 的发现入口；
- Claude 的 `grilling` 与 `self-improvement` Plugin 当前启用。

上述是配置与文件层证据。本轮没有启动新的 Claude 会话，因此没有重新验证一个全新 Claude Session 是否实际暴露 Agent Teams 的每个工具，也没有验证它与 Orca Run 的联动。Orca 自己可以通过 `worker-start --agent claude` 启动受监督 Claude worker；这不依赖把 Claude Agent Teams 当成同一个 orchestration 后端。

## 旧 `orchestration` Skill 核验

本机有三种容易混淆的对象：

| 对象 | 当前事实 | 判断 |
| --- | --- | --- |
| `C:\Users\<user>\workspace\orca\skills\orchestration\SKILL.md` | 253 行，SHA-256 `13ED91F...CD2BA1D`；包含旧的 `run`／`run-stop` 叙述，缺少当前 `run-create`、`worker-start`、Delivery ack、worker release／retain／abandon 等契约 | 旧 checkout 材料；不得安装或用来定义当前方法 |
| `C:\Users\<user>\.agents\skills\orchestration\SKILL.md` | 82 行，SHA-256 `9CA22813...C0BD7F`；Claude junction 指向它 | 发现 stub；要求先执行 `orca skills get orchestration`，避免缓存命令漂移 |
| `orca skills get orchestration --full` | 当前二进制动态提供的 406 行版本匹配指南 | 当前 Orca 命令与生命周期事实的首选来源；不是本系统产品边界的权威 |

旧 workspace Skill 中仍有一些值得重新验证的行为思想：区分监督式协调与完整 handoff、要求任务边界、worker report、唯一 owner、等待 completion 而非用 heartbeat 猜完成。但当前权威已经独立推出了其中的大部分需求；这些内容只能作为候选证据，不能原样吸收。

旧副本的具体漂移风险包括：

- 把现在已经 retired 的 scheduler `run`／`run-stop` 当成可用主路径；
- 缺少当前必须先创建或绑定 lightweight Run 的契约；
- 缺少当前首选 `worker-start` 组合路径和 typed outcome；
- 缺少新的 FIFO Delivery／ack 语义、稳定 `dispatch:<id>` 地址和 worker 释放责任；
- 大量工具细节会随 Orca 版本继续变化，复制进本系统 Skill 会再次形成双重来源。

因此，正式候选最多引用 Orca discovery stub／动态指南，不复制它的命令正文。

## 最小行为 Skill 候选

### 候选名称与触发

候选名：`delegate-and-synthesize`。

候选描述：

> 当用户、系统或当前任务已经明确允许多 Agent／并行委派时，用最小批次判断是否值得委派，建立互不冲突的工作包和证据／报告契约，选择当前真实可用的协作后端，收集并核查结果，记录接受、拒绝与未知，最后返回原任务。该 Skill 不自行扩大授权，也不因为并发能力存在就自动派工。

这个名称刻意不叫 `multi-agent-system` 或 `orchestration`：它表示一个可重复行为切片，不冒充整个协作领域，也不与 Orca 自带的工具 Skill 重名。

### 最小流程

1. **重新锚定**：写出原始目标、当前权威、已获授权、禁止事项、决定所有者和完成条件。
2. **委派价值检查**：只在任务独立、能减少等待或提供真正独立核验，且整合成本可接受时委派；Token 充足不是单独理由。
3. **拆成最小批次**：为每项任务指定唯一目标、输入、边界、依赖、可写文件、报告路径和完成条件。共享 worktree 中默认一个文件只有一个 writer；审计／调研 Agent 只写各自唯一报告。
4. **选择真实后端并记录 provenance**：
   - 本 Session 内快速、同环境、同提供方的小任务可用 Codex 原生协作；
   - 需要监督、跨 Codex／Claude、Run／Task／Dispatch、可恢复 inbox 或 worker transcript 时优先 Orca；
   - Claude Agent Teams 只有在当前 Claude Session 确认可用且任务只需该后端时使用；
   - 用户明确要求 Orca orchestration 时必须创建／绑定 Orca Run 和 Task，不能用其他工具后再宣称是 Orca。
5. **先并行派出独立任务**：一次启动所有无依赖小任务，协调者同时做不可委派的综合工作；不以频繁轮询代替有事件的等待。
6. **要求独立报告**：每个 worker 报告事实、证据、推理、变更、验证、未知与剩余事项，并返回报告路径和 provenance ID；完成消息只是索引，不代替报告。
7. **核查和整合**：协调者实际读取报告、差异和验证结果；对冲突按证据处理，记录为什么接受／拒绝／保留未知。涉及授权、权威或高损失选择时交给负责人决定，不把工具 gate 当成人类授权。
8. **结束与返回**：记录最终整合、尚未解决内容和下一 owner；按后端契约释放／保留 worker；回到原任务，不把“协调系统建设”变成新主线。

### 不进入这个 Skill 的内容

- Orca／Codex／Claude 的命令、参数和生命周期实现细节；
- Agent 进程创建、并发槽位、消息传递、等待、终止和恢复；
- worktree／文件系统隔离、mutation fencing、typed completion 和 transcript 捕获；
- 当前任务状态、权威结论、知识正文、研发记忆正文；
- 自动调度器、长期 worker 池、跨 Session 平台和资源监控；
- 人的授权、重要决定或知识／权威准入。

这些分别属于运行工具、当前任务／权威、研发记忆或以后另行确认的能力。

## 可读核查设计

当前已确认的“两层研发记忆”可以直接用于协作，不需要第三套独立记忆系统。

### 原始记录层：运行工具提供，文件只保存指针

保留或引用：

- Codex 原生 canonical task path、父子关系、状态通知和相关 Session／thread 标识；
- Orca Run ID、Task ID、Dispatch ID、Delivery／message ID、`worker-read` 来源与 cursor；
- Claude team／task／session 标识（仅在实际使用并可稳定取得时）；
- 工具 transcript、terminal 输出、Git diff／commit 和测试原始输出的位置。

Skill 只能要求记录这些指针，不能凭空提供持久性。提供方没有稳定 transcript 能力时，应如实写“不可稳定恢复”，并依赖可读报告和版本化产物，不伪造 raw provenance。

### 可读记录层：协调者与每个 Agent 都写结构化 Markdown

每个并行批次至少有一份协调记录和每项任务一份独立 Agent 报告。路径应服从研发记忆主任务最终确认的结构；本批次使用：

```text
work/records/<batch>/
  coordination.md                 # 协调者的任务图、决定与最终整合
  agent-reports/<task-name>.md    # 每个 Agent 的独立证据报告
```

协调记录最小字段：

```markdown
# 协调记录
- 原始目标：
- 权威／任务状态锚点：
- 授权与禁止事项：
- 后端与 provenance：

## 委派表
| task id | 为什么委派 | 输入 | 边界／禁止 | 依赖 | writer／报告路径 | 完成条件 | 状态 |

## 决定账本
| 时间／阶段 | 决定或问题 | 候选 | 证据 | 决定者 | 结果与影响 |

## 整合
| 发现 | Agent 报告／原始证据 | 接受／拒绝／未知 | 理由 | 对资产或下一步的影响 |

## 验证、未决和下一 owner
```

每份 Agent 报告最小字段：

```markdown
# Agent 报告
- 收到的任务／task id：
- 读取的权威和输入：
- 写入边界与禁止事项：
- provenance：

## 做了什么
## 事实、证据与可重复检查
## 推演、选择与拒绝理由
## 修改的文件与验证
## 冲突、未知、风险和剩余事项
```

可核查性依赖以下硬规则：

1. 任务说明和报告都进入版本化文件；聊天中的完成摘要不作为唯一记录。
2. 每个报告能追溯到 task／dispatch／Agent path；每个关键整合结论能反向链接到一个或多个报告／证据。
3. 协调者记录接受和拒绝，不只保留最终答案；否则无法解释为什么某个 Agent 的建议没有采用。
4. 每个文件有明确 writer；其他 Agent 只读或写自己的报告。协调者是唯一综合 owner，权威仍只由获授权的 owner 修改。
5. 工具状态只证明任务和生命周期发生过，不证明结论正确；结论仍要靠来源、diff、测试或可重复检查核验。
6. decision gate 记录问题、选项、决定者和答案，但只有负责人或既定授权者的答案才改变授权／权威。

## Skill 与运行工具的明确边界

| 能力 | 行为 Skill | 运行工具 |
| --- | --- | --- |
| 判断是否值得并行、怎样拆任务 | 定义判断与步骤 | 不应自动猜测 |
| 任务边界、输入、完成标准、writer | 要求并记录 | 可承载字段，但不定义内容 |
| 启动、通信、等待、重试、终止 | 说明何时使用 | 必须实际提供并执行 |
| 身份、Run／Task／Dispatch provenance | 要求保存和核对 | 必须生成、鉴权并持久化 |
| 文件／worktree 隔离与 mutation fencing | 要求选择和检查 | 必须真实实施 |
| transcript／原始消息／状态恢复 | 要求保留指针 | 必须提供捕获和读取保证 |
| Agent 报告格式、证据和未知 | 定义最小合同 | 可传输／保存，但不保证质量 |
| 冲突处理、接受／拒绝、综合 | 定义协调者行为 | 提供原始输入，不替代判断 |
| 人类决定与授权 | 识别并暂停请求 | gate／消息只能传递，不能授予权威 |
| worker 资源释放 | 要求完成后处理 | 必须安全关闭／保留／报告状态 |

## 下一步候选

如果负责人决定继续建设，建议只做一个可逆的 `delegate-and-synthesize` `0.1.0`：

- 内容仅为上述触发、八步流程、报告合同和工具边界；
- 明确引用“读取当前后端的版本匹配 Skill／tool contract”，不复制 Orca 命令；
- 同步到 Codex 与 Claude，但分别使用当前真实可用后端；
- 先把下一次自然发生、确实需要监督或跨 Codex／Claude 的并行任务作为首个试用，不为了验证单独造任务；
- 若选择 Orca，派工前创建／绑定 Run，全部 worker 使用 Task／Dispatch，报告路径进入 typed completion；
- 以一次试用中的整合成本、冲突、遗漏、负责人复查成本和恢复能力决定继续、缩减或停止。

本候选不建议吸收 `workspace/orca` 的旧 Skill，也不建议立即建设自动调度器、统一跨后端状态库或复杂 DAG 方法论。

## 未知与限制

- 本轮没有启动新的 Codex／Claude 会话，因而没有重新验收它们各自的新 Session Skill 发现和 Agent Teams 工具面；
- 没有运行 Orca worker，不能用本轮证明 `worker-read`、远程 federation、release 或恢复路径的端到端质量；
- Codex 原生协作的原始 transcript、跨 Session 保存和 typed provenance 保证没有在当前工具契约中得到证明；
- Claude Agent Teams 与 Orca orchestration 是两个后端，当前没有证据支持把状态自动互通；
- 研发记忆的最终目录和 raw-record 保存策略由同批次的研发记忆任务综合决定，本报告只给出协作所需字段，不抢先设为权威。
