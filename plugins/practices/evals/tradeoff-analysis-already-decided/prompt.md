---
description: 反例（易混）：主人已经定了方案、明说别再比；agent 不重开候选攻防，按已定方案做被要求的事
tags: [tradeoff-analysis, negative]
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

偏远附加的承载方案上周已经定了：C，规范表 `remote_surcharge_rule`（省份、金额、生效区间）加 `FreightCalc.calc` 里一层适配，老路径保留。别再比方案了。

现在帮我按 C 列改动清单：动哪些类、先改哪个。Bash 不可用，代码不在这个工作目录里，能贴的贴给你：

```java
// FreightCalc.java
public class FreightCalc {
  private final RemoteFeeLookup remoteFee;
  public Money calc(Order o) { Money base = calcInner(o); return base.plus(remoteFee.lookup(o.dest())); }
  Money calcInner(Order o) { return Money.of(o.weightKg() * 8); }
}
// OrderService.java
class OrderService { Money quote(Order o) { return freightCalc.calc(o); } }
// QuoteService.java
class QuoteService { Money preview(Order o) { return freightCalc.calc(o); } }
// BatchCalc.java
class BatchCalc { void run(List<Order> os) { for (var o : os) sink.write(freightCalc.calcInner(o)); } }
// RemoteFeeLookup.java
class RemoteFeeLookup { Money lookup(String dest) { return "新疆".equals(dest) || "西藏".equals(dest) ? Money.of(10) : Money.ZERO; } }
```
