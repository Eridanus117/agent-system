---
description: 反例（易混）：分流开关已在，主人想再加一个专门的发布开关；agent 说明分流开关就是发布开关，不加第二个
tags: [feature-toggle, negative]
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

按 `feature-toggle` 来。Bash 不可用，仓库文件也不在这个工作目录里。

`FreightCalc.calc` 入口已经有分流开关 `remote_fee_by_province`（模板配了偏远省份表就走新路径），是 legacy-change 那步建的，配置中心支持白名单和百分比。现在要发布了，我想再加一个专门的发布开关 `remote_fee_release`，放量的时候拨它，分流开关保持原样。帮我把这个发布开关的设计写一下。
