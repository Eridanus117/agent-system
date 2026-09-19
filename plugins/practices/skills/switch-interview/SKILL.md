---
name: switch-interview
description: >-
  要弄清一条外来需求背后真正的问题、而提出方只能由主人去问时用：按 JTBD 的切换访谈备问题——只问过去发生过的事（上次怎么办的、现在怎么忍的、不做会怎样），答案回来后用四种力读出真正的问题。Prepare and read a Jobs-to-be-Done switch interview: ask only about what happened last time, not about wanted features; read the answers through the four forces.
---

# 切换访谈（switch interview）

出处：Jobs to be Done（JTBD）的切换访谈，Bob Moesta 与 Chris Spiek（The Re-Wired Group；Moesta《Demand-Side Sales 101》）。一句话：人被问「你想要什么」会现编，被问「上次发生了什么」能回忆；所以问题只问过去的事，答案里读的是提出方为什么想换掉现状。本仓里由 `requirement-elicitation` 点名；提出方 agent 问不到，主人是中间人——agent 备问题、收答案、下断言，问的动作主人去做。用词按 `plugins/CONTEXT.md`。

## 什么时候用

用：外来需求是一句「解」（「要支持 X」），真正的问题没收口，提出方只能由主人带问题去、带原话回。

不用：念头是主人自己的，没有第三方可问——直接和主人谈，问主人自己上次怎么做的（`clarify`）；答案已经带回、三行结论已经否过——不再重问；问「切换访谈是什么」——直接答。

## 步骤

1. 先给主人一句断言，代替问句：「提出方真正的问题是 P，不是 X」，标「假设」。主人判「这句不对」比答开放题快。完成判据：草案是一句带假设标记的断言，不是「你觉得他们要什么」。
2. 备三个问过去的问题，沿上一次「切换」的时间线问（第一次想到、被动找、主动找、决定；出处同上）：上次遇到这种情况你们怎么办的？现在怎么忍过来的？不做会怎样？问的对象是提出方，主人拿去问、把原话带回。完成判据：三个问题全问已经发生或正在发生的事，没有一个问「你想要什么功能」「你觉得该怎么做」。
3. 答案回来后用四种力（four forces；出处同上）读：推力（现状哪里痛）、拉力（新解法吸引在哪）、焦虑（换了怕什么）、习惯（不换的惯性）。推力加拉力就是真正的问题；焦虑与习惯说明「不做会怎样」是不是真的。用人工顶着的代价算推力，不算已解决：手工补的差价是还在付的钱，手工导表是还在付的时间。每种力指到答案原话里的一句，指不到的写「未提到」。完成判据：四种力各有一句原话或「未提到」，没有一句是替提出方编的。
4. 改断言：答案否了草案，在草案下面记「原写 A，裁为 B」，旧句留着。完成判据：新旧两句都在，旧句没被覆盖。

## 产出

一句断言草案、三个问题；答案回来后是四种力的读法与改过的断言。一对输入输出见 [references/example.md](./references/example.md)。

## 为什么在哪

- desk#152（方案对齐）、agent-system#115（spec）、agent-system#119（拆分）。
- 旧正文 `requirement-insight` 已归档在 `_archive/plugins/workcoding/skills/requirement-insight`（agent-system#123）。
