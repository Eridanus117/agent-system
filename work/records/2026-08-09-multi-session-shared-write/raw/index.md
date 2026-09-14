# 原始来源索引：多 Session 共享写入试验

> 状态：非权威。这里只索引可复查来源和观察时点，不把运行状态复制成永久事实。
> 观察日期：2026-08-09。

## S01：当前权威与任务

- `authority/04-collaboration.md`
- `work/current.md`
- 用途：确认问题已经登记、当前授权、当前方案与写入所有权。

## S02：Orca 现行协调合同

- 命令：`orca skills get orchestration --full`
- Orca 版本：`1.4.177`
- 关键可复查事实：Run 是命名空间和协调者收件箱；Task／Dispatch 记录派工与生命周期；Orca 不调度、不放置任务，也不推断冲突；TUI 不是协调状态源。
- 失效条件：Orca 更新后重新运行该命令，不能继续依赖本次命令语义。

## S03：本机活跃状态

- 命令：`orca status --json`
- 命令：`orca terminal list --json`
- 命令：`orca worktree list --json`
- 命令：`orca orchestration run-list --json`
- 命令：`orca orchestration task-list --run <run-id> --json`
- 观察：本轮开始时，Orca 有四个可写终端；两个 Codex Session 可以触及 `agent-control`。主 Session 是浮动终端，终端元数据没有工作目录；另一个 Session 绑定 `agent-control` 主 worktree。
- 保存策略：这些是易变运行状态，不复制完整 JSON；需要时按命令重新观察。

## S04：Git 与安装状态

- 命令：`git worktree list --porcelain`
- 命令：`git status --short --branch`
- 命令：`codex plugin list --json`
- 命令：`claude plugin list --json`
- 用途：确认当前只有一个 `agent-control` Git worktree、共享主分支已有本轮未提交改动，以及三个运行端的 Plugin 版本。

## S05：版本化与安装文件

- `entrypoints/agent-system.md`
- `C:\Users\<user>\.codex\AGENTS.md`
- `C:\Users\<user>\AppData\Roaming\orca\codex-runtime-home\home\AGENTS.md`
- `C:\Users\<user>\.claude\CLAUDE.md`
- `C:\Users\<user>\workspace\agent-plugins\plugins\orchestrated-collaboration\skills\orchestrated-collaboration\SKILL.md`
- 三端安装缓存中的 `orchestrated-collaboration/0.1.2/.../SKILL.md`
- 用途：检查入口和 Skill 的版本化来源、安装副本与哈希一致性。

## S06：本轮 Orca 来源链

- Run：`run_8f829c43983e`
- 首次旧 Session 任务：`task_099768649943`
- 首次低层 Dispatch：`ctx_90b4415d96b1`
- 全新 Session 验证任务：`task_f3f90df43be8`
- 全新 Session 低层 Dispatch：`ctx_2b46ee0bc0d4`
- 用途：复核派工、交付、失败和验收来源。

## 完整性说明

- 没有复制终端全文、Session transcript、用户凭据或隐藏推理；
- 运行状态以 Orca 和 Git 当前查询为准；
- 本索引只证明来源可定位，不证明结论已经可信或权威。

## S07：`issue-to-merge` 安装源码

- 路径：`C:\Users\<user>\.codex\plugins\cache\codex-marketplace\issue-to-merge\0.1.0`
- 对象：Plugin `0.1.0`，17 个 `SKILL.md`，合计 1491 行、94929 字节。
- 复查：`rg --files --hidden <path>`，逐个读取 `SKILL.md` 及 `references/repository-work-files.md`。
- 用途：确认它实际的流程、授权语义、外部 Skill 依赖、本地资产规则和默认串行边界。
- 失效条件：安装版本或源码更新后重新读取；不把上游仓历史或旧 Issue 当作当前行为。

## S08：GitHub 当前官方能力

- GitHub Issues：<https://docs.github.com/en/issues/tracking-your-work-with-issues/learning-about-issues/about-issues>
- Projects API：<https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects>
- Actions 事件：<https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows>
- Actions 并发：<https://docs.github.com/en/actions/concepts/workflows-and-actions/concurrency>
- 自托管 Runner：<https://docs.github.com/en/actions/reference/runners/self-hosted-runners>
- PR 审查：<https://docs.github.com/en/pull-requests/concepts/giving-reviews>
- 受保护分支：<https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches>
- 核验日期：2026-08-09。
- 用途：确认 GitHub 可以承载的持久协作能力，以及需要另外运行层的边界。

## S09：当前 GitHub 仓与 CLI 环境

- `gh` 版本：`2.97.0`。
- 仓：`Eridanus117/agent-control`，私有，Issues 与 Projects 已启用，当前无 Issue、PR、Actions Runner。
- CLI 已具备 `repo`、`workflow`、`project` 和 `read:org` 范围；`gh issue create/edit` 实际支持 parent、sub-issue、blocked-by 和 blocking。
- 当前私有个人仓读取 branch protection 和 rulesets 均返回 HTTP 403，要求升级 GitHub Pro 或改为公开仓。
- 复查命令：`gh repo view`、`gh issue create --help`、`gh issue edit --help`、`gh api repos/Eridanus117/agent-control/branches/main/protection`、`gh api repos/Eridanus117/agent-control/rulesets`。

## S10：Orca 当前运行层

- Orca 版本：`1.4.177`，运行时状态 `ready`。
- 当前指南：`orca skills get orchestration --full`。
- 当前状态：`orca status --json`、`orca orchestration run-current --json`、`task-list --json`、`worker-list --json`。
- 可复查能力：Run、Task DAG、Dispatch、受监督 Worker、持久消息、ask/reply、decision gate、typed `worker_done`、worker 读取／停止／放弃／释放，以及跨 Orca 主机派发。
- 当前 Run 仍是原共享写入试验目标，两个 Task 已终结，当前 Worker 为空；这证明 Orca 状态需要显式绑定持久任务，不能单独成为长期方向权威。
