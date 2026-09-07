# Issue tracker：GitHub

本仓的 issue 与 spec 存在 GitHub Issues 里，一切操作走 `gh` CLI。

## 约定

- **建 issue**：`gh issue create --title "..." --body "..."`。多行正文用 heredoc。
- **读 issue**：`gh issue view <number> --comments`，用 `jq` 过滤评论，同时取标签。
- **列 issue**：`gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`，按需加 `--label` 与 `--state`。
- **评论**：`gh issue comment <number> --body "..."`
- **加/去标签**：`gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **关闭**：`gh issue close <number> --comment "..."`

仓库由 `git remote -v` 推断——在克隆目录里运行时 `gh` 会自动认出来。

本仓的标题与正文默认用中文（见 `AGENTS.md`「Git / PR 约定」）。

## Pull request 作为诉求来源

**PR 作为诉求来源：否。** _（若本仓把外部 PR 当作功能诉求，改成「是」；`/triage` 读这个开关。）_

设为「是」时，PR 与 issue 走同一套标签和状态，命令换成 `gh pr` 对应项：

- **读 PR**：`gh pr view <number> --comments`，取 diff 用 `gh pr diff <number>`。
- **列出待分诊的外部 PR**：`gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments`，只保留 `authorAssociation` 为 `CONTRIBUTOR`、`FIRST_TIME_CONTRIBUTOR` 或 `NONE` 的（丢掉 `OWNER`/`MEMBER`/`COLLABORATOR`）。
- **评论 / 标签 / 关闭**：`gh pr comment`、`gh pr edit --add-label`/`--remove-label`、`gh pr close`。

GitHub 的 issue 与 PR 共用一个编号空间，所以裸写的 `#42` 两者都可能是——先 `gh pr view 42`，不中再回落 `gh issue view 42`。

## 技能说「发布到 issue tracker」时

建一个 GitHub issue。

## 技能说「取回对应 ticket」时

跑 `gh issue view <number> --comments`。

## Wayfinding 操作

`/wayfinder` 用。**地图**是一个 issue，**子** issue 作为其 ticket。

- **地图**：一个打了 `wayfinder:map` 标签的 issue，正文含 Notes / Decisions-so-far / Fog 三节。`gh issue create --label wayfinder:map`。
- **子 ticket**：以 GitHub sub-issue 形式挂到地图上（对 sub-issues 端点走 `gh api`）。没启用 sub-issues 时，把子项加进地图正文的任务列表，并在子项正文顶部写 `Part of #<map>`。标签用 `wayfinder:<type>`（`research`/`prototype`/`grilling`/`task`）。认领后把 ticket 指派给推进者。
- **阻塞边**：用 GitHub **原生 issue dependencies**，这是唯一权威、且在 UI 上可见的表示。加边：`gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`，其中 `<blocker-db-id>` 是阻塞方的数字 **database id**（`gh api repos/<owner>/<repo>/issues/<n> --jq .id`，**不是** `#number`，也不是 `node_id`）。GitHub 会给出 `issue_dependencies_summary.blocked_by`（只计开着的阻塞方，这就是实时闸门）。没有 dependencies 时回落到子项正文顶部写一行 `Blocked by: #<n>, #<n>`。所有阻塞方都关闭即为解除阻塞。
- **前沿查询**：列出地图下开着的子项（`gh issue list --state open`，范围限该地图的 sub-issues 或任务列表），去掉还有开着的阻塞方的（`issue_dependencies_summary.blocked_by > 0`，或 `Blocked by` 行里还有开着的 issue）以及已有 assignee 的；地图顺序中最靠前的胜出。
- **认领**：`gh issue edit <n> --add-assignee @me`——本会话的第一次写入。
- **收口**：`gh issue comment <n> --body "<answer>"`，然后 `gh issue close <n>`，再把上下文指针（gist 加链接）追加到地图的 Decisions-so-far 一节。
