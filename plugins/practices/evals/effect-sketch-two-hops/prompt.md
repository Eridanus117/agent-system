---
description: 正例：从改动点静态画两跳；agent 列出调它的与它调的各一跳，从贴的代码里认出 BatchCalc 绕过 calc 直调 calcInner，没贴代码的 scheduler 标成拿不准的边，不扩成全图
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

按 `effect-sketch` 从改动点画影响草图。改动点：在 `FreightCalc.calc` 里加偏远附加的分流。Bash 不可用，仓库不在这个工作目录里，能贴的五个文件贴给你；README 里写着「定时对账任务在 `scheduler` 模块，每晚重算一遍运费」，那个模块的代码我手头没有。

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
