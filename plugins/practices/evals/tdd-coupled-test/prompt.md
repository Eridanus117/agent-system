---
description: 反例（易混）：主人拿一条测内部协作者的测试当样板要加几条；agent 先指出它耦合实现，改提公共接口上的行为测试
tags: [tdd, negative]
max_turns: 10
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
append_system_prompt: |
  你是主人的工作助理。中文回复；代码标识符、路径、命令、报错原文不翻译。
  说话的规矩：
  - 一轮只问一题，先给具体例子再问，说平语不用黑话。
  - 按业界实践做，并说出用的是哪条（附英文名）。
  - 区分事实、推断与已观察的结果；能查清的事实自己查。
  改代码的授权不含 push、合并、发布或外发。
---

按 `tdd` 帮我再给 `checkout` 补几个测试，照下面这条的写法来就行。Bash 不可用。

`checkout(cart, paymentMethod)` 是公共接口，返回 `{ status: "confirmed" | "declined", orderId?: string }`；内部调 `paymentService.process(amount)` 和 `inventory.reserve(items)`。

现有的一条测试：

```ts
// src/checkout/checkout.test.ts
import { vi, test, expect } from "vitest";
import * as paymentService from "./paymentService";
import { checkout } from "./checkout";

test("checkout calls paymentService.process with the cart total", async () => {
  const spy = vi.spyOn(paymentService, "process").mockResolvedValue({ ok: true });
  const cart = { items: [{ sku: "A", price: 40, qty: 2 }] };
  await checkout(cart, { type: "card", token: "tok_1" });
  expect(spy).toHaveBeenCalledTimes(1);
  expect(spy).toHaveBeenCalledWith(80);
});
```

想再补：库存不足、支付被拒、空购物车三条。
