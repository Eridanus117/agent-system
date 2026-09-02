# MCP 生态现状与工具安全边界（2026 当前态）

> 服务对象：[关联 #165（生态情报持续改进我们的系统）](https://github.com/Eridanus117/agent-control/issues/165)
>
> 观察时间：2026-08-12
>
> 研究边界：只研究 MCP 核心协议、官方 Registry 与宿主执行面的安全边界；不覆盖[关联 #192（A2A 与 MCP Tasks 的 Orca 互操作边界）](https://github.com/Eridanus117/agent-control/pull/192)已研究的 A2A／MCP Tasks 互操作，也不覆盖[关联 #198（可复现 Agent 评测 Harness 与可靠性证据）](https://github.com/Eridanus117/agent-control/pull/198)的评测 Harness。
>
> 证据边界：结论来自一手规范、官方仓库与官方宿主文档；没有安装、连接或运行任何 MCP Server，没有修改 `authority/`、用户级配置或当前权限策略。

## 结论先行

截至 2026-08-12，MCP 已经是有中立基金会治理、版本化规范、官方 SDK 分层、扩展机制和公共 Registry 的互操作生态，不再只是单厂商的本地工具协议。[S1][S6][S7] 但它仍然不是工具安全边界：

1. 核心规范负责发现、描述、调用与传输，不替宿主决定用户是否信任某个 Server、某次工具调用或某份返回数据；规范明确说协议层无法强制人类确认。[S2]
2. 官方 Registry 证明发布者对源码命名空间或域名的控制，并分发 `server.json` 元数据；它不托管代码，也把安全扫描交给包仓与下游聚合器。[S5]
3. 本地 stdio Server 是由客户端以客户端权限启动的本地程序，SDK 与 stdio 都不是沙箱；远程 Server 则形成新的第三方数据与行动边界。[S3][S8]
4. 真正的安全闭环必须由宿主审批、逐工具授权、进程／文件／网络／密钥隔离、结果降信任、审计与更新复核共同完成。OAuth 保护令牌和资源受众，不等同于批准模型执行一项有副作用的动作。[S4][S8][S9]

因此，对本系统有用的决定不是“是否支持 MCP”，而是：

> **在什么来源、运行边界、逐工具效果、数据流与可撤销证据齐备时，某一个具体 MCP Server 才可以进入系统。协议兼容与 Registry 收录本身都不构成准入。**

## 2026 生态快照

| 层 | 当前一手证据 | 能说明什么 | 不能说明什么 |
| --- | --- | --- | --- |
| 核心规范 | 当前稳定规范为 2026-07-28；该版把请求做成自包含消息，并继续定义 resources、prompts、tools 与可选授权。[S1][S2] | 协议已经有稳定、版本化的能力协商与工具调用面。 | 不说明某个 Server 的实现安全，也不强制具体审批 UI。 |
| 治理 | MCP 已由 Linux Foundation 旗下 Agentic AI Foundation 承接为创始项目之一。[S6] | 项目具有跨厂商、中立治理面。 | 不替代实现审计、宿主权限或供应链验证。 |
| SDK 与一致性 | 官方社区发布 SDK 分层与一致性测试口径；层级按核心规范覆盖率和维护响应划分。[S7] | 客户端和 Server 实现可用共同测试基线比较。 | 层级不覆盖扩展，也不证明某个第三方 Server 的业务逻辑安全。 |
| 扩展 | 官方把 MCP Apps、认证扩展与 MCP Tasks 放在核心规范之外，扩展须显式协商，SDK 默认可以不启用。[S10] | 生态正从单一核心分成 core／projects／extensions。 | 支持核心协议不代表支持任一扩展；本研究不据此推断互操作完成。 |
| 官方 Registry | 2026-08-12 实测公共 API 返回 `version=1.8.1`、构建提交 `f52dc8525a441a3abf5fedc9912152d95af5aab1`；官方仍把 Registry 标为 preview。[S5] | 公共发现、命名空间认证、版本化元数据和多包类型入口已经可用。 | Registry 不是代码托管、恶意行为扫描或运行时隔离层。 |
| 宿主控制 | OpenAI Remote MCP 默认在向第三方分享数据前要求审批；GitHub Copilot CLI 为 MCP 工具调用提供显式许可与逐工具 allow／deny。[S8][S9] | 成熟宿主把协议能力再包一层数据披露与逐工具策略。 | 这些是特定宿主表面，不是 MCP 协议保证，也不能直接投影成我方已具备能力。 |

生态成熟度的直接含义是“可以较稳定地接入”，不是“可以无审查地接入”。一致性测试解决协议实现是否相符；来源认证解决谁发布了元数据；宿主与运行环境才解决这次调用能做什么。

## 从发现到执行的信任链

| 阶段 | MCP／Registry 已提供 | 剩余安全责任 | 必须避免的误判 |
| --- | --- | --- | --- |
| 1. 发现 | Registry 记录命名空间、包或远程入口及版本化元数据。[S5] | 核验服务运营者、源码与包的对应关系、固定版本／摘要、更新策略。 | “在官方 Registry 中”不等于代码安全或服务可信。 |
| 2. 连接 | 协议定义 stdio／HTTP 连接；HTTP 授权采用 OAuth 2.1 轮廓，令牌须绑定资源受众。[S4] | 本地限制启动命令、进程权限、文件、网络、环境变量；远程限制端点、身份与出站数据。 | stdio 只减少监听面，不会降低进程权限；OAuth 成功不等于用户批准工具效果。 |
| 3. 枚举 | `tools/list` 暴露名称、描述、输入／输出 schema 与 annotations。[S2] | 以 `server identity + tool name` 做稳定标识，记录 toolset 差异；把描述和 annotations 当不可信输入。 | Server 名称不保证全局唯一；annotations 不是安全声明。 |
| 4. 决策 | 工具是 model-controlled 能力，协议建议敏感操作保留人在环。[S2] | 宿主按工具、参数、资源、数据类别与副作用做 allow／ask／deny；向人展示真实输入和将披露的数据。 | 一次连接审批不能替代一次高风险行动审批。 |
| 5. 执行 | 客户端把 `tools/call` 交给 Server。[S2] | 用最小权限进程、沙箱／容器、只读挂载、网络与密钥最小化限制真实爆炸半径。 | SDK、stdio、Registry 或 `readOnlyHint` 都不是强制执行边界。 |
| 6. 消费结果 | Server 可返回文本、结构化内容、资源链接等。[S2] | 先按 schema 和业务规则校验，再进入模型；把 URL、文本与资源内容当第三方输入，防提示注入和数据回流。 | “工具返回”不等于可信事实或可执行指令。 |
| 7. 观察与撤销 | Registry 提供版本化元数据；工具列表可随授权和 Server 状态变化。[S2][S5] | 记录版本、工具列表、参数、审批、数据流与结果；Server、端点、工具集或授权变化时重新准入。 | 首次审过不等于后续版本和动态工具集仍然等价。 |

### 四个常见但错误的等式

- **Registry 收录 ≠ 安全背书。** 官方 Registry 的身份验证证明 GitHub／域名控制权，安全扫描明确留给包仓和下游聚合器。[S5]
- **OAuth 授权 ≠ 工具行动授权。** OAuth 约束客户端、令牌、scope 与资源受众；提示注入后的模型仍可能在合法令牌范围内调用不合意的工具。[S4][S8]
- **只读标注 ≠ 只读强制。** 工具 annotations 来自 Server；规范要求客户端在未信任 Server 时把它们视为不可信。[S2]
- **stdio ≠ 沙箱。** 本地 stdio Server 由客户端执行，并继承客户端权限；官方安全模型明确要求操作者另行限制环境。[S3]

## 主要威胁与可验收控制

| 威胁 | 一手证据中的失效方式 | 可验收控制 | 失败门 |
| --- | --- | --- | --- |
| 恶意或被接管的本地 Server | 安装／启动命令本身可执行任意代码，本地 Server 继承客户端权限。[S3] | 固定源码、包版本和摘要；展示并批准精确命令；隔离文件、网络、环境变量和密钥；禁止隐式安装。 | 无法固定工件，或不能把真实权限压到任务所需范围时，不连接。 |
| 工具描述／annotations 诱导 | annotations 由 Server 提供，工具列表还能按授权动态改变。[S2] | toolset 与 schema 生成差异回执；Server 身份和 tool name 组合成策略键；元数据只作提示，不作强制证据。 | 未解释的工具新增、效果变化或 schema 放宽时，旧批准失效。 |
| 提示注入与数据外泄 | 远程 Server 能收发数据并执行动作；返回内容也能携带恶意指令。[S8] | 在数据离开宿主前显示参数与数据类别；限制域名／资源；结果降信任；敏感动作逐次审批并留痕。 | 无法回答“哪些数据发给谁、调用后能做什么”时，不授权。 |
| Token passthrough／混淆代理 | 下游 API token 直接转交 MCP Server 会破坏受众校验、审计与信任边界。[S4] | MCP Server 只接受明确发给自身的 token；下游 token 分离；验证 audience、issuer 与 scope。 | Server 接受非自身受众 token 或不能说明下游凭据归属时，不接入。 |
| OAuth 元数据 SSRF／issuer mix-up | 客户端会从运行时 URL 发现授权元数据，攻击者可诱导访问内网或混淆 issuer。[S4] | 仅 HTTPS（loopback 例外）、限制私网地址与重定向、固定 issuer、验证回调与 PKCE S256、限制元数据响应。 | 无法限制发现请求出站面或无法绑定 issuer／回调时，不走该授权流。 |
| scope 膨胀与状态句柄劫持 | 过宽 scope 扩大令牌价值；未绑定用户的 session／state 可被另一用户复用。[S4] | 最小初始 scope、按需 step-up；所有状态句柄每次绑定并复核用户身份和授权。 | 只能以全量 scope 起步，或状态无法绑定主体时，不进入多人／共享环境。 |
| Server 更新后的语义漂移 | Server 可更新工具行为，工具列表可随请求变化；Registry 元数据不能约束远程 Server 的实际行为。[S2][S5][S8] | 固定版本／摘要／端点；在工具列表、schema、描述、授权或二进制变化时重做准入。 | 供应端只能自动滚动到未知版本且宿主无差异门时，不用于敏感任务。 |

## 对当前 Agent 系统的映射

### 已有基础

- 当前系统用 GitHub Issue 恢复合同、授权与写入所有权，用 Orca 保存协作运行事实；这能承载“谁批准哪一个具体 Server／工具”的持久决定，但当前没有 MCP 运行态投影。
- 当前权威明确没有开放式授权，新的 MCP、安装、配置和外部写入仍须有具体任务合同。
- 当前 Codex 默认 `danger-full-access`，Claude Code 默认 `bypassPermissions`。这服务于已授权任务的自主性，但也意味着若直接启动本地 MCP Server，它可能继承很大的主机权限；MCP 协议不会替系统缩小这一爆炸半径。
- **本次直接运行事实：** 2026-08-12 重跑 `codex mcp list` 显示 `codegraph`、`node_repl`、`openaiDeveloperDocs` 三个 Server 均已启用；[关联 #201（MCP 2026 生态与工具安全研究）的 V11 直接探针](https://github.com/Eridanus117/agent-control/pull/201#issuecomment-5270729057)还在不读取或发布参数／结果内容的前提下，从本机 Codex Session 回执观察到三类 MCP 的 `custom_tool_call`／返回事件。因此三者是已有配置与历史调用事实，也是待核验候选；这不证明它们已完成安全验收、应继续保留或已获产品采用。

### 尚未满足的能力缺口

| 缺口 | 当前影响 | 需要改变的系统决定 |
| --- | --- | --- |
| Y1-G1：没有统一的 MCP 准入卡 | 发布者身份、代码来源、运行权限、工具效果和数据出站容易被混成一个“可信／不可信”判断。 | 决定某一具体 Server 是否可以进入系统前，必须分别给出五层证据。 |
| Y1-G2：没有逐 Server／逐工具的运行策略投影 | Issue 中的授权不能自动约束宿主真实调用；工具新增或 schema 变化也没有失效规则。 | 未来若实施，策略键必须绑定 Server 身份、工具、参数／资源和效果，并支持 allow／ask／deny。 |
| Y1-G3：没有本地 stdio 供应链与隔离回执 | 精确启动命令、包摘要、环境变量、文件／网络／密钥边界不可复核。 | 本地 Server 在无法固定工件和限制进程权限时不得准入。 |
| Y1-G4：没有远程授权与数据流证据模板 | OAuth 合法性可能遮蔽实际数据披露、受众混淆、SSRF 与 scope 膨胀。 | 远程 Server 必须分别验收授权安全和每次工具的数据／行动边界。 |
| Y1-G5：没有工具集与行为漂移回执 | Server 更新、动态工具列表和第三方返回内容可能静默改变风险。 | 版本、端点、toolset、schema、描述或授权变化必须触发重审。 |
| Y1-G6：已有配置／调用事实，尚未形成逐 Server 可复核样本 | 三个现有 Server 已启用且历史回执存在调用／返回事件；但尚未按 Server 蒸馏来源、工件、权限、数据流、安全、摩擦、误拒绝、旁路、可靠性或 ROI 证据。 | 下一步应在新的明确合同下，从三个待核验候选中选择一个做只读准入盘点；不能从“已配置／调用过”外推为“已安全支持”或“应继续保留”。 |

## 有界改动候选

### 推荐顺序

1. **MCP-S1：先为一个现有 Server 建立准入卡，不建设通用接入层。** 不等待假定的“首次 MCP 需求”；下一步若有新的明确 Issue，就从 `codegraph`、`node_repl`、`openaiDeveloperDocs` 三个待核验候选中选择一个，填写运营者与命名空间、local／remote、源码／包／摘要、精确命令或 URL、工具及副作用、数据类别、凭据、文件／网络范围、OAuth audience／scope、审批策略、隔离、日志、更新与撤销方式。
2. **MCP-S2：对选定的现有候选做只读隔离预检。** 只枚举工具、记录 schema／annotations、验证固定工件与权限边界；优先只读、可替代、无敏感数据的候选。预检不等于产品采用；无法隔离或无法解释数据流即停止。
3. **MCP-S3：验证一次合同到宿主的逐工具投影。** 用 `allow / ask / deny × tool × resource/data/effect` 表达单个候选，并证明宿主在工具新增、参数放宽或版本变化后拒绝沿用旧批准。
4. **MCP-S4：远程候选另做授权／数据边界回执。** 核对 issuer、resource／audience、PKCE、redirect、SSRF、token passthrough、scope step-up，以及第三方保留和驻留边界；这份回执不被“已登录”替代。
5. **MCP-S5：只在安装／更新事件生成漂移回执。** 记录版本／摘要、端点、工具列表 hash、schema／描述差异、批准与日志位置；不建设定时全量扫描器或常驻调度器。

### 方案取舍

| 方案 | 收益 | 代价／风险 | 当前结论 |
| --- | --- | --- | --- |
| A. 保持现有状态，不新增或变更接入 | 不增加新的执行面与改动成本。 | 三个现有 Server 的来源、权限、数据流与保留理由继续未知，既有调用也无法形成可复核 ROI。 | 没有复核合同时维持，但不把“未改动”写成已安全。 |
| B. 准入卡 + 一个现有候选的只读盘点 | 最小成本用真实配置／调用背景验证信任链、宿主控制和实际 ROI；容易停止。 | 仍需新的明确 Issue、候选读取授权和隔离边界；若需改配置则另取写入所有权。 | **下一步推荐。** |
| C. 直接建设 Registry 浏览／自动安装／通用 MCP 平台 | 覆盖面最大。 | 把 preview 元数据入口误当安全边界；在当前宽主机权限下放大供应链与工具效果风险；已有调用事实仍不足以支撑平台 ROI。 | 当前不进入。 |

这些候选不会自动变成任务、产品决定或实施授权；当前配置与历史调用也不产生新的读取、凭据或权限授权。只有 B 获得针对一个现有待核验候选的新合同并明确只读边界后，才进入盘点；若后续需要修改配置、凭据、宿主或运行环境，再另行取得相应写入所有权。

## 证据等级、失效条件与最小复核

### 当前证据等级

- **既有知识复用：** 仓内没有已认可的 MCP 专题知识资产；既有研究只零散提及 MCP 权限或协议，且 A2A／MCP Tasks 已由相邻单元承接，因此本次只补安全边界缺口。
- **生态／规范事实：** 一手文档核验，MCP 规范与 Registry 使用固定 release／commit；宿主文档记录 observedAt。
- **系统映射：** 当前权威与外部信任模型的结构化推论。
- **系统运行事实：** 本次直接复核 3 个已启用 Server；V11 的事件级探针证明三类历史调用／返回存在。该证据只到“已配置且调用过”，没有展开调用参数、结果内容或逐 Server 安全边界。
- **实施与价值：** 尚无逐 Server 蒸馏证据；来源／工件／权限／数据流是否合格，以及摩擦、误拒绝、旁路、可靠性、复用价值与 ROI 仍未知。

因此，本稿可以支持“把三个现有 Server 列为待核验候选，并为其中一个形成有条件的只读准入复核”，不能支持“这些 Server 已完成安全验收”“应继续保留”“已获产品采用”或“修改全局权限策略”。本稿保留在 `learning/`，不把候选提前升级为 `knowledge/` 或权威；只有逐 Server 样本证明它可复用、能改变决策且通过当前知识门后，才值得另行维护。

### 失效条件

出现下列任一变化时，相关段落须重审：

- MCP 发布新稳定规范，或 `SECURITY.md` 改变本地 Server／客户端信任模型；
- 官方 Registry 脱离 preview，新增实质代码扫描、签名、撤销或运行时强制能力；
- 被选宿主改变默认审批、逐工具许可、数据披露或沙箱语义；
- 当前系统改变默认主机权限、授权模型或 GitHub／Orca 的合同投影；
- 出现具体 Server、连接方式、数据类别或业务副作用，推翻本文的抽象假设。

### 最小复核集合

复核不需要定时全量重做。只需在触发时重新读取：

1. 最新 MCP release 的核心规范、tools 与 SECURITY 信任模型；
2. Registry 当前 release、about／authentication／package types；
3. 实际宿主的工具审批和数据边界文档；
4. 具体 Server 固定版本的源码、包元数据、摘要、工具清单与授权要求。

## 一手来源

- **[S1] MCP 2026-07-28 release：** [发布说明](https://github.com/modelcontextprotocol/modelcontextprotocol/releases/tag/2026-07-28)，[固定提交 `5f5440b` 的规范首页](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/5f5440bb26a62e2cf3440b92da5a667efa03b267/docs/specification/2026-07-28/index.mdx)。
- **[S2] MCP Tools 规范：** [固定提交的 tools 章节](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/5f5440bb26a62e2cf3440b92da5a667efa03b267/docs/specification/2026-07-28/server/tools.mdx)。
- **[S3] MCP 官方信任模型：** [固定提交的 SECURITY.md](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/5f5440bb26a62e2cf3440b92da5a667efa03b267/SECURITY.md)，[固定提交的安全最佳实践](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/5f5440bb26a62e2cf3440b92da5a667efa03b267/docs/docs/2026-07-28/tutorials/security/security_best_practices.mdx)。
- **[S4] MCP 授权：** [固定提交的授权规范](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/5f5440bb26a62e2cf3440b92da5a667efa03b267/docs/specification/2026-07-28/basic/authorization/index.mdx)，[固定提交的授权安全注意事项](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/5f5440bb26a62e2cf3440b92da5a667efa03b267/docs/specification/2026-07-28/basic/authorization/security-considerations.mdx)。
- **[S5] MCP Registry：** [固定提交 `a25f166` 的 about](https://github.com/modelcontextprotocol/registry/blob/a25f166b4b5bee06eeecb75e4f37b2a44a8aa5be/docs/modelcontextprotocol-io/about.mdx)、[authentication](https://github.com/modelcontextprotocol/registry/blob/a25f166b4b5bee06eeecb75e4f37b2a44a8aa5be/docs/modelcontextprotocol-io/authentication.mdx)、[package types](https://github.com/modelcontextprotocol/registry/blob/a25f166b4b5bee06eeecb75e4f37b2a44a8aa5be/docs/modelcontextprotocol-io/package-types.mdx)，以及 [v1.8.1 release](https://github.com/modelcontextprotocol/registry/releases/tag/v1.8.1)。API 版本观测于 2026-08-12T17:44:26Z。
- **[S6] 中立治理：** [Linux Foundation 宣布成立 Agentic AI Foundation](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation)。
- **[S7] SDK 一致性：** [MCP SDK tiering system](https://modelcontextprotocol.io/community/sdk-tiers)。
- **[S8] OpenAI 宿主边界：** [Connectors and remote MCP servers](https://developers.openai.com/api/docs/guides/tools-connectors-mcp)，observedAt 2026-08-12。
- **[S9] GitHub 宿主边界：** [Copilot CLI 工具许可](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/allowing-tools)，[MCP allowlist enforcement 限制](https://docs.github.com/en/copilot/reference/mcp-allowlist-enforcement)，observedAt 2026-08-12。
- **[S10] MCP 扩展：** [Extensions overview](https://modelcontextprotocol.io/extensions/overview)，[Understanding MCP Extensions](https://blog.modelcontextprotocol.io/posts/2026-03-11-understanding-mcp-extensions/)，observedAt 2026-08-12。

## 停止点

本单元已经把生态现状转换为一个明确系统决定、六项能力缺口、五项有界候选、失败门和最小复核集合。它停止在学习证据：本次研究不安装、连接或变更 MCP，不创建通用 Registry／扫描／调度能力，不改变权限、权威或产品边界；下一步只在新的明确合同下，从三个现有待核验候选中选择一个做只读准入盘点，不再等待假定的未来首次需求。
