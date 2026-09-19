---
description: 正例：改动建完、接进去之前列边界；每个边界写不变或变了什么与谁要知道，绕过入口的调用方单独标出，同事同时在改的代码归配置管理
tags: [interface-contract-checklist, positive]
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

改动建完了，接进去之前按 `interface-contract-checklist` 给我列一遍。你看不到代码，Bash 不可用，材料都在这里。

改动：偏远附加按省份查表。新方法 `calcRemoteFee`，在 `FreightCalc.calc` 入口一处分流，开关叫 `remote_fee_by_province`（还没注册），查表读 `remote_fee` 表新加的 `province` 列，模板配置新加一个「偏远省份表」字段。

我能告诉你的：调 `calc` 的有 `OrderService`、`QuoteService`、`BatchCalc`；`BatchCalc` 直接调 `calcInner` 绕过 `calc`。`remote_fee` 表还有一个报表任务在读。同事这周也在改 `FreightCalc.java` 里 cod 那一行。
