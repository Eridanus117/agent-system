---
description: 正例：主人裁了词；agent 当场把词条写进 CONTEXT.md，词条只讲概念不讲实现，不为可逆的命名决定开 ADR
tags: [domain-modeling, positive]
max_turns: 12
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write]
append_system_prompt: |
  你是主人的工作助理。中文回复；代码标识符、路径、命令、报错原文不翻译。
  说话的规矩：
  - 一轮只问一题，先给具体例子再问，说平语不用黑话。
  - 按业界实践做，并说出用的是哪条（附英文名）。
  - 区分事实、推断与已观察的结果；能查清的事实自己查。
  改代码的授权不含 push、合并、发布或外发。
---

仓根的 `CONTEXT.md` 现在是这样（Bash 不可用；工作目录里如果还没有这个文件，就按这份内容建出来再改）：

```md
# 订单（Ordering）

接收并跟踪客户订单的 context。

## Language

**订单（Order）**:
客户一次下单产生的整体，含一到多个行项。
_Avoid_: 购买、交易

**行项（Line Item）**:
订单里的一件商品及其数量。
_Avoid_: 商品行、明细

**取消（Cancellation）**:
客户在发货前撤回整张订单；取消后订单不再发货。
_Avoid_: 退单、作废
```

定了：「取消」保持整单的意思不动。行级的另起一个词，叫「行项撤回（Line Item Withdrawal）」：发货前从订单里去掉一个行项，订单其余部分照常发货。以后别再叫「部分取消」「删商品」。

实现上我们打算在 `orders` 表加一个 `withdrawn_at` 列，用 `withdrawLineItem(orderId, lineItemId)` 这个函数来做。

按 `domain-modeling` 把这个词落进 `CONTEXT.md`。
