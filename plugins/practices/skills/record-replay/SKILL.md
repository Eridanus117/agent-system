---
name: record-replay
description: >-
  要把真实出入参录下来当测试输入时用：先挑一批覆盖新路径每条需求句与老路径每个主要分支的样本请主人否，再在改代码之前用手边的工具（Arthas、日志）录成一请求一文件的仓内 JSON，规整掉时间戳、随机 id 这类每次都变的字段，改后原样回放。Record and replay: choose a covering sample set, record real inputs and outputs before the change into per-request files in the repo, normalise volatile fields, replay the same requests after.
---

# 录制回放（record and replay）

来源：录制回放（record and replay）是把真实流量的出入参录下来、再对被测代码回放的测试手法，工具如 GoReplay、Arthas 的 `watch` 与 `tt`、HTTP 层的 VCR 一族；配套标准 ISO/IEC/IEEE 29119 对测试记录的要求。本实践只管样本怎么挑、怎么录、录成什么样；母版怎么比归 `golden-master`。

## 什么时候用

用：要拿真实出入参当测试输入，证明老路径没变；还没改代码，或能回到改前状态。主人说「出入参采集」「录一批」「回放」。

不用：只是给一个纯函数写几条单测——直接写，归 `tdd`。拿录下来的流量做压测——那是性能回放（GoReplay 一类的用法），目标是容量不是正确性，本实践不管。

## 步骤

1. 挑样本。两处来源：需求翻译的例子（新类别）与真实流量（老类别）。覆盖判据：新路径每条需求句至少一条，老路径每个主要分支至少一条；每条样本写场景名与它覆盖的是哪条句子或哪个分支，新老分开标。例子见 [references/sample-plan.md](./references/sample-plan.md)。完成判据：一张样本清单，每行「场景名：请求要点 → 覆盖什么」，说不出覆盖谁的样本删掉。
2. 定规整规则（normalization；ApprovalTests 叫 scrubber）。列出每次运行都会变的字段（时间戳、随机 id、trace id、序号），录的时候去掉或钉死；规则写进样本目录的 README，回放时对实际输出做同样处理，approved 与 actual 走同一份规则。回放红了只差这些字段，补规则，不重录、不删测试。完成判据：规则是一份字段清单，两边共用。
3. 请主人否样本与规整规则。否过之前不录、不写测试、不改代码；一轮一题，漏了哪个分支、哪个字段直接说。主人否了哪一行，原话记在那一行下面，不覆盖。完成判据：主人说了「行」，被否的行下面留着原话。
4. 在改代码之前录。用手边的工具把每条样本的出入参原样录下：Java 服务用 Arthas `watch <类> <方法> '{params, returnObj}' -x 3`，或从请求日志抠；一请求一文件，JSON，存进仓内样本目录（`samples/<模块>/<场景名>.request.json` 与 `.approved.json`）。改完才想起没录的，按 `golden-master` 第 1 步找改前等价的来源，不用改后输出充数。完成判据：每条样本两个文件都在，录制早于第一处代码改动。
5. 回放。改完后把同一批 request 文件喂给新代码，输出交给 `golden-master` 比对。完成判据：回放跑的是录下来的 request 文件，不是手写的新请求。

## 产出

主人否过的样本清单与规整规则；仓内样本目录。

## 为什么在哪

- agent-system#122（从 `evidence-regression` 拆出）、agent-system#115（spec）、ADR-0006（分层与术语）。
- 备选（等价类、并行运行）与不选理由：个人知识库《证据回归》。
