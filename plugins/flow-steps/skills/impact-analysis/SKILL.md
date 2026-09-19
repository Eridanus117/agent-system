---
name: impact-analysis
description: >-
  常规变更改旧代码、某个决定缺一个数或判断时的活动：把数挂到决定上，假设单列，effect-sketch 画两跳，只为拿不准的边取证，baseline-measurement 量数，出一行带置信度的结论进那个决定；限时两小时。Impact analysis for one decision: tie the number to the decision, list assumptions, two-hop effect sketch, evidence only for uncertain edges, baseline measurement, one conclusion line with confidence; two-hour cap.
---

# 影响分析

改旧代码时才开的活动，在第 4 阶段的门上开（`flow`），或别的活动卡在一个数上时起一次。影响分析（impact analysis）按 IEEE 14764 软件维护的修改分析说：改之前查清改动会波及什么。用词按 `plugins/CONTEXT.md`。点名的实践（`effect-sketch`、`baseline-measurement`）在当前客户端没装时，按第 2、3 步的完成判据做完，不停下等它。

## 什么时候用

用：某个明确的决定缺一个数或一个判断——会波及哪些调用方、新路径慢多少、分流条件占多大比例；`architecture-decision`、`legacy-change` 卡在这样的缺口上。

不用：来的是需求（「这需求到底要什么」），那是第 1、2 阶段的事，按需求处理；要的是压测或整张调用图，那是性能测试与系统地图，另起；证据齐全的查数，直接答。

## 步骤

1. 写问题与假设。第一行写要回答的问题和它进哪个决定，写不出决定就不查；再单独写为回答它先假定了什么，连「所有调用都走这个入口」这种默认前提也写出来。完成判据：问题挂着决定，假设自成一行。
2. 画草图：`effect-sketch`，从改动点两跳，绕过改动点的调用方与拿不准的边都标出来。完成判据：草图里有绕过改动点的调用方（如果有）与待核实的边。
3. 取证只为拿不准的边。静态能定的边不抓；拿不准的边抓一条真实请求核实（JVM 上 Arthas `stack`／`trace`），要数的按 `baseline-measurement` 量。本会话跑不了，就把命令按顺序写给主人，结论写「待核实」。完成判据：每条证据对着一条拿不准的边，没有一条是编的。
4. 出一行结论。数或判断，加置信（高／中／低），加哪条假设没验证；到两小时就带着置信度出结论。完成判据：结论一行带置信度与未验证的假设。
5. 留。结论进那个决定的记录（ADR 背景段或 PR 正文「为什么」）；新发现的调用方与绕过进目标仓自己的文档。主人否了假设或草图，在结论上方记「原写 A，裁为 B」，不覆盖。完成判据：结论有去处。

形状与例子见 [six-lines.md](./references/six-lines.md)。

## 产出

六行：问、假设、草图、证据、结论、留。只出这六行，第二个问题另起一次；不改代码、不写方案、不画全图、不做压测。

## 出口

结论回到起它的那个决定。

## 为什么在哪

- desk#152、agent-system#115（实践与规程分层）、agent-system#120；旧 `system-analysis` 的正文归档在 agent-system#123。
- 与 ISO 12207 6.4.6、IEEE 14764 的对照，备选与不选，两小时上限：wiki《系统分析》。
