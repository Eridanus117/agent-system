# 好测试与坏测试

来源：Matt Pocock 的 tdd（tests.md，revision 6acc160），MIT。

## 好测试

**集成风格**：穿过真实接口测，不 mock 内部零件。

```typescript
// 好：测可观察的行为
test("user can checkout with valid cart", async () => {
  const cart = createCart();
  cart.add(product);
  const result = await checkout(cart, paymentMethod);
  expect(result.status).toBe("confirmed");
});
```

特征：

- 测用户或调用方在乎的行为
- 只用公共 API
- 内部重构后仍然活着
- 说的是「做什么」，不是「怎么做」
- 一个测试一个逻辑断言

## 坏测试

**实现细节测试**：绑在内部结构上。

```typescript
// 坏：测实现细节
test("checkout calls paymentService.process", async () => {
  const mockPayment = jest.mock(paymentService);
  await checkout(cart, payment);
  expect(mockPayment.process).toHaveBeenCalledWith(cart.total);
});
```

信号：

- mock 内部协作者
- 测私有方法
- 断言调用次数或顺序
- 行为没变、只是重构，测试却挂了
- 测试名说的是「怎么做」不是「做什么」
- 绕过接口从别的渠道验证

```typescript
// 坏：绕过接口去验证
test("createUser saves to database", async () => {
  await createUser({ name: "Alice" });
  const row = await db.query("SELECT * FROM users WHERE name = ?", ["Alice"]);
  expect(row).toBeDefined();
});

// 好：穿过接口验证
test("createUser makes user retrievable", async () => {
  const user = await createUser({ name: "Alice" });
  const retrieved = await getUser(user.id);
  expect(retrieved.name).toBe("Alice");
});
```

**同义反复测试**：期望值照着实现重算一遍，测试按构造必过。

```typescript
// 坏：期望值按代码同样的算法重算
test("calculateTotal sums line items", () => {
  const items = [{ price: 10 }, { price: 5 }];
  const expected = items.reduce((sum, i) => sum + i.price, 0);
  expect(calculateTotal(items)).toBe(expected);
});

// 好：期望值是独立的、已知正确的字面值
test("calculateTotal sums line items", () => {
  expect(calculateTotal([{ price: 10 }, { price: 5 }])).toBe(15);
});
```
