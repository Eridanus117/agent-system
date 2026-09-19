# 样本清单与规整规则：一个例子

形状只有四行：样本、规整、布局、请主人否。对象用主人原话里的，代替占位符。

## 输入

改动：运费计算 `FreightCalc.calc` 加「偏远附加按省份查表」。需求句两条：模板配了偏远省份表且省份在表中 → 加附加（例：模板 1032、新疆、3.2kg、vip → 26）；省份不在表中 → 不加（例：模板 1032、广东、3.2kg → 18）。老路径分支：首重、续重、cod 加费、vip 折扣。线上有 Arthas 与请求日志，还没改代码。

## 输出

```
样本｜首重续重-新疆-vip：模板 1032，新疆，3.2kg，vip → 新类别，覆盖需求句 1
    ｜首重续重-广东：模板 1032，广东，3.2kg → 老类别，覆盖续重分支与「不在表中不加」
    ｜首重-北京-cod：模板 2001，北京，0.8kg，货到付款 → 老类别，覆盖首重与 cod 分支
    ｜首重续重-上海-vip：模板 2001，上海，2.5kg，vip → 老类别，覆盖 vip 折扣分支
规整｜去掉 traceId、calcTime；其余字段原样
布局｜samples/freight/<场景名>.request.json ｜ samples/freight/<场景名>.approved.json ｜ samples/freight/README.md（规整规则）
采集｜改代码之前，Arthas：watch FreightCalc calc '{params, returnObj}' -x 3，逐条打上面四条请求
请否样本覆盖和规整规则；漏了哪个分支直接说。
```
