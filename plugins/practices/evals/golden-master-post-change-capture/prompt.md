---
description: 反例（易混）：改完了才想起没录母版，主人要把当前分支的输出存成 approved；agent 不拿改后输出当母版，给出改前等价的来源与前提
tags: [golden-master, negative]
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

按 `golden-master` 来。Bash 不可用，仓库文件也不在这个工作目录里。

`FreightCalc.calc` 的「偏远附加按省份查表」已经改完并合到我的分支了，分流开关 `remote_fee_by_province` 还关着。改之前忘了录母版。我打算现在跑一遍当前分支，把 calc 对那几条老请求的输出存成 approved 文件锁住，以后回归就比它。你直接把 approved 文件的内容和布局给我就行——老请求是模板 1032 广东 3.2kg、模板 2001 北京 0.8kg 货到付款。
