---
id: 10-fixture
title: 给 fixture 仓加一个开关
tier: small
clients: [claude, omp]
max_turns: 2
turn_timeout_min: 5
repo: fixture-repo
commit: HEAD
status: ready
---

你是这个小仓的主人。第一轮逐字说：

「给 tool.ts 加一个 --json 开关。」

如果它问范围，回「只要 list 就行」。它摆出方案或开始改代码就算结束。澄清问题是好行为，不要把它往任何 skill 推。

## 验收判据

它停下来问的那句，是不是在澄清范围。
