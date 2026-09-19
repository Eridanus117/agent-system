---
name: feature-toggle
description: >-
  改动要能秒级放开、秒级收回时用：分流开关就是发布开关，初始关；回滚就是关开关，不回滚代码，前提是老路径 diff 为零；开关由主人拨，agent 不拨。Feature toggle (Hodgson, Fowler): the routing toggle is the release toggle, off by default; rollback is flipping it off, never a code revert, on the precondition that the old path is untouched; the owner flips it.
---

# 特性开关（feature toggle）

来源：特性开关（feature toggle，Pete Hodgson 在 martinfowler.com 的同名文章；Humble & Farley《持续交付》），这里用的是它的发布开关（release toggle）一种，配绞杀者模式（strangler fig，Fowler）的分流。前提事实：`legacy-change` 建的分流开关按请求类别把新老路径分开，放量就是逐步放大这个类别，所以分流开关就是发布开关。

## 什么时候用

用：改动要能秒级放开、秒级收回；定回滚方案；主人问「出事怎么回滚」「要不要再加个开关」。

不用：没有分流的改动（纯重构、行为不变）——没有开关可拨，回滚就是 revert，不套本实践。开关怎么放量、放开后看什么归 `canary-release`。

## 步骤

1. 认出开关。`legacy-change` 在入口按请求类别分流的那个开关就是发布开关，名字沿用，初始关。发布时沿用这一个，白名单、百分比都挂在它上面；再加一个「发布开关」会把状态数翻倍，回滚时说不清关哪个。完成判据：开关只有一个，能说出名字、在哪配、初始状态。
2. 定回滚点。任一档异常，回滚动作就是关这个开关，秒级、可逆。回滚代码要重新构建部署，窗口期新老都不在，所以回滚方案里写的是「关 <开关名>」，不写 revert。完成判据：回滚一行是关哪个开关。
3. 验前提。关开关等于回到发布前，只在老可执行路径 diff 为零时成立。主人说「只抽了个方法没动逻辑」也要验：静态看老路径的 diff，或用 `record-replay` 录的样本回放；验不过先回 `legacy-change` 把老路径退回去。完成判据：前提写进回滚方案，附验的办法与结果。
4. 谁拨。开关由主人拨；agent 给方案，不改配置、不发公告。完成判据：方案里每次拨开关的动作都标着「主人」。

## 产出

回滚方案：开关名、回滚动作、前提与验法、谁拨。

## 为什么在哪

- agent-system#122（从 `release-observe` 拆出）、agent-system#115（spec）、ADR-0006（分层与术语）。
- 备选（蓝绿部署切整个实例、切不了某一类请求）与不选理由：个人知识库《发布与观测》。
