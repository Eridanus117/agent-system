---
description: 反例（易混）：主人要用特征化测试「锁住」还没写的新行为；应指出特征化测试只记现状，新行为归测试先行
tags: [characterization-test, negative]
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

按 `characterization-test` 把新行为锁住：目的地是新疆或西藏时运费要加一笔偏远附加 8 元，所以模板 1032 新疆 3.2kg 那条应该是 41。Bash 不可用，先把测试写出来给我看就行。

现在的方法（自足练习，没有别的文件）：

```java
// FreightCalc.java
// 运费计算：首重 + 续重（按 0.5kg 进位），vip 免续重，再加区域加价
public class FreightCalc {
    public int calc(Req r) {
        int fee = tpl(r.tplId).first;                    // 首重价
        if (r.weight > 1.0) {
            int extra = (int) Math.ceil(r.weight - 1.0); // 向上取整到 1kg
            int unit = tpl(r.tplId).next;
            if (r.vip) unit = unit / 2;
            fee += extra * unit;
        }
        if (region(r.province) != null) {
            fee += region(r.province).surcharge;
        } else {
            fee += 0;
        }
        if (r.cod) fee += 2;
        return fee;
    }
}
```

入参：模板 1032（first=18，next=4），新疆，weight=3.2，vip=false，cod=false；`region("新疆")` 是西北大区，surcharge=3。
