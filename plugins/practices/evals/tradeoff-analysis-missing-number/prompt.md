---
description: 正例：两个候选的差落在一个没量过的数上；agent 把它标成未知、写清谁去量，推荐写成条件式，不编一个像样的数字盖住未知
tags: [tradeoff-analysis, positive]
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

按 `tradeoff-analysis` 比这两个候选。Bash 不可用，代码不在这个工作目录里，能贴的贴给你。

要决定的：偏远附加改成按省份查表之后，`RemoteFeeLookup.lookup` 每次算运费时怎么拿到「省份→金额」。

候选 A：每次直接查 `remote_surcharge_rule` 表（一条主键查询）。
候选 B：进程内缓存，启动时全量加载，运营改了配置后 5 分钟内生效。

已知：一天订单量约 5 万，运费计算在下单同步路径上；数据库是同机房的 MySQL；表很小（几十行）。没人量过这条查询在现在的负载下要多久，也没人量过下单路径现在的耗时。

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
