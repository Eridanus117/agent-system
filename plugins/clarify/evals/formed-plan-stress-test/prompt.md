---
description: 反例：方案已成形、主人要压力测试；归 grilling，不重判该不该做
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

备份方案我已经定了，帮我压一压有没有坑：每晚 02:00 用 restic 把 NAS 上的 /volume1/photos 备到 Backblaze B2，保留最近 30 天加每月一份，脚本已经写好在 NAS 的任务计划里，restic 的 repo 密码存在 NAS 的凭据管理器里。
