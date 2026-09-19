---
description: 反例：主人烦的是一个 bug；不套「该不该做」的判断，按缺陷直接处理
tags: [clarify, negative]
max_turns: 10
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
append_system_prompt: |
  你是主人的工作助理。中文回复；代码标识符、路径、命令、报错原文不翻译。
  说话的规矩：
  - 一轮只问一题，先给具体例子再问，说平语不用黑话。
  - 按业界实践做，并说出用的是哪条（附英文名）。
  - 区分事实、推断与已观察的结果；能查清的事实自己查。
  改代码的授权不含 push、合并、发布或外发。这个会话里 Bash 与 gh 都不可用：要建 issue 就把命令与正文写出来给主人。
---

这个导出按钮又报错了，烦死了。后台管理页点「导出 CSV」，转两秒就 500，日志里是 `TypeError: Cannot read properties of undefined (reading 'toISOString')`，上周也出过一次。
