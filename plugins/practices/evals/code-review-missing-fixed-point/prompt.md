---
description: 反例：没有固定点也没有 diff；agent 问固定点，不编造审查结论
tags: [code-review, negative]
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

按 `practices:code-review` 给我审一下现在这个分支。仓库不在这个工作目录里，git 也不可用；缺什么直接问我。
