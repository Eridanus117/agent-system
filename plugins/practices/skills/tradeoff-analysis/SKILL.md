---
name: tradeoff-analysis
description: >-
  一件事有两条以上做法要选时用：出至少两个能落地的候选，每个各写支持、反对、最大风险、可逆性，说出什么证据会推翻推荐，暂定推荐交主人定。Trade-off analysis of design candidates: at least two buildable options, each argued for and against with its biggest risk and reversibility, a tentative recommendation and what would overturn it; the owner decides.
---

# 权衡分析（tradeoff-analysis）

权衡分析（trade-off analysis）出自 SEI 的 ATAM（Clements、Kazman、Klein《Evaluating Software Architectures》），这里只取它的核心动作——候选、两面、风险，一个人一轮做完，不开评审会。可逆性（reversibility）按 Amazon 的单向门／双向门说（one-way door / two-way door，Bezos 2015 年股东信）：上线后改回去要付多大代价。用词按 `plugins/CONTEXT.md`。

## 什么时候用

用：一件事有两条以上做法要选——配置怎么承载、逻辑放哪、用哪个库；`architecture-decision` 点名；主人说「比一下方案」「摆几个候选」。

不用：主人已经定了（「就 C，别再比」），做被要求的事，不重开候选；主人拿一个方案来盘、要问到没有一处被默默假设，那是 `grilling`；候选之间的差落在一个还没有的数上，先 `impact-analysis` 或 `baseline-measurement` 把数拿到再比。

## 步骤

1. 写清在选什么。一句话：决定的对象、边界、谁受影响。旧代码里的取值、旧表、尝试分支只算证据；候选要从决定出发，一个都不因为「已经写了」而当前提。完成判据：能一句话说出决定对象，且没有一个候选是因为已存在而被预设。
2. 出候选，至少两个能落地的。每个写清接口、模型、存储、迁移各碰什么，失败后果是什么。候选之间要有真实取舍，任意两个之间能指出一处互不兼得；凑不出第二个就说只有一条路，不用本实践，也不用「方案 A／方案 B」凑数。完成判据：任意两个候选之间能指出一处互不兼得的地方。
3. 每个候选各写四样：支持、反对、最大风险、可逆性。推荐的那个也写反对与风险，只给落选者写反对不算做完。缺一个数才能比时，标「未知」并写清谁去量（`impact-analysis`、`baseline-measurement`）；不用一个像样的数字盖住未知。完成判据：每个候选四样齐，没有一个数字是估的。
4. 暂定推荐加推翻条件。写推荐哪个、放弃了哪些、什么事实一出现推荐就翻。完成判据：能指出一条会推翻推荐的证据。
5. 交主人定。推荐不是授权：收口只留一件事请主人确认；主人说行之前不改代码、不扩字段、不建表、不把草案写成正式规范，实现等确认。完成判据：回复结尾只有一个问句；回复里没有代码、DDL、迁移脚本。

## 产出

候选与两面的对照，写在对话或那件事的记录里（ADR、spec issue 评论）；形状与一个例子见 [candidates.md](./references/candidates.md)。

## 为什么在哪

- desk#152、agent-system#115（实践与规程分层）、agent-system#120（从旧 `architecture-design` 的「出候选」「做攻防」两段拆出；旧正文的决策卡回显与多卡格式、TUI 与文件双通道一节有意不搬）。
- 为什么不做全套 ATAM：wiki《架构设计》的备选与不选。
