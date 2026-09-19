---
name: interface-contract-checklist
description: >-
  改动要接进既有系统、先要摸清碰到哪些边界时用：列出上游调用方、下游依赖、开关、数据与别人同时在改的代码五种边界，每个写「不变」或「变了什么、谁要知道」，绕过入口的调用方单独标出，清单摆给主人否。Interface contract checklist: enumerate the five kinds of boundary a change touches and record for each whether the contract is unchanged or what changed and who must know, before anything is merged.
---

# 接口契约清单（interface contract checklist）

出处：ISO/IEC/IEEE 12207 集成过程（integration process）要求「接口已检查」；契约（contract）取 Meyer 契约式设计（Design by Contract）的意思——签名、语义、异常、幂等是一处接口对调用方的承诺。改动接进既有系统之前把碰到的每个边界列出来，每个写「不变」或「变了什么、谁要知道」。规程 `system-integration` 先点名它，再点名 `incremental-integration`。

## 什么时候用

用：改动建完要接进既有系统，还没摸清碰到哪些边界；主人说「列边界」「变没变」「谁要知道」。

不用：合分支解冲突——那是配置管理（12207 的 configuration management），就冲突块作答；排接入顺序——清单否过之后归 `incremental-integration`。

## 步骤

1. 列边界，五种逐个过：上游调用方（谁调我）、下游依赖（我调谁：表、配置、外部服务）、开关注册、数据变更、别人同时在改的代码。来源是主人给的材料、影响分析的草图、仓里的调用点；最后一种写一行「归配置管理」，不在这里决定。完成判据：五种各有一行，没有的写「无」。
2. 每个边界写变没变：没变的写「不变」；变了的写变了什么（签名、语义、异常、幂等；只增不改的扩展也算变了）和谁要知道。绕过入口直接调内部方法、不经过分流的调用方写「不变」（分流对它不生效），再单独列到「待你定」：接还是留在老路径，由主人定，agent 可以说倾向。完成判据：没有一行空着；每个「变了」后面跟着一个要通知的人或任务。
3. 摆给主人否（形状与例子见 [references/checklist.md](./references/checklist.md)）：请主人点名漏了哪个边界；被 `system-integration` 点名时，清单和 `incremental-integration` 的顺序一次出完，主人只否一次。主人否了原话记在那一行下面。「谁要知道」由主人去通知。完成判据：主人否之前没合分支、没动表、没注册开关。

## 产出

一份边界清单，进 PR 正文「做了什么」；新发现的边界进项目自己的系统地图（有的话）。

## 出口

主人否过 → `incremental-integration` 排顺序。

## 为什么在哪

- agent-system#121（从 `integration` 拆出的第一条实践）、ADR-0006、desk#152。
- 五种边界与「不变也要写出来」来自 `integration` 旧正文，到 agent-system#123 归档为止；消费者驱动契约测试（Pact）不在这里，上下游都要接工具，单人推不动。
