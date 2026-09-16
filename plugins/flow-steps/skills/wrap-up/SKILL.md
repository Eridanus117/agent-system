---
name: wrap-up
description: >-
  改动落地第 7 段收尾时用：从 issue、spec 与证据抄出 PR 正文四节，写停靠记录，登记挂起物，只问主人一句「推上去开 PR，还是放着」；不做本地 merge。Segment 7 of a change delivery: draft the four-section PR body from the issue, spec and evidence, write the docking record, register loose ends, and ask the owner one thing: push and open a PR, or leave it; never merge locally.
---

# 收尾

第 7 段的步。前提：证据齐（`verify-evidence`），审查清单处理完（`review-response`）。用词按 `plugins/CONTEXT.md`：停靠记录。

## 什么时候用

用：`flow` 走到第 7 段；或主人说「收尾」「开 PR」。

不用：还有审查意见主人没定——先回 `review-response`。

## 步骤

1. 写 PR 正文四节，按仓的 PR 模板：做了什么、为什么、怎么验证的、怎么回退。内容从 issue、spec、证据抄，不另编；「为什么」链 issue 与 spec；「怎么验证的」放证据块；跳过的段在正文里留一句为什么。先存成文件。
2. 写停靠记录（四栏，形状见 `flow`）：「做成了」写可复核的结果，「等你」只写第 4 步那一件事。
3. 登记挂起物：分支、工作树、要建的上线待办，写进停靠记录或 issue。
4. 只问主人一件事：推上去开 PR，还是放着。不做本地 merge，不合并，不发布——授权不含。
5. 主人说推：push 分支，`gh pr create`（标题正文中文，正文用第 1 步的文件），PR 号写回停靠记录。主人说放着：停靠记录写明分支在哪。

工作树不删，合并后另做。

验收标准：PR 正文四节齐、证据在里面；停靠记录四栏齐；主人只被问了一件事。

## 产出

PR 正文文件；停靠记录；PR（主人说推之后）。

## 出口

PR 开了或分支放着；第 8 段多数跳过；第 9 段随时。

## 为什么在哪

- desk#140、agent-system#113。
- 原版 Superpowers `finishing-a-development-branch` 的三选一（本地 merge、push 开 PR、放着）改成两选一：本地 merge 与 push 都越过授权，push 只在主人说推之后做。
