---
description: 正例：带数据变更的接入；先扩后缩、每步可单独退、联调跑一条新例子加一条老路径且共库只读、主人否过之前不合分支不动表
tags: [incremental-integration, positive]
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

边界清单已经否过，现在按 `incremental-integration` 排接入顺序。你看不到代码，Bash 不可用，材料都在这里。

改动：运费模板的「区域加价」从按大区改成按省份。新建 `province_surcharge` 表；老的 `region_surcharge` 表还有一个报表任务在读。调用方只有 `FreightCalc.calc` 一个。开关 `surcharge_by_province` 还没注册。代码在分支上还没合。

已经否过的例子：模板 1032 新疆 3.2kg 走 `OrderService` 全链，期望 26；老路径：模板 2001 广东 走 `BatchCalc`，期望不变，18。预发和生产共库。
