# Epic 5 Context: 修复 Epic 4 交付后真实使用中暴露的缺陷

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 4（Claude Code adapter）已完成全部 Story 与 retrospective 后，2026-08-25 真实执行 `configs use --client claude-code` 端到端流程时暴露了 4 个此前未被任何验收标准覆盖的缺陷（GitHub Issue #6/#7/#8/#9）。本 Epic 不重开 Epic 4，作为独立后续处理，逐条修复这些真实使用中发现的问题，让 Epic 4 已声称完成的能力真正可用。

## Stories

- Story 5.1：修复 Claude fresh 启动的登录态丢失（对应 #9，严重，接近功能阻断）
- Story 5.2：本仓自我开发场景的供给库根自动识别（对应 #8）
- Story 5.3：configs tui 补齐 establish/revise/supply 入口（对应 #7）
- Story 5.4：configs 的 `<id>` 参数消歧（对应 #6）

排序：5.1 → 5.2 → {5.3, 5.4 并行，优先级低}。四条彼此独立，可分别验收。

## Requirements & Constraints

- 普通复用路径最多只需要一次产品确认，且不得要求客户端自身认证/权限动作之外的额外确认（PRD FR-8）；Story 5.1 的核心诉求正是消除 fresh 启动制造的"隐性额外认证"，让 FR-8 在 Claude Code 客户端侧真正达标。
- 状态必须携带实际客户端版本/环境证据；文档声称不能替代 probe/smoke 证据（NFR-3，AD-15）。
- 客户端拥有凭据、transcript 与原生 Session；产品只保存 opaque locator、去密的 manifest/plan/receipt，不翻译或复制 Session 内容、不持久化 secret（NFR-4/5，AD-6）。
- 必需能力/输入缺失、证据完整性失败时 fail closed；只有可选项缺失才允许 degraded（AD-10）。
- 期望装配、adapter plan、启动结果、运行观察、差异与 Unknown 不得折叠；"参数已传入"不得冒充"已生效"（NFR-2）。

## Technical Decisions

- **架构范式**：六边形模块化单体，外部 TypeScript/Bun CLI 为唯一组合根；`domain` 不导入客户端/IO；adapter 不做产品决定，真实 IO 协作者必须走注入端口（Epic 4 retro 已修正 `content-materializer.ts` 缺端口抽象的教训，不要重犯）。
- **Claude adapter 结构种子**：`packages/control-plane/src/adapters/clients/claude/`（probe/plan/launch/interpret）；应用层入口在 `application/claude-launch.ts`；端口定义集中在 `application/ports.ts`。
- **AD-19**（manifest/plan/receipt 合同）：`ClaudeAdapterPlan` 只含 argv 结构、环境变量*键*（从不含真实值）、生成文件*元数据*（从不含内容）、确定性 planHash；真实环境值/文件内容只存在于非持久的 `RuntimeLaunchSpec`。
- **AD-21**（内容物化）：Instructions/Skills/MCP 的 `sourceRef` 在调用作用域内解析为真实内容，只写入 invocation 隔离目录下的 `materialized/` 子目录（不写目录根，根同时是 `cwd`/`CLAUDE_CONFIG_DIR`），随 invocation 目录终态清理；`sourceRef` 不可解析时按 AD-10 fail-closed。
- **AD-23（新增，`[PROPOSED]`，Story 5.1 的直接权威）**：fresh 启动必须在把 `CLAUDE_CONFIG_DIR` 指向隔离目录之前/同时，把当前真实登录凭据只读复制进该隔离目录，随该目录一起清理，不进入 SQLite/投影/receipt；凭据不可读/格式无法识别时 fail closed。状态待 Story 5.1 落地时经 probe 核实后转 `[ADOPTED]`。
- **AD-22 追加段（Story 5.2 的直接权威）**：本仓自我开发场景下 `CONTROL_PLANE_SUPPLY_ROOT` 应可自动识别（检测到位于 agent-system 仓内时自动推导），仅在环境变量未显式设置时生效，根本身仍不进修订、只在本机生效。
- **激活生命周期**（AD-18，Claude adapter 复用同一状态机，AD-20）：`prepared → awaiting-confirmation → applying → observing → succeeded|degraded|failed|incomplete`；fresh target 走完整链路，already-running target 只能终止于既有 `requires-restart`。任何新失败路径复用既有终态，不新增状态。

## Cross-Story Dependencies

- Story 5.1 与 Story 5.2 共享"本仓自我开发场景环境自动识别"这一基础设施主题（今天手动设置 `CONTROL_PLANE_SUPPLY_ROOT` 踩坑即为证据）；实现 5.1 时如果顺带触及该识别逻辑，应与 5.2 的既定范围对齐，不重复发明。
- Story 5.3、5.4 独立于 5.1/5.2，不依赖其产出。
- 四条 Story 均不依赖 Epic 3（配置供应）或 Codex CLI（继续 Deferred）。
