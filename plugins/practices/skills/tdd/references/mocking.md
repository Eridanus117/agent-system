# 什么时候 mock

来源：Matt Pocock 的 tdd（mocking.md，revision 6acc160），MIT。

只在**系统边界**mock：

- 外部 API（支付、邮件……）
- 数据库（有时；优先用测试库）
- 时间、随机数
- 文件系统（有时）

不 mock：

- 自己的类和模块
- 内部协作者
- 任何自己控制的东西

## 为可 mock 而设计

在系统边界上，把接口设计成容易 mock 的样子：

**1. 用依赖注入**

外部依赖从外面传进来，不在里面自己造：

```typescript
// 容易 mock
function processPayment(order, paymentClient) {
  return paymentClient.charge(order.total);
}

// 难 mock
function processPayment(order) {
  const client = new StripeClient(process.env.STRIPE_KEY);
  return client.charge(order.total);
}
```

**2. SDK 风格的接口，代替通用的取数函数**

每个外部操作一个专门函数，代替一个带条件分支的通用函数：

```typescript
// 好：每个函数可以单独 mock
const api = {
  getUser: (id) => fetch(`/users/${id}`),
  getOrders: (userId) => fetch(`/users/${userId}/orders`),
  createOrder: (data) => fetch('/orders', { method: 'POST', body: data }),
};

// 坏：mock 里得写条件分支
const api = {
  fetch: (endpoint, options) => fetch(endpoint, options),
};
```

SDK 风格的好处：

- 每个 mock 只返回一种形状
- 测试准备里没有条件逻辑
- 一眼看出一个测试碰了哪些端点
- 每个端点各自有类型
