---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-agent-system-2026-08-21/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-agent-system-2026-08-22/ARCHITECTURE-SPINE.md
---

# agent-system - Epic Breakdown

## Overview

本文将现有 Agent Context Assembly capability SPEC、术语、验证合同和 adopted Architecture Spine 收敛为首个可交付 MVP。负责人在 Story 细化期间确认，MVP 最核心且仅需产品化的用户能力只有两项：

1. 用户可以查看某个配置包含什么，并按需机械比较多个配置；
2. 用户可以亲自选择某个配置，然后用该配置启动 OMP。

MVP 只实现 OMP。Claude Code 与 Codex CLI 只保留未来 client adapter 合同边界。产品不分析任务目标/验收/约束/权限/风险，不观察任务内容或结果，不由 Agent 选择配置、生成候选或推荐装配。OMP Session 恢复使用 OMP 原生能力；Agent System 不拥有 native Session locator。

## Requirements Inventory

### Functional Requirements

MVP-FR1：用户可以从外部 Agent System CLI 查看所有已保存配置；每项显示名称、具体修订、默认/通用标记、简短边界和可用状态。没有配置时显示诚实空状态，不伪造默认配置。

MVP-FR2：用户可以查看某一配置声明的 Instructions、Skills、MCP、来源类别、边界、缺失项和 Unknown；产品不显示或持久化私域原文、凭据、prompt、transcript 或任务内容。

MVP-FR3：用户可以自行选择两个或更多配置进行机械并列比较；产品不生成候选、评分、排序、Recommendation、自动选择或静默 fallback。

MVP-FR4：用户可以亲自选择一个具体配置修订，并在一次简洁确认后用它 fresh 启动 OMP；配置选择本身和进入 OMP 后不得产生额外产品确认。

MVP-FR5：用户进入 OMP 后可以使用 OMP 原生 resume。Agent System 不拦截、不选择 Session、不保存 opaque locator、不管理 lease/fencing，也不观察恢复后的任务内容或结果。

MVP-FR6：用户可以从外部 CLI 查看所选配置、OMP client/version、启动阶段、配置应用结果以及已知差异/Unknown；该状态不包含任务目标、对话、工具调用、进度或结果。

MVP-FR7：用户可以选择另一个配置进行切换；切换必须创建新的启动计划并要求重启，不在原 OMP 进程内热改配置，也不自动 resume。

MVP-FR8：配置查看、准备、应用或 OMP 启动失败时，用户可以看到失败阶段、受影响配置项、已知原因、Unknown 和恢复动作；产品不得伪造成功、自动回退或修改用户全局 OMP 配置。

MVP-FR9：OMP 内的“当前配置/启动状态/切换入口”采用 native-first：钉住版本的 capability probe 证明 OMP 原生能力满足合同时直接复用；不存在或不足时才由薄扩展提供最小辅助面，两者不得形成不同事实源。

MVP-FR10：MVP adapter registry 只支持 OMP；Claude Code/Codex CLI 返回明确 unsupported，仅保留客户端中立的 manifest/plan/receipt 与 adapter port 边界，不提供占位实现、配置翻译或跨客户端 Session 恢复。

### NonFunctional Requirements

NFR1：所有配置可用、应用、启动、失败和差异结论必须绑定可回读证据；未知即 Unknown。

NFR2：配置声明、启动计划、配置应用结果和 OMP 生命周期状态必须可区分；不得通过命名把较弱证据提升为“已在任务中生效”。

NFR3：状态必须携带实际 OMP client/version 或等价环境证据；文档声明或移动分支不能替代钉住版本的 probe/smoke。

NFR4：SQLite、日志、投影、manifest/plan/receipt、bridge envelope 与 invocation 诊断不得包含私有原文、凭据、prompt、transcript、工具 payload 或任务内容。

NFR5：私域资产仍受原授权边界约束；产品不得通过复制、缓存、公共摘要或启动工件绕过授权。

NFR6：外部来源或 MCP 的 configured/installed/connectable 状态不得自动推导安全、可信、适用或已在任务中使用。

NFR7：日常路径保持“查看/选择配置 → 一次确认 → 使用 OMP”；不得要求用户管理单项资产、填写内部 trigger enum 或处理任务分析。

NFR8：只做配置和启动控制面的机械判断；产品不执行任务语义判断、任务观察、任务结果验证或装配推荐。

NFR9：用户拥有配置选择权；Agent、默认标记、显示顺序和历史使用均不得替代用户选择。

### Additional Requirements

- AR1：采用外部 TypeScript/Bun CLI 与六边形模块化单体；领域状态变更只经应用命令，OMP adapter/薄扩展不得自行做产品决定或直接写 SQLite。
- AR2：MVP 只实现 OMP。Claude Code/Codex CLI 仅保留未来 adapter port 和版本化 DTO/schema 边界，不实现配置等价、Session 翻译或兼容 shim。
- AR3：SQLite 保存配置修订、用户选择和启动 operation 的持久事实；JSON/Markdown 仅为 allowlist 可重建投影。OMP transcript、凭据、缓存和原生 Session 始终由 OMP 拥有。
- AR4：配置修订不可变；查看、比较和启动始终绑定具体修订。历史修订不得因新状态被原位改写。
- AR5：一次启动确认绑定当前 operation、具体配置和当前计划；计划或配置变化后旧确认失效。SQLite 提交不伪装覆盖文件生成和进程启动，副作用必须可协调且不得重复启动。
- AR6：真实 OMP 配置只生成在受限 invocation 边界；直接 argv spawn，显式管理 cwd/env/stdio/exit/signal，不经 shell，不清空、改写或恢复用户全局配置。
- AR7：启动状态只覆盖 Agent System 配置选择、计划、应用和 OMP 进程生命周期；不得读取、归类、记录或解释任务运行态。prompt/任务参数只可不透明、invocation-scoped 透传给 OMP。
- AR8：必需配置引用不可达、schema/client 版本不兼容、权限或工件完整性失败时 fail closed；仅 optional 项失败可明确 degraded，并列出差异和 Unknown。
- AR9：OMP native resume 完全由用户在已启动 OMP 内操作。MVP 不保存 opaque locator，不实现 explicit resume 启动参数、native Session lease/fencing 或自动恢复；这些只保留未来 adapter 扩展空间。
- AR10：配置切换返回“需要重启”，以新配置创建新启动计划并再次进行该计划唯一一次确认。Agent System 不热改当前进程、不自动 resume。
- AR11：OMP 辅助面 native-first。实现前必须对钉住 OMP artifact 做 capability probe；原生能力满足当前配置/启动状态查看合同时复用，缺失或不足时才建设同语言薄扩展。
- AR12：薄扩展若需要，只消费版本化 launch context、显示当前配置/启动状态并转发切换入口；不得观察 prompt、消息、工具调用、任务进度/结果，不拥有配置或启动事实。
- AR13：配置创建、编辑、Context Assembly、Agent 候选/推荐、任务期 Context Loading、任务适用性判断、任务观察、样本/Bad Case 产品化、三层任务验证和跨 Session 任务证据均不进入 MVP。
- AR14：来源 SPEC FR1～FR4 在 MVP 中收敛为已保存配置的查看、用户选择和机械比较；来源 FR5～FR8 收敛为配置应用与 OMP 启动控制状态；来源 FR9～FR13 的任务感知/运行观察能力延后；FR14 只保留配置修订可跨 CLI Session 回读，不承担任务交接。
- AR15：本轮负责人裁决覆盖来源 SPEC FR2 与 Architecture Spine AD-16 的 Agent 候选生成/Recommendation，覆盖 AD-7/AD-13/AD-19 的 MVP explicit resume、opaque locator 与 Session lease/fencing，并把 AD-11/AD-17 的真实任务证据约束保留为外部开发验收门而非产品运行功能。
- AR16：配置供应不是本轮第三项用户能力。Story 以“存在已保存配置”为正常前置；无配置必须显示诚实空状态。不得通过伪造默认配置掩盖未提供配置数据。
- AR17：验证必须覆盖 schema/type contract、配置查询/比较、SQLite 仓储、隐私 allowlist、OMP adapter、确认幂等、失败协调和目标 OMP smoke；覆盖非 ASCII/空格路径、既有全局配置、未知 capability、bridge 不可用和 OMP 启动失败。

### UX Design Requirements

本轮按负责人要求跳过独立 UX 阶段，且未发现独立 UX 设计合同。用户可见交互合同已直接写入两条 Story：Story 1.1 覆盖候选比较和当前配置辅助面；Story 1.2 覆盖一次确认、启动/原生恢复边界、状态、配置切换和失败反馈。

### FR Coverage Map

MVP-FR1：Epic 1 / Story 1.1 — 查看保存配置列表与诚实空状态。
MVP-FR2：Epic 1 / Story 1.1 — 查看配置组成、来源、边界和 Unknown。
MVP-FR3：Epic 1 / Story 1.1 — 用户选定配置间的机械候选比较。
MVP-FR4：Epic 1 / Story 1.2 — 用户选择配置、一次确认并 fresh 启动 OMP。
MVP-FR5：Epic 1 / Story 1.2 — resume 委托 OMP 原生能力。
MVP-FR6：Epic 1 / Story 1.2 — 查看配置应用与 OMP 启动状态。
MVP-FR7：Epic 1 / Story 1.2 — 配置切换创建新计划并重启。
MVP-FR8：Epic 1 / Story 1.2 — 类型化失败反馈和恢复入口。
MVP-FR9：Epic 1 / Story 1.1、1.2 — OMP 内辅助能力 native-first。
MVP-FR10：Epic 1 / Story 1.2 — OMP-only 与未来 adapter 边界。

## Epic List

### Epic 1：查看、选择并使用 OMP 配置

用户可以看清一个配置包含什么，必要时并列比较多个配置，然后亲自选择一个具体修订，经一次确认 fresh 启动 OMP；进入 OMP 后使用原生 resume，并只查看配置应用与客户端启动状态。

**覆盖 FR：** MVP-FR1～MVP-FR10

**实现与交互约束：** 外部 CLI 是唯一主入口；OMP 内能力 native-first，缺口才由薄扩展补齐。产品不创建/编辑配置、不生成候选/推荐、不分析或观察任务。SQLite、versioned manifest/plan/receipt、invocation 隔离和失败协调只服务两项核心能力，不扩成额外用户流程。

### Epic 2：控制面发布与自更新

`configs` 以 Bun 编译的独立可执行文件分平台发布；进程启动时后台静默检查新版本，通过固定发布端点 + 完整性校验后原地自更新，失败静默降级不阻塞本次启动，不上报任何遥测。具体 Story 与验收标准由后续细化产出。

**覆盖 AD：** AD-15（2026-08-22 修订，见 `sprint-change-proposal-2026-08-22-configs-self-update.md`）

### Epic 3：配置供应与装配

`configs` 支持选择数据源（GitHub 仓库或本地目录）导入原始资产，由 Agent 辅助完成调查、候选生成与推荐（对应 SPEC.md CAP-1），用户裁决后建立/修订可持久化的稳定配置（对应 CAP-2 的"建立/修订"部分，恢复覆盖 PRD FR-1～FR-4 / WF-1）。这条能力域此前被 epics.md AR13/AR15/AR16 明确裁定不进入 MVP；本次由负责人在实际使用已交付产品后重新表态、正式排入后续排期。装配（Agent 辅助）与使用（人工看/选/用，即 Epic 1 范围）保持两个不同的能力面，不合并、不互相替代。具体数据源接入方式、配置修订写路径与交互设计留给后续 bmad-architecture / bmad-ux / bmad-create-epics-and-stories 产出。

**覆盖：** SPEC.md CAP-1（全部）、CAP-2（建立/修订部分）；PRD FR-1～FR-4、WF-1；覆盖 epics.md AR13、AR15、AR16 对应裁决的重新表态；覆盖 Architecture Spine AD-16 的"MVP 边界"标注（该行文本本身留给下一轮 architecture 阶段正式修订，不在本次 correct-course 直接改）。

（2026-08-23 新增，见 `sprint-change-proposal-2026-08-23-configs-supply-assembly.md`）

### Epic 4：装配并激活 Claude Code/Codex 客户端（Agent System 第二客户端）

`configs` 新增对 Claude Code 与 Codex CLI 的类型化 client adapter（复用 Architecture Spine AD-19 已定义的窄端口：probe → plan → launch/resume → interpret，capability 状态固定为 `supported | degraded | unsupported | unknown` 并绑定证据），以硬控制（native 权限/工具/MCP 层面可强制执行的边界）交付 Instructions/Skills/MCP 装配，取代现有 `.cap/`（`.cap/manifest.toml`、`profiles/*.toml`、`runtime/claude.toml`、`skill-imports.toml`）当前依赖 TOML 允许清单与未经证据绑定的软约束的装配方式。这条能力域此前被 PRD §4.4"已确认 MVP 客户端范围"与 §7"明确非目标"、Architecture Spine AD-1 与 Deferred 小节明确列为"第二客户端"，需等待"产品合同明确激活"才重新评估；本次由负责人在 correct-course 会话中依据 epic-1-retro-2026-08-22.md 的 open action item（CAP 长期独立兜底、缺乏 epic 覆盖、以软约束方式维护）与本仓持续的 ad hoc CAP 维护证据（如 `b9e95cd` 等散点提交），明确裁决触发该重开条件、正式激活第二客户端。装配（Claude Code/Codex adapter、硬控制能力合同）与迁移退役 `.cap/` 保持在同一能力域内处理，不与 Epic 3（OMP 配置供应与装配）合并——两者服务不同客户端、不追求跨客户端配置或 Session 等价（AD-1、AD-19）。具体 adapter 边界、Claude Code 特有的"通常已是交互中会话而非 fresh spawn"执行模型如何纳入 launch-scoped operation 状态机、`.cap/` 到新 adapter 的迁移与退役顺序、PRD Non-goals 与 Architecture AD-1/Deferred 的正式改写，均留给后续 bmad-prd（addendum）、bmad-architecture、bmad-create-epics-and-stories 产出。

**覆盖：** PRD §4.4、§7 对应裁决的重新表态（第二客户端激活触发条件已满足）；Architecture Spine AD-1、AD-19、Deferred 小节"Claude Code/Codex adapter"条目的重新表态；覆盖 epic-1-retro-2026-08-22.md open action item `epic-1-retro-item-7`。

（2026-08-23 新增，见 `sprint-change-proposal-2026-08-23-cap-claude-codex-adapter.md`）

**2026-08-24 范围补全：** Story 4.5 的 AC2（本仓自身切换）经调查证明其前置对象不存在——本仓自身交互式 Claude Code session 的装配与 `.cap` 无渲染管线关联，"切换"这个动作没有真实对象。真正阻挡"退役 `.cap`"的是两个此前未被识别的能力缺口：新 adapter 的 fresh 启动尚不具备真实内容物化能力（只传硬控制 flag，不交付 Instructions/Skills/MCP 内容），且 `configs` CLI 没有任何入口能调用新 adapter 的 Claude 相关代码。因此新增 Story 4.5b（内容物化能力）与 Story 4.6（CLI 入口），原 Story 4.6（退役 `.cap/` 本体）顺延为 Story 4.7，验收前提相应改写。详见下方对应 Story 正文与 `sprint-change-proposal-2026-08-24-cap-retirement-redesign.md`。

### Epic 5：修复 Epic 4 交付后真实使用中暴露的缺陷

Epic 4 完成并跑完 retrospective 后，2026-08-25 真实使用 `configs use --client claude-code` 端到端流程时发现 4 个此前未被任何验收标准覆盖的缺陷（#6/#7/#8/#9）。本 Epic 不重开 Epic 4，作为独立后续处理。

**覆盖：** GitHub Issue #6、#7、#8、#9；PRD FR-8 在 Claude Code 客户端侧的真实达标状态。

（2026-08-25 新增，见 `sprint-change-proposal-2026-08-25-epic-4-post-delivery-fixes.md`）

## Epic 1：查看、选择并使用 OMP 配置

用户可以看清一个配置包含什么，必要时并列比较多个配置，然后亲自选择一个具体修订，经一次确认 fresh 启动 OMP；进入 OMP 后使用原生 resume，并只查看配置应用与客户端启动状态。

### Story 1.1：查看与比较配置内容

作为长期使用 OMP 的个人实践者，
我希望查看任一保存配置包含的 Instructions、Skills 和 MCP，并按需比较多个配置，
以便我在选择前知道会使用什么，而不依赖 Agent 推荐或隐含默认。

**实现需求：** MVP-FR1、MVP-FR2、MVP-FR3

**Acceptance Criteria:**

**Given** 存在一个或多个保存的配置修订
**When** 用户在外部 CLI 打开配置列表
**Then** CLI 显示每个配置的名称、修订标识、默认/通用标记、简短适用边界和可用状态
**And** 不自动选择、排序为推荐或隐藏不可用配置；不可确认状态显示为 `Unknown`。

**Given** 当前没有保存配置
**When** 用户打开配置列表
**Then** CLI 显示诚实空状态和配置供应边界
**And** 不伪造默认配置、不自动恢复历史配置，也不把空状态冒充产品故障。

**Given** 用户打开某个配置
**When** CLI 显示配置详情
**Then** 分组列出 Instructions、Skills、MCP 的类型化引用、来源类别、允许公开的摘要、配置边界和当前可证明状态
**And** 明确显示未配置项、不可达项和 `Unknown`，不得以文件存在或已安装推导已生效。

**Given** 配置引用个人私域资产
**When** 用户查看详情或导出可读视图
**Then** 授权环境内可看到类型化引用和受控状态，公共/可导出视图仍能自足说明配置含义
**And** 不显示或持久化私有原文、凭据、prompt、transcript、工具 payload 或个人当前上下文。

**Given** 用户选择两个或更多配置进行比较
**When** CLI 展示候选比较
**Then** 按同一字段并列显示组成、来源、边界、缺失项、差异和 `Unknown`
**And** 比较只基于机械事实，不生成评分、排序、Recommendation、自动候选或默认选择。

**Given** 用户只查看一个配置
**When** CLI 打开详情
**Then** 提供完整检查视图，不要求先建立 CandidateSet
**And** 不为满足候选数量而复制配置、生成变体或引入历史配置。


**Given** 配置不存在、版本不受支持、引用不可达或详情解析失败
**When** 外部 CLI 请求显示
**Then** 显示配置标识、类型化失败原因和可执行恢复入口
**And** 不静默回退到默认配置、不修改配置、不影响其他配置的查看。

### Story 1.2：选择配置并使用 OMP

作为长期使用 OMP 的个人实践者，
我希望亲自选择一个保存配置并启动 OMP，之后能看见当前配置、切换配置和理解失败，
以便日常使用只需“选配置 → 确认一次 → 使用 OMP”。

**实现需求：** MVP-FR4、MVP-FR5、MVP-FR6、MVP-FR7、MVP-FR8、MVP-FR9、MVP-FR10

**Acceptance Criteria:**

**Given** 用户在外部 CLI 看到保存配置列表
**When** 用户选择一个具体配置修订
**Then** 系统绑定该修订并准备 fresh 启动 OMP
**And** 不由 Agent 自动选择、推荐或静默回退到默认配置。

**Given** 所选配置可以转换为当前 OMP 版本支持的启动配置
**When** CLI 展示启动确认
**Then** 简洁显示配置名称/修订、将启用的 Instructions/Skills/MCP、OMP 版本、已知缺失或差异，并提供按需展开详情
**And** 用户只确认一次；配置选择本身和进入 OMP 后都不再重复确认。

**Given** 用户确认当前启动计划
**When** Agent System 启动 OMP
**Then** 在独立 invocation 边界生成所需配置并直接启动 OMP 进程
**And** 不清空、改写或恢复用户全局 OMP 配置，不安装/升级依赖，不经 shell 启动。

**Given** 用户向 OMP 传入 prompt、任务参数或动态上下文
**When** CLI 启动 OMP
**Then** 这些内容只作为不透明 invocation-scoped 输入透传给 OMP
**And** Agent System 不解析、不分类、不持久化、不记录日志，也不观察任务执行或结果。

**Given** OMP 已由 Agent System 启动
**When** 用户查看状态
**Then** 外部 CLI 显示所选配置修订、OMP client/version、启动阶段、配置应用结果以及已知差异/`Unknown`
**And** 状态不包含任务目标、对话、工具调用、任务进度、任务结果或装配推荐。

**Given** capability probe 证明 OMP 原生界面已满足当前配置和启动状态查看合同
**When** 用户在 OMP 内查看
**Then** 产品复用原生能力且不安装重复辅助命令
**And** 若原生能力不存在或不足，薄 OMP 扩展才提供最小当前配置、启动状态和外部 CLI 入口；两种路径不得同时形成不同事实源。

**Given** 用户进入 OMP 后需要恢复旧会话
**When** 用户调用 OMP 原生 resume
**Then** Agent System 不拦截、不选择 Session、不保存 opaque locator，也不观察恢复后的任务内容
**And** resume 的成功或失败由 OMP 原生界面负责；Agent System 只继续声明本进程由哪个配置修订启动，不把原生 resume 失败改写为配置应用失败。

**Given** 用户希望切换到另一个配置
**When** 用户在外部 CLI 或必要的薄 OMP 辅助入口选择新配置
**Then** 当前进程显示“需要重启”，新配置创建新的启动计划并要求一次确认
**And** Agent System 不在原进程内热改配置、不自动 resume；新 OMP 启动后用户可自行调用原生 resume。

**Given** 配置引用不可达、schema/OMP 版本不兼容、required 项无法应用、生成工件失败或 OMP 未成功启动
**When** 启动流程失败
**Then** 外部 CLI 与可用的 OMP 辅助面显示失败发生阶段、受影响配置项、已知原因、`Unknown` 和恢复动作
**And** 不伪造成功、不产生部分配置状态、不自动回退、不修改全局配置；仅 optional 项失败时才可明确标为 degraded。

**Given** 用户拒绝确认，或确认后配置修订/启动计划发生变化
**When** 系统尝试启动
**Then** 拒绝使用旧确认；拒绝时不启动，计划变化时重新展示一次新确认
**And** 确认不能跨配置、跨启动计划或跨 OMP 进程复用。

**Given** 用户选择 Claude Code 或 Codex CLI
**When** MVP 解析客户端
**Then** 明确返回当前不支持，并指出未来 adapter 边界
**And** 不提供占位实现、配置翻译、兼容 shim 或跨客户端 Session 恢复。

> **2026-08-23 一致性提示：** 上一条 AC 写于 Claude Code/Codex 均未激活时。Epic 4（2026-08-23 裁决激活）已经给 Claude Code 建立正式 adapter，Codex 仍按原样不支持。Epic 4 交付后，本 Story 描述的“Claude Code 返回不支持”这一具体行为会被 Epic 4 的 Story 4.1～4.3 取代；本条 AC 按 correct-course 惯例保留原文不删（可追溯 Epic 1 当时的真实交付范围），不在本轮改写——按范围约定本轮只处理 Epic 4，不修改 Epic 1 正文。

## Epic 2：控制面发布与自更新

`configs` 以 Bun 编译的独立可执行文件分平台发布；进程启动时后台静默检查新版本，通过固定发布端点 + 完整性校验后原地自更新，失败静默降级不阻塞本次启动，成功替换后打印一行提示，不上报任何遥测。

> **2026-08-24 事后补记：** 本节与下面的 Epic 3 各 Story 小节是补写的。Epic 2／3 此前只在上方 `## Epic List` 里各有一段范围描述，正文写的是"具体 Story 与验收标准由后续细化产出"，而实际交付走的是 `_bmad-output/implementation-artifacts/spec-*.md`（`bmad-build` 的 spec 流程），Story 从未回写进 epics.md。后果不只是文档缺一块：`sprint_plan.py generate` 以 epics.md 为准重建计划，这 5 条 Story 在 epics.md 里无对应标题，会被当作 orphan 丢弃（实测 `dropped_orphans` 命中全部 5 条、状态均为 `done`）。因此这里补的是**标题与索引**，把 sprint-status.yaml 的键重新锚定回 epics.md；每个 Story 的约束与验收标准仍以对应 `spec-*.md`（`frozen-after-approval`）为准，不在此处重建一份可能与之漂移的副本。

### Story 2.1：打包与发布流水线

作为需要在多台机器上安装 `configs` 的个人实践者，
我希望 `configs` 以分平台的独立可执行文件发布到 GitHub Releases 并带校验和，
以便我无需 clone 源码或安装 Bun 就能装上，也让自更新有可验证的固定端点。

**覆盖 AD：** AD-2、AD-15

**验收标准来源：** `_bmad-output/implementation-artifacts/spec-2-1-打包与发布流水线.md`（status: done）

### Story 2.2：自更新客户端

作为已经装上某个版本 `configs` 的个人实践者，
我希望它在启动时自行检查并原地更新到新版本，
以便我不必手动重新下载；且检查失败时绝不打扰我或拖慢本次启动。

**覆盖 AD：** AD-15

**验收标准来源：** `_bmad-output/implementation-artifacts/spec-2-2-自更新客户端.md`（status: done）。2026-08-23 的 correct-course（`sprint-change-proposal-2026-08-23-configs-self-update-visible-success.md`）把"成功路径也必须可见"补为独立规则，已随 PR #148 落地。

## Epic 3：配置供应与装配

`configs` 支持把 Agent 会话内已裁决的候选写成可持久化的稳定配置修订，并让用户看清一条修订的装配来源与替代关系。装配（写入）与使用（Epic 1 的看／选／用）保持两个不同的能力面。

### Story 3.1：建立新配置修订（configs establish）

作为完成了一轮配置调查与裁决的个人实践者，
我希望把裁决结果写成一条新的稳定配置修订，
以便装配结果能真正进入产品、被 Epic 1 的查看与启动路径读到。

**覆盖：** SPEC.md CAP-2（建立部分）；PRD FR-1～FR-4

**验收标准来源：** `_bmad-output/implementation-artifacts/spec-3-1-建立新配置修订-configs-establish.md`（status: done），另有 `spec-3-1-code-review-fixes.md` 记录其审查修复轮。

### Story 3.2：修订现有配置（configs revise）

作为已经有一条稳定配置的个人实践者，
我希望追加一条替代旧修订的新修订，并在替代目标已被别人替代时得到明确的类型化拒绝，
以便配置能持续演进，而并发或重复替代不会以裸 SQLite 错误泄漏。

**覆盖：** SPEC.md CAP-2（修订部分）；PRD FR-1～FR-4

**验收标准来源：** `_bmad-output/implementation-artifacts/spec-3-2-修订现有配置-configs-revise.md`（status: done）

### Story 3.3：查看装配来源与替代链

作为要在多条修订之间做选择的个人实践者，
我希望 `configs show` 显示每条能力引用的来源与内容指纹、这条修订的触发类别与证据引用，以及它替代了谁、又被谁替代，
以便我判断一条修订的内容从哪来、在演进链上处于什么位置。

**覆盖：** SPEC.md CAP-1（来源可见部分）

**验收标准来源：** `_bmad-output/implementation-artifacts/spec-3-3-查看装配来源与替代链-configs-source.md`（status: done）

### Story 3.4：裁定并落地 sourceRef 的跨机器可移植性语义

作为要在多台机器上使用同一批稳定配置的个人实践者，
我希望一条配置修订不绑死在某台机器的绝对路径上，
以便同一条修订在每台机器上都能解析到本机那份供给库里的真实内容。

**覆盖：** AD-22 退役第 (1) 步显式要求「必须一并裁定 `sourceRef` 的跨机器可移植性语义」这一开放项；AD-21 的解析侧语义

**验收标准来源：** `_bmad-output/implementation-artifacts/spec-3-4-sourceref-跨机器可移植性语义.md`

### Story 3.5：从 Skill 供给库产出配置修订候选（configs supply）

作为要把一批 Skill 装配进配置的个人实践者，
我希望按组声明白名单就能得到一份候选，而不是手写几十条来源引用，
以便装配能规模化，而不是靠人逐条抄路径。

**覆盖：** Epic 3 正文「选择数据源导入原始资产」的供应半边；`#1`（原 `Eridanus117/agent-system#173`，随仓重建后编号变更） 记录的供给能力缺口，AD-22 退役第 (1) 步的其余部分

**验收标准来源：** 待 `bmad-build` 产出（当前记于 `_bmad-output/implementation-artifacts/deferred-work.md`）

### Story 3.6：本仓装配意图从既有权威推导，并建立一致性门

作为维护本仓的负责人，
我希望「本仓的 agent 会话该装配哪些 Skill」这件事不需要我再单独维护一份声明，
以便它不可能与仓库规则漂移——改规则就是改意图。

**覆盖：** AD-22 退役第 (1) 步「本仓自身的装配意图能被表达为一条真实修订」与「规则与能力必须同真」两项；AD-22 验证边界里标记为「退役第 (1) 步落地后生效的待建门」的那道门。

**关键取舍：** 不新增装配声明文件。意图从仓内两处**已有且各因别的理由存在**的权威推导——`entrypoints/agent-system.md` 中「加载可用的 `X`」点名的 Skill，与 `_bmad/_config/` 的安装器清单与 pin。新增一份列表会与入口规则漂移，而漂移正是 `plugins/skill-imports.toml` 失效的死因。

**验收标准来源：** `_bmad-output/implementation-artifacts/spec-3-6-assembly-intent-gate.md`

## Epic 4：装配并激活 Claude Code 客户端

用户可以让本产品把已存在的装配意图（Instructions/Skills/MCP 引用）交付给 Claude Code，边界是宿主原生可强制执行的权限/工具/MCP 硬控制，不是 prompt 文字软约束；交付方式复用 Architecture Spine AD-19 的窄端口（probe → plan → launch/resume → interpret）与 AD-20 的会话模型（fresh target 复用 OMP 同款单次确认生命周期，already-running session target 诚实返回 `requires-restart`），最终按固定三步顺序取代现有 `.cap/`。Codex CLI 因缺乏真实装配证据（`.cap/runtime/` 无 `codex.toml`）不在本 Epic 范围内，继续按 Architecture Spine AD-1 的 2026-08-23 澄清保持非目标。

**覆盖：** Architecture Spine AD-1（2026-08-23 澄清）、AD-19（MVP 边界更新）、AD-20（新增，2026-08-24 修订）、AD-21（2026-08-24 新增，内容物化）；SPEC.md CAP-2/CAP-3/CAP-4 的 2026-08-23 MVP 归属更新；不覆盖 CAP-1（候选/推荐）、CAP-2 的建立/修订部分、CAP-4 的 ChangeAssessment、CAP-7（Bad Case 产品化）——这些对 Claude Code 同样不在 MVP，与 OMP 侧收窄口径一致。

**实现与交互约束：** 新 adapter 落在 `packages/control-plane/src/adapters/clients/claude/`，复用既有 domain/application 层，不另起新包；不与 Epic 3（OMP 配置供应与装配）合并，不追求跨客户端配置或 Session 等价；不做候选/推荐、不做建立/修订工作流。`.cap/` 退役必须按 Architecture Spine"`.cap/` 退役顺序"小节（2026-08-24 收窄为三步）严格顺序执行（Story 4.1～4.4、4.5b、4.6 均对应"落地新 adapter"——probe/plan/launch/interpret、AD-21 内容物化、CLI 真实入口；Story 4.5 的 AC1 与 Story 4.7 的前置真实烟雾测试共同对应"parity 验证"；Story 4.7 对应"退役 `.cap/` 本体"），不得先退役后设计替代，迁移期间本仓自身运行的 Claude Code session（包括当前维护本仓的这个 session）不得失去 skill/profile 装配能力（2026-08-24 澄清：调查证明本仓自身 session 的装配与 `.cap` 无渲染管线关联，见 AD-20 的 2026-08-24 澄清，这条约束按原文保留但不再指向一个已知存在的切换动作）。

（2026-08-23 Story 拆分，见 `sprint-change-proposal-2026-08-23-cap-claude-codex-adapter.md`）

### Story 4.1：建立 Claude Code adapter 骨架与硬控制能力探测

作为维护本仓 Agent System 的负责人，
我希望新的 Claude Code client adapter 能探测（probe）当前 Claude Code 环境实际支持哪些原生可强制执行的能力，
以便后续装配只基于证据化的能力状态，不基于假设或 prompt 文字承诺。

**实现需求：** Architecture Spine AD-19（capabilityStatus 合同）、AD-1（2026-08-23 澄清）。

**Acceptance Criteria:**

**Given** `packages/control-plane` 已有 `adapters/clients/omp/` 的既有实现
**When** 新增 `adapters/clients/claude/` 并实现 probe 阶段
**Then** probe 对每个候选硬控制能力（如 settings.json 权限字段、hook 拒绝返回值、MCP 配置项）返回 `supported | degraded | unsupported | unknown`，并绑定可回读证据
**And** 不接受 prompt 文字承诺、文档声称或未核实的假设作为 `supported` 的证据；无法验证时返回 `unknown`，不得默认为 `supported`。

**Given** probe 在本仓当前环境（Windows，Claude Code 2.1.236，见 `.cap/runtime/claude.toml` 已核实的版本证据）执行
**When** 结果与 `.cap/runtime/claude.toml` 中已核实的字段（`permission_mode`、`enable_project_mcp`、`enable_user_assets`）比对
**Then** probe 得到的能力集合与 `.cap/` 现有已核实字段一致或明确记录差异
**And** 差异不得被静默丢弃，需记录为 Unknown 或已知不一致供后续 Story 处理。

### Story 4.2：装配 Claude Code 的确定性 AdapterPlan

作为维护本仓 Agent System 的负责人，
我希望 adapter 能把一份已存在的装配意图（Instructions/Skills/MCP 引用）编译成 Claude Code 的确定性 `AdapterPlan`，
以便同一份装配意图在相同输入下总是产出相同的 plan，且不产出任何候选或推荐。

**实现需求：** Architecture Spine AD-19（AssemblyManifest/AdapterPlan 合同）；SPEC.md CAP-1（候选/推荐排除）、CAP-2（内容所有权，只读引用）。

**Acceptance Criteria:**

**Given** 一份已存在的装配意图（等价于 `.cap/manifest.toml` + `profiles/*.toml` + `skill-imports.toml` 当前表达的引用集合）
**When** adapter 执行 plan 阶段
**Then** 产出的 `AdapterPlan` 只包含硬控制字段（对应 Claude Code settings.json 权限字段、hook 配置等）与类型化的 Instructions/Skills/MCP 引用，不复制引用内容原文
**And** 相同输入两次执行产出确定性相同的 plan（hash 相同），不引入候选、评分或推荐。

**Given** 装配意图引用了某个 probe 阶段标记为 `unsupported` 或 `unknown` 的能力
**When** plan 阶段处理该引用
**Then** 按 Architecture Spine AD-10 fail-closed：必需能力缺失时整体 fail closed，仅可选项可标记为 `degraded` 并列出受影响能力
**And** 不得静默忽略缺失能力或伪装成已装配。

### Story 4.3：fresh target 的启动与观察

作为长期使用 Claude Code 的个人实践者，
我希望选择一个已存在的装配后，让本产品新启动一个 Claude Code 会话并应用该装配，
以便我在一次确认后就能获得已装配好硬控制边界的新会话，而不必手动配置。

**实现需求：** Architecture Spine AD-20（fresh target 复用 AD-7/AD-18 生命周期）。

**Acceptance Criteria:**

**Given** 用户在外部 CLI 选择一个已存在的 Claude Code 装配，且目标是新建会话（fresh）
**When** 用户完成唯一一次确认
**Then** 系统按 `prepared → awaiting-confirmation → applying → observing → succeeded | degraded | failed | incomplete` 生命周期新 spawn 一个 Claude Code 进程并应用该 plan
**And** `observationStage` 可以推进到 `launched`/`observed`，与 OMP adapter 同构；不产生部分应用状态。

**Given** fresh 启动过程中必需能力不可达或宿主拒绝应用硬控制边界
**When** 启动流程失败
**Then** 显示失败阶段、受影响能力、已知原因与恢复动作
**And** 不伪造成功，不静默回退到未装配状态。

### Story 4.4：already-running session target 的 requires-restart 路径

作为维护本仓 Agent System 的负责人，
我希望当目标是一个已经在运行的交互式 Claude Code 会话（例如当前维护本仓的这个 session）时，系统诚实告知需要重启，
以便不会有人误以为热更新已经生效，从而在没有实际硬控制边界的情况下继续工作。

**实现需求：** Architecture Spine AD-20（already-running session target）、AD-10（fail-closed）。

**Acceptance Criteria:**

**Given** 用户请求把某个装配应用到当前已在运行的交互式 Claude Code 会话
**When** adapter 的 `plan` 阶段判断 target 类型
**Then** 无法证明是 fresh target 时按更保守的 already-running 处理（fail closed，不擅自假定是 fresh）
**And** `apply` 只解析为 AD-18 既有终态 `requires-restart`，不新增状态、不产生部分应用的 SQLite 事实。

**Given** target 已被判定为 already-running session
**When** 用户在重启前查询状态
**Then** `observationStage` 保持 `planned`，不越过 `planned` 推进到 `launched`/`observed`/`verified`
**And** 界面明确说明"需要重启才能生效"，不暗示已经热更新成功。

### Story 4.5：`.cap/` parity 验证与本仓自身切换

作为维护本仓 Agent System 的负责人，
我希望新 adapter 产出的 plan 先与 `.cap/` 现有产物做一次对照验证，再把本仓自身的 Claude Code session 装配来源切换过去，
以便确认新 adapter 真的覆盖了 `.cap/` 现有场景后才继续，不在验证前就切断退路。

**实现需求：** Architecture Spine"`.cap/` 退役顺序"小节第 2、3 步。

> **2026-08-24 范围收窄：** AC1（parity 验证）已完成，保持有效。AC2（本仓自身切换）经调查（见
> `spec-4-5-cap-parity-验证与本仓自身切换.md` 的"2026-08-24 追加调查"）证明其对象不存在——本仓
> 自身交互式 session 的 skills/CLAUDE.md 由 Claude Code 原生项目目录发现机制读取 git 跟踪文件，
> 与 `.cap` 的渲染管线无关。AC2 收敛为"确认并记录这一调查结论"，不再要求任何切换动作；下方 AC2
> 正文保留原文存档，不再是本 Story 的待办。真正的能力缺口拆分为 Story 4.5b（内容物化）与
> Story 4.6（CLI 入口）。

**Acceptance Criteria:**

**Given** 新 adapter 已能对本仓现有 `.cap/profiles/general.toml`、`.cap/profiles/agent-assembler.toml` 两个 profile 产出 `AdapterPlan`
**When** 执行一次性 parity 验证
**Then** 新 adapter 产出的能力覆盖范围与 `.cap/` 现有 lock/render 产物逐项比对，记录一致项与差异项
**And** 存在未解释差异时不得继续切换，需先处理差异或明确记录为可接受的已知差异。

**Given** parity 验证通过
**When** 本仓自身切换装配来源
**Then** 本仓自身运行的 Claude Code session（包括当前维护本仓的这个 session）从 `.cap/` 切换到新 adapter 产出的 manifest/plan
**And** 切换过程中不出现 skill/profile 装配能力中断的时间窗口；如无法保证不中断，先记录为阻塞项，不强行切换。

### Story 4.5b：Claude adapter 内容物化能力

作为维护本仓 Agent System 的负责人，
我希望新 spawn 的 Claude Code 进程能真正收到装配意图声明的 Instructions/Skills/MCP 内容，
以便 fresh 启动的会话不只是拿到硬控制 flag，而是功能对等于 `.cap` 的 `cap use <role> --cli claude`（`--plugin-dir` 交付 Skill 内容）。

**实现需求：** Architecture Spine AD-21（Claude adapter 内容物化）、AD-6（内容所有权与调用作用域边界）、AD-9（invocation 目录生命周期）、AD-10（fail-closed）、AD-15（未经 probe 证实的能力保持 Unknown）。

**Acceptance Criteria：**

**Given** 本仓现有经 `src/adapters/sources/cap-fs.ts`（`loadCapConfigRevisions`，由 `scripts/seed-from-cap.ts` 调用）从 `.cap/` 灌入的修订，其 `CapabilityReference.sourceRef`/`contentFingerprint` 当前被硬编码为 `CAP_FS_FIELD_NOT_CAPTURED`（`Unknown`）
**When** 本 Story 落地
**Then** `cap-fs.ts` 改为把它读取 `.cap/` 时已知的真实磁盘路径写入 `sourceRef`（不是发明新的名字→路径映射规则，只是记录脚本本就持有的信息）
**And** 修复后重新灌入的修订，其 Instructions/Skills/MCP 引用的 `sourceRef` 均可解析为真实可读内容。

**Given** 一份声明了非空 Instructions/Skills/MCP 引用、且 `sourceRef` 可解析的装配意图
**When** `launchClaudeFresh` 编译并启动
**Then** 在既有 `ClaudeInvocationDirPort` 隔离目录下的专用 `materialized/` 子目录（不写入该目录根，根同时是 `cwd` 与 `CLAUDE_CONFIG_DIR`，直接写入有真实碰撞风险）物化内容：Skills 重建 `.cap` 已实测可被 `--plugin-dir` 加载的真实 Claude plugin 包布局（`materialized/plugin/.claude-plugin/plugin.json` + 每个 Skill 一个 `materialized/plugin/skills/<name>/` 子目录，`name` 取 `CapabilityReference.name` 并按安全路径片段规则清洗），Instructions 直接作为 `--append-system-prompt` 的参数文本（不落文件），MCP 生成原生 `mcpServers` 格式的 `materialized/mcp.json`
**Then** 新 spawn 的隔离 Claude 进程通过 `--plugin-dir materialized/plugin`、`--append-system-prompt <text>`、`--mcp-config materialized/mcp.json --strict-mcp-config` 实际收到这些内容，而不再被 `computeClaudeKnownDifferences` 恒记为"未物化"
**And** 物化文件的写入遵守 AD-9 既有的同目录临时文件原子替换纪律，不产生可被读者观察到的半写状态；不持久化私域原文、凭据或动态任务内容进入 SQLite/投影/receipt。

**Given** 某个 Instructions/Skills/MCP 引用的 `sourceRef` 无法解析为真实可读内容（例如指向本仓 `.cap/` 之外、Epic 3 数据源协议尚未覆盖的来源）
**When** 编译该装配意图
**Then** 该 capability 按 AD-10 fail-closed 记为 `unsupported`（必需）或 `degraded`（可选），列出受影响的引用与原因
**And** 不静默跳过该引用，也不用占位内容伪装已物化成功。

**Given** `--plugin-dir`、`--append-system-prompt` 当前只有 `.cap` 既有证据与文档核实过，未被 Story 4.1 的 `BunClaudeCapabilityProbe` 纳入探测
**When** 本 Story 落地
**Then** 扩展 probe 覆盖这两个 flag（同 `--permission-mode`/`--setting-sources`/`--strict-mcp-config` 一样，基于真实 `claude --help`/调用捕获，不接受文档声称为 `supported` 证据）
**And** 重新执行一次完整 probe（不复用 Story 4.1/4.5 记录的旧版本快照——`.cap` 核实基线 2.1.236 与本机实测 2.1.241 已知漂移，必须以本次 probe 的实际结果为准）。

**Given** 一次 Claude fresh 启动达到任一终态（`succeeded | degraded | failed | incomplete`）
**When** 触发 `materialized/` 清理
**Then** 清理时机绑定 invocation 目录整体既有的清理节点（AD-9），不早于——不得在 Claude 进程本身或其显式 spawn 的子进程（MCP server、hooks）已知仍可能读取 `materialized/` 期间执行
**And** 清理逻辑与 invocation 目录其余内容的清理复用同一路径，不为内容物化单独发明一套提前触发的删除时机。

### Story 4.6：`configs` CLI 的 Claude 入口

作为长期使用 Claude Code 的个人实践者，
我希望能通过 `configs use --client claude-code`/`configs switch --client claude-code` 真正触发新 adapter，
以便新 adapter 的能力不再只被测试调用，而是有真实可用的产品入口。

**实现需求：** `domain/client.ts` 的 `resolveClientSupport` 从硬编码 `unsupported` 改为真实探测结果；复用 Story 1.2 已建立的 `use`/`switch` 确认与生命周期模式；复用 Story 4.3/4.4 已实现的 fresh/already-running 判定与生命周期；复用 Story 4.5b 的内容物化（AC 依赖 4.5b 已完成，`configs use --client claude-code` 的成功路径必须走物化后的真实交付，不是 3 个硬控制 flag 的旧行为）。

**Acceptance Criteria：**

**Given** 用户在 `configs` CLI 执行 `use <id> --client claude-code` 或 `switch <id> --client claude-code`
**When** `resolveClientSupport('claude-code')` 返回真实探测结果而非硬编码 unsupported
**Then** 命令真实触发新 adapter 的 fresh/already-running 判定与对应生命周期（复用 Story 4.3/4.4 已实现的逻辑），成功路径经 Story 4.5b 的内容物化真实交付 Instructions/Skills/MCP
**And** 不改变 OMP 侧 `use`/`switch` 既有行为，不引入跨客户端配置或 Session 等价语义。

**Given** Story 4.1 的探测结果对某个必需硬控制能力返回 `unsupported`/`unknown`，或 Story 4.5b 的内容物化对某个必需引用 fail-closed
**When** 用户执行 `configs use/switch --client claude-code`
**Then** CLI 显示失败发生阶段、受影响能力、已知原因与恢复动作（复用既有 `renderQueryFailure`/`renderLaunchFailure` 渲染约定）
**And** 不伪造成功，不静默降级为"已装配"。

### Story 4.7：退役 `.cap/` 本体

> **编号沿革：** 本 Story 原编号为 4.6；2026-08-24 架构重新编号退役顺序（新增 Story 4.5b／4.6 后顺延）时改为 4.7。此前这句说明写在标题里（`### Story 4.7（原 Story 4.6）：退役 .cap/ 本体`），导致 `sprint_plan.py` 从标题派生出的键是 `4-7-原-story-4-6-退役-cap-本体`，与 sprint-status.yaml 里已有的 `4-7-退役-cap-本体` 对不上——`generate` 会同时新建一条 backlog 键、并把已有的 done 键当 orphan 丢弃。移到正文即可两边一致。

作为维护本仓 Agent System 的负责人，
我希望在确认新 adapter 已功能对等 `.cap` 后才移除 `.cap/`，
以便 `.cap/` 的历史内容降级为证据参考而不是被仓促删除导致无法回溯。

**实现需求：** Architecture Spine"`.cap/` 退役顺序"小节第 3 步（2026-08-24 已收窄为三步，见该小节正文）。

**Acceptance Criteria:**

**Given** Story 4.5b（内容物化）与 Story 4.6（CLI 入口）均已完成，且新 adapter 的 fresh Claude 启动经真实烟雾测试验证——对 `general`、`agent-assembler` 两个 profile 交付的 Skills/Instructions/MCP 内容与 `cap use <role> --cli claude` 功能对等
**When** 执行 `.cap/` 退役
**Then** 移除 `.cap/` 目录，并把 `openspec/specs/` 下与 `.cap/` 直接相关的条目（`v3-assembly-executor` 已确认相关；`claude-runtime`、`cap-default-interactive-entry` 等其余条目是否相关由本 Story 实现时逐一核实）收敛为归档状态——这些是 `openspec/specs/` 下的现存 spec，不是 `openspec/changes/` 下待处理的 change
**And** `.cap/` 历史内容降级为证据参考，不再作为任何当前需求或架构的权威来源，不早于上述前提验证稳定执行。

**Given** Story 4.5b/4.6 尚未完成，或真实烟雾测试尚未验证功能对等
**When** 有人尝试执行退役
**Then** 阻止退役，明确说明"不得先退役后设计替代"（Architecture Spine 约束）
**And** 不产生"部分退役"的中间态。

**Given** 准备执行 `.cap/` 目录删除前
**When** 核实退役范围
**Then** 确认 `configs` CLI（`packages/control-plane/src/cli/index.ts`）与产品运行时代码路径不依赖 `.cap/` 目录内容（已知现状：`resolveClientSupport` 之外没有任何 `claude` 相关引用，`.cap/` 只被开发期 `scripts/seed-from-cap.ts` 与其测试读取，不在产品运行时路径上）；`scripts/seed-from-cap.ts` 及依赖 `src/adapters/sources/cap-fs.ts` 读取真实 `.cap/` 文件的测试（`cap-fs.test.ts`、`claude-cap-parity-verification.test.ts`、`claude-assembly-manifest.test.ts` 等）随 `.cap/` 一并退役或改写为不依赖真实 `.cap/` 文件
**And** 若发现未预期的产品运行时依赖，先记录为阻塞项并停止退役，不强行删除。

## Epic 5：修复 Epic 4 交付后真实使用中暴露的缺陷

Epic 4 完成并跑完 retrospective 后，2026-08-25 真实使用 `configs use --client claude-code` 端到端流程时发现 4 个此前未被任何验收标准覆盖的缺陷（#6/#7/#8/#9）。本 Epic 不重开 Epic 4，作为独立后续处理。

**覆盖：** GitHub Issue #6、#7、#8、#9；PRD FR-8 在 Claude Code 客户端侧的真实达标状态。

**实现与交互约束：** 四条 Story 彼此独立、可分别验收；排序为 5.1 → 5.2 → {5.3, 5.4 并行，优先级低}。不重开 Epic 4 的任何已完成 Story，不修改其历史验收记录。

（2026-08-25 新增，见 `sprint-change-proposal-2026-08-25-epic-4-post-delivery-fixes.md`）

### Story 5.1：修复 Claude fresh 启动的登录态丢失

作为使用 Claude Code 的个人实践者，
我希望 fresh 启动的新会话保留登录态，
以便不必每次都重新登录。

**覆盖：** [#9](https://github.com/Eridanus117/agent-system/issues/9)；PRD FR-8"最多一次确认，不含产品制造的额外认证负担"；Architecture Spine AD-23（新增，`[PROPOSED]`）。

**Acceptance Criteria:**

**Given** 用户执行 `configs use <revisionId> --client claude-code` 并完成唯一一次确认
**When** 新 Claude Code 进程 fresh 启动
**Then** 该进程保留用户当前真实的登录态，不要求用户重新登录
**And** 登录凭据只在调用作用域的隔离目录内只读复制，不写入 SQLite、投影、manifest、plan 或 receipt。

**Given** 调用作用域内的凭据副本
**When** 本次启动达到任一终态（`succeeded | degraded | failed | incomplete`）
**Then** 凭据副本随 invocation 目录一并清理，清理时机不早于 Claude 进程及其显式 spawn 的子进程已知不再读取该目录期间
**And** 不产生可被读者观察到的半写或残留状态。

**Given** 当前登录凭据文件不可读或格式无法识别
**When** launch 阶段尝试复制凭据
**Then** 按 AD-10 fail-closed，将该次 fresh 启动记为 `unsupported`/`degraded` 并说明原因
**And** 不产生"看起来成功、实际未登录"的部分状态。

### Story 5.2：本仓自我开发场景的供给库根自动识别

作为维护本仓的负责人，
我希望 `CONTROL_PLANE_SUPPLY_ROOT` 在本仓内可以被自动推导，
以便不必每次手动设置且不会因漏设导致 `sourceRef` 解析失败。

**覆盖：** [#8](https://github.com/Eridanus117/agent-system/issues/8)；Architecture Spine AD-22 追加段（供给库根自动识别）。

**Acceptance Criteria:**

**Given** 当前工作目录或可执行文件位于一个带 `vendor/bmad` 与 `plugins/` 目录的 agent-system 仓内，且 `CONTROL_PLANE_SUPPLY_ROOT` 未被显式设置
**When** `defaultSupplyRoot()` 解析供给库根
**Then** 自动推导为该仓库根，不要求用户手动设置环境变量
**And** 该自动推导值仍遵守既有约束——不进入任何修订、只在本机生效、不改变发行版用户场景的既有默认值逻辑。

**Given** `CONTROL_PLANE_SUPPLY_ROOT` 已被显式设置
**When** `defaultSupplyRoot()` 解析供给库根
**Then** 显式设置值优先于自动推导，行为与当前一致。

### Story 5.3：`configs tui` 补齐 establish/revise/supply 入口

作为习惯用 TUI 的用户，
我希望能在 `configs tui` 里发现并使用 Epic 3 新增的写路径能力，
以便不必知道裸 CLI 命令才能建立/修订配置。

**覆盖：** [#7](https://github.com/Eridanus117/agent-system/issues/7)。

**Acceptance Criteria:**

**Given** 用户在 `configs tui` 中浏览
**When** 用户寻找"建立/修订配置"或"从供给库产出候选"的入口
**Then** TUI 提供可发现的入口（可以是直接交互式表单，也可以是"生成对应命令供用户在终端执行"的轻量形式，具体形式由实现时决定）
**And** 不静默缺失——用户不需要额外了解裸 CLI 命令才能发现这些能力存在。

### Story 5.4：`configs` 的 `<id>` 参数消歧

作为 `configs` 用户，
我希望 `show`/`use`/`switch` 能区分我传入的是配置名还是修订 id，或至少在报错时明确指出这一点，
以便不会被"未找到"这类提示误导。

**覆盖：** [#6](https://github.com/Eridanus117/agent-system/issues/6)。

**Acceptance Criteria:**

**Given** 用户对 `show`/`use`/`switch` 传入一个实际是配置名（而非修订 id）的值
**When** 命令尝试解析该值
**Then** 明确提示"你传入的是配置名，该配置下有 N 条修订，请用 `configs list` 查看修订 id"（或等价的消歧提示），而不是笼统的"未找到"
**And** 用法字符串（`usageLine()`）把 `<id>` 改为更明确的 `<revisionId>`。
