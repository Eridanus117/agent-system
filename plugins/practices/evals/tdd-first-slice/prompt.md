---
description: 正例：接缝已确认；写第一个失败测试与最小实现，一次一个切片，断言用独立字面值
tags: [tdd, positive]
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

接缝已经确认：只测 `applyCoupon(cart, code)` 这条公共接口，通过 `total(cart)` 观察结果。

按 `tdd` 做第一个切片：`SAVE10` 对满 100 的购物车减 10。过期券、无效券都以后再说。

Bash 不可用，跑不了测试。把第一个失败测试写到工作目录的 `src/cart/applyCoupon.test.ts`，再把让它通过的最小实现写到 `src/cart/applyCoupon.ts`，然后停下告诉我下一个切片是什么。

现有代码：

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
