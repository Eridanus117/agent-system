---
description: 反例（易混）：主人要的是压测方案（性能测试），不是给一个决定量一个数；agent 给压测方案，不缩成抓一条请求
tags: [baseline-measurement, negative]
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

帮我出一份运费计算接口的压测方案：并发多少、跑多久、看哪些指标。这是自足的练习，不对应真实系统。
