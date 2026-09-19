---
name: regression-evidence
description: >-
  改旧代码时才开的活动「证」：改完要证明老流程没变、新流程是对的。改代码之前按 record-replay 录母版，改完按 golden-master 回放比对，三样进同一个 PR。The legacy-code activity for proof: record the master before the change (record-replay), replay and compare after (golden-master), assets in the same PR.
---

# 回归取证

改旧代码时才开的活动之一（`flow` 里的「证」：改完要证明没变），第 4 阶段门上开了它才做。用词按 `plugins/CONTEXT.md`：活动、证据。做法在两条实践里：`record-replay`（挑样本、录母版）、`golden-master`（比对、留证）；这里只说顺序与完成判据。

## 什么时候用

用：第 4 阶段门上开了「证」——改动碰了既有路径，老路径没有测试或验收要求输出逐字节一致；第 5 阶段动手之前开始，第 6 阶段验证时收。

不用：从零新建、没有老路径——门上写「从零新建，不开改旧代码的活动」，一句跳过写进 PR 正文或站会记录，正确性归需求例子与 `tdd`。灰度期的线上比对归 `rollout-observe`。

## 步骤

1. 改代码之前：按 `record-replay` 出样本清单与规整规则请主人否，否过后录母版进仓。样本清单是计划，不用先拿到真实请求就能列；工具不可用时照样列出来请主人否，录制留到工具可用时做。完成判据：样本目录里每条样本的 request 与 approved 都在，录制早于第一处代码改动。
2. 改完之后：按 `golden-master` 回放比对，红的按它归类。完成判据：回放测试全绿，或每条红都有归属。
3. 留证：母版文件、回放测试、比对结果（命令与退出码）进同一个 PR，PR「怎么验证的」一节按 `verify-evidence` 贴。完成判据：PR diff 里三样都在。

完成判据：能指着 PR 说出「老路径没变」与「新路径对」各由哪条测试证明。

## 产出

母版、回放测试、比对结果——在改动的 PR 里。

## 出口

第 6 阶段 `verify-evidence` 收证据；要放量的进第 8 阶段 `rollout-observe`。

## 为什么在哪

- agent-system#122、agent-system#115（spec）、ADR-0006；原正文 `plugins/workcoding/skills/evidence-regression`，归档见 agent-system#123。
