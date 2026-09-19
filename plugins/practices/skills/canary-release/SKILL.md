---
name: canary-release
description: >-
  改动要放出去时用：三档放量（内部账号或测试模板 → 分流类别的一小部分 → 全量），每档写清放谁、停多久，进下一档由主人定；每条需求句配一个观测点，老路径看四个黄金信号（延迟、流量、错误、饱和）；档 1 放开后拿需求例子打一条冒烟。Canary release with Google SRE's four golden signals: three tiers each with who and how long, one observation point per requirement sentence, the owner decides each tier, smoke-test tier 1 with a requirement example.
---

# 金丝雀发布（canary release）

来源：金丝雀发布（canary release，Humble & Farley《持续交付》；Fowler bliki 的 CanaryRelease）——先放一小部分流量到新路径、看指标、再放大；观测按 Google《Site Reliability Engineering》的四个黄金信号（four golden signals）：延迟、流量、错误、饱和；档 1 后的演示是冒烟测试（smoke test），也是 ISO/IEC/IEEE 12207 移交过程要求的「能力已在运行环境演示」。放大拨的是 `feature-toggle` 认出的那一个开关。

## 什么时候用

用：改动要放出去，开关已按 `feature-toggle` 定好；主人问「怎么灰度」「放多少」「放出去看什么」。

不用：没有开关、行为不变的改动，跟例行发版走，不放量。SLO、错误预算、告警体系的设计——单个改动的灰度期用四个信号够，长期形态另立事项。

## 步骤

1. 定三档（tier；金丝雀发布通行的分档说法）。档 1 只放内部账号或测试模板；档 2 放分流类别的一小部分（白名单或百分比）；档 3 全量。每档写「放谁」「停多久」。开关系统只能开／关（进程级环境变量、配置项）时，如实写成两档：关 → 开一次验证 → 开，并说明为什么退化，不假装有百分比。完成判据：每档一行放谁、停多久，或写明退化为开／关与原因。
2. 定观测点。需求翻译的每条句子配一个：新路径命中数、抽样结果与例子一致、新路径异常数；老路径看四个黄金信号不变，落到手边有的指标上（p99 延迟、QPS、错误率、线程池或内存占用）。写不出观测点的句子先回需求补例子，补了再放。完成判据：一句一观测，老路径四个信号各对上一个指标。
3. 定冒烟。档 1 放开后，用需求翻译的例子在线上打一条，与期望输出比对。完成判据：冒烟写了用哪条例子、期望什么。
4. 每档由主人定。放开、停多久后看、进下一档，都等主人说；方案末尾只留一件事——请主人定档 1 放谁。agent 不拨开关、不改比例、不发公告。主人否了哪一档或哪个观测点，原话记在那一行下面，不覆盖。完成判据：方案里没有「指标正常即自动进下一档」这类句子，结尾只问一题，被否的行下面留着原话。
5. 留。放量顺序、回滚点（`feature-toggle`）、观测点进 PR 或工单，每档的观测结果跟着记。发布后日常盯日志与告警，发现问题转成一个维护改动重新进 `flow`。完成判据：方案与每档结果能在 PR 或工单里找到。

例子见 [references/release-plan.md](./references/release-plan.md)。

## 产出

发布方案：三档、观测点、冒烟；每档结果。

## 为什么在哪

- agent-system#122（从 `release-observe` 拆出）、agent-system#115（spec）、ADR-0006（分层与术语）。
- 备选（蓝绿部署、SLO 与错误预算）与不选理由：个人知识库《发布与观测》。
