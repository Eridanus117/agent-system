# 边界清单

## 形状

```
集成面｜上游 <谁调我> ｜ 下游 <我调谁：表、配置、外部服务> ｜ 开关 <名> ｜ 数据 <哪张表哪一列> ｜ 别人的代码 <归配置管理>
变没变｜<边界>：<不变 / 变了什么，谁要知道>（每个边界一条）
待你定｜<绕过入口的调用方要不要接，这类只有主人能定的>
请否集成面；漏了哪个边界直接说。
```

## 例子：偏远附加按省份查表

```
集成面｜上游 OrderService、QuoteService、BatchCalc ｜ 下游 remote_fee 表、模板配置 ｜ 开关 remote_fee_by_province ｜ 数据 remote_fee 加 province 列 ｜ 别人的代码 同事在改 cod 那一行，归配置管理
变没变｜calc 签名：不变 ｜ OrderService、QuoteService：不变，经 calc 入口分流 ｜ BatchCalc：不变——直接调 calcInner 绕过 calc，新分流对它不生效，接不接见待你定 ｜ remote_fee 表：新增 province 列，旧列保留，报表任务要知道 ｜ 模板配置：新增偏远省份表字段，未配置即不加 ｜ 开关：新注册，默认关
待你定｜BatchCalc 要不要拿到偏远附加：接（在 calcInner 也分流一处）还是留在老路径
请否集成面；漏了哪个边界直接说。
```
