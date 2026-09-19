---
description: 正例：一个决定缺「新路径慢多少」；agent 先在同样条件下量老路径当基线再量新路径，只抓几条真实请求不做压测，判定规则挂在数上，数留给主人填
tags: [baseline-measurement, positive]
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

按 `baseline-measurement` 定测法。

决定：偏远附加改成按省份查表之后，灰度第一档要不要只放测试模板——取决于新路径比老路径慢多少，慢超过 20 ms 就只放测试模板。

系统：Java 运费服务。老路径 `FreightCalc.calc` 现在还在跑；新路径 `FreightCalc.calcV2` 已经部署到预发，同一个入口按开关 `remote.byProvince` 分流。工作机上装了 Arthas，预发上有一条线上真实请求的样本可以重放。

本会话看不到代码，也跑不了任何命令：把要主人在工作机上做的按顺序写出来，命令原样写。
