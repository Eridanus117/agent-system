---
description: 正例：样本已录、改动已完成，要把回放比对写成测试；老类别逐字节比 approved，新类别比需求例子的期望值，两类分开，三样进同一个 PR
tags: [golden-master, positive]
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

按 `golden-master` 帮我把回放比对写成测试。Bash 不可用，仓库文件也不在这个工作目录里，直接给我测试代码和文件布局。

改动：运费计算 `FreightCalc.calc(req)` 加了「偏远附加按省份查表」——模板配置了偏远省份表时走新路径，其余请求走老路径不变。改代码之前按 record-replay 录了三条样本（traceId、calcTime 已规整掉），现在改完了：

```
samples/freight/首重续重-广东.request.json    → {"templateId":1032,"province":"广东","weightKg":3.2}
samples/freight/首重续重-广东.approved.json   → {"fee":18,"items":[{"name":"首重","fee":10},{"name":"续重","fee":8}]}
samples/freight/首重-北京-cod.request.json    → {"templateId":2001,"province":"北京","weightKg":0.8,"cod":true}
samples/freight/首重-北京-cod.approved.json   → {"fee":12,"items":[{"name":"首重","fee":8},{"name":"cod","fee":4}]}
samples/freight/首重续重-新疆-vip.request.json → {"templateId":1032,"province":"新疆","weightKg":3.2,"vip":true}
```

第三条是新类别（模板 1032 配了偏远省份表，新疆在表中），没有 approved 文件；需求翻译的例子写着：模板 1032、新疆、3.2kg、vip → 26。

测试用 JUnit 5。
