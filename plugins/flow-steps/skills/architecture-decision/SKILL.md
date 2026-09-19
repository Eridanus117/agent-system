---
name: architecture-decision
description: >-
  常规变更改旧代码、要在既有系统上定一项新能力「系统成为什么样」时的活动：写清这轮决定什么，摆基线与未知，点名 tradeoff-analysis 出候选做两面，把暂定推荐交主人确认；确认前不实现。Architecture decision for a change on an existing system: frame the decision, lay out baseline facts and unknowns, name tradeoff-analysis for the candidates, hand the tentative recommendation to the owner; nothing is built before confirmation.
---

# 架构决定

改旧代码时才开的活动，在第 4 阶段的门上开（`flow`）。架构决定（architecture decision）按 Nygard 的 ADR 说：这次改动要定「系统成为什么样」的那件事。用词按 `plugins/CONTEXT.md`。点名的实践（`tradeoff-analysis`）在当前客户端没装时，按第 3 步的完成判据把候选做完，不停下等它。

## 什么时候用

用：`flow` 在第 4 阶段的门上开了它——在既有系统上加一项新能力，需求已收口但还没定承载方式与放哪；或主人说「先定架构」。

不用：架构决定主人已经确认，票要的是按它改代码——进第 5 阶段，旧代码没测试就开 `legacy-code-change`，不重开候选；需求本身还没收口——先回第 1、2 阶段。

## 步骤

1. 定决定。写这轮要决定什么、不决定什么、谁受影响。完成判据：一句话能说出决定对象与范围。
2. 摆基线与未知。已确认的需求（spec 的验收判据）、`master` 现状、尝试分支、外部约束各一行，都标来源；还没查明的写进未知，写明为什么未知、补证要多少代价。尝试分支与旧字段的地位按 `tradeoff-analysis`。完成判据：每条事实有来源，每条未知有原因，没有把猜测写成事实。
3. 出候选做两面：`tradeoff-analysis`。缺一个数才能比时开 `impact-analysis` 或 `baseline-measurement` 拿数。完成判据：至少两个能落地的候选，各有支持、反对、最大风险、可逆性；暂定推荐带推翻条件。
4. 交主人确认。把决定、基线、未知、候选、推荐写进这件事的记录（形状见 [decision-record.md](./references/decision-record.md)），只请主人做一件事：确认推荐与剩余未知（推荐不是授权，按 `tradeoff-analysis` 收口）；确认后写 ADR（`domain-modeling`）再进第 5 阶段。完成判据：结尾只有一个问句；回复里没有代码与 DDL。

## 产出

这件事记录里的方案一节；主人确认后一条 ADR。

## 出口

主人确认推荐 → 第 5 阶段；主人要证据 → `impact-analysis`；主人否 → 回第 3 步重出候选。

## 为什么在哪

- desk#152、agent-system#115（实践与规程分层）、agent-system#120；旧 `architecture-design` 的正文已归档在 `_archive/plugins/workcoding/skills/architecture-design`（agent-system#123）。
- 为什么单独有这一步、为什么不做全套架构评审：wiki《架构设计》。
