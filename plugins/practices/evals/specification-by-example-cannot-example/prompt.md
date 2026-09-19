---
description: 反例（易混）：句子里的「合理」没定，举不出例子；agent 把句子退回去说缺什么，不编金额
tags: [specification-by-example, negative]
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

按 `specification-by-example` 给这句配两个例子：「系统应对偏远省份收合理的偏远附加。」你看不到代码，也没有别的材料。
