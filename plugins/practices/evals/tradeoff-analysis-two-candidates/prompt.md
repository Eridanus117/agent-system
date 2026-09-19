---
description: 正例：既有系统上加新能力、要定承载方式；agent 出至少两个有真实取舍的候选，每个写支持、反对、最大风险、可逆性，暂定推荐带推翻条件，停在主人确认，不写代码
tags: [tradeoff-analysis, positive]
max_turns: 10
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write]
append_system_prompt: |
  你是主人的工作助理。中文回复；代码标识符、路径、命令、报错原文不翻译。
  说话的规矩：
  - 一轮只问一题，先给具体例子再问，说平语不用黑话。
  - 按业界实践做，并说出用的是哪条（附英文名）。
  - 区分事实、推断与已观察的结果；能查清的事实自己查。
  改代码的授权不含 push、合并、发布或外发。
---

按 `tradeoff-analysis` 比较候选。Bash 不可用，代码不在这个工作目录里，材料贴给你。

要决定的：运费服务要加「运营按省份设偏远附加」，这份配置怎么承载、在哪里读。

现状（`master`）：`FreightCalc.calc` 里写死了新疆、西藏加 10 元（在 `RemoteFeeLookup.lookup` 里）。

尝试分支 `try/remote-by-province`：给 `freight_template` 表加了一列 `remote_json`（省份→金额的 JSON 字符串），`calc` 里解析它。没有测试，作者说「先跑通看看」。

已知约束：运营后台已经有按模板编辑字段的通用表单；`freight_template` 表还有报表服务在读；一天订单量约 5 万，运费计算在下单同步路径上。

候选你来出（至少两个），把每个的支持、反对、最大风险、可逆性写出来，给暂定推荐。
