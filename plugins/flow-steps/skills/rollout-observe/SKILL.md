---
name: rollout-observe
description: >-
  常规变更第 8 阶段发布时用：按 feature-toggle 定回滚点，按 canary-release 定三档放量与观测点，每档的开关由主人拨；多数改动跳过这一阶段，留一句为什么。Stage 8 of a normal change: rollback point from feature-toggle, tiers and observation points from canary-release, the owner flips each tier; most changes skip this stage with one line.
---

# 放量观测

第 8 阶段发布的活动。用词按 `plugins/CONTEXT.md`：阶段、门、活动、站会记录。做法在两条实践里：`feature-toggle`（开关与回滚点）、`canary-release`（三档、观测点、冒烟）；这里只说这一阶段做什么、门上判什么。

## 什么时候用

用：`flow` 走到第 8 阶段且改动带分流开关、有面向用户的新路径；或 PR 合了之后主人问「这个怎么发」。

不用：多数改动跳过第 8 阶段——没有开关、行为不变、跟例行发版走的，留一句「跳过第 8 阶段：<为什么>」写进 PR 正文或站会记录。改前改后的仓内比对归 `regression-evidence`。

## 步骤

1. 按 `feature-toggle` 定回滚点。完成判据：回滚一行写的是关哪个开关、它的前提验没验。
2. 按 `canary-release` 定放量方案。完成判据：每档有放谁、停多久，每条需求句有观测点，冒烟有例子与期望。
3. 给第 8 阶段门上那条消息（模板见 `flow` 的 `references/gate-message.md`）：门上判灰度三档与回滚点，列出方案（形状见 `canary-release` 的 `references/release-plan.md`），最后只留一件事——请主人定档 1 放谁；回滚阈值、名单范围这类细节等主人定了档 1 再谈。每档由主人定（`canary-release` 第 4 步）；主人说行进下一档时再来一次。完成判据：消息里能数出三档、回滚点、观测点、一件要主人做的事。
4. 每档放开后：观测结果与冒烟结果记进 PR 或工单；异常就关开关（主人拨）并回第 5 阶段。完成判据：每档一条结果记录。

## 产出

发布方案与每档结果，在 PR 或工单里。

## 出口

档 3 全量后进第 9 阶段；跳过的一句写在 PR 或站会记录里。

## 为什么在哪

- agent-system#122、agent-system#115（spec）、ADR-0006；原正文已归档在 `_archive/plugins/workcoding/skills/release-observe`（agent-system#123）。
