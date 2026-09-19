---
name: baseline-measurement
description: >-
  一个决定缺一个运行时的数（慢多少、占多大比例、多久跑完）时用：先在同样条件下量老路径当基线，再量新路径，只量决定要的那一个数，判定规则挂在数上，没量到就留空给主人跑。Baseline measurement for one decision: measure the old path first under the same conditions, then the new one, only the number the decision needs; the rule is tied to the number and no value is invented.
---

# 基线测量（baseline-measurement）

基线测量（baseline measurement）出自性能工程的基线统计（Gregg《性能之巅》的 baseline statistics）与 ISO/IEC/IEEE 12207 的测量过程（6.3.7）：先量现状，再量改动，同条件比。用词按 `plugins/CONTEXT.md`；评测那节的「基线」是另一回事。

## 什么时候用

用：一个决定缺一个运行时的数——新路径比老路径慢多少、分流条件在真实流量里占多大比例、批处理多久跑完；`impact-analysis`、`release-observe` 这类活动点名；主人说「量一下」「慢多少」。

不用：要的是压测方案（并发多少、跑多久、看哪些指标），那是性能测试（12207 验证过程里的一种），按压测的做法给；要的是静态的数（几个调用方），那是 `effect-sketch`；写不出「这个数进哪个决定」，说明不需要它，不量；先回去把决定写出来，决定有了数才有用。

## 步骤

1. 把数挂到决定上。一行：量什么、进哪个决定、判定规则（超过多少就怎样）。完成判据：判定规则里有数与动作。
2. 定条件。同一条真实请求（或同一份输入）、同一个环境、同一个工具与指标，老路径新路径都用；有预热就都预热，抓几条就都抓几条。完成判据：能说出老路径与新路径的测量哪几样相同。
3. 先量老路径当基线。用手头最轻的工具——JVM 上 Arthas `trace`／`monitor`，别的运行时用它自带的追踪器或日志时间戳——抓几条真实请求，记下数。完成判据：基线有数、有命令、有请求样本。
4. 再量新路径。同条件同工具，切开关或换分支，抓同样多的请求。完成判据：两边的数并排，能算差。
5. 出数进决定。按第 1 步的规则给判定。本会话跑不了（没工具、看不到系统）就把命令按顺序写给主人，数留空写「待主人跑」；估的数不顶上，判定写成「数回来后按规则定」。完成判据：判定要么带着量到的数，要么写明待跑；没有一个数是估的。

## 产出

一对数（老、新）与判定，进那个决定的记录；跑不了时是给主人的命令清单。形状与例子见 [measure.md](./references/measure.md)。

## 为什么在哪

- desk#152、agent-system#115（实践与规程分层）、agent-system#120（从旧 `system-analysis` 的「抓运行证据」里量数那半拆出）。
- 为什么不压测：wiki《系统分析》的备选与不选。
