---
name: grilling
description: >-
  主人拿一个计划、决定或想法来要压力测试时用：把决定画成一棵树，按前提顺序一轮一题地问到没有一处被默默假设；事实自己查，决定归主人。Grill the user about a plan, decision or idea: walk the design tree one question per round with a recommendation attached, until nothing is silently assumed.
---

# 盘方案（grilling）

来源：Matt Pocock 的 `grilling`（github.com/mattpocock/skills，revision 6acc160，MIT，许可全文见 `plugins/practices/LICENSE-mattpocock`），按 ADR-0007 复制入库改写。与原版的差别（都来自本工作区常驻规则）：原版一轮把前沿上的题一起问，这里改成一轮一题；每题先给具体例子、选项面列全（含「不做／用现成的」）；收口时把已定决定列一遍请主人确认。用词按 `plugins/CONTEXT.md`。

## 什么时候用

用：主人拿一个计划、决定或想法来要盘（「盘一下」「压力测试一下」「grill」），或规程在方案对齐阶段点名；`grill-with-docs`、`grill-me` 这类 skill 内含本实践。

不用：主人要的是答案或事实，查了答；主人已经说「定了，就这么做」，进实现；要把一个念头翻成该不该做的三行结论，那是 `clarify`。

## 步骤

1. 画树。把方案里的决定列出来，每个决定下面挂着依赖它的决定。前提都已定、现在就能问的那些题叫前沿（frontier；出处：Russell & Norvig《人工智能：一种现代方法》的图搜索）。完成判据：能说出哪些决定已定、哪些在前沿、哪些还被挡着。
2. 事实自己查。前沿里某题要的是环境里的事实（文件、代码、工具输出），自己去查，能派子代理就派子代理并行查；主人贴来的材料先读完再问。查着的那题先不问，问前沿里别的。完成判据：问出去的每一题都是决定，不是自己能查到的事实。
3. 一轮一题。从前沿挑一题：先给一个具体例子说清这题为什么现在要定，再给自己的推荐答案和理由，选项面列全（含「不做／用现成的」），然后停下等主人。形状见 [question-format.md](./references/question-format.md)。完成判据：这一轮只有一个问号、带推荐，没有动手做任何设计或实现。
4. 主人答一题，树就变一次。定了的决定推着前沿往外走，解锁下面的题；答案依赖本轮还没定的题的，留到后面的轮。回到第 3 步。完成判据：不再问已定的题，不问被挡着的题。
5. 前沿空了就收口：每个分支都走到了，没有一处被默默假设。把已定的决定列一遍，请主人确认达成共识；主人确认之前不据此动手。完成判据：主人说了「对」，或指出哪条不对，回到第 4 步。

## 产出

对话里一轮一题的问答；收口时一份已定决定的清单。词汇与 ADR 落盘归 `domain-modeling`。

## 为什么在哪

- ADR-0007（复制入库）、ADR-0006（术语与分层）、desk#152。
- 原版正文：`vendor/mattpocock/skills/grilling/SKILL.md`。
