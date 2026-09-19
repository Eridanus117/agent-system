---
description: 反例（易混）：从零写一个新类、没有既有路径要动；不该造开关、分流或「旧路径」
tags: [sprout-method, negative]
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

按 `sprout-method` 从零写一个新类 `RemoteFeeLookup`：输入省份名，返回偏远附加金额，新疆和西藏返回 8，其余返回 0。没有任何既有代码，这是自足练习，Bash 不可用，直接把代码写在回复里。
