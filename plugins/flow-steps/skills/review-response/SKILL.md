---
name: review-response
description: >-
  收到 code-review 的审查报告时用：逐条对照代码核实、给建议与理由，整份报给主人，主人定了再一条一改一测；不说客套话。Handle a code-review report: verify each finding against the code, recommend fix or not with reasons, report the whole list to the owner, then fix one item at a time after the owner decides; no flattery.
---

# 接审查意见

第 6 段的步。输入是 `code-review` 的两轴报告（Standards、Spec），或主人转来的别人的意见。用词按 `plugins/CONTEXT.md`：硬问题、判断题。

## 什么时候用

用：审查报告回来了。

不用：报告还没出——先跑 `code-review`。

## 步骤

1. 逐条复述：一条意见一行，用自己的话说它要什么；看不懂的标「不明」，不猜。
2. 逐条核实：对着代码看（读文件、跑命令），意见说的现象在不在，规则或 spec 的原文是什么。
3. 逐条评估：对本仓成不成立，改了有什么副作用。给建议——修、不修、部分修——加一句理由；标硬问题（违反仓里文档化规则或 spec 明写的要求）还是判断题，只作参考。意见不成立就说不成立，引代码为证。
4. 整份报主人：一条消息列完，「等你」只写一件事——逐条定修不修。不先动手；主人当场说「都修」再修。
5. 主人定了再改：一条一改一测，改完把证据贴出来（`verify-evidence`）；不顺手改主人没点的地方。

不说「你说得对」「好建议」这类客套；不在 PR 上回帖，主人要求才写。

验收标准：每条意见都有复述、核实结果、建议与理由；改动只落在主人定过的那几条上。

## 产出

审查清单（对话里）；主人定后的修正 commit。

## 出口

主人定完、改完，交 `wrap-up`。

## 为什么在哪

- desk#140（Q2 = B：全部先报主人，主人定了再改）、agent-system#113。
- 原版 Superpowers `receiving-code-review` 的六步（读、复述、核实、评估、回复、逐条实现）保留，去掉末尾用 `gh api` 回帖——对外的话由主人定。
