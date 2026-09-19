---
description: 反例（易混）：证据齐全的只读计数；直接给数与文件名，不套草图、不先要一个决定
tags: [effect-sketch, negative]
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

只读计数，全部证据如下：`api.ts` 和 `batch.ts` 里各有一处调用 `buildReport`，`types.ts` 只声明 `Report` 类型。`buildReport` 有几个直接调用方？直接给数量与文件名。
