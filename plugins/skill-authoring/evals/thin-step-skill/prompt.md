---
description: 一条薄的、自动调用的 skill 的机会 issue：应判为不改路由＋自动调用，计划里用例与基线在正文之前
tags: [decision, smoke]
max_turns: 15
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write]
---

按 `skill-authoring` 走。下面是 desk 仓的一条机会 issue。这个会话里不用建文件：把该判的判了，说清走多长的路线、frontmatter 怎么写、动笔写正文之前要先做哪几件事、按什么顺序，然后说下一步。

## 这是什么

主人定：Superpowers 在 Windows 全部关闭后，改动路线第 7 段「收尾」这一格空了。要自建一条 skill，名字暂定 `wrap-up`，只做三件事：写停靠记录（固定四栏：做成了、停在、下一步、等你）、开 PR（正文四节：做了什么、为什么、怎么验证的、怎么回退）、把挂起物登记进 issue。不做本地 merge，不 push。

三行结论：
1｜真正的问题：收尾这一格有规则没载体，每次都靠 agent 现想，四栏和四节经常漏一栏。
2｜值不值得解：值得，每条改动都要过这一格。
3｜往哪个方向解：自建一条薄 skill，装进 daily manifest；由流程 skill 在第 7 段点名，agent 自己跑。
