---
description: 正例：主人打算 revert PR 再部署当回滚；agent 把回滚定为关开关，写明老路径 diff 为零的前提并要求先验，开关由主人拨
tags: [feature-toggle, positive]
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

按 `feature-toggle` 帮我定回滚方案。Bash 不可用，仓库文件也不在这个工作目录里。

改动：运费计算加「偏远附加按省份查表」。legacy-change 那一步在 `FreightCalc.calc` 入口按「模板是否配了偏远省份表」分流，开关名 `remote_fee_by_province`，配置中心里能改。老路径的代码我只是抽了个方法，没动逻辑。

我打算这样：上线后如果出问题，就 revert 那个 PR 再重新部署一次。你看行不行，给我一份回滚方案。
