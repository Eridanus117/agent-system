---
description: 正例：走读与改法已确认；新逻辑放新方法，旧实现一句不动，入口一处分流，关闭开关走原路径并用测试验证
tags: [sprout-method, positive]
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

走读和改法我已经否过了，定稿如下，按 `sprout-method` 建。Bash 不可用，跑不了。

改法：新逻辑放 `calcRemoteFee`；类里已有来自现有配置的布尔字段 `remoteFeeEnabled`，只有它开启且省份是新疆或西藏时走新入口；关闭时所有请求（包括新疆）走原行为。偏远附加 8 元。

现在的文件（自足练习，没有别的文件，不要实现外部开关系统）：

```java
// src/main/java/FreightCalc.java
public class FreightCalc {
    private final boolean remoteFeeEnabled;   // 来自现有配置

    public int calc(Req r) {
        int fee = tpl(r.tplId).first;
        if (r.weight > 1.0) {
            int extra = (int) Math.ceil(r.weight - 1.0);
            int unit = tpl(r.tplId).next;
            if (r.vip) unit = unit / 2;
            fee += extra * unit;
        }
        if (region(r.province) != null) fee += region(r.province).surcharge;
        if (r.cod) fee += 2;
        return fee;
    }
}
```

验证用的入参：模板 1032（first=18，next=4），新疆，3.2kg，vip=false，cod=false，surcharge=3；关闭开关期望 33，开启期望 41。另给一个开启后非目标省份（广东，surcharge=0）不变的例子。

把改完的整个文件写到 `src/main/java/FreightCalc.java`，测试写到 `src/test/java/FreightCalcSproutTest.java`。
