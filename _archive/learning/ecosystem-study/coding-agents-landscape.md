# AI 编码 Agent 开源图景：从本地循环到长程协作治理

> 核验日期：2026-08-12
>
> 研究对象：Cline、Roo Code、Aider、Continue、Kilo Code；Cursor 作为非开源产品对照。
>
> 适用范围：比较公开产品与源码所能证明的架构、Agent 循环、工具／权限、上下文／记忆、编排与社区状态；不评价未公开的服务端实现。
>
> 证据边界：本次读取官方仓库、固定提交源码、官方文档／博客，并直接查询 GitHub API；没有安装或运行这些 Agent，没有执行端到端任务、基准或安全测试。文中的“工作”“运行”若无特别标注，均是在转述一手资料描述，不代表本机实测。

## 一、结论先行

这批产品的共同内核已经高度收敛：

```text
用户目标
  → 组装系统提示、规则、上下文和可用工具
  → 模型返回文本或工具调用
  → 权限判定
  → 执行工具并把结果送回模型
  → 直到完成、失败、超限、被拒绝或需要人输入
```

真正拉开差距的不是这条循环本身，而是循环外围的六项工程选择：

1. **Agent harness 是否与 IDE／CLI／云端表面解耦**；
2. **权限是否是工具边界上的显式数据，而非提示词里的愿望**；
3. **上下文是否按价值渐进加载、在压缩时保留可恢复锚点**；
4. **副作用是否有 diff、checkpoint、Git 或隔离环境可回退**；
5. **编排是否明确隔离子任务上下文、传递合同与完成摘要**；
6. **本地执行状态、持久任务合同和可复用知识是否被分开承载**。

开源样本在前五项上已经提供很多成熟构件；在第六项上普遍较弱。Cline Teams、Roo Boomerang、Continue 子 Agent、Kilo Agent Manager 都能扩大执行面，但其默认真源仍主要是本地 Session、任务板、工作树或对话摘要。对我方“GitHub 合同真源 + Orca 运行面 + 独立审阅 + 知识／研发记忆分层”的目标而言，最合理的路线不是照搬一套产品，而是继续把这些编码 Agent 当作**可替换执行器**，有选择地吸收其权限、上下文和可逆执行设计。

## 二、研究口径与证据分级

### 2.1 为什么选择这五个开源样本

- **Cline**：从 VS Code Agent 演进成共享 SDK、CLI、IDE 和多 Agent 能力，适合观察“扩展产品如何抽出 Agent harness”。
- **Roo Code**：Cline 谱系里把模式、工具组和 Boomerang 子任务做得最显式；虽已归档，仍是模式化编排的重要设计样本。
- **Aider**：终端与 Git 原生、架构相对小而清楚，代表“人机结对 + 精确编辑 + 验证反馈”路线，而非无限工具循环。
- **Continue**：配置优先、模型／规则／工具可组合，源码里有非常清晰的工具握手、权限过滤和上下文压缩循环；官方已声明停止积极维护，适合作为参考实现而非默认依赖。
- **Kilo Code**：负责人点名对象；它从 Roo 分支起步，又在 2026 年迁到 OpenCode 服务内核，并增加 Agent Manager、工作树并行和跨表面产品化，最适合观察“谱系迁移与平台化”。

**Cursor 不计入五个开源样本。** Cursor 官方说明客户端是 VS Code 分支，但服务条款限制反向取得服务源码；因此这里只把它作为商业产品边界对照，不把可见界面和文档推断成内部实现。[Cursor 官方安全说明（客户端与索引）](https://cursor.com/security) [Cursor 官方条款（源码边界）](https://cursor.com/en-US/terms-of-service)

### 2.2 证据标签

| 标签 | 本文含义 |
| --- | --- |
| **本次直接验证** | 本次实际执行的只读命令或 API 查询；本文仅用于 GitHub 仓库状态、提交和社区数字。 |
| **一手源码核验** | 直接读取官方仓库固定提交中的实现或仓内设计说明；能证明“代码写成什么”，不能自动证明生产行为、质量或采用。 |
| **一手文档核验** | 官方文档、README、博客、条款或安全说明；能证明官方公开合同或自述，营销数字不自动等于留存和质量。 |
| **推断** | 基于前述证据做出的比较或对我方适用性判断；会明确写出翻转条件。 |

### 2.3 固定源码水位与社区快照

源码分析固定在以下 `main` 提交；社区数字通过 `gh api repos/{owner}/{repo}` 于 2026-08-12 直接查询。Stars、forks 和安装量只表示注意力／扩散，不证明质量、留存或适合我方。

| 项目 | 固定提交 | 许可证／当前状态 | 社区快照 |
| --- | --- | --- | --- |
| Cline | `a56af4efaf672e0f5261f06ebf3332ef684bd4c0` | Apache-2.0；活跃，最新公开 release 为 `cli-v3.0.53`（2026-08-11） | 66,037 stars；7,092 forks。[Cline 官方仓库（社区与许可证）](https://github.com/cline/cline) |
| Roo Code | `b867ec9145750d0ae1ff7f02d35406e9bf2a0b16` | Apache-2.0；仓库已归档，官方 README 记载扩展于 2026-05-15 停止维护 | 24,350 stars；3,416 forks。[Roo Code 官方仓库（归档状态）](https://github.com/RooCodeInc/Roo-Code) |
| Aider | `5dc9490bb35f9729ef2c95d00a19ccd30c26339c` | Apache-2.0；仓库未归档，最新公开 release 为 `v0.86.0`（2025-08-09） | 48,140 stars；4,836 forks；官方 README 另显示 680 万 PyPI 安装和每周 150 亿 token，但这些是项目自报指标。[Aider 官方仓库（社区快照）](https://github.com/Aider-AI/aider) |
| Continue | `5522c6f44ca0ac3528b37244818fbfa39b5af470` | Apache-2.0；官方 README／文档声明不再积极维护、对用户只读，GitHub API 的 `archived` 仍为 `false` | 35,451 stars；5,214 forks；最终 2.0.0 版本于 2026-06 发布。[Continue 官方仓库（维护声明）](https://github.com/continuedev/continue) |
| Kilo Code | `64e5dd03633013b4564d0ac759747d606f74522c` | MIT；活跃，最新公开 release 为 `v7.4.21`（2026-08-11） | 26,827 stars；3,047 forks；官方博客称 300 万下载，同时主动说明下载不等于独立用户或留存。[Kilo Code 官方仓库（社区与许可证）](https://github.com/Kilo-Org/kilocode) [Kilo 官方复盘（下载量边界）](https://blog.kilo.ai/p/what-we-learned-from-3-million-downloads) |
| Cursor | 不适用 | 商业服务；本文未发现可供同等源码核验的官方产品仓库 | 不用 GitHub stars 与开源样本横比；只采用官方文档／博客的产品事实。 |

Continue 出现“官方声明只读”与 GitHub API `archived=false` 的表面差异。本文把官方 README 的产品维护声明作为语义事实，把 API 字段只作为仓库开关事实，不据此推断团队仍在维护产品。

## 三、五个开源样本与一个产品对照

### 3.1 Cline：从 IDE 扩展抽出共享 Agent 内核

#### 是什么

Cline 当前已不是单一 VS Code 扩展，而是以共享引擎支撑 CLI、VS Code、JetBrains、SDK，并通过独立 Kanban 提供多 Agent 任务板。官方仓库把 SDK、CLI、IDE 和 Kanban 明确列为不同表面；JetBrains 客户端本身未开源，是“共享核心开源、部分表面例外”的混合边界。[Cline 官方仓库（产品分层）](https://github.com/cline/cline/blob/a56af4efaf672e0f5261f06ebf3332ef684bd4c0/README.md)

#### 怎么工作

**一手源码核验**：轻量 `Agent` 是无磁盘持久化的通用循环：构造回合上下文 → 调模型 → 若返回工具调用则执行并继续 → 返回无工具调用文本时结束；会话历史只保存在内存，可通过 snapshot／restore 导入导出。需要内置 Bash、编辑器、会话持久化和多进程共享时，使用更重的 `ClineCore`。[Cline 源码说明（轻量 Agent 循环）](https://github.com/cline/cline/blob/a56af4efaf672e0f5261f06ebf3332ef684bd4c0/.agents/skills/cline-sdk/references/agent/REFERENCE.md)

#### 架构与关键设计

- **内核／表面分离**：`@cline/agents` 负责轻量循环，`@cline/core` 提供完整 harness，CLI／IDE 负责交互和展示。这个边界让同一循环可嵌入不同宿主。
- **Plan／Act 是能力边界，不只是 persona**：Plan 只能读和搜索，Act 才能修改文件、执行命令；两者共享同一对话历史，也可分别选择模型。[Cline 官方文档（Plan 与 Act）](https://docs.cline.bot/core-workflows/plan-and-act)
- **工具权限有两层**：交互产品默认逐调用批准，也可以按类别自动批准；CLI 源码还维护安全自动批准工具集合与通配策略。YOLO 会放开文件、命令、浏览器、MCP 和模式切换，官方明确标为危险。[Cline 源码（CLI 工具策略）](https://github.com/cline/cline/blob/a56af4efaf672e0f5261f06ebf3332ef684bd4c0/apps/cli/src/runtime/tool-policies.ts) [Cline 官方文档（自动批准边界）](https://docs.cline.bot/features/auto-approve)
- **上下文分层**：Task 保存完整会话、工具输出和 checkpoint；接近窗口上限时自动压缩。Rules 是持续／条件指令，Skills 只先暴露元数据，命中后再加载正文和资源，形成渐进披露。[Cline 官方文档（任务与压缩）](https://docs.cline.bot/core-workflows/task-management) [Cline 官方文档（Skill 渐进加载）](https://docs.cline.bot/customization/skills)
- **可逆副作用**：IDE 以独立 shadow Git 保存 checkpoint，不污染主仓 Git 历史；可分别回退 workspace 与 task context。[Cline 官方文档（Checkpoint）](https://docs.cline.bot/core-workflows/checkpoints)
- **多 Agent 两级模型**：Sub-agent 是会话内父子委派、没有共享状态；Team 是跨 Session 的协调，使用本地 `task-board.json`、`mailbox.json`、`mission-log.json` 持久化。[Cline 源码说明（多 Agent 两级模型）](https://github.com/cline/cline/blob/a56af4efaf672e0f5261f06ebf3332ef684bd4c0/.agents/skills/cline-sdk/references/multi-agent/REFERENCE.md)

#### 为什么流行或独特

**一手文档核验 + 推断**：Cline 把“本地可见、逐步批准、模型供应商可换”作为低门槛信任机制，又逐步抽出 SDK、CLI 和团队能力；最大开源社区快照与活跃 release 说明它既有分发规模也还在快速扩展。独特点已经从“IDE 里能执行工具”迁移到“同一 Agent 核心可被二次嵌入”。但 Team 的本地 JSON 是运行协作状态，不应被推断为跨主机持久合同或权限真源。

### 3.2 Roo Code：模式即能力包，Boomerang 即上下文隔离

#### 是什么

Roo Code 源自 Cline，最终版本围绕 Code、Ask、Architect、Debug、Orchestrator 与自定义模式构造“一个编辑器里的 Agent 团队”。仓库已经归档，当前价值主要是设计样本和迁移来源，而不是应新增的长期依赖。[Roo Code 官方仓库（最终边界）](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/README.md)

#### 怎么工作

**一手源码核验**：Roo CLI 通过扩展发出的 `ClineMessage` 流判断 Agent 状态；`say` 是非阻塞信息，完成的 `ask` 通常暂停循环。工具、命令、追问、浏览器、MCP 等 ask 进入等待输入；完成、API 失败、错误上限等 ask 进入 idle；CLI 把 ExtensionClient 视为状态单一来源。[Roo Code 源码说明（CLI Agent 状态机）](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/apps/cli/docs/AGENT_LOOP.md)

#### 架构与关键设计

- **Mode = persona + prompt + model affinity + tool groups + file restriction**。例如 Ask 只有 read／MCP；Architect 可读、可用 MCP、只能编辑 Markdown；Code／Debug 拥有完整工具组。[Roo Code 官方文档（模式与工具组）](https://roocodeinc.github.io/Roo-Code/basic-usage/using-modes/)
- **权限是分层组合**：`.rooignore` 限制文件工具和 context mention，但官方明确说明它不是系统沙箱；自动批准再按读、写、命令、浏览器、MCP、模式切换、子任务分类。[Roo Code 官方文档（文件访问边界）](https://roocodeinc.github.io/Roo-Code/features/rooignore/) [Roo Code 官方文档（自动批准）](https://roocodeinc.github.io/Roo-Code/advanced-usage/auto-approving-actions/)
- **Boomerang 子任务**：Orchestrator 默认没有直接工程工具，只能 `new_task`；父任务暂停，子任务拥有隔离的会话历史，向下只传初始说明，向上只回完成摘要。官方将限制读取能力解释为避免编排上下文被实现细节污染。[Roo Code 官方文档（Boomerang 子任务）](https://roocodeinc.github.io/Roo-Code/features/boomerang-tasks/)
- **上下文压缩**：最终版本默认启用 Intelligent Context Condensing，并允许阈值、模型和 prompt 配置。[Roo Code 官方说明（上下文压缩）](https://roocodeinc.github.io/Roo-Code/update-notes/v3.19.0/)
- **可移植配置**：`.roomodes`、`.roo/rules-*` 与导入／导出让 persona、工具组和规则进入仓库配置，而不是只留 UI。[Roo Code 官方文档（自定义模式）](https://roocodeinc.github.io/Roo-Code/features/custom-modes/)

#### 为什么流行或独特

**一手文档核验 + 推断**：Roo 把“角色切换”落成真正的能力差异，使 Architect／Reviewer 不只是换系统提示，而是换可用工具与文件权限；Boomerang 又把子任务上下文隔离做成用户可见模型。这比只让一个大上下文自行分工更易理解。其归档状态说明影响力与可持续维护是两回事；Kilo、Zoo 等后继分支本身也是该设计扩散的证据。

### 3.3 Aider：以 Git、Repo Map 和编辑格式约束模型

#### 是什么

Aider 是 Python 终端结对工具。它把 Git 仓库、显式加入的文件、全仓 Repo Map 和模型专用 edit format 放在核心位置，产品重心不是让模型拥有越来越多外部工具，而是让一次代码修改更可控、更容易核对。[Aider 官方仓库（产品定位）](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/README.md)

#### 怎么工作

**一手源码核验**：`Coder.run()` 等待用户输入；`run_one()` 调用模型、解析并应用编辑。如果自动 lint／test 发现错误，Aider 先征求用户是否把错误作为 reflected message 再跑一轮，并受最大反思次数限制。这个循环是“用户回合 → 编辑 → 验证 → 经同意修正”，不是默认无限自主工具循环。[Aider 源码（Coder 回合与反思）](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py)

#### 架构与关键设计

- **Coder 类族 + edit format**：不同模型使用 whole、diff、udiff、editor-diff 等结构化输出格式，把“想法正确”和“补丁可应用”拆开。[Aider 官方文档（编辑格式）](https://aider.chat/docs/more/edit-formats.html)
- **Architect／Editor 双模型**：Architect 先自由描述解法，Editor 再转换为具体编辑指令；这是模型角色分工，不是多 Session 编排。[Aider 官方文档（聊天模式）](https://aider.chat/docs/usage/modes.html)
- **Repo Map 是有预算的全局结构摘要**：tree-sitter 提取符号和签名，再以依赖图排序选择最相关部分，默认约 1k token 并随当前聊天动态调整。[Aider 官方文档（Repo Map）](https://aider.chat/docs/repomap.html) [Aider 源码（Repo Map 实现）](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/repomap.py)
- **Git 是副作用账本**：编辑后默认自动提交，可 `/diff`、`/undo`；编辑已有未提交文件前会先保存用户改动。它强调可逆性，但也意味着工具会主动改变真实 Git 历史。[Aider 官方文档（Git 集成）](https://aider.chat/docs/git.html)
- **验证回馈**：可自动 lint；测试默认需要显式启用。错误输出可再次进入模型，形成短反馈环。[Aider 官方文档（Lint 与测试）](https://aider.chat/docs/usage/lint-test.html)
- **记忆较克制**：聊天历史可总结／恢复，CONVENTIONS.md 作为只读上下文；没有内建的跨 Agent 任务图或组织级知识真源。[Aider 官方文档（编码约定）](https://aider.chat/docs/usage/conventions.html)

#### 为什么流行或独特

**一手文档核验 + 推断**：Aider 的差异化来自“薄界面 + Git 原语 + 可解释上下文选择 + 模型适配编辑格式”。它不要求用户把整个开发工作流迁入新 IDE，也能连接云端和本地模型。Repo Map 与 Architect／Editor 还体现了一个重要取向：先减少模型必须同时解决的问题，再谈更长自主循环。

### 3.4 Continue：Agent 是模型、规则与工具的可组合配置

#### 是什么

Continue 提供 CLI、VS Code 和 JetBrains 表面，把 Agent 定义为模型、规则与工具／MCP 的组合。当前官方已发布最终 2.0.0 并声明停止积极维护；因此本节强调它的架构价值和退出风险。[Continue 官方文档（最终维护状态）](https://docs.continue.dev/)

#### 怎么工作

**一手源码核验**：CLI 的 `streamChatResponse()` 是显式 `while (true)` 循环：每步按当前模式重新生成 system message 和可用工具；调用模型；聚合工具调用；执行并写回结果；做上下文校验／自动压缩；无工具调用且无需压缩后续时结束。该源码把常见 Agent loop 写得最直接。[Continue 源码（CLI Agent 循环）](https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/extensions/cli/src/stream/streamChatResponse.ts)

#### 架构与关键设计

- **共享 TypeScript Core**：IDE 与 CLI 共用模型、上下文、工具定义等核心，宿主层负责 UI／终端交互。
- **工具握手明确**：工具 schema 送给模型 → 模型请求调用 → 权限判断 → 内置或 MCP 工具执行 → 结果回传 → 下一轮。[Continue 官方文档（Agent 工具握手）](https://docs.continue.dev/features/agent/how-it-works)
- **权限三态且在请求前过滤**：`allow`、`ask`、`exclude`；可按 Bash 命令或参数 glob 匹配。Headless 模式会隐藏需要询问的工具，避免在无人应答时卡住或静默放权。[Continue 官方文档（CLI 工具权限）](https://docs.continue.dev/cli/tool-permissions) [Continue 源码（权限匹配）](https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/extensions/cli/src/permissions/permissionChecker.ts)
- **Plan／Agent 通过工具集合区别**：Plan 只发只读工具，Agent 才发写文件与执行命令工具；Chat 不发工具。[Continue 官方文档（模式工具边界）](https://docs.continue.dev/features/agent/how-it-works)
- **配置优先**：`config.yaml` 组合模型角色、rules、context provider、MCP；本地和共享 blocks 支持复用。[Continue 官方参考（Agent 配置）](https://docs.continue.dev/reference)
- **压缩有持久锚点**：对话摘要写回目标历史项；再次压缩时会合并上一摘要，并显式保存 active work、文件和未完成项。[Continue 源码（对话压缩）](https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/util/conversationCompaction.ts)
- **子 Agent 是工具**：CLI 可把 specialized agent 作为一次工具调用执行，父 Session 取得结果；源码未显示独立的跨 Session 持久任务图。[Continue 源码（子 Agent 工具）](https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/extensions/cli/src/tools/subagent.ts)

#### 为什么流行或独特

**一手文档核验 + 推断**：Continue 最独特的不是某个模型，而是“模型／规则／工具可配置、可版本化、可分享”的开放组合面。这种低锁定设计适合团队把私有模型、MCP 和规范接进统一客户端。反面是配置面、IDE、CLI、Hub 和服务边界都要持续维护；当前退出状态说明模块化不能替代清晰的长期维护承诺。

### 3.5 Kilo Code：从 Roo 分支迁到 OpenCode 内核，再扩展为多表面平台

#### 是什么

Kilo 最初是 Roo Code 分支；2026 年的新 VS Code 扩展重建在 OpenCode server 上，CLI 本身也明确来自 OpenCode 分支。当前产品覆盖 VS Code、JetBrains、CLI、Cloud Agent、代码审查和 Agent Manager。[Kilo 官方迁移指南（谱系与重建）](https://kilo.ai/articles/roo-to-kilo-migration-guide) [Kilo 官方仓库（当前产品面）](https://github.com/Kilo-Org/kilocode/blob/64e5dd03633013b4564d0ac759747d606f74522c/README.md)

#### 怎么工作

**一手源码核验**：当前保留的 OpenCode prompt loop 以持久 Session 消息为输入，逐步解析最后用户／助手状态；处理子任务和压缩任务；按 agent、session、model 解析工具与权限；注入环境、memory、instructions、MCP 和 skills；调用模型；只有正常完成且无待处理工具调用时结束，并有 max-steps 与压缩尝试上限。[Kilo 源码（Session Agent 循环）](https://github.com/Kilo-Org/kilocode/blob/64e5dd03633013b4564d0ac759747d606f74522c/packages/opencode/src/session/prompt.ts)

#### 架构与关键设计

- **共享服务内核**：Session、Agent、Tool、Permission、MCP、Plugin、事件和数据库形成服务层；IDE／CLI／云表面围绕同一 Agent 平台演进。
- **权限是 action × resource 的规则集**：默认 `ask`，支持 `allow／ask／deny`、通配匹配、按 Agent 合并、会话询问和“以后总是允许”的持久规则；deny 优先于 ask／allow。[Kilo 源码（权限服务）](https://github.com/Kilo-Org/kilocode/blob/64e5dd03633013b4564d0ac759747d606f74522c/packages/core/src/permission.ts)
- **每 Session 单写执行**：Run Coordinator 对同一 Session 串行执行，对不同 Session 允许并发，并提供 wake／interrupt；这处理的是进程内执行互斥，不等于跨系统任务所有权。[Kilo 源码（Session 执行协调）](https://github.com/Kilo-Org/kilocode/blob/64e5dd03633013b4564d0ac759747d606f74522c/packages/core/src/session/run-coordinator.ts)
- **结构化压缩**：摘要固定为 Objective、Important Details、Completed／Active／Blocked、Next Move、Relevant Files，并设保留 token、工具输出截断和压缩失败门。[Kilo 源码（结构化上下文压缩）](https://github.com/Kilo-Org/kilocode/blob/64e5dd03633013b4564d0ac759747d606f74522c/packages/core/src/session/compaction.ts)
- **编排双层**：任一全工具 Agent 可调用 subagent；Agent Manager 则运行多个独立 Session，每个可拥有 Git worktree、分支、终端、diff／review 面和 PR 徽标，并可对同一 prompt 开 2–4 个版本。[Kilo 官方文档（Agent Manager）](https://kilo.ai/docs/automate/agent-manager) [Kilo 官方文档（并行工作流）](https://kilo.ai/docs/automate/agent-manager-workflows)
- **迁移适配是一等产品**：Roo 的 `.roomodes`、rules、MCP、权限和 Memory Bank 都有显式迁移映射；旧 Kilo 兼容分支与新内核边界被公开说明。[Kilo 官方迁移指南（配置映射）](https://kilo.ai/articles/roo-to-kilo-migration-guide)

#### 为什么流行或独特

**一手文档核验 + 推断**：Kilo 的独特点不是单一 loop，而是快速吸收谱系设计、主动换内核、同时补齐 IDE／CLI／云／并行管理表面。官方 300 万下载复盘还坦承 installs 不等于 retention，这是较可信的社区边界表述。Agent Manager 让 worktree 隔离、人工 diff 复核和多版本比较成为显式交互，这对扩大 Agent 吞吐很实用；但它仍把环境脚本、`.env` 复制、分支处置等高风险动作放在本地产品层，不能直接等同于组织级治理。

### 3.6 Cursor：非开源的一体化产品对照

#### 是什么与怎么工作

Cursor 是基于 VS Code 的商业编辑器与云 Agent 平台。前台 Agent 能搜索、编辑、运行命令与 MCP；Ask／Manual／Custom 模式通过工具集限制能力。后台 Agent 运行在隔离的远端环境，默认可联网并自动执行命令；官方明确提示 prompt injection 与数据外传风险。[Cursor 官方文档（Agent 模式）](https://docs.cursor.com/agent) [Cursor 官方文档（后台 Agent 安全）](https://docs.cursor.com/background-agent)

#### 可见架构与关键设计

- **客户端 + 服务端 prompt／索引**：官方说明即使用自带 API key，请求仍经过 Cursor 后端完成最终 prompt 组装。代码索引用 Merkle tree 找变化、服务端切块／embedding，查询返回路径和范围后由客户端读取相应明文片段。[Cursor 官方隐私说明（请求与索引）](https://docs.cursor.com/account/privacy) [Cursor 官方研究（大仓索引复用）](https://cursor.com/blog/secure-codebase-indexing)
- **规则与记忆**：`.cursor/rules` 可版本化并按路径附加；Memories 是项目范围规则，可由 sidecar 观察或工具调用产生，后台生成的记忆需要用户批准。[Cursor 官方文档（Rules）](https://docs.cursor.com/context/rules) [Cursor 官方文档（Memories）](https://docs.cursor.com/en/context/memories)
- **权限表面分化**：CLI 支持 Shell／Read 等 token 与 allow／deny；后台 Agent 为完成闭环会自动跑命令，因此主要隔离手段变成 VM、网络和仓库授权，而不是逐调用批准。[Cursor 官方文档（CLI 权限）](https://docs.cursor.com/cli/reference/permissions)
- **编排产品化**：IDE 提供多 Agent 界面；Cloud Agents、API 和 Automations 支持并行、事件／计划触发、MCP 与 memory。[Cursor 官方发布（多 Agent 界面）](https://cursor.com/blog/2-0) [Cursor 官方发布（Automations）](https://cursor.com/blog/automations)

#### 为什么独特

**一手文档核验 + 推断**：Cursor 把模型、编辑器、索引、远端环境、自动化入口和审阅体验做成一体化服务，减少用户自己拼装的成本。代价是内部实现、数据路径和退出能力比开源样本更依赖供应商公开合同；因此它适合做产品体验与安全边界对照，不适合当作可直接复刻的开源架构证据。

## 四、按主题横向比较

### 4.1 架构：共享 harness 正在替代“扩展里的一团循环”

| 项目 | Agent 内核 | 产品表面 | 关键边界 |
| --- | --- | --- | --- |
| Cline | 轻量无状态 Agent + 有状态 ClineCore | CLI、VS Code、JetBrains、SDK、Kanban | 内核／会话／宿主分开；部分客户端例外未开源。 |
| Roo Code | Cline 衍生的扩展 Task 核心 + 消息流客户端 | VS Code、最终 CLI | Mode 是核心抽象；项目已归档。 |
| Aider | Python `Coder` 类族、Repo、RepoMap、edit formats | 终端为主，IDE watch 为辅 | 把编辑正确性与自主工具平台解耦。 |
| Continue | TypeScript core + CLI／GUI 宿主 | CLI、VS Code、JetBrains | Agent 由 models／rules／tools 配置组合；项目停止积极维护。 |
| Kilo | OpenCode 衍生服务内核，Session／Permission／Tool／Plugin 模块化 | IDE、CLI、Cloud、Agent Manager、Reviews | 谱系迁移和多表面共享内核是一等设计。 |
| Cursor | 可见为 VS Code 客户端 + Cursor 后端／云环境 | IDE、CLI、Web／Mobile、Cloud、Automations | 服务端内部不可同级源码核验。 |

**推断**：最稳健的开源方向是把 Agent loop 降为可替换 harness，将治理、权限、持久合同和 UI 各自放在外层。Cline 与 Kilo 的演进都支持这一方向；Continue 的退出则提醒我们，共享 core 还需要清晰维护与退出合同。

### 4.2 Agent 循环：结束条件和反馈边界比“自主”标签更重要

| 项目 | 一轮的基本形状 | 结束／暂停条件 | 验证反馈 |
| --- | --- | --- | --- |
| Cline | 模型 ↔ 工具，直到无工具文本 | 完成、失败、超时、错误上限、审批／追问、人工终止 | 诊断、命令输出、checkpoint；完整 Core 有 loop detection。 |
| Roo Code | ClineMessage 驱动，ask／say 显式化 | interactive ask 等人；completion／failure idle；Orchestrator 等子任务摘要 | VS Code diagnostics、命令输出、子任务回传。 |
| Aider | 用户回合 → 生成编辑 → 应用 → Git → lint／test | 默认回到用户；验证失败需同意才 reflection；有最大反思次数 | lint／test 错误短闭环，最克制。 |
| Continue | 每步重算 system／tools → LLM → tool calls → result → compaction | 无工具调用、拒绝、abort、上下文失败 | 工具错误自动回传；压缩后可自动继续。 |
| Kilo | 持久 Session 消息 → 子任务／压缩／工具解析 → LLM step | finish、plan follow-up、max steps、压缩尝试上限、权限／错误 | tool result、review telemetry、memory／summary、结构化输出。 |
| Cursor | 官方表面为 Agent 多工具迭代；后台运行在完整环境 | 产品文档未公开同等细粒度内部状态机 | 终端／测试／云环境、自检与审阅面。 |

**好设计模式**：

- 把 `waiting_for_input`、`idle`、`resumable`、`failed` 等状态做成可观测协议，不从终端是否安静猜测；
- 给反思／修复、总步数、上下文压缩分别设上限，防止不同失败模式共享一个模糊“还在跑”；
- 区分“模型给出最终文本”和“产品交付已经验证”，不让 loop 的 finish reason承担验收语义。

### 4.3 工具与权限：从审批按钮进化到可组合策略

| 项目 | 权限粒度 | 默认安全形态 | 主要缺口 |
| --- | --- | --- | --- |
| Cline | 工具类别／工具策略，Plan／Act，hooks 可阻断 | IDE 逐调用批准；安全读工具可自动；YOLO 显式高风险 | 文档中的模型自报 `requires_approval` 不能替代确定性策略。 |
| Roo Code | Mode 工具组、文件类型、`.rooignore`、命令前缀、MCP | 读／写／命令等分开批准；workspace 边界 | `.rooignore` 不是 OS 沙箱；命令解析存在天然旁路面。 |
| Aider | 主要由命令入口、文件加入、Git／lint／test确认控制 | 人在每个聊天回合；验证修复再询问 | 缺少统一 action × resource 策略；默认自动 Git 提交本身是副作用。 |
| Continue | `allow／ask／exclude`，工具／命令／参数 glob，模式覆盖 | 写与 Bash 默认 ask；headless 隐藏 ask 工具 | 配置优先级需要用户理解；`--auto` 是绝对放权。 |
| Kilo | action × resource ruleset，Agent／Session／持久批准合并 | 未命中默认 ask；deny 优先 | 本地持久批准会随时间积累，仍需治理与过期机制。 |
| Cursor | 前台／CLI token；后台 VM、网络与仓库授权 | 前台审批；后台以隔离环境承担更多风险 | 供应商环境与数据路径透明度受公开合同限制。 |

**好设计模式**：权限至少需要四层：`模式能力上限 → 工具是否可见 → 参数／资源匹配 → 本次调用批准`。只在提示词里写“不要动生产”不是权限模型；只做 worktree 隔离也不能限制外部网络、凭据和共享服务。

### 4.4 上下文与记忆：工作记忆、交接摘要、长期知识不是一回事

| 项目 | 当前回合上下文 | 压缩／恢复 | 跨 Session 记忆 |
| --- | --- | --- | --- |
| Cline | 文件／终端／Git／URL mentions，rules，按需 skills | Auto-Compact、`/smol`、`/newtask`；Task history 可恢复 | Task history、Rules；Team 本地任务板／邮箱／日志。 |
| Roo Code | mode rules、文件、搜索、MCP | 智能压缩；Boomerang 子任务完全隔离，只传入说明／传回摘要 | 工作区 rules 与 task history；无独立知识准入层。 |
| Aider | 显式 in-chat 文件 + 只读文件 + Repo Map + conventions | 历史 summary、token 预算、prompt cache | 聊天历史文件和约定文件；没有自动“记忆即知识”。 |
| Continue | 手动 context、规则、工具探索、context providers | 历史项内 conversationSummary，CLI auto-compaction | Session resume／fork、rules；没有正式知识可信门。 |
| Kilo | 环境、memory、instructions、MCP、skills、editor context | 固定结构 summary、最近内容保留、工具输出截断、失败上限 | Session DB、AGENTS.md／rules、Agent Manager state。 |
| Cursor | rules、代码索引、当前会话和工具搜索 | 产品内部细节未完全公开 | 项目 Memories，经 sidecar 或工具生成并需批准。 |

**推断**：这些产品大多解决“让下一次模型调用继续工作”，而不是“让后续任务只复用仍可信的结论”。摘要、Rules、Memories 和任务历史都可能有用，但如果没有来源、适用边界、失效条件和准入门，它们仍是上下文或研发证据，不应自动升级为当前知识。

### 4.5 编排：上下文隔离已成熟，持久合同与独立验收仍薄弱

| 项目 | 分解／并行 | 隔离 | 结果回收 | 持久协调真源 |
| --- | --- | --- | --- | --- |
| Cline | Sub-agents；Teams；Kanban 卡片依赖 | 子 Agent 独立；Kanban 每卡 worktree | 父 Agent取结果／团队任务板 | 默认本地 Team JSON 或 Kanban 状态；不是 GitHub 合同。 |
| Roo Code | Orchestrator 顺序创建 Boomerang 子任务 | 每个子任务独立上下文，父任务暂停 | 只把完成摘要带回父任务 | 编辑器任务层级；仓库已归档。 |
| Aider | Architect／Editor 两模型串行 | 角色提示和请求分开；共享同一聊天／文件范围 | Editor 生成可应用编辑 | Git 提交是结果记录；没有任务图。 |
| Continue | specialized subagent 工具 | 子 Agent 配置独立 | 工具结果返回父循环 | Session history；没有跨主机任务合同。 |
| Kilo | 原生 subagents；Agent Manager 多 Session／多版本 | worktree、分支、终端、Session | diff、review、PR 状态／人工整合 | `.kilo/agent-manager.json` + Git；组织级合同另需外部系统。 |
| Cursor | 多 Agent 界面、Cloud Agents、Automations | 云 VM／自托管环境 | UI／PR／API／自动化结果 | Cursor 服务与集成平台；公开资料未证明可替代 GitHub 合同。 |

**好设计模式**：

- 编排者默认不做实现，或者至少限制直接工具，减少上下文污染；
- 子任务上下文默认隔离，向下必须传清目标／边界／证据，向上必须给结构化摘要；
- 文件隔离与任务所有权分别表达，worktree 不能充当领取锁；
- 多版本并行适合比较高价值方案，不适合把同一模糊任务复制多份后投票；
- 运行状态留在运行后端，长期合同与验收证据放在可恢复的远端载体。

### 4.6 社区：分支速度是创新机制，也是维护风险

Cline → Roo → Kilo 的谱系证明，开放代码让 modes、权限、上下文和编排模式能快速传播；Kilo 后来又迁到 OpenCode 内核，说明分支不必永久绑定原架构。与此同时，Roo 归档、Continue 停止积极维护也说明：stars、安装量和功能广度不能替代治理、资金与迁移路径。

社区层面值得保留三个判断：

1. **活跃维护水位必须与历史影响力分开**：Roo 仍有设计价值，但不再是新增依赖候选；Continue 同理。
2. **迁移能力本身是产品能力**：Kilo 把规则、模式、权限、MCP 和历史行为逐项映射，比“兼容大多数配置”更可验收。
3. **供应商／模型中立有真实吸引力**：五个开源样本都不同程度支持多提供商或本地模型；但模型可换不代表执行后端、数据和任务状态也可换。

## 五、归纳出的好设计模式

### 模式 A：把 Agent loop 做成库，把产品治理留在外层

Cline 的 Agent／ClineCore、Continue 的共享 core、Kilo 的 Session 服务都显示：循环、工具协议、会话和宿主表面可以拆开。这样 IDE、CLI、CI 和多 Agent 调度共享同一执行语义，又不必共享同一 UI 或持久合同。

**适用条件**：工具调用和 Session 语义已经稳定到足以复用。

**失效信号**：为兼容每个宿主持续在 core 注入 UI 特例，或 core 开始承载组织任务真源。

### 模式 B：Mode 必须改变能力上限，而非只换人格

Roo、Continue、Kilo 都把 Plan／Ask／Architect 与 Code 的工具集区分开；这比在系统提示里要求“只分析”更可靠。最小权限应先决定模型看得到哪些工具，再决定调用时是否询问。

**适用条件**：任务类型与允许副作用能稳定分类。

**失效信号**：模式数量不断增加但权限边界相同，只剩 prompt 模板堆积。

### 模式 C：上下文采用“索引 → 按需正文 → 结构化压缩”

Aider Repo Map 用低 token 展示全仓结构，Cline Skills 先暴露 metadata 再加载正文，Kilo／Continue 用结构化摘要保留 work state。共同原则是：上下文不是越多越好，而是先给可发现索引，命中后才加载高成本内容，压缩时保留下一步所需锚点。

**适用条件**：能定义相关性、token 预算和压缩保真字段。

**失效信号**：摘要无法追溯来源、旧结论不退出、metadata 本身膨胀成常驻正文。

### 模式 D：副作用必须与回退、差异和验证绑定

Cline／Roo 的 shadow checkpoint、Aider 的 Git commit、Kilo 的 worktree + diff 都在降低“让 Agent 动手”的心理与技术成本。高价值不是自动保存本身，而是每个变化有清楚边界、可见差异、可恢复点和验证反馈。

**适用条件**：回退对象和真实交付 Git 历史的关系清楚。

**失效信号**：shadow repo、自动 commit 与用户分支互相覆盖，或 checkpoint 被误当成审查／验收。

### 模式 E：子任务隔离，交接通过窄协议而非共享大上下文

Roo Boomerang 最明确：父任务暂停，子任务上下文隔离，向下传任务说明，向上只回摘要。Cline Teams、Continue subagent 和 Kilo subagent／Agent Manager 从不同方向扩展了这个模型。

**适用条件**：子任务能独立验收，边界和所有权可以写清。

**失效信号**：摘要成为唯一事实却没有证据链接，或父子同时写同一资源而没有单写者。

### 模式 F：迁移与退出路径要像新功能一样逐项设计

Kilo 的 Roo 迁移表逐项映射规则、模式、MCP、权限、checkpoint 与 credentials，并明确哪些需要人工重建。它比“我们可替换后端”的抽象承诺更强，因为用户可以逐项核对能力保留和回退。

**适用条件**：依赖的能力语义已被枚举，能区分真源与可重建派生物。

**失效信号**：迁移只搬文件，不验证行为、权限或持久状态语义。

## 六、对我方 Agent 系统的可借鉴项

以下五点都只是学习候选，不改变当前权威，也不自动授权实现。每项的最小第一步都刻意放在一个自然、低风险样本中，先取得证据再决定是否进入 Skill、Plugin 或工具。

### 6.1 把“执行能力画像”写进派发合同

**借鉴来源**：Roo Mode 工具组、Continue `allow／ask／exclude`、Kilo action × resource ruleset。

**候选做法**：在任务范围之外再显式声明执行能力上限，例如 `read`、`edit:<glob>`、`execute:<pattern>`、`external-write`、`coordinate`；派发后端只在该上限内暴露工具。Agent 身份或模型不再隐含权限。

**最小第一步**：选择一个低风险叶子 Issue，只在派发说明附一张五项能力画像；人工核对实际工具调用是否都能映射，不先修改全局入口或权限系统。

**验收信号**：减少临场判断和越权提示，同时没有增加负责人批准次数。

**翻转条件**：画像维护成本高于误用减少量，或后端无法可靠隐藏／阻断工具。

### 6.2 为上下文压缩与子任务回收统一“可恢复摘要”字段

**借鉴来源**：Roo 的父子隔离、Continue 的 conversation summary、Kilo 的 Objective／Work State／Next Move／Relevant Files。

**候选做法**：把压缩摘要和 worker 详细报告的最小语义统一为：原目标、仍有效约束、已完成及证据、进行中、阻塞／未知、下一动作、相关文件／远端链接。摘要仍是恢复索引，不取代 GitHub 合同或证据。

**最小第一步**：在一次自然父子任务中让一个 worker 额外交付这七字段报告，协调者只读该报告与远端合同恢复；记录遗漏、追问和恢复时间。

**验收信号**：新 Session 能正确继续，且摘要没有把推断写成决定。

**翻转条件**：结构化摘要诱发重复双写，或字段无法稳定追溯到远端证据。

### 6.3 从 Orca 事件派生显式 Agent 状态，但不回灌持久面

**借鉴来源**：Roo 的 `RUNNING／STREAMING／WAITING_FOR_INPUT／IDLE／RESUMABLE` 状态机，Cline SDK 事件流。

**候选做法**：在 Orca 运行面将 Dispatch 的可观测事件归一成少量状态，供协调者判断“在工作、等输入、可回收、失败”；仍遵守过程执行态只存在于运行面。

**最小第一步**：对一个现有 Run 做只读状态映射表，用真实 heartbeat、question、worker_done 和终端事件离线核对，不建立轮询器、不写 GitHub 状态。

**验收信号**：协调者不再靠“终端没输出”猜测，同时没有产生新的过期状态副本。

**翻转条件**：Orca 事件已经足够直接，额外归一层只增加解释税。

### 6.4 把“环境可运行”作为独立交付前置，而不是隐含 setup 脚本

**借鉴来源**：Kilo Agent Manager 的 worktree 环境、专用终端、run script 与人工 diff／test 节律；Cursor Cloud Agent 的完整开发环境。

**候选做法**：对需要执行验证的仓库，任务合同明确依赖、构建／测试入口、外部服务与凭据引用方式；环境准备和 Agent 编辑分开验收。

**最小第一步**：在一个自然任务中人工记录“从新 worktree 到首个真实测试”的必要步骤、耗时和失败点，只形成 Markdown 证据；重复出现后再考虑用 Python／Go／TypeScript／Rust 自动化。

**验收信号**：worker 更快进入真实验证，且没有复制秘密或创建跨 worktree 共享副作用。

**翻转条件**：仓库启动差异太大，声明长期失真，维护成本高于每次人工恢复。

### 6.5 为可替换执行后端建立逐项迁移演练

**借鉴来源**：Kilo 从 Roo 到 OpenCode 的逐项迁移矩阵。

**候选做法**：围绕我方已枚举的长期 Orca 能力语义，逐项说明真源、可重建状态、替代路径、会丢失什么和如何验证，而不是只保留“后端中立”口号。

**最小第一步**：选一项已完成任务，假设 Orca 运行态全部不可用，仅从 GitHub Issue／PR 与仓库恢复合同和交付证据；记录唯一无法恢复的信息。

**验收信号**：在不读取旧 Session 的前提下恢复正确，缺失只限于本应易失的过程执行态。

**翻转条件**：演练发现 GitHub 持久面缺少授权、决定或验收信息，此时先修合同闭环，不建设替代后端。

## 七、我们已经更强、或不宜照搬的点

### 7.1 GitHub 合同真源强于本地任务板／Session 状态

Cline Teams 的 JSON、Roo 的任务层级、Kilo Agent Manager 的本地状态都适合活跃协作，但默认不能证明授权、负责人决定或跨主机恢复。我方已经把意图、授权、决定和验收放在 GitHub Issue／PR，把 Orca 只当执行事实后端；这更符合长程治理。可借鉴其 UI 和事件，不应把本地任务板升级为第二合同真源。[我方协作权威（产品事实三分）](../../_archive/authority/04-collaboration.md#产品事实三分)

### 7.2 三方审阅与当前 head 绑定强于自检／diff 面

Cline／Roo checkpoint、Aider lint／test、Kilo diff review、Cursor 自检都能提高可逆性和局部正确性，但本次一手材料没有证明它们默认提供“未参与实现者 + 当前提交 + 合同／权限／CI”的三方审阅。我方的独立审阅和 PR 整合门更适合高价值多 Agent 交付。checkpoint 只能回退，不能代替验收。

### 7.3 知识、研发记忆、任务状态分层强于自动把摘要／Memory 当长期事实

Cursor Memories、Cline Rules／Tasks、Continue／Kilo summary 都服务连续性，但容易把“值得继续提示模型”与“已经可信、仍适用”混在一起。我方知识有价值门、可信门、失效条件与最少复核；研发记忆保存过程且不自动可信。这一层级不应为追求顺滑记忆而降级。[我方知识权威（两道准入门）](../../_archive/authority/01-knowledge.md#两道准入门) [我方研发记忆权威（资产边界）](../../_archive/authority/09-rd-memory.md#与其他资产的边界)

### 7.4 守恒律比无限增加 Rules／Skills／Modes 更适合长期系统

开源产品普遍鼓励增加 rules、skills、modes、plugins 和 MCP；Cline 的渐进加载已经明显改善上下文成本，但仍不等于“新增规则必须置换旧规则”。我方对无条件入口和 Skill 描述有体积上限与置换要求，能抑制配置单调增长。可借鉴渐进披露，不宜放弃总量治理。[我方权威总图（守恒律）](../../_archive/authority/00-map.md#守恒律与受限自清理)

### 7.5 不照搬 Aider 默认自动提交

Aider 用自动 commit 提供优秀回退体验，但我方并发分支、用户未提交改动、Draft PR 和独立审阅合同更复杂。执行 Agent 自动提交用户脏状态，可能扩大授权、改变提交归属或污染待审 diff。应保留“每个副作用可回退”的目标，不默认复制其具体 Git 策略。

### 7.6 不照搬 Kilo 自动复制 `.env` 与任意 setup 脚本

Kilo Agent Manager 会把根级 `.env*` 复制进新 worktree，并允许各平台 shell setup／run script。这对个人 IDE 方便，但会扩大秘密副本和外部副作用；同时与本机持久脚本语言规则冲突。我方若建设环境准备能力，应只保存秘密引用，不复制秘密正文；持久实现只用 Go、Python、TypeScript 或 Rust，并把 setup 权限与任务合同绑定。

### 7.7 不把 worktree 当任务所有权或完整沙箱

Kilo 的工作流文档对文件隔离和并行任务选择很实用，也明确提示依赖、缓存、数据库和容器会产生额外资源；Roo 也明确 `.rooignore` 不是系统沙箱。我方已经把 worktree 只定位为文件隔离机制，并单独管理共享写入所有权、Orca 状态和外部资源，边界更完整。[我方权威总图（共享单点）](../../_archive/authority/00-map.md#共享单点清单)

## 八、最大启发

> **最大启发：把编码 Agent 看成“带权限、上下文预算和回退点的可替换执行器”，而不是长程工作的控制平面；真正稀缺的能力是让目标、授权、证据和知识在执行器、Session 与后端更换后仍保持同一语义。**

这条结论同时解释了哪些要学、哪些不照搬：我们应吸收 Cline／Continue／Kilo 的 harness 与策略化工具边界、Aider 的上下文经济性和 Git 可逆性、Roo 的隔离交接、Cursor 的环境与产品体验；但持久合同、独立验收、事实分层和知识准入继续由我方治理层掌握。

## 九、仍未知、失效条件与下次最少复核

### 9.1 仍未知

- 未实测各产品在同一真实仓库、同一模型、同一任务下的完成质量、token、延迟和人工介入；本文不能用于性能排名。
- 未审计各产品全部依赖、遥测、密钥存储、网络请求与沙箱逃逸面；权限比较仅限官方公开策略与选定源码。
- Cline、Kilo 在 2026 年快速演进，本次固定提交之后的多 Agent、memory、remote placement 语义可能变化。
- Cursor 服务端的 prompt、调度、记忆与审阅实现不可同级源码核验；本文只覆盖官方公开合同。
- GitHub stars、forks、下载和 token 量不能推出付费采用、留存、企业成熟度或社区健康。

### 9.2 会使结论失效的信号

- Cline 或 Kilo 把持久任务合同、权限真源和跨主机恢复提升为可审计的一等协议；届时需重新比较其与 GitHub／Orca 分层，而不能沿用“主要是本地状态”的判断。
- Continue 出现新的官方维护主体或后继仓库；届时其退出风险判断需更新。
- Cursor 开放足够源码或正式可移植服务端；届时可从产品对照升级为架构样本。
- 我方自然任务数据显示 GitHub 合同恢复成本长期高于本地 Session 恢复，或三方审阅成本高于避免的返工；届时应回到父目标与 ROI 重新判断，而不是维护现状。

### 9.3 下次最少复核步骤

1. 重新查询五个仓库的默认分支 HEAD、`archived`、最新 release 与 README 维护声明；
2. 只检查本文固定源码路径是否仍存在，以及 Agent loop、permission、compaction、orchestration 的关键接口是否改变；
3. 读取 Cline、Kilo、Cursor 最近三个月与多 Agent／权限／记忆／运行环境有关的官方 release note；
4. 若要作采用决定，再选一个我方自然、低风险 Issue 做同任务实测，预先固定模型、权限、环境、成功条件和人工介入记录；
5. 把实测结果留在任务证据层；只有可复用结论逐条通过价值门与可信门后，才考虑进入 `knowledge/`。

## 十、来源索引

本节只为复核导航；主要主张已在正文就近引用。

- [Cline 官方仓库（固定源码水位）](https://github.com/cline/cline/tree/a56af4efaf672e0f5261f06ebf3332ef684bd4c0)
- [Cline 官方文档（文档总入口）](https://docs.cline.bot/)
- [Roo Code 官方仓库（最终源码水位）](https://github.com/RooCodeInc/Roo-Code/tree/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16)
- [Roo Code 官方文档（归档文档入口）](https://roocodeinc.github.io/Roo-Code/)
- [Aider 官方仓库（固定源码水位）](https://github.com/Aider-AI/aider/tree/5dc9490bb35f9729ef2c95d00a19ccd30c26339c)
- [Aider 官方文档（文档总入口）](https://aider.chat/docs/)
- [Continue 官方仓库（固定源码水位）](https://github.com/continuedev/continue/tree/5522c6f44ca0ac3528b37244818fbfa39b5af470)
- [Continue 官方文档（文档总入口）](https://docs.continue.dev/)
- [Kilo Code 官方仓库（固定源码水位）](https://github.com/Kilo-Org/kilocode/tree/64e5dd03633013b4564d0ac759747d606f74522c)
- [Kilo Code 官方文档（文档总入口）](https://kilo.ai/docs)
- [Cursor 官方文档（文档总入口）](https://docs.cursor.com/)
