# Codex/Claude 当前运行环境与配置盘点

> 状态：只读盘点基线；后续入口实施与验证结果见“实施后补充”。本文件不是权威，也不是改造授权。
> 盘点日期：2026-08-09。
> 范围：当前 Windows 主机、已有 WSL2、Codex、Claude Code、入口文件、Skills、Hooks、MCP、Plugins 和相关资产仓。

## 结论

当前不是“能力太少”，而是“存在多套能力和入口，但它们没有共同服从当前权威”。

最明显的四层是：

1. 当前对话中的上下文；
2. `agent-control` 仓库中的当前权威；
3. Windows 用户级 Codex/Claude 配置；
4. WSL 和 Orca 遗留或现用的入口、Hooks 与 Skills。

盘点时，`agent-control` 只会在会话从该仓库范围内启动时自动进入项目指令链。从 `C:\Users\<user>` 等其他目录启动的新会话没有新的用户级入口把它带回当前权威。后续已实施这个最小改进，结果见下一节。

## 实施后补充

- 已新建 Windows 用户级 `.codex\AGENTS.md` 与 `.claude\CLAUDE.md`；
- Claude Code 的全新只读会话已正确恢复当前权威入口；
- 从普通 Windows 终端环境启动、默认使用 `C:\Users\<user>\.codex` 的 Codex 全新只读会话也已正确恢复入口；
- 当前宿主进程另外注入了 `CODEX_HOME=C:\Users\<user>\AppData\Roaming\orca\codex-runtime-home\home`，而 Windows 用户级和机器级都没有持久设置该变量；
- Orca 已把 `.codex\AGENTS.md` 复制到该专用目录，并用一个只含来源路径的标记文件声明这是它维护的副本；两份文件的内容和 SHA-256 相同；
- Orca 当前版本的本机代码会在同步时刷新这个受管副本，宿主路径不需要再手工建立第二份入口；
- 全新、临时、只读的 Orca 宿主 Codex Session 已正确恢复全部入口信息；因此普通 Windows 和 Orca 两种 Codex 启动路径均已验证。

## 已观察到的事实

### 原生 Windows

| 项目 | Codex | Claude Code |
|---|---|---|
| 版本 | `0.147.0` | `2.1.221` |
| 用户配置 | 普通 Windows 环境使用 `C:\Users\<user>\.codex\config.toml`；当前宿主进程的 `CODEX_HOME` 指向另一目录 | `C:\Users\<user>\.claude\settings.json` |
| 用户级持久指令 | 盘点时没有；现已创建并验证普通 Windows 启动路径；Orca 已生成同内容的受管副本 | 盘点时没有；现已创建并通过全新会话验证 |
| `agent-control` 项目入口 | 根目录有 `AGENTS.md` | 根目录 `CLAUDE.md` 导入 `AGENTS.md` |
| 项目专属配置 | 没有 `.codex\config.toml` | 没有 `.claude\settings.json` |
| 默认执行权限 | 不请求批准，并允许访问整个主机 | `bypassPermissions`，跳过常规权限检查 |
| 自动记忆 | 关闭 | 关闭 |
| 多 Agent 能力 | 功能开关已开，最多 15 个并发线程、深度 3 | Agent Teams 环境开关已开 |

当前会话从 `C:\Users\<user>` 启动，而不是从 `agent-control` 启动。它能保持当前方向主要依赖本次长对话和已经建立的仓内记录；这不能证明全新的 Session 会自动找到权威。

### Codex 的当前扩展

- 当前配置启用了 `code-quality`、`issue-to-merge`、`research-to-plan` 三组 `codex-marketplace` 插件；
- 还启用了 OpenAI 提供的浏览器、Chrome、计算机操作、文档、PDF、演示文稿、电子表格、模板和可视化等插件；
- 配置了 `codegraph`、OpenAI 官方文档和本地 Node 运行环境三个 MCP 服务；
- `hooks.json` 当前没有 Hook 定义，但 `config.toml` 留有一条旧 Hook 状态记录，属于不一致的残留状态；
- `rules/default.rules` 有 47 条历史允许规则，全部是 `allow`，没有 `prompt` 或 `forbidden`。其中包含已经结束的一次性下载、安装、Git、WSL 和设备控制命令；
- `config.toml` 还保留 39 条已经禁用的 Skill 路径，其中多条指向缺失的旧文件或旧插件版本。

这些规则和禁用项不是当前权威，但仍位于会被 Codex 读取的用户配置范围内。

### Claude Code 的当前扩展

- 已安装并启用 `rust-analyzer-lsp`；
- 已安装但禁用 `compound-engineering`；
- `~/.claude/skills` 中有 4 个指向 `~/.agents/skills` 的目录连接：`orca-cli`、`orca-linear`、`orca-per-workspace-env` 和 `orchestration`；其中 `orca-linear` 又被设置为关闭；
- 11 类生命周期事件都配置了同一个 `.orca` Hook，覆盖会话开始、提交提示、工具调用前后、权限请求、子 Agent 和队友状态等事件；
- Hook 脚本在所需环境变量存在时，把事件发送到本机 `127.0.0.1` 的 Orca 服务，否则丢弃输入并正常结束；
- 当前进程环境中存在这些 Orca 变量，所以从同一环境启动 Claude 时具备转发条件；
- 用户配置里另有一个 `codegraph` MCP 文件，但官方 Claude Code 的用户级和项目级 MCP 入口分别是 `~/.claude.json` 与项目根目录 `.mcp.json`。当前 `agent-control` 没有项目 MCP。

Hook 当前主要承担本机事件转发，并没有在入口脚本中注入 `agent-control` 权威。

### 共享 Skills 与 `grilling`

- `C:\Users\<user>\.agents\skills` 目前有 `find-skills`、三个 Orca Skill 和 `orchestration`，但该目录不是 Git 仓库，不能直接跨主机恢复；
- 这些 Skill 文件存在，但本次 Codex 会话提供的可用 Skill 清单没有列出它们；原因尚未验证；
- `agent-plugins` 是干净的 Git 仓库并已连接 GitHub；
- 其中已经存在 `grilling` `0.1.0`，同时有 Codex 与 Claude manifest，共用一份 `skills/grilling/SKILL.md`；
- 后续已在普通 Windows Codex、Orca Codex 和 Claude Code 用户范围安装并启用 `grilling` `0.1.0`。

三个正常的新会话检查都能发现它：Codex 的显式入口是 `$grilling`，Claude 的显式入口是 `/grilling:grilling`，并且没有会话在未获同意时自行开始问询。Claude 的一次 `--tools ""` 检查出现假阴性，说明这个参数也会隐藏 Skill，不能用于发现能力验收。负责人随后从 Orca 成功恢复原 Codex Session；线程 ID 和专用 `CODEX_HOME` 保持不变，恢复后的能力清单也包含 `grilling:grilling`。

### WSL2

- Ubuntu WSL2 已安装并正在运行；
- WSL 内 Codex 为 `0.144.0`，Claude Code 为 `2.1.206`，都落后于 Windows 当前版本；
- WSL 有独立的 `.codex/config.toml` 和有效的全局 `.codex/AGENTS.md`；
- 该 `AGENTS.md` 仍把 `docket`、`rhizome`、`crux`、Orca 工作站和旧知识流程当作默认入口，不是本次 Session 的当前权威；
- WSL 使用 `on-request` 与 `workspace-write`，权限比 Windows 默认值收敛；
- WSL 使用另一套 `codex-warp` 插件源；
- WSL 没有 `agent-control` 副本，也没有 `~/.agents/skills`。

因此现在迁移 WSL，不是简单换一个终端，而是把工作迁入另一套已经分叉、并含旧指令的环境。当前不建议迁移。

### 跨主机恢复

| 资产 | 当前是否可通过 Git 恢复 | 说明 |
|---|---|---|
| `agent-control` | 是 | 私有远程 `Eridanus117/agent-control`；首次推送和全新临时克隆恢复检查已通过 |
| Windows Codex/Claude 用户配置 | 否 | 只有本机文件和若干手工备份 |
| `~/.agents/skills` | 否 | 不是 Git 仓库 |
| `agent-plugins` 与 `grilling` | 是 | 已连接 GitHub；`grilling` 已安装到普通 Codex、Orca Codex 和 Claude Code |
| WSL 配置 | 否 | 独立的本机 Linux 配置 |
| `agent-workbench`、`agent-system-foundry` 等 | 部分是 | 有远程，但不具有当前权威，不能直接恢复成新系统 |

现在把任一旧工作目录直接 GitHub 化，都不能自动解决“哪个资产应该恢复、恢复后由谁生效”的问题。

### `agent-control` 远程恢复补充

负责人随后明确批准当前权威仓的私有远程与一次恢复检查：

- 远程地址为 `https://github.com/Eridanus117/agent-control`；
- 本地 `main` 已推送并跟踪 `origin/main`；
- 全新临时克隆的提交、工作区清洁状态和三份入口文件 Git 对象均通过检查；
- README 能恢复“权威总图 → 当前任务”的读取入口；
- 临时克隆验证后移入 Windows 回收站。

Winget 的 GitHub CLI 实际位于 `C:\Program Files\GitHub CLI\gh.exe`，但用户级 `.gitconfig` 仍指向已不存在的 Scoop 路径。本次没有改全局配置，只在本仓 `.git/config` 中增加本地凭据助手覆盖。因此仓内容可以跨主机恢复，但每台主机仍需自行具备有效的 GitHub 认证。

## 需要单独处理的风险

### 1. 默认执行权限过宽

Codex 当前组合是“不请求批准 + 整机访问”；Claude 当前组合是原生 Windows 上跳过权限检查，而 Anthropic 官方说明原生 Windows 没有沙箱。它有利于无人值守执行，但会把错误指令、提示注入和漂移的影响放大到主机范围。

这项风险不能通过一条入口文档完全解决。后续需要比较“默认受保护、显式进入自主模式”与“继续默认自主、增加其他控制”的人力成本和任务中断成本。

### 2. 静态认证信息及其备份

Codex 的 OpenAI 官方文档 MCP 使用了非空的静态 `Authorization` 值。盘点没有读取或输出该值，但相同配置键存在于当前文件和 4 个备份中。

它是否仍是有效凭据尚未确认。在任何配置 Git 化以前，需要把这项信息迁移到环境变量、OAuth 或其他凭据存储，并决定旧备份是否需要清理或凭据是否需要轮换。

### 3. 旧入口仍可能被执行

- WSL 的全局 `AGENTS.md` 仍是旧工作站规则；
- Windows Claude 的 11 类 Hook 仍连接 `.orca`；
- Codex 有 47 条历史允许规则和大量禁用 Skill 路径；
- 多个旧仓有远程地址，但都不是当前权威。

当前不能把“文件存在”“缓存存在”或“仓库有远程”解释为应该继续使用。

### 4. Orca 启动时的配置分层警告

Orca 宿主验证从 `C:\Users\<user>` 启动时，Codex 把 `.codex\config.toml` 额外识别为项目级配置，并报告其中的 `notify` 不支持项目级设置而被忽略。原因是 Orca 使用另一处专用 `CODEX_HOME`，同时工作目录正好包含默认 `.codex` 目录。

后续窄复核确认：默认配置与 Orca 专用用户配置都在第 10 行定义了顶层 `notify`，两处定义完全相同。被忽略的是额外发现的项目级重复项，Orca 专用 `CODEX_HOME` 中的用户级定义仍然存在。因此当前证据只显示警告噪声，没有显示通知配置丢失。

当前按 ROI 选择不修复。只有实际通知失效，或警告持续干扰自动化输出时，才值得追加一次通知触发实验。官方依据：[Config basics](https://learn.chatgpt.com/docs/config-file/config-basic) 与 [Config reference](https://learn.chatgpt.com/docs/config-file/config-reference)。

### 5. `agent-control` 的 Orca 登记与信任

为执行负责人批准的可观察交接重试，现有本地仓 `C:\Users\<user>\workspace\agent-control` 已登记到 Orca，没有新建 Git worktree、分支或远程。

负责人明确允许把该当前权威仓标记为受信任项目。可见变化只出现在 Orca 专用 `CODEX_HOME` 的 `config.toml`：新增该项目段及 `trust_level` 键；默认 Windows `.codex\config.toml` 未变化。新 TUI 的只读任务没有再修改仓或配置。

## 官方规则与本机事实的对应

- Codex 官方把 `AGENTS.md` 用于持久项目指令，把 Skill 用于可复用流程，把 Plugin 用于安装和分发，把 MCP 用于外部工具连接；这些载体用途不同，不应全部塞入一个 Skill 或知识库。
- Codex 官方在 `CODEX_HOME` 中加载用户级 `AGENTS.md`；没有设置该变量时默认使用 `~/.codex`，并在每次运行时先于项目入口加载它。
- Claude Code 官方使用用户级 `~/.claude/CLAUDE.md` 和项目 `CLAUDE.md`；Skill 只在相关时加载，Plugin 负责跨项目分发。
- Codex 原生 Windows 是正式支持路径；只有需要 Linux 工具、项目本来位于 WSL，或原生沙箱不够用时才应选择 WSL。
- Claude Code 同时支持原生 Windows 和 WSL2，但只有 WSL2 支持它的沙箱。

来源：

- OpenAI：[Codex 自定义总览](https://learn.chatgpt.com/docs/customization/overview)、[`AGENTS.md` 加载规则](https://learn.chatgpt.com/docs/agent-configuration/agents-md)、[Windows 沙箱](https://learn.chatgpt.com/docs/windows/windows-sandbox)、[WSL](https://learn.chatgpt.com/docs/windows/wsl)、[Plugin 架构](https://developers.openai.com/plugins/concepts/plugins)
- Anthropic：[扩展选择总览](https://code.claude.com/docs/en/features-overview)、[`.claude` 目录](https://code.claude.com/docs/en/claude-directory)、[项目记忆与 `CLAUDE.md`](https://code.claude.com/docs/en/memory)、[Skills](https://code.claude.com/docs/en/skills)、[Plugins](https://code.claude.com/docs/en/plugins)、[Windows 与 WSL 安装](https://code.claude.com/docs/en/installation)、[权限模式](https://code.claude.com/docs/en/permission-modes)

## 方案比较

| 下一步 | 方向收益 | 成本 | 当前问题 |
|---|---:|---:|---|
| 安装 `grilling` | 中 | 低～中 | 已完成发现检查；仍不代表完整“升级思考”能力或行为质量已经验证 |
| 现在迁移 WSL | 中 | 高 | 会先进入另一套旧指令和分叉配置 |
| 建立 Windows 用户级当前权威入口 | 高 | 低 | 只解决启动方向，不解决执行权限和跨主机恢复 |

## 推荐的一个最小改进

只建立 Windows 用户级当前权威入口：

1. 新建很短的 Codex 用户级 `AGENTS.md`；
2. 新建很短的 Claude 用户级 `CLAUDE.md`；
3. 两者只说明这台机器用于建设 Agent 系统，并把系统建设任务路由到 `agent-control` 的权威总图和当前任务；
4. 明确旧仓、旧 Issue、旧知识和旧实现不是默认权威；
5. 不把详细流程、知识内容或方法写进入口；
6. 用全新的 Codex 和 Claude 会话各做一次只读恢复检查。

本次最小改进不修改权限模式、Hooks、Rules、MCP、Plugins、WSL、远程仓库或旧资产。它先解决“从哪里启动都能找到当前方向”，再用真实任务观察是否值得继续治理安全模式和配置分发。

## 本次没有验证

- 没有启动新的 Claude 会话或 MCP 服务；
- 没有测试插件与 MCP 的连接健康；
- 没有读取任何凭据值、会话历史、记忆数据库或旧仓内容；
- 没有验证 `grilling` 的当前行为质量；
- 没有验证跨主机恢复；
- 没有证明新的全局入口一定能阻止漂移。
