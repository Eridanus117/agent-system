---
name: incremental-integration
description: >-
  边界清单已定、要把改动接进去时用：排一个依赖在前、每步能单独退的接入顺序，数据先扩后缩，沿真实调用链跑一条新例子加一条老路径例子，共库只读；主人否过之前不合分支、不动表。Incremental integration: order the wiring so each step is independently reversible, expand before contract, and smoke the real call chain with one new and one old example before anything is merged.
---

# 增量集成（incremental integration）

出处：McConnell《代码大全》（Code Complete）第 29 章的增量集成，对面是大爆炸集成（big-bang integration）；数据变更先扩后缩按 Fowler 的并行修改（ParallelChange，expand/contract）；联调是 ISO/IEC/IEEE 12207 集成过程里的集成测试。每一步能单独退，退不了就拆成两步。规程 `system-integration` 在边界清单否过之后点名它。

## 什么时候用

用：边界清单已被主人否过，要排接入顺序并在预发联调；主人说「什么顺序接」「先合还是先加列」「联调跑什么」。

不用：问放量放多少、回滚点、看什么指标——顺序到预发联调为止，放出去归第 8 阶段的活动；合分支解冲突——配置管理。

## 步骤

1. 排顺序，依赖在前：表与配置先扩不收（新表连同它的数据一起扩，没人读它就不算写生产）→ 开关注册且关着 → 代码合入 → 下游 → 上游 → 预发联调。数据变更先扩后缩：新旧并存一段，删旧的另起一步放在放量之后。完成判据：每步只做一件事，前一步没做后一步做不了。
2. 每步写退法，一句能执行的话：列留着不用；删注册；开关关着就是老路径。一步退不了就拆成能退的两步，合代码与打开开关永远是两步。完成判据：没有一步没有退法。
3. 定联调：在测试或预发环境沿真实调用链跑一条已否过的新例子，再跑一条老路径例子（期望不变）；预发与生产共库时只读。完成判据：两条例子各有入口、期望值和共库读写标注。
4. 摆给主人否（形状与例子见 [references/order.md](./references/order.md)）：请主人点名哪步退不了；被 `system-integration` 点名时和边界清单一次出完，主人只否一次。否过之前不合分支、不动表、不注册开关；联调由主人在预发执行或按授意做。完成判据：顺序进 PR 正文「做了什么」，联调结果进「怎么验证的」。

## 产出

接入顺序（每步带退法）；联调的两条例子与结果。

## 出口

顺序到预发联调为止；放量与回滚点归第 8 阶段。

## 为什么在哪

- agent-system#121（从 `integration` 拆出的第二条实践）、ADR-0006、desk#152。
- 「表与配置先扩不收 → 开关关着 → 合代码 → 下游 → 上游」这条顺序与「共库只读」来自旧 `integration` 正文，已归档在 `_archive/plugins/workcoding/skills/integration`（agent-system#123）。
