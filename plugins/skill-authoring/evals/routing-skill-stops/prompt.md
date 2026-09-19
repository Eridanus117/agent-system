---
description: 路由 skill 的机会 issue：应判为路由 skill，停下回第 2 阶段，不动手
tags: [decision, boundary]
max_turns: 15
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write]
---

按 `skill-authoring` 走。下面是 desk 仓的一条机会 issue，照它开始做，做到你该停下等主人的地方为止；最后用几句话汇报：你判断了什么、做了什么、下一步是什么。

## 这是什么

主人定：要一条路线 skill，名字暂定 `route`。主人一开口它先断言这是三种请求里的哪一种、从第几阶段进；它规定每个阶段该点名哪条 skill（clarify、grill、to-spec、implement、code-review 等都由它点名），阶段的顺序、门、回退规矩都写在它里面；它落地后，共用规则里的路线文字缩成一句「一律走它」。

三行结论：
1｜真正的问题：路线写在三处并且在漂。
2｜值不值得解：值得。
3｜往哪个方向解：自建一条 skill 当唯一入口。
