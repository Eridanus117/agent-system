---
description: 反馈：应走修改路径，改前改后各跑一遍，patch 版本加一
tags: [decision, modify]
max_turns: 15
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write]
---

按 `skill-authoring` 走。主人分诊后说「改」。下面是 agent-system 仓的一条反馈 issue，说清你会怎么改、怎么验证、版本怎么动，然后说下一步；不用真的改文件。

## 反馈：wrap-up：第 3 步要本地 merge，与授权冲突

- 哪一步：`wrap-up` 第 3 步「收尾」。
- 它让做什么（原文）：「把分支本地 merge 进 main，然后删除分支。」
- 我实际做了什么、为什么：没有照做。工作区规则说改代码的授权不含 push、合并、发布，所以我开了 PR、写了停靠记录，分支留着。
- 任务现场：notes 仓，issue #12，第 7 段。
