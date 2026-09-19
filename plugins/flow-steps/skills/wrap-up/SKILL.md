---
name: wrap-up
description: >-
  常规变更第 7 阶段收尾时用：从 issue、spec 与证据抄出 PR 正文四节，写站会记录，登记挂起物，只问主人一句「推上去开 PR，还是放着」；合并由主人做。Stage 7 of a normal change: draft the four-section PR body from the issue, spec and evidence, write the standup update, register loose ends, and ask the owner one thing: push and open a PR, or leave it; merging is the owner's.
---

# 收尾

第 7 阶段的活动。前提：证据齐（`verify-evidence`），审查清单处理完（`review-response`）。用词按 `plugins/CONTEXT.md`：站会记录（standup update）、上线清单（rollout checklist）。

## 什么时候用

用：`flow` 走到第 7 阶段；或主人说「收尾」「开 PR」。

不用：还有审查意见主人没定——先回 `review-response`。

## 步骤

1. 写 PR 正文，按仓的 PR 模板四节，每节一个二级标题：`## 做了什么`、`## 为什么`、`## 怎么验证的`、`## 怎么回退`。内容从 issue、spec、证据抄；「为什么」链 issue 与 spec；「怎么验证的」放证据块；跳过的阶段在正文里留一句为什么。手头材料不全就按现有的写，缺的标「待补」。先存成文件。完成判据：四节齐、证据在里面、没有一句是编的。
2. 写站会记录：标题 `### 站会 · YYYY-MM-DD HH:MM`，四栏顺序固定、各一行——做成了、停在、下一步、等你（模板与例子见 `flow` 的 `references/standup-update.md`）。「做成了」写可复核的结果，「等你」只写第 4 步那一件事。完成判据：四栏齐，是四行不是表格。
3. 登记挂起物：分支、工作树、要建的上线清单，写进站会记录或 issue。
4. 只问主人一件事：推上去开 PR，还是放着。收尾那条消息里只有这一个问句；内容按第 1 步已备好，材料缺的已标「待补」。合并与发布由主人做——授权不含本地 merge、合并、发布。
5. 主人说推：push 分支，`gh pr create`（标题正文中文，正文用第 1 步的文件），PR 号写回站会记录。主人说放着：站会记录写明分支在哪。

工作树留着，合并后另做。

完成判据：PR 正文四节齐、证据在里面；站会记录四栏齐；主人只被问了一件事。

## 产出

PR 正文文件；站会记录；PR（主人说推之后）。

## 出口

PR 开了或分支放着；第 8 阶段多数跳过；第 9 阶段随时。

## 为什么在哪

- desk#140、agent-system#113、agent-system#117（换词）。
- 原版 Superpowers `finishing-a-development-branch` 的三选一（本地 merge、push 开 PR、放着）改成两选一：本地 merge 与 push 都越过授权，push 只在主人说推之后做。
