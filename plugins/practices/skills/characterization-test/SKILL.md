---
name: characterization-test
description: >-
  给一段没有测试的旧代码锁住现状时用：拿一条真实入参沿代码走一遍，每一步写成带中文注释的断言，期望值是实际输出不是想要的输出；注释与实现的出入单独标出，拿不出证据的行写「假设」，清单摆给主人否。Characterization test: pin the current behaviour of untested legacy code with one real input, one commented assertion per step, expected values taken from what the code actually does, and hand the walkthrough to the owner for veto.
---

# 特征化测试（characterization test）

出处：Feathers《修改代码的艺术》（Working Effectively with Legacy Code，2004）第 13 章的特征化测试；把走读摆给人看那一面按 IEEE 1028 的走查（walkthrough）。它锁的是代码现在做什么，不是该做什么，期望值从实际输出来。规程 `legacy-code-change` 在第 5 阶段先点名它。

## 什么时候用

用：要改一段没有测试的旧代码，先把现状锁住；旧代码注释与实现对不上，agent 要把自己的理解摆给主人否；主人说「锁现状」「先录旧行为」「特征化测试」。

不用：要的是还没有的新行为——那是测试先行，归 `tdd`，期望值来自 spec 而不是代码；只是问「接缝是什么」「特征化测试是什么」直接答。

## 步骤

1. 拿一条真实入参。用主人给的那条请求；没有就问主人要一条真实的。完成判据：入参的每个关键字段都有值，而不是自己编的例子。
2. 沿代码走一遍，一步一行：看哪个字段、进或跳过哪个分支、数怎么变。注释与实现对不上的地方以实现为准，单独标出；中间值自己算，算不出或查不到的写「假设」。完成判据：每一步都能对着这条入参判对错，没有占位符；末尾是老代码对这条入参的实际输出。
3. 写成测试，进仓库：一个断言对应走读的一步或最终结果，每个断言带一行中文注释，注释就是那一步；期望值是实际输出。跑一次；跑不过说明走读编了，改走读，代码不动。完成判据：测试文件在，注释逐行抄出来就是走读清单；跑过，或标「未验证」并写该跑的命令。
4. 摆给主人否：把注释抄成清单（形状与例子见 [references/walkthrough.md](./references/walkthrough.md)），假设单列，这条入参没走到的分支写「本条未触发」，请主人点名哪一步不对。主人否了，原话记在那一步下面，改测试重走，旧版留着。完成判据：主人否之前生产代码一行没动；否三次还不对就停下，先把方法拆小。

## 产出

一份能跑的特征化测试是存储；走读清单是它的注释抄出来的视图，不另存。

## 为什么在哪

- agent-system#121（从 `legacy-change` 拆出的第一条实践）、ADR-0006（实践与规程分层）、desk#152。
- 走读产物「存储唯一、视图随意」的裁决（2026-09-02）与 Feathers 六步的对照在旧 `legacy-change` 正文，已归档在 `_archive/plugins/workcoding/skills/legacy-change`（agent-system#123）。
