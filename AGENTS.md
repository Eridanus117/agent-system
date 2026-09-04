# 仓库工作入口

本仓的项目级 Agent 规则正文在 [`entrypoints/agent-system.md`](./entrypoints/agent-system.md)，开始工作前读取。它只在工作目录落在本仓时加载，不进入用户级全局常驻面。

## 当前权威声明（2026-09-01，负责人确认）

**被替代内容：** `_bmad-output/` 全部产出（SPEC、epics、ARCHITECTURE-SPINE、sprint-status 等），即下方 2026-08-22 声明所指定的"唯一产品政策、架构与范围权威来源"。

**新结论（2026-09-02 更新）：** `_bmad-output/` **已整体删除**。它先于 2026-09-01 被降级为历史资产（负责人确认其过程记忆与判断门"有大量错误"，同日裁定 bmad 整组退库、移除 `vendor/bmad`，见 PR #25），2026-09-02 负责人进一步裁定「bmad 可以干掉」，连同其覆盖矩阵 Change `bmad-openspec-coverage` 一并删除。覆盖矩阵原本的作用是「查清 `_bmad-output` 里哪些决定还没迁进 `openspec/`」；既然该语料已被判定不可信且不打算迁移，为它建矩阵是无收益工作，故一并杀掉。git 历史保留，`git log --diff-filter=D -- _bmad-output` 可复原。失败模式与 2026-08-22 降级 `authority/` 时相同：agent 批量生成的规划文档与实际锁定方向反复冲突。

**新权威规则（不再指定单一文档树为权威）：**

- 产品政策、范围与授权以**负责人的明确裁决**为唯一来源；仓内载体是 `openspec/` 的 intake 与 Change 记录（只收负责人裁过的决定与验证过的证据），desk 提案裁决史为其上游。
- agent 生成而未经负责人逐项裁决的任何规划文档（无论存于何处），一律视为草案或历史资产，不构成当前授权。
- 过程记忆收录纪律：agent 推断必须标注为假设；未收敛的事项停留在 intake 的已知/未知层，不进正式工件。
- `entrypoints/agent-system.md` 中 GitHub Issue 授权边界、避免破坏性操作等**流程安全护栏**继续有效。

## 历史说明

2026-08-22 至 2026-09-01 的 BMad 权威迁移方案已被负责人推翻；`_bmad-output/`、`vendor/bmad` 与覆盖矩阵已删除，git 历史保留。旧 `authority/`、`knowledge/`、`docs/`、Python 实现等内容只作历史证据，不构成当前需求、架构、范围或授权。

当前规则、任务路由和安全护栏以 [`entrypoints/agent-system.md`](./entrypoints/agent-system.md) 为准；本文件不重复维护已退役的权威路径。

## 仓库任务路由

- 开始任何工作前，先读取 `README.md` 与 `entrypoints/agent-system.md`。
- 带 `迁移索引/待分诊` 标签的 Issue 默认只允许分诊和只读核验；旧正文、私有评论与开放状态都不恢复实施授权。
- 没有明确 Issue 时保持自由对话或当前请求的最小范围；可以提出有界候选，不能自行激活、派发或恢复旧事项。
- 明确 Issue 的工作直接实施、验证并通过 PR 或自足证据评论交付；不从源码、开放状态或历史安装恢复额外行为与权限。
- 不把分析、提案、实验、历史记录或私有旧仓材料当成当前授权。
- 未经负责人明确确认，不扩大授权，不恢复暂停事项，也不修改产品政策。

## 知识按名问路

- 需要 Windows／PowerShell GitHub 多行 Markdown 或 Windows 长路径／文件锁知识时，主动按名运行 `python tools/knowledge_action_trigger/action_trigger.py --action github-multiline-markdown` 或 `--action windows-path-or-file-lock`，再按需读取返回的当前知识源。
- 这是可查询工具，不自动触发、注入或挂 Hook；也可直接按名读取 `_archive/knowledge/windows-powershell-multiline-transfer.md` 或 `_archive/knowledge/windows-agent-ops.md`。查询不扩大合同、权限或产品决定。

## 代码注释语言

- 本仓新增或实质修改的代码注释一律用中文写，包括行内注释、块注释和文档注释（如 TypeScript 的 JSDoc、Python 的 docstring）。
- 代码标识符、类型名、路径、SQL／PRAGMA 语句、错误码、测试名和外部专名保持原文，不翻译；中文只用于解释性的散文部分。
- 这条只约束新增与实质修改的注释，不授权对既有英文注释做批量重写——碰到哪段就顺手把哪段改成中文，不为改注释单独开工。
- 提交信息本身的语言不受此约束。

## Git / PR 约定

- `gh pr create`/`gh pr edit` 的标题和正文默认使用中文（提交信息本身的语言不受此约束）。
