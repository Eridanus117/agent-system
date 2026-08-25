# Sprint Change Proposal — Epic 4 交付后真实使用暴露的缺陷

- **日期：** 2026-08-25
- **触发人：** Eridanus（负责人）
- **处理方式：** bmad-correct-course，Incremental 模式
- **关联 Issue：** [#6](https://github.com/Eridanus117/agent-system/issues/6)、[#7](https://github.com/Eridanus117/agent-system/issues/7)、[#8](https://github.com/Eridanus117/agent-system/issues/8)、[#9](https://github.com/Eridanus117/agent-system/issues/9)

## 1. Issue Summary

Epic 4（装配并激活 Claude Code 客户端）已完成全部 Story 与 retrospective。2026-08-25，负责人在真实执行"建立含 BMad Skill 的配置修订并用 `configs use --client claude-code` fresh 启动"这一端到端流程时，发现 4 个此前未被任何验收标准覆盖的问题：

1. **#9（严重，接近功能阻断）**：fresh 启动把新 Claude Code 进程的 `CLAUDE_CONFIG_DIR` 整体指向全新隔离目录，导致新会话丢失登录态。Story 4.3/4.5b 的验收标准从未要求验证登录态延续性，这是设计时的盲区，不是实现偏差。
2. **#8（中）**：`CONTROL_PLANE_SUPPLY_ROOT` 在"本仓自我开发"场景下需要每次手动设置，源码注释（`supply-root.ts`）承认这一点但没有任何自动化配套；真实复现为一次 fresh 启动因环境变量未继承而以 51 条 ENOENT 失败告终。
3. **#7（中）**：`configs tui`（Epic 1 产出）从未更新以覆盖 Epic 3 新增的 `establish`/`revise`/`supply` 写路径命令，TUI 用户结构性看不到这些能力存在。
4. **#6（轻）**：`configs show/use/switch` 的 `<id>` 参数实指修订版本 id，但用法字符串和错误提示未区分它与配置名，真实导致过混淆（`configs show general`、`configs use <配置名>` 均返回"未找到"）。

四个问题均在同一次真实操作中直接复现，证据为终端输出原文，非推测。

## 2. Impact Analysis

### Epic 影响

- **Epic 4**：无需重开或回滚。全部已完成 Story 的历史记录保持有效；#9 是验收标准盲区暴露的真实缺陷，而非某个已确认 AC 的失败。
- **Epic 3**（当前 in-progress，retrospective 状态 optional 未跑）：#7、#8 都落在 Epic 3 的产出范围内。建议 Epic 3 补跑 retrospective 时把这两条列为已知输入。
- **新增 Epic 5**：承接四个问题的具体修复，详见第 4 节。

### Artifact 冲突

- **PRD**：FR-8"快速激活已验证稳定配置"要求"除客户端自身要求的认证或权限动作外，最多只需要一次稳定配置激活确认"。#9 让用户被迫承担产品隔离机制**制造**出的额外认证负担，构成对 FR-8 可验收结果的真实违反。**FR-8 在 Claude Code 客户端侧的达标状态需要重新评估为"未达标"，待 Story 5.1 修复后重新验收。** 不影响 OMP 侧 FR-8 的既有达标状态，也不需要缩小或重定义 MVP 范围（#9 只影响 Epic 4 追加激活的第二客户端能力，不触及 Epic 1～3 锁定的原始 OMP-only MVP）。
- **架构（ARCHITECTURE-SPINE.md）**：
  - AD-21（内容物化）未讨论登录凭据延续，是架构文档层面的遗漏，需要新增 AD-23（见第 4 节）。
  - AD-22（本仓自我开发装配）已确立"共用同一条装配路径"原则，但供给库根的自动识别是该原则下一个已知但未落地的实现缺口，需要追加说明（见第 4 节）。
  - TUI 覆盖范围（#7）不构成架构违反——"Deferred"小节已明确"TUI 文案与投影视图：UX/实现层决定"，只是实现层遗漏。
- **UI/UX**：无独立 UX spec；`configs tui` 交互合同直接写在 Story 1.1/1.2 里，Epic 3 未同步更新，印证 #7。
- **其他 artifact**：`.github/workflows/repository-checks.yml`（assembly-intent 门）与本次改动无关，不需要变更。

### 技术影响

四个修复均为有界的增量代码改动，不涉及推翻既有架构决定：
- #9：需要先 probe 核实 Windows 上 Claude Code 凭据的真实存储位置/格式，再实现"调用作用域内只读复制、随隔离目录一起清理"的机制。
- #8：需要一个自动检测本仓根目录的机制（例如向上查找 `vendor/bmad`+`plugins/` 标记）。
- #7：Ink TUI 新增 establish/revise/supply 相关界面。
- #6：CLI 用法字符串与错误提示措辞调整，可能需要允许配置名作为 `<id>` 的别名输入。

## 3. Recommended Approach

**选定路径：Option 1（直接调整）**，具体形式为**新增 Epic 5**，而非重开 Epic 4 或塞入 Epic 3。

**评估过的替代方案：**

- **Option 2（回滚 Story 4.3/4.5b）—— 判定不可行。** `CLAUDE_CONFIG_DIR` 隔离本身的目的（隔离权限/hook/MCP 边界）合理且必要，问题只是"顺带隔离掉了凭据"这一具体副作用；回滚整个能力等于丢弃已完成的真实交付，且不解决根因——未来重做 Claude adapter 时同一问题会再次出现。
- **Option 3（PRD/MVP 范围重审）—— 判定不需要。** #9 只影响 Epic 4 追加激活的 Claude Code 客户端能力，不触及 Epic 1～3 锁定的原始 OMP-only MVP，无需缩小或重定义 MVP 范围。

**理由：** 四个问题都是有界缺陷修复，不是需求误解或架构错误，不需要动 PRD 目标或推翻任何已 ADOPTED 的 AD；成本和风险都在"新增几个 Story"的量级，收益（尤其 #9）是让 Epic 4 已声称完成的能力真正可用、让 FR-8 在 Claude Code 侧真正达标。

**排序：** #9 → #8 → {#7, #6 并行，优先级低}。#9 是阻断级且是 FR-8 真正达标的前提；#8 是基础设施，且 #9 修复过程本身很可能复用同一套"本仓自我开发环境自动识别"机制（今天手动设置环境变量踩坑即为证据）；#7、#6 是纯体验问题，不阻断任何核心路径。

## 4. Detailed Change Proposals

以下四条均已经 Eridanus 在 Incremental 模式下逐条确认（Approve）。

### 4.1 `epics.md` 新增 Epic 5

```
### Epic 5：修复 Epic 4 交付后真实使用中暴露的缺陷

Epic 4 完成并跑完 retrospective 后，2026-08-25 真实使用 `configs use --client claude-code`
端到端流程时发现 4 个此前未被任何验收标准覆盖的缺陷（#6/#7/#8/#9）。本 Epic 不重开 Epic 4，
作为独立后续处理。

**覆盖：** GitHub Issue #6、#7、#8、#9；PRD FR-8 在 Claude Code 客户端侧的真实达标状态。

### Story 5.1：修复 Claude fresh 启动的登录态丢失（对应 #9）
作为使用 Claude Code 的个人实践者，我希望 fresh 启动的新会话保留登录态，
以便不必每次都重新登录。
**覆盖：** #9；PRD FR-8"最多一次确认，不含产品制造的额外认证负担"。

### Story 5.2：本仓自我开发场景的供给库根自动识别（对应 #8）
作为维护本仓的负责人，我希望 CONTROL_PLANE_SUPPLY_ROOT 在本仓内可以被自动推导，
以便不必每次手动设置且不会因漏设导致 sourceRef 解析失败。
**覆盖：** #8；AD-22 已知但未落地的缺口。

### Story 5.3：configs tui 补齐 establish/revise/supply 入口（对应 #7）
作为习惯用 TUI 的用户，我希望能在 configs tui 里发现并使用 Epic 3 新增的写路径能力，
以便不必知道裸 CLI 命令才能建立/修订配置。
**覆盖：** #7。

### Story 5.4：configs 的 <id> 参数消歧（对应 #6）
作为 configs 用户，我希望 show/use/switch 能区分我传入的是配置名还是修订 id，
或至少在报错时明确指出这一点。
**覆盖：** #6。

排序：5.1 → 5.2 → 5.3/5.4（后两者可并行，优先级低于前两者）。
```

**理由：** 独立 Epic 而不塞进 Epic 4，因为 Epic 4 已合法关闭（含 retro），重开会打乱已确认完成的历史记录；新 Epic 承接"交付后真实使用反馈"这个语义更清楚。

### 4.2 `ARCHITECTURE-SPINE.md` 新增 AD-23（凭据延续）

```
### AD-23 — Claude adapter fresh 启动延续登录凭据，且不持久化 [PROPOSED]

- **Binds:** AD-6（secret 只存在于调用作用域）、AD-9（invocation 目录清理）、AD-21（内容物化模式）；Epic 5（Story 5.1）
- **Prevents:** fresh 启动的新 Claude Code 进程因 CLAUDE_CONFIG_DIR 隔离丢失登录态；
  为图省事把凭据复制进任何持久化产物（SQLite/投影/receipt）；清理时机早于进程仍可能
  读取凭据的窗口。
- **Rule:** launch 阶段在把 CLAUDE_CONFIG_DIR 指向隔离 invocation 目录之前或同时，把当前
  真实登录凭据（真实存储位置与格式需先经 probe 核实，不同平台可能不同）只读复制一份到该
  隔离目录内；复制操作与 AD-21 的物化内容一样，只存在于调用作用域，不写入 SQLite/投影/
  receipt。清理时机复用 AD-9/AD-21 已有的 invocation 目录清理节点，不早于进程及其显式
  spawn 的子进程已知不再读取该目录期间。若凭据文件不可读或格式无法识别，按 AD-10
  fail-closed：整个 fresh 启动记为 unsupported/degraded 并说明原因，不产生"看起来成功、
  实际未登录"的部分状态。
```

状态标 `[PROPOSED]` 而非 `[ADOPTED]`——需要 Story 5.1 落地时先核实 Windows 上 Claude Code 凭据的真实存储位置和格式，再转正。插入位置：AD-22 之后。

**理由：** 沿用 AD-19～22 的既有格式（每个 Epic 4 新发现的边界单独成 AD，保持可追溯）；`[PROPOSED]` 如实反映"规则方向已定，具体机制未经 probe 证实"，符合 AD-15/AD-21 反复强调的"文档声称不能替代 probe/smoke 证据"原则。

### 4.3 `ARCHITECTURE-SPINE.md` AD-22 追加一条 Rule（供给库根自动识别）

```
  - **供给库根在本仓自我开发场景下应可自动识别（2026-08-25 追加，见 Issue #8、Epic 5
    Story 5.2）。** 当前 `defaultSupplyRoot()` 要求调用方每次手动设置
    `CONTROL_PLANE_SUPPLY_ROOT` 指向仓库根，否则静默回退到发行版默认根、导致
    `sourceRef` 解析到错误位置——这是本条"共用同一条装配路径"原则下的一个已知但未
    落地的缺口，不是新增例外：自动识别机制本身仍必须遵守"根不进修订、只在本机生效"
    的既有约束（本条 Rule 第 (1) 步已裁定的可移植性语义），只是把"人工设置"这一步
    改为"检测到位于 agent-system 仓内时自动推导"，且仅在环境变量未显式设置时生效，
    不改变发行版用户场景的既有默认值逻辑。具体检测方式留给 Story 5.2 实现时判断
    （例如向上查找带 `vendor/bmad` 与 `plugins/` 的仓库根标记）。
```

插入位置：AD-22 Rule 小节末尾，"开放问题"之前。

**理由：** 不新开 AD——这是 AD-22 已确立原则下的一个实现缺口，追加说明即可，避免 AD 数量膨胀到语义重叠。

### 4.4 `sprint-status.yaml` 新增 Epic 5 条目

```yaml
  epic-4-retrospective: done

  epic-5: backlog
  5-1-修复-claude-fresh-启动的登录态丢失: backlog
  5-2-本仓自我开发场景的供给库根自动识别: backlog
  5-3-configs-tui-补齐-establish-revise-supply-入口: backlog
  5-4-configs-的-id-参数消歧: backlog
  epic-5-retrospective: optional
```

**理由：** 严格按 checklist 6.4 的既定规则——新增 Epic 一律以 `backlog` 状态登记；story 键名沿用 `sprint_plan.py` 从标题派生键的既有惯例（Story 4.7 曾因键名与标题不对齐导致 orphan 误判，这次直接照抄标题保证一致）。

## 5. Implementation Handoff

**变更范围分类：Moderate**（需要 backlog 重组，但不需要 PM/Architect 级别的根本性重规划）。

- **路由到：** Product Owner / Developer agent（`bmad-create-story` 或 `bmad-build` 承接 Story 5.1～5.4 的细化与实现）
- **交付物：**
  - 本文档（Sprint Change Proposal）
  - `epics.md` Epic 5 正式写入（第 4.1 节内容）
  - `ARCHITECTURE-SPINE.md` AD-23 新增 + AD-22 追加段（第 4.2、4.3 节内容）
  - `sprint-status.yaml` Epic 5 条目（第 4.4 节内容）
- **成功标准：**
  - Story 5.1 落地后，真实 `configs use --client claude-code` fresh 启动的新会话保留登录态，可端到端验证（无需重新登录即可使用）
  - Story 5.2 落地后，本仓内执行 `configs supply`/`establish`/`use` 无需手动设置 `CONTROL_PLANE_SUPPLY_ROOT`
  - Story 5.3 落地后，`configs tui` 内可发现并触发 establish/revise/supply
  - Story 5.4 落地后，`configs show/use/switch` 对配置名输入给出明确提示（而非"未找到"）
- **下一步：** 负责人确认本提案后，实际写入 `epics.md`/`ARCHITECTURE-SPINE.md`/`sprint-status.yaml` 三个文件；随后可用 `bmad-create-story` 细化 Story 5.1（优先级最高）。
