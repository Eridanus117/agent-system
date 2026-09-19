---
description: 正例：主人拿一个说成解的念头来；agent 把它翻回问题、用断言式草案递一题历史行为、停下，不开建也不写文件
tags: [clarify, positive]
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

按 `clarify` 走。我想给我们团队做个周报机器人：把 Slack 里各个项目频道一周的消息抓下来，用模型自动汇总成一份周报，每周五自动发到 #general。我们六个人，三个项目频道。
