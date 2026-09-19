---
description: 反例（易混）：主人只是查词汇表里一个词的意思；答就是了，不开建模会话、不改文件
tags: [domain-modeling, negative]
max_turns: 10
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

仓根的 `CONTEXT.md`（Bash 不可用，贴给你）：

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

`CONTEXT.md` 里的「取消」到底指什么？我在写测试名，想用对词。
