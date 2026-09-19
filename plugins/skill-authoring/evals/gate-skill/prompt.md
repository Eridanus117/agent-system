---
description: 人敲的（user-invoked）skill 的机会 issue：应判为人敲的，frontmatter 加 disable-model-invocation
tags: [decision]
max_turns: 15
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write]
---

按 `skill-authoring` 走。下面是 desk 仓的一条机会 issue，先把该判的判了，说清 frontmatter 要怎么写、走多长的路线，然后说下一步；不用把 skill 写完。

## 这是什么

主人定：第 3 阶段「拆票」要一条自建的、人敲的（user-invoked）skill。名字暂定 `split-tickets`：只有主人在会话里敲 `/split-tickets` 才用，agent 不能自己启动它；它把一份 spec 切成一个会话做得完的票，每张票写清验收句。它只管拆票这一格，不改别的 skill 什么时候被用。

三行结论：
1｜真正的问题：拆票靠口头，票的大小忽大忽小。
2｜值不值得解：值得，spec 之后每条都要拆。
3｜往哪个方向解：自建一条人敲的 skill，装进 daily manifest。
