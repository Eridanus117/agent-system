# CONTEXT.md 的格式

来源：Matt Pocock 的 domain-modeling（CONTEXT-FORMAT.md，revision 6acc160），MIT。仓里已经有自己的词汇表格式（比如本仓 `plugins/CONTEXT.md` 的词条带英文原词与出处）就沿用仓里的；下面是没有既定格式时的默认。

## 结构

```md
# {context 名}

{一两句：这个 context 是什么、为什么存在。}

## Language

**订单（Order）**:
{一两句说这个词是什么。}
_Avoid_: 购买、交易

**发票（Invoice）**:
交付后发给客户的付款请求。
_Avoid_: 账单、付款申请

**客户（Customer）**:
下订单的人或组织。
_Avoid_: 客户端、买家、账号
```

## 规矩

- **要有主张。** 同一个概念有几个词时，挑最好的那个，其余列进 `_Avoid_`。
- **定义要紧。** 最多一两句；说它**是什么**，不说它做什么。
- **只收这个 context 特有的词。** 通用编程概念（超时、错误类型、工具模式）不收，哪怕项目里用得很多。加词前问一句：这是本 context 独有的概念，还是通用编程概念？只收前者。
- **自然成簇时用小标题分组。** 全部属于一块的，平铺就行。

## 单 context 与多 context

**单 context（多数仓）：** 仓根一份 `CONTEXT.md`。

**多 context：** 仓根一份 `CONTEXT-MAP.md`，列出各 context 在哪、彼此什么关系：

```md
# Context Map

## Contexts

- [Ordering](./src/ordering/CONTEXT.md) —— 接收并跟踪客户订单
- [Billing](./src/billing/CONTEXT.md) —— 生成发票、处理付款
- [Fulfillment](./src/fulfillment/CONTEXT.md) —— 仓库拣货与发运

## Relationships

- **Ordering → Fulfillment**：Ordering 发出 `OrderPlaced` 事件，Fulfillment 消费它开始拣货
- **Fulfillment → Billing**：Fulfillment 发出 `ShipmentDispatched` 事件，Billing 消费它生成发票
- **Ordering ↔ Billing**：共享 `CustomerId` 与 `Money` 类型
```

怎么判用哪种：有 `CONTEXT-MAP.md` 就按它找 context；只有仓根 `CONTEXT.md` 就是单 context；两者都没有，第一个词敲定时在仓根懒建 `CONTEXT.md`。多 context 时按话题推断归哪个 context，推不出就问一句。
