---
description: 正例：草图画完要定在工作机上核实什么；agent 只为静态定不了的边（没贴代码的 scheduler）开运行时核实，静态看得见的边不再抓
tags: [effect-sketch, positive]
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

按 `effect-sketch` 画影响草图，然后告诉我要在工作机上核实什么、怎么核实。改动点：在 `FreightCalc.calc` 里加偏远附加的分流。

工作机上装了 Arthas，预发环境可以重放线上请求，定时任务也能手动触发一次。本会话跑不了任何命令，代码不在这个工作目录里；能贴的五个文件贴给你，README 里写着「定时对账任务在 `scheduler` 模块，每晚重算一遍运费」，那个模块的代码我手头没有。

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
