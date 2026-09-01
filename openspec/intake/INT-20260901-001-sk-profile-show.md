---
schemaVersion: 1
id: INT-20260901-001-sk-profile-show
state: promoted
phase: disposition
source: 负责人对话（Claude Code session，2026-09-01）
capturedAt: 2026-09-01
promotedTo: sk-profile-show
---

# Intake

## 原始问题

目前 sk 的设计，似乎没有办法看到 profile 中的配置？——负责人确认要做：补一个查看 profile 内容的命令（sk show）。

## Triage

范围：仅 `packages/sk`（`src/cli.ts` 增一个只读命令 + `tests/sk.test.ts` 增测试 + `README.md` 补文档），不触碰 profile 数据格式、sync 派生逻辑或其他包。
影响：sk CLI 用户此前无法从 CLI 查看单个 profile 内含哪些技能，只能绕开工具去看文件系统（`profiles/<名>/skills/` junction 或 `manifest.json`）；补上后 add/rm 前可先查看当前配置。
判断：范围清楚、只读、风险受控的小改动，建议走 light-change 快车道（跳过独立分析/规划门，只留验收门）。

## Evidence

### 已知事实

- `sk list`（cli.ts cmdList）列的是库存（plugins/、vendor/ 全部技能），与 profile 无关。
- `sk profiles`（cli.ts cmdProfiles）只输出每个 profile 的技能数量与失效链接数，不列具体技能。
- 查看单个 profile 内容所需的数据函数均已存在：`profileSkills()` 返回 name/target/alive，`groupOfEntry()` 推断所属组，`frontmatter()` 可取 description，`readManifest()` 覆盖未 restore 的 clone 场景。
- 本 worktree 分支 `Eridanus117/sk-profile-show` 即为此事项开设。

### 未知与假设

- 假设命令名取 `sk show <profile>`（与既有命令风格一致）；输出格式对齐 `sk list` 的列式排版。
- 未 restore 的 clone（链接全缺但 manifest 非空）时，show 应回退读 manifest 并提示 restore，而不是报空。

### 证据

- `packages/sk/src/cli.ts`（2026-09-01 现状读取）：无任何按 profile 列技能的命令分支。
- `packages/sk/README.md` 命令清单：list / profiles / new / add / rm / sync / restore / run / version，无 show。

## Options

### 候选处置

1. **建（推荐）**：新增 `sk show <profile>` 只读命令，列出组、技能名、描述、链接存活状态；链接全缺且 manifest 非空时回退读 manifest 并提示 restore。实现是对既有函数的组装，附测试。
2. 不建，改为文档化「用 `ls profiles/<名>/skills/` 或读 manifest.json 查看」：不加代码，但与「人不需要背文件系统布局」的工具定位相悖。
3. 缓：无依赖压力，但负责人已明确确认要做，无缓的理由。

## Disposition

决定：promote（走 light-change@v1.0.0 快车道）
理由：负责人已在对话中明确确认实施（「你确认要做的话我就直接实现」→「是的」）；改动只读、边界清晰、验证方式明确（bun test + 实机运行）。
下一步：建立 Change `openspec/changes/sk-profile-show`，绑定 light-change@v1.0.0，实施后停靠验收门。

## History

- 2026-09-01T14:10:21.337Z captured
- 2026-09-01T14:11:42.183Z advanced to triage
- 2026-09-01T14:11:43.059Z advanced to evidence
- 2026-09-01T14:11:43.859Z advanced to options
- 2026-09-01T14:11:44.692Z advanced to disposition
- 2026-09-01T14:12:26.438Z promoted to sk-profile-show
