# Kilo Code：从「Cline 的孙辈」到 OpenCode 内核上的 Agent 工程平台

> 核验日期：2026-08-12
>
> 研究对象：`Kilo-Org/kilocode` 主分支 `64e5dd0`、最新发布版 `v7.4.21`，并回看其 Roo/Cline 血缘。
>
> 证据边界：本研究直接查询了 GitHub API 元数据并阅读官方仓库、源码、文档与官方博客；未安装或运行 Kilo Code，凡运行时体验、可靠性与流行原因都不写成实测结论。

## 一句话结论

Kilo Code 今天已经不宜简单称作「Roo Code 的一个分叉」：它的旧版确实沿着 **Cline → Roo Code → Kilo Code** 演化，但 2026 年的 v7 把 VS Code 扩展重做为 OpenCode 派生 CLI 运行时的客户端，再把模式、子 Agent、工具、权限、上下文、工作树和多模型入口收进同一平台。它最强的产品设计是「一套可移植执行内核，两层并发形态，多种交互表面」；它仍没有替代我方 GitHub 合同真源、Orca 可追踪派发、独立三方审阅与知识分层治理。

## 证据分级与范围

| 等级 | 本文怎样使用 | 本次覆盖 |
| --- | --- | --- |
| 本次直接验证 | 通过命令获得、可重复查询的远端事实 | GitHub API 显示：主仓 26,827 stars、3,047 forks，主干当日仍有提交；Roo 仓已归档；当前主仓根许可证为 MIT |
| 一手来源核验 | 官方仓库、源码、文档或官方博客的明确陈述 | 产品范围、血缘、架构、模式、工具、上下文、权限、Agent Manager、重构过程 |
| 未核验推断 | 从一手事实作出的竞争情报判断 | 流行原因、设计取舍、对我方的启发；均明确标为推断 |

没有采用第三方评测，也没有把 Kilo 自己的对比页当成中立结论。尤其是其对 Cline 的若干比较已落后于 Cline 当前主线：Cline 现在也有 CLI、JetBrains、子 Agent、持久团队与 worktree Kanban，差异必须以两边当前仓库为准。

主要定位入口：[Kilo 官方仓库（当前主线）](https://github.com/Kilo-Org/kilocode)、[Kilo 主干快照（64e5dd0）](https://github.com/Kilo-Org/kilocode/commit/64e5dd03633013b4564d0ac759747d606f74522c)、[Kilo v7.4.21 发布页](https://github.com/Kilo-Org/kilocode/releases/tag/v7.4.21)。

## 它是什么

Kilo Code 是一个开源 AI 编码 Agent，也是覆盖本地与托管表面的产品平台。当前公开仓库同时容纳 CLI 运行时、VS Code 扩展、JetBrains 插件、SDK、代码索引、Gateway 客户端和文档；本地编码可从 VS Code、JetBrains、交互式 CLI 或无头 `kilo run` 进入。官方 README 主打 500+ 模型、任务中切换模型、直接使用 Kilo Gateway 或 BYOK／本地模型，以及终端、浏览器、MCP、Autocomplete、Cloud Agent 和代码审阅等能力。[Kilo 产品自述（README）](https://github.com/Kilo-Org/kilocode/blob/main/README.md)

当前产品的关键不是一个聊天框，而是四层组合：

1. **Agent 角色层**：Code、Plan、Ask、Debug 与自定义 Agent；
2. **执行层**：模型反复调用读写、搜索、Shell、Web、MCP、Skill、Task 等工具；
3. **会话与上下文层**：本地 SQLite 会话、按需检索、规则注入、索引、裁剪与压缩；
4. **并发与审阅层**：会话内子 Agent，以及 Agent Manager 管理的多 worktree 会话、Diff、终端和 PR 状态。

官方架构还区分本地运行时、Kilo Cloud 共享服务和托管执行产品。本文只把公开主仓中可读到的本地 Agent 与编辑器路径作为主要研究对象；仓库中出现某个 Cloud 边界，只证明静态设计与代码路径存在，不能推出生产启用率、流量或服务质量。[Kilo 架构总览（边界说明）](https://kilo.ai/docs/contributing/architecture)

## 与 Cline、Roo Code 的关系

### 血缘不是一句「都是 fork」就能说清

- **Cline 是上游祖先。** Roo Code 从 Cline 演化；Roo 官方归档页也把 Cline 称为其来源。[Roo Code 官方归档仓（来源说明）](https://github.com/RooCodeInc/Roo-Code)
- **Kilo 旧版从 Roo Code 起步。** Kilo 2025 年官方文章明确写道：它先 fork Roo，而 Roo 又 fork Cline；早期策略是移植两者已经验证的差异功能，形成「功能超集」。[Kilo 早期血缘与超集策略](https://blog.kilo.ai/p/roo-or-cline-were-building-a-superset)
- **Kilo 当前主线换了底座。** 2026 年 v7 是一次重做：VS Code 扩展改为 OpenCode server 派生内核的客户端，旧 Roo 系代码被移入归档仓；当前 README 也明确说明 Kilo CLI 是 OpenCode 的 fork。[Kilo v7 重做与共享内核](https://blog.kilo.ai/p/were-back-on-product-hunt-new-vs-code)、[Kilo CLI 的 OpenCode 来源](https://kilo.ai/docs/code-with-ai/platforms/cli)、[Kilo 旧版归档仓](https://github.com/Kilo-Org/kilocode-legacy)

因此，准确表述是：**产品与交互范式继承 Cline/Roo，当前执行内核与扩展架构主要继承并持续同步 OpenCode。**

### 当前差异（截至核验日）

| 维度 | Kilo Code | Roo Code | Cline |
| --- | --- | --- | --- |
| 生命周期 | 活跃；当前主仓 MIT | 2026-05-15 后归档；Apache-2.0 | 活跃；Apache-2.0 |
| 主模式 | Code / Plan / Ask / Debug；专用 Orchestrator 已弃用 | Code / Architect / Ask / Debug / Custom；末期有 Orchestrator | 以 Plan / Act 双态为主 |
| 子 Agent | 完整权限 Agent 可直接调用 `task`；General/Explore 与自定义子 Agent | 以 Orchestrator／Boomerang 委派其他模式 | 当前已有只读研究子 Agent，也有持久多 Agent 团队 |
| 多工作树 | VS Code 内置 Agent Manager，可并行 worktree、Diff、终端、PR 状态 | 主要是单扩展会话与子任务栈 | 独立 Kanban 提供 worktree 卡片、依赖链与自动提交 |
| 运行时表面 | VS Code、JetBrains、CLI 共用本地 CLI server 内核，并延展到 Cloud | 以 VS Code 扩展为主 | CLI、VS Code、JetBrains、SDK 共用 agent core |
| 定制单元 | Markdown Agent：提示词、模型、模式、权限、步数；另有 Skills、MCP、AGENTS.md | Custom Modes：角色、指令、工具组 | Rules、Skills、MCP、插件、Agent team 定义 |
| 模型入口 | 官方称 500+；Gateway、BYOK、本地模型、任务中切换 | 多 Provider／Router | 多 Provider、OpenRouter 200+、BYOK、本地模型 |

Cline 当前能力依据其主仓而非 Kilo 的营销对比页：[Cline 当前主仓（CLI、Kanban、SDK、团队）](https://github.com/cline/cline/blob/main/README.md)、[Cline CLI 当前能力](https://github.com/cline/cline/blob/main/apps/cli/README.md)、[Cline Plan/Act 官方说明](https://docs.cline.bot/core-workflows/plan-and-act)、[Cline 子 Agent 官方说明](https://docs.cline.bot/features/subagents)。

一个容易误读的细节：Kilo 当前主仓根许可证和 GitHub API 都显示 MIT，但 VS Code Marketplace 页面仍写 Apache-2.0，显然存在版本化文案冲突。做复用、分发或合规判断时，应核对目标版本与具体包的 `LICENSE`，不能只引用市场页。[Kilo 当前许可证正文](https://github.com/Kilo-Org/kilocode/blob/main/LICENSE)、[Kilo 市场页（仍写旧许可证）](https://marketplace.visualstudio.com/items?itemName=kilocode.Kilo-Code)

## 它怎么工作

### 1. 一套本地引擎，多种客户端

当前 VS Code 扩展不是把完整 Agent 循环塞在 Webview 里。扩展宿主按需启动一个共享的 `kilo serve --port 0` 子进程，通过生成的 SDK 发 HTTP 请求，通过全局 SSE 接收事件；侧栏、聊天标签、Diff、Autocomplete、Agent Manager 等共用这一进程。不同工作区／worktree 以目录参数路由到同一进程内彼此隔离的运行时实例。[Kilo VS Code 扩展架构](https://kilo.ai/docs/contributing/architecture/vscode-extension)

```text
VS Code / JetBrains / CLI
          │ HTTP + SSE（或 CLI 内嵌路径）
          ▼
      kilo serve
          │ 按 directory / worktree 选择实例
          ▼
   Kilo CLI 运行时
   ├─ Session / SQLite / Snapshot
   ├─ Agent + Prompt + Provider Router
   ├─ Tool Registry + MCP + Skills
   └─ Permission Gate
          │
          ▼
  直接模型 Provider 或 Kilo Gateway
```

这条边界带来两个效果：各编辑器只做客户端适配，Agent 行为可跨表面一致；多个 worktree 又能共享进程与 Provider 配置。代价是「目录隔离」不等于「进程隔离」——全局 SSE、部分服务与慢快照保护仍是进程共享状态，架构文档对此有明确提醒。[Kilo CLI 运行时架构](https://kilo.ai/docs/contributing/architecture/cli-runtime)

### 2. Agent 循环：模型选工具，权限门执行，再把结果写回会话

源码显示，运行时为一次会话选择 Agent 与模型，组合系统提示、项目指令与消息历史，向模型暴露当前 Agent 可用的工具；工具调用经过权限判断和输入校验，执行结果作为消息部件持久化，模型继续下一步，直到完成、失败、被中断或达到步数／上下文门限。这里是对源码结构的**一手来源归纳**，不是本次运行实测。[Kilo Agent 定义源码](https://github.com/Kilo-Org/kilocode/blob/main/packages/opencode/src/agent/agent.ts)、[Kilo 工具注册表源码](https://github.com/Kilo-Org/kilocode/blob/main/packages/opencode/src/tool/registry.ts)、[Kilo 会话提示循环源码](https://github.com/Kilo-Org/kilocode/blob/main/packages/opencode/src/session/prompt.ts)

### 3. 两层并发：子 Agent 与 worktree Agent Manager

- **会话内委派**：Code、Plan、Debug 可用 `task` 创建隔离子会话；子 Agent 有独立历史、模型、提示词与权限，结束后把摘要交回父会话。默认提供 General 和只读 Explore；可配置嵌套深度、最大步数与 `task` 权限。专用 Orchestrator 因而被弃用。[Kilo 子 Agent 设计](https://kilo.ai/docs/customize/custom-subagents)、[Kilo Orchestrator 弃用说明](https://kilo.ai/docs/code-with-ai/agents/orchestrator-mode)
- **工作树级并发**：Agent Manager 为多个会话创建独立 branch/worktree，展示实时 Diff、专用终端、设置脚本与 PR／CI／审阅徽标；还可对同一提示同时运行最多四个模型版本。[Kilo Agent Manager](https://kilo.ai/docs/automate/agent-manager)

这两层解决的是不同问题：前者节省父上下文并做任务分工，后者隔离文件与 Git 状态。官方工作流明确提醒，共享端口、缓存、容器、数据库等外部资源仍会碰撞，worktree 本身不会解决这些冲突。[Kilo 多 worktree 工作流](https://kilo.ai/docs/automate/agent-manager-workflows)

## 架构与关键设计

### 模式系统：从「模式切换」演化为「Agent 配置 + 可委派工具」

当前内置 Agent 是：

- **Code**：完整编码工具；
- **Plan**：读为主，只能写计划目录；
- **Ask**：读操作与受限只读命令，写操作受阻；
- **Debug**：完整工具，但系统提示偏向系统化诊断。

自定义 Agent 用 Markdown 正文作为系统提示，以 frontmatter 声明 `primary`、`subagent` 或 `all`、模型、温度、最大步数和权限。它把 Roo 时代「人格 + 工具组」的 Custom Mode 继续保留，却把模式能力落实到可组合的工具策略，而不是只靠提示词说「请勿编辑」。[Kilo 内置 Agent 说明](https://kilo.ai/docs/code-with-ai/agents/using-agents)、[Kilo 自定义 Agent 配置](https://kilo.ai/docs/customize/custom-subagents)

### 工具体系：统一注册，分层扩展

内置工具覆盖 `read/glob/grep`、`edit/write/apply_patch`、Shell、Web、问题、Todo、计划、Task、Skill 等；Kilo 自身还加入语义搜索、Agent Manager、模型搜索等工具，MCP 工具和本地插件工具也进入同一注册表与权限模型。工具输出会截断并把完整内容转存到临时路径，避免一次巨量输出占满上下文。[Kilo 工具总览](https://kilo.ai/docs/automate/tools)、[Kilo MCP 权限统一入口](https://kilo.ai/docs/automate/mcp/overview)

代表性工程选择是把 Kilo 专属能力放在 `packages/opencode/src/kilocode/` 等自有边界；必须触碰 OpenCode 共享文件时以 `kilocode_change` 标记，并用 CI 检查标记完整性。它不是一般用户功能，却是高速跟随上游时控制长期 fork 成本的关键设计。[Kilo 上游同步与变更标记](https://kilo.ai/docs/contributing/architecture/development-patterns)

### 上下文：按需找、分层注入、主动压缩

Kilo 的上下文不是一次性把全仓塞入提示词：

1. Agent 用 `read/glob/grep/bash` 按需发现；用户也可用 `@file`、终端、Git 变化或过去会话显式附加上下文；VS Code 会附当前文件与打开的标签页。[Kilo Context Mentions](https://kilo.ai/docs/code-with-ai/agents/context-mentions)
2. 根目录与上层 `AGENTS.md` 在任务开始加载；子目录 `AGENTS.md` 在读取对应目录文件时动态注入。规则文件默认受写保护，修改需明确批准。[Kilo AGENTS.md 规则](https://kilo.ai/docs/customize/agents-md)
3. 语义索引是默认关闭的显式选项：Tree-sitter 切块、Embedding、向量库、`semantic_search` 工具。[Kilo 代码索引](https://kilo.ai/docs/customize/context/codebase-indexing)
4. 长会话会先裁剪旧工具结果，再生成锚定摘要，保留最近若干轮原文；还可为压缩单独指定更便宜或更大上下文的模型。[Kilo 上下文压缩](https://kilo.ai/docs/customize/context/context-condensing)
5. 本地会话元数据与聊天历史保存在 SQLite，可恢复、搜索或把过去会话作为当前上下文；本地历史与 Cloud 会话是不同边界。[Kilo 会话历史与 SQLite](https://kilo.ai/docs/code-with-ai/agents/session-history)

这是一套有效的 Token 工程，但压缩摘要仍是模型生成的工作记忆，并不等价于经过可信门的知识，也不等价于任务合同。

### 权限：Agent × 工具 × 输入目标的有序规则

每项工具调用最终落到 `allow / ask / deny`。规则可按命令或路径 glob 细分，按配置顺序求值，最后一个匹配规则胜出；子 Agent 的 `task` 调用、Agent Manager 能力和 MCP 工具也走同一模型。`.env`、外部目录和重复失败循环有专门保护，Shell 会拆解组合命令逐项判断；项目 Agent 文件不能借环境变量或项目外文件扩展自身权限。[Kilo Agent 权限规则](https://kilo.ai/docs/customize/agent-permissions)

值得警惕的是，当前默认偏向低摩擦：多数工具默认允许，未匹配才询问；`--auto` 还会移除交互许可。官方安全页明确提示这可能造成数据损失或系统风险。[Kilo 自动批准与默认权限](https://kilo.ai/docs/getting-started/settings/auto-approving-actions)、[Kilo Autonomous Mode 警告](https://github.com/Kilo-Org/kilocode#autonomous-mode-cicd)

## 为何流行或独特

### 已观察到的规模

本次 GitHub API 直接查询显示，Kilo 主仓有 26,827 stars、3,047 forks，且核验日仍在提交；官方 2026-05-05 文章称 IDE 扩展累计超过 230 万安装。后者是厂商自报，本文不把它当独立审计数字。[Kilo 官方仓库规模入口](https://github.com/Kilo-Org/kilocode)、[Kilo 官方安装量与重做回顾](https://blog.kilo.ai/p/were-back-on-product-hunt-new-vs-code)

### 对流行原因的判断（推断，不是因果实测）

1. **用成熟血缘降低起步成本。** 早期直接承接 Cline 与 Roo 的用户心智、模式、MCP、Provider 与 UI 习惯，再以「超集」减少用户二选一的摩擦。Kilo 官方也把这称为早期获客基础。
2. **模型与付费入口极宽。** 500+ 模型、Gateway、BYOK、本地模型、任务中切换，把模型选择权和开箱体验同时交给用户。
3. **从单 Agent 聊天升级为可见并发工作台。** 子 Agent、Agent Manager、worktree、Diff、PR 状态和多模型对比，让「多开 Agent」成为编辑器内的一等交互。
4. **同一执行内核覆盖多个表面。** CLI、IDE 和本地 API 共用引擎，减少能力漂移，也给 Cloud、Slack、SDK 等入口留下扩展位置。
5. **开源快跟随与高迭代速度。** 官方披露 v7 上线后单周 188 个 PR、21 次上游合并；同时承认重写初期内存、限流、会话稳定性和可见性问题。这种透明快速修复会增强社区参与，但也说明高速度不是可靠性的替代品。[Kilo v7 人在回路复盘](https://blog.kilo.ai/p/we-are-so-back-human-in-the-loop)

独特之处并非任何单项功能全球唯一，而是把「模式、模型、工具、权限、上下文、子 Agent、worktree 与审阅」压成一个可移植、可扩展的整体，并公开维护上游派生关系。

## 对我方 Agent 系统的可借鉴点

以下均是候选，不自动改变权威、授权或长期依赖。

### 1. 把合同事实与运行事实投影到同一只读工作台

**借鉴**：Agent Manager 把会话、worktree、Diff、PR、CI 和审阅状态放在一处，显著降低负责人切换成本。

**我方适配**：GitHub Issue／PR 继续是合同与验收真源，Orca 继续是 Run／Task／Dispatch 运行事实；UI 只做带来源时间戳的并排投影。

**最小第一步**：选一个真实 Dispatch，做一张只读卡片，同时显示 Issue 标题与更新时间、Task/Dispatch ID、ownedPaths、当前 head、CI 与待处理审阅；逐项链接回权威来源，不增加写操作。

### 2. 把文字授权编译成可执行的逐工具权限

**借鉴**：Kilo 的 Agent × 工具 × 输入 glob 与 `allow/ask/deny`，让「只读审查者」从提示词愿望变成运行时阻断。

**我方适配**：Issue 合同中的 `ownedPaths`、允许操作与风险门可生成临时权限配置，但生成物不能反向定义授权。

**最小第一步**：只对一个只读复核任务做实验：允许 `read/rg/git diff`，阻断编辑、推送和外部目录；预先登记一个越权探针，验证运行时确实拒绝，再丢弃策略。

### 3. 为长 Session 设计「锚定压缩 + 最近原文 + 可追溯载体」

**借鉴**：Kilo 不只总结全文，还保留最近轮次、清理陈旧工具输出，并允许专门压缩模型。

**我方适配**：锚定字段必须包含远端合同链接、未消费决定、排他所有权、验证证据与下一责任人；权威、知识、研发记忆仍分层，摘要不能越级。

**最小第一步**：在一次 Orca 交接中手工生成结构化恢复包，让未参与者只凭恢复包和远端链接复核；记录遗漏率与恢复耗时，不改系统提示词或 Skill。

### 4. 在产品表面明确区分两种并发

**借鉴**：Kilo 把「父会话内的子 Agent」与「worktree 级并行会话」做成不同机制，避免把上下文隔离误当文件隔离。

**我方适配**：进一步区分轻量研究子 Agent 与具有 Task/Dispatch、ownedPaths、worker_done 来源链的耐久委派。

**最小第一步**：在 Orca 一个视图中给两类工作加不同标签和验收提示；统计一次真实波次里是否仍有人把子 Agent 摘要误当成可交付证据。

### 5. 对上游派生资产建立「窄覆盖面」纪律

**借鉴**：Kilo 用自有目录、窄注入缝、变更标记和检查脚本控制持续同步 OpenCode 的成本。

**我方适配**：对外部 Skill／Plugin 明确记录上游版本、本地覆盖层、置换对象与同步检查，和守恒律共同控制常驻规则膨胀。

**最小第一步**：只选一个实际维护中的外部 Skill，产出一次「上游版本—本地差异—仍需保留理由—最少复核步骤」清单；先人工复核，不建设全量同步器。

## 我方已经更好，或不宜照搬的点

1. **本地会话不是持久合同。** Kilo 的 Agent Manager 主要围绕会话、worktree、Diff 和 PR 状态；本次所读架构没有把 GitHub Issue 的范围、授权、成功条件与负责人决定建成任务真源。我方的 GitHub 合同真源更适合跨 Session 长程恢复。
2. **摘要回传不等于可追踪交付。** Kilo 子 Agent 结束后向父会话返回摘要；我方 Orca 的 Run/Task/Dispatch、能力票据、心跳、`worker_done` 与精确交付标识更适合追责和拒绝迟到重试。Kilo 的轻委派可借鉴，但不能替换来源链。
3. **多版本对比不等于独立三方审阅。** 同一提示并行跑多个模型很适合探索方案，却没有自动满足身份独立、密封、裁决与授权门。我方三方审阅应继续按高影响决定的经济门触发。
4. **上下文管理不等于知识治理。** Kilo 的 AGENTS.md、历史搜索、Memory Recall 与压缩解决「模型还能看到什么」；我方把权威、当前知识、任务证据与研发记忆分开，能回答「什么已经被认可、证据到哪一级」。这一层不应折回单一 Memory Bank。
5. **不照搬默认宽权限。** Kilo 多数工具默认允许，适合个人编码的低摩擦目标；对共享分支、权威、用户级配置、Plugin 与 Orca 状态，我方仍应以合同所有权、窄授权和读后复核为前置。
6. **不把 fork 速度当产品采用证据。** Kilo v7 自己承认重写早期「能力先行、可见性与控制回补」；我方守恒律、父目标验收和证据等级正是防止常驻规则与能力面只增不减的保护层。

上述第 1 点是基于本次已读公开架构与文档的范围内判断，不声称 Kilo 全部私有或未来产品绝对没有外部合同能力。

## 风险、未知与下次最少复核

- **未实测**：安装、登录、模型调用、权限提示、compaction 质量、Agent Manager 并发稳定性、Windows 体验与 Cloud 会话同步。
- **文档变化快**：v7 在 2026 年仍高速迭代，旧 Roo 概念与新 Agent 概念并存；市场页许可证已经出现滞后。
- **厂商自报偏差**：安装量、Token 量、模型数量、增长原因来自 Kilo 自述，应与 Marketplace API、NPM 下载或独立遥测交叉核验后再用于采购／采用决定。
- **竞争对手也在变**：Cline 已补上 CLI、团队、调度和 Kanban；任何静态「Kilo 有、Cline 无」表都容易失效。

下次最少复核步骤：读取主仓最新 release 与架构页；查询 Kilo、Cline、Roo 的 GitHub 元数据；核对 `packages/opencode/src/agent/agent.ts`、权限文档、Agent Manager 文档和 Cline 当前 README；只有准备采用或替换工作流时，再用一个隔离样本仓实测权限、压缩恢复、双层并发和 PR 审阅链。

## 最大启发

**Kilo 最大的启发不是某个更聪明的提示词，而是把 Agent 角色、工具、权限、上下文与工作树做成一套可移植执行内核；我方真正值得建立的差异化，是在这类成熟编码内核之上叠加可恢复合同、可追踪运行、独立审阅和证据分层，而不是再造一套编码 Agent。**
