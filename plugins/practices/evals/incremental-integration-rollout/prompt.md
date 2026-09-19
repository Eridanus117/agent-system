---
description: 反例（易混）：接入顺序已走完、问的是放量与回滚；不该重列边界与接入顺序
tags: [incremental-integration, negative]
max_turns: 8
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

偏远附加的改动已经按 `incremental-integration` 的顺序接进去、在预发联调过了，开关 `remote_fee_by_province` 现在是关的。怎么灰度？第一档放谁、放多久、出问题怎么回滚？你看不到代码，Bash 不可用。
