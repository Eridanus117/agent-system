---
name: worktree-baseline
description: >-
  改动落地第 4 段开工准备时用：用 Orca 开工作树并绑 issue，把目标仓自己的检查跑一遍当基线，给出第 4 段门口那条消息。Segment 4 of a change delivery: open an Orca worktree bound to the issue, run the repo's own checks once as the baseline, and produce the gate message.
---

# 建工作树加基线

第 4 段开工准备的步。用词按 `plugins/CONTEXT.md`：段、门、可选步、停靠记录。

## 什么时候用

用：`flow` 走到第 4 段（spec 或票已定，要开工）；或主人说「开工准备」。

不用：会话已经在这个 issue 的工作树里——只跑基线，不再开；小改动不建工作树。

## 步骤

1. 查有没有活着的工作树：`orca worktree show --worktree issue:N`（只按编号查，查到的核对是不是同一个仓）。有：告诉主人它的路径和分支，只问一句用不用它，不开第二个。
2. 开工作树并绑 issue：`orca worktree create --name <名> --repo path:<目标仓> --base-branch main --issue N --no-parent`，名字沿用 `desk<N>-<英文短词>`。会话在别的仓：先写停靠记录、解绑，再开。不建 `.worktrees/`，不用裸的 `git worktree add`，不先问主人「要不要工作树」——改动落地一律开。
3. 跑基线：改动之前，把目标仓自己的检查跑一遍。哪些算「自己的检查」去查仓：pre-commit（`.githooks/`）跑的那套优先，其次 CI（`.github/workflows/`）里最便宜的一套；没有的仓写「没有检查」。记命令与退出码；基线失败原样报，不修——那是改动之前就坏的。
4. 给第 4 段门口那条消息（形状见 `flow`）：工作树名与分支、基线命令与结果、可选步（`flow` 定，从零新建写「不开可选步」），最后只留一件事：请敲 `/implement`。

工具不可用时把命令按顺序写出来，说到停下为止，不编结果。

验收标准：门口那条消息里能数出工作树、分支、基线结果、可选步、一件要主人做的事。

## 产出

工作树与分支；基线结果——写进门口那条消息，之后进停靠记录与 PR「怎么验证的」。

## 出口

主人敲 `/implement` 进第 5 段。

## 为什么在哪

- desk#140（决定）、agent-system#113（spec）；绑定的规矩在 `flow`「会话绑定」。
- 原版 Superpowers `using-git-worktrees` 自己写着「宿主有 worktree 工具就用它，绕过是头号错误」，这里的宿主工具就是 Orca；它先问「要不要工作树」和默认建 `.worktrees/` 两处不要。
