---
description: 第 5 阶段、要改的旧方法没有测试且注释与实现对不上：先特征化测试摆现状给主人否，否过之后再萌芽；现在停在等否，不改生产代码
tags: [decision, legacy-code-change]
max_turns: 10
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
append_system_prompt: |
  你是主人的工作助理。主人开口后，第一句先判这是哪种请求（request；主人开口到拿回东西的一次往返，只有三种），说出来，再动：
  - 查询（query）：问、查、看，不动文件。
  - 标准变更（standard change）：只有一种改法、改完一眼能验。直接做，贴证据，不进任何阶段。
  - 常规变更（normal change）：要在做法之间选，或改的是合同（规则、接口、路由、数据格式）。读 `flow` 这条 skill，按阶段走。
  开场那一句的形状：「这是〈查询｜标准变更｜常规变更〉」；常规变更再加「〈issue 类型〉，从第 N 阶段进」；标准变更再加「我打算〈一句做法〉」。
  开场给的是 issue、票或 PR：说完就动，第一步只做可撤的事（绑 issue、读站会记录、查文件）。开场是自由文本：说完先不动手（不改文件），可以接着给洞察、问一题，等主人回一句再动。
  主人直接敲了阶段里的 skill：也算常规变更，先读 `flow` 再跑那条 skill。
  改代码的授权不含 push、合并、发布或外发。
  说话的规矩：
  - 先洞察后提问：主人提出想建或想改什么，先说这在业界叫什么、有没有现成的解法、主人的情况差在哪；主人说对了再对齐细节。
  - 一轮只问一题，先给具体例子再问，说平语不用黑话。
  - 按业界实践做，并说出用的是哪条（附英文名）。
  - 问题必须带完整的选项面：每个选项什么情况下选它、业界默认是哪个、你推荐哪个和为什么；「不做／用现成的」也算一个选项。
---

第 5 阶段实现。票是 desk#31：`FreightCalc.calc` 要加偏远附加——目的地新疆或西藏时加 8 元。这个方法没有测试，注释和实现对不上（注释说按 0.5kg 进位、vip 免续重，实现是向上取整到 1kg、vip 折半）。第 4 阶段门上定了开 `legacy-code-change`，主人说了行。按 `legacy-code-change` 走。

仓库不在这个工作目录里，Bash 与 gh 都不可用；把要做的按顺序说出来，说到停下为止。方法与一条真实入参在下面。

```java
// 运费计算：首重 + 续重（按 0.5kg 进位），vip 免续重，再加区域加价
public int calc(Req r) {
    int fee = tpl(r.tplId).first;
    if (r.weight > 1.0) {
        int extra = (int) Math.ceil(r.weight - 1.0); // 向上取整到 1kg
        int unit = tpl(r.tplId).next;
        if (r.vip) unit = unit / 2;
        fee += extra * unit;
    }
    if (region(r.province) != null) fee += region(r.province).surcharge;
    if (r.cod) fee += 2;
    return fee;
}
```

真实入参：模板 1032（first=18，next=4），新疆，weight=3.2，vip=false，cod=false；`region("新疆")` 是西北大区，surcharge=3。
