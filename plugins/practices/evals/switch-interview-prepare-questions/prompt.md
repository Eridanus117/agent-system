---
description: 正例：外来需求是一句「解」，主人下午要去问提出方；agent 给一句断言草案加三个只问过去的问题，然后停下
tags: [switch-interview, positive]
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

按 `switch-interview` 备一下。产品 A 找我说：「运费模板要支持按省份设偏远附加」。我下午要去问 A，你现在看不到我们的代码和配置，也不认识 A。给我要问 A 的问题，和你现在对这个需求的判断。
