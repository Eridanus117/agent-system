---
description: 正例：给一段没有测试、注释与实现对不上的旧方法锁现状；每步断言带注释、期望值是实际输出、出入标出、假设单列、请主人否
tags: [characterization-test, positive]
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

按 `characterization-test` 给下面这个方法锁住现状。Bash 不可用，跑不了；工作区里没有别的文件，材料都在这里。

要锁的方法（自足练习）：

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

一条真实请求：模板 1032（`tpl(1032).first = 18`，`tpl(1032).next = 4`），目的地新疆（`province = "新疆"`），`weight = 3.2`，`vip = false`，`cod = false`。我确定 `region("新疆")` 返回西北大区、`surcharge = 3`；区域表里有没有「新疆」单独一行我不知道。

把测试写到工作目录的 `src/test/java/FreightCalcCharacterizationTest.java`，然后把走读清单摆给我否。
