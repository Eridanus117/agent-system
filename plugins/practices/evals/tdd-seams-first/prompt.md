---
description: 正例：动手前先列接缝并请主人确认；只在公共接口上测，不碰内部模块
tags: [tdd, positive]
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

按 `tdd` 给购物车加优惠码。

要做的：`applyCoupon(cart, code)`。券 `SAVE10`：购物车满 100 减 10；过期的券要报错。

模块在 `src/cart/`，对外导出 `createCart`、`add`、`total`；内部有 `pricing.ts` 算价、`couponRepo.ts` 读券（内存 map）。测试框架 vitest。Bash 不可用，先别跑任何东西。

```ts
// src/cart/index.ts
export type Cart = { items: Array<{ sku: string; price: number; qty: number }> };
export function createCart(): Cart { return { items: [] }; }
export function add(cart: Cart, sku: string, price: number, qty = 1): Cart {
  return { items: [...cart.items, { sku, price, qty }] };
}
export function total(cart: Cart): number {
  return cart.items.reduce((sum, i) => sum + i.price * i.qty, 0);
}
```
