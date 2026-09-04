# Agent System

本仓是 `agent-system` 的公共单仓：保存可公开复用的 Agent 系统原则、协议、知识、合同、Plugin、profile 装配和验证工具。它不保存个人当前工作状态，也不公开 private state-lab 原始研究证据。

## Agent System 单仓边界

本仓是 `agent-system` 单仓收敛的目标仓；目标由现有 `agent-control` 原位改名得到，不新建第六个仓。迁移完成后，根目录分别承载：

- `entrypoints/`：项目入口；`authority/`、`knowledge/` 已于 2026-08-23 物理归档至 `_archive/`（见下方"文件职责"），不再是当前政策或知识权威来源；
- `contracts/`：合同 Schema、样例、捕获／回执工具和验证；
- `plugins/` 与 `.claude-plugin/`：可安装 Plugin／Skill 与 Claude 端 Marketplace（本仓只支持 Claude Code CLI 与 OMP 两个运行端，OMP 直读 Claude 格式 skill；`.agents/` 下的 Codex 端 Marketplace 不再维护，2026-09-03 负责人裁定）；
- `.cap/`：此前的显式 profile、prompt 和 capability 声明；已于 Epic 4（Story 4.7，2026-08-24）安全退役并从仓库删除，功能由 `packages/control-plane/` 承接；`plugins/skill-imports.toml` 承接了原 `.cap/skill-imports.toml` 的当前默认装配声明；
- `src/agent_system/`：此前唯一的 profile、CAP 与 OMP Python 实现，已废弃并于 2026-08-23 物理归档至 `_archive/src/agent_system/`；CAP／OMP 装配改由 `packages/control-plane/`（TypeScript/Bun）承接。

迁移中的 immutable source head、目标路径和历史保留策略记录在 [`work/records/2026-08-19-agent-system-consolidation/provenance.json`](work/records/2026-08-19-agent-system-consolidation/provenance.json)。目录尚未迁入不表示对应源仓可以归档；静态、集成、回滚和所需真实客户端门全部通过后才切换入口。

## 持久实现语言

本仓新增或实质修改的持久程序、CLI、自动化和验证脚本只使用 Go、Python、TypeScript 或 Rust；不把 PowerShell、Batch 或 Shell 沉淀为产品脚本。文档和配置不受影响，Windows 一次性命令仍可通过 shell 宿主执行。该规则是本仓贡献约束，不自动扩大到其他仓库或用户级配置。

## 迁移与历史边界

- 2026-08-15 从私有 `Eridanus117/agent-control` clean-slate 迁入的 Issue #1–#34 标记为 `迁移索引/待分诊`；它们默认不是当前授权或活动 backlog。
- 迁入事项只有补齐公开、自足的目标、范围、验收和当前授权后才能重新激活。旧仓评论与 PR 可以作历史来源，但公共规范不得以私有链接为理解前提。
- 旧仓保持私有；必要决定与证据先脱敏蒸馏，再机械 archive。当前落地工作见 [Issue #58](https://github.com/Eridanus117/agent-system/issues/58)。

## 开始工作

> **权威变更（2026-08-22，负责人确认；2026-08-23 物理归档）：** `authority/`（含 `00-map.md`）、`src/agent_system/`（Python 实现）、`docs/`、`knowledge/` 均已降级为历史资产，只作证据参考，不再定义当前产品政策、需求、架构或范围；并已于 2026-08-23 物理搬迁到 `_archive/` 同名子路径（如 `_archive/authority/00-map.md`），git 历史随 `git mv` 保留。~~当前唯一权威来源是 BMad 工作流产出（`_bmad-output/` 下的 SPEC、epics、ARCHITECTURE-SPINE、sprint-status）。~~ **2026-09-02 更新：`_bmad-output/` 已整体删除**（先于 2026-09-01 降级为非权威，负责人判其「有大量错误」），当前权威结构见 [`AGENTS.md` 的当前权威声明](./AGENTS.md) 与 [`entrypoints/agent-system.md`](./entrypoints/agent-system.md) 的三层目标结构。下方按 Issue 分流的流程本身（GitHub Issue 授权边界、避免恢复迁移事项等）仍然适用，只是不再从 `authority/00-map.md` 加载产品政策正文。

每个新的 Session 先读取 [`AGENTS.md` 的当前权威声明](./AGENTS.md) 与 [`entrypoints/agent-system.md`](./entrypoints/agent-system.md)（[`_archive/authority/00-map.md`](./_archive/authority/00-map.md) 只是历史索引，不再必读），再按本次请求分流：

1. **负责人明确激活一个公开、自足的 Issue**：重新读取该 Issue 当前正文与状态，只加载它明确链接的政策和证据；授权、写入所有权和验收均以远端当前内容为准。
2. **Issue 带 `迁移索引/待分诊` 标签**：默认只允许分诊和只读核验；不能从旧正文、私有评论或开放状态恢复实施授权。
3. **没有明确 Issue**：保持自由对话或当前请求的最小范围。负责人要求选择工作时，可以查看公开 Issue 列表并提出一个有界候选，但不能自行激活、派发或恢复迁入事项。

Session 的职责由负责人当前明确指令、公开自足的 Issue 合同和写入所有权共同决定，不由 Provider、终端名称或固定身份决定。Issue 不能覆盖更高层权限边界；冲突时保持相关范围只读并升级。

明确 Issue 的工作直接按远端当前合同实施、验证并通过 PR 或自足证据评论交付；不把源码存在、Issue 开放或历史安装当作额外行为、权限或流程来源。GitHub 授权、PR 合并和 Issue 正文重写的安全边界见项目入口。

### 扩大工作范围

公共规则见 [`entrypoints/agent-system.md` 的同名章节](./entrypoints/agent-system.md#扩大工作范围)。

## 在线续接与负责人事项

公共规则见 [`entrypoints/agent-system.md` 的同名章节](./entrypoints/agent-system.md#在线续接与负责人事项)。

## 运行与观察

- 本仓不提供仓内“当前运行状态”文件；当前工作、授权和验收存在于公开 Issue／PR，过程执行态存在于实际运行后端。
- [`tools/worker_snapshot/`](./tools/worker_snapshot/)、[`tools/ops-metrics/`](./tools/ops-metrics/) 和 [`tools/ops-console/`](./tools/ops-console/) 是可选观察工具；生成的 `current.md` 只是带新鲜度边界的本机快照，不是公共产品状态、授权源或等待清单。
- 迁移前的私有 Project 和运营台只作历史证据，不是本公共仓的当前入口。
- 本地提交闸门：`bun install`（或 `npm install`）会把 `core.hooksPath` 指向 `.githooks/`，之后每次 `git commit` 先跑 `plugins/tests/skills.test.ts`（与 CI 的 Plugin conformance checks 同源）；改了 `plugins/*/skills/*/SKILL.md` 没重生成 `plugins/docs/skills-overview.md`（命令 `node plugins/scripts/skills-overview.ts --write`）会在本地被拦并提示命令。

## 文件职责

- `docs/adr/`：架构决策记录（ADR，MADR 模板），有备选要比较、决定会比代码活得久的改动在此留一份；小改动只按 `.github/PULL_REQUEST_TEMPLATE.md` 写 PR 正文（2026-09-04 负责人裁定）；
- `_archive/`：历史资产归档根，2026-08-23 起承载已降级但仍保留证据价值的旧目录，各子路径与原根路径同名（`_archive/authority/`、`_archive/knowledge/`、`_archive/docs/`、`_archive/src/agent_system/`），git 历史随 `git mv` 保留；
- `_archive/authority/`：**历史资产（2026-08-22 起降级，见上方"开始工作"的权威变更；2026-08-23 起物理归档于此）**，曾保存版本化产品政策；正文不再是当前产品政策来源，只作历史证据；当前产品政策见 `AGENTS.md` 的当前权威声明（`_bmad-output/` 已于 2026-09-02 删除）；
- `_archive/knowledge/`：**历史资产（2026-08-22 起降级；2026-08-23 起物理归档于此）**，通过价值门与可信门的公共知识包与检索卡，覆盖 Windows 运维（长路径、文件锁）、GitHub 引用与 PowerShell 多行正文等已验证陷阱；技术性内容仍可参考，但不再作为产品政策或流程权威；入口表见 [`_archive/knowledge/README.md`](./_archive/knowledge/README.md)；
- `work/records/`：保存非权威、可追溯的研发过程；默认不读取，只在当前任务明确链接时按需读取；
- `work/history/`：已退出当前工作面的旧候选、调研与决策记录；历史记录不是当前指令。2026-08-23 起，此前长期堆在 `work/` 根目录的 `configuration-inventory.md`、`current-monitoring-directive.md`、`knowledge-mvp-proposal.md`、`knowledge-mvp-boundary-candidate.md`、`knowledge-mvp-decision.md`、`permission-strategy-research.md` 与 `knowledge-trial/project-instructions.md` 已按本节既有规则移入 `work/history/`（含 `work/history/knowledge-trial/`）；
- `work/` 根目录：只保留 `records/` 与 `history/` 两个子目录作为默认结构；新增同类具名调研、清单与候选优先进 `work/records/<日期>-<主题>/`，不再往根目录堆放；已退出当前工作面的旧候选移入 `work/history/` 并明确标出被替代入口。
- `entrypoints/agent-system.md`：本仓项目级 Agent 行为入口；不作为用户级全局提示词安装源；
- `AGENTS.md`：Codex 的最小仓库入口，只保留仓库增量并回指 `entrypoints/agent-system.md`；公共系统规则的唯一版本化正文由后者承载；
- `CLAUDE.md`：Claude Code 导入同一份入口规则，并在本仓内加载 `entrypoints/agent-system.md`；用户级入口只保留与任务无关的锚点，本仓正文不进全局常驻面；
- [`_archive/src/agent_system/`](./_archive/src/agent_system/)：**历史资产（2026-08-22 起降级；2026-08-23 起已废弃并物理归档于此）**，此前的 profile、CAP、OMP 与 Claude Python 实现；不再是新开发的基线或约定来源（BMad 架构曾 `[ADOPTED]` 外部 TypeScript/Bun control plane；原始记录随 `_bmad-output/` 于 2026-09-02 删除，可经 git 历史查阅），仅作 Bad Case 证据保留；对应的 `_archive/tests/{cap,omp,profile}/`、`_archive/pyproject.toml`、`_archive/uv.lock` 一并归档，`.github/workflows/cross-host-checks.yml` 已删除，`repository-checks.yml` 中依赖它的步骤已下线；接口边界历史记录见 [`_archive/docs/profile.md`](./_archive/docs/profile.md) 和 [`_archive/docs/maintenance.zh-CN.md`](./_archive/docs/maintenance.zh-CN.md)（同为历史资产）。
- `_archive/docs/cap-guide.zh-CN.md`：**历史资产（2026-08-22 起降级；2026-08-23 起物理归档于此）**，此前面向使用者的 CAP 中文入门、日常命令、资产范围和故障排查路径；当前实现基线见 `packages/control-plane/`。

私有旧仓、迁移索引、历史记录、分析和实验只提供来源；公共产品政策必须在本仓自足表达，历史材料不能反向产生当前授权。

## 方案审阅

准备请负责人确认一项会改变产品边界、架构、长期依赖或显著投入的方案时，不得只在聊天、本地文件、当前任务或研发记录中分散表达。默认先在当前 GitHub 仓建立一个可由负责人直接访问的方案 Issue，至少包含：

- 原始问题和预期结果；
- 推荐方案和完整运行过程；
- 可信替代方案与选择理由；
- 范围、明确不做事项、成本、风险、可逆性和升级条件；
- 实施与验收方式；
- 负责人需要确认的少量决定。

纯方案默认使用公开、自足的 GitHub Issue；需要审阅已经形成的仓库文件差异时才使用 Draft PR。方案获得确认后，只把已确认结论进入产品政策；被拒绝或替代的方案作为 Issue 或研发记录保留，不继续冒充当前方向。GitHub 暂时不可用时，本地草稿必须明确标为临时载体。

## 改变权威

分析、提案和实验结果在负责人明确确认前都不是权威。改变 `_archive/authority/` 时，需要同时记录被替代的内容和新的确认结果，不能静默修改方向。
