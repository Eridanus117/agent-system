---
name: requirement-elicitation
description: >-
  改旧代码时需求不清才开的活动，第 4 阶段门上定：外来需求还是一句「解」、提出方只能由主人去问时用，把解翻回问题、备好问提出方的问题、查现成，收口成三行加一句可观察的验收判据。Requirement elicitation as a stage-4 activity: turn a solution-shaped request back into the problem, prepare switch-interview questions for the owner to relay, check existing capability, close into three lines plus one observable acceptance criterion.
---

# 需求获取

改旧代码时才开的活动之一，开不开在第 4 阶段的门上定（`flow`）。需求获取（requirements elicitation；出处：ISO/IEC/IEEE 29148）。做法在实践里：问过去的事归 `switch-interview`；这里只写这一步做什么、点名哪些实践、完成判据。用词按 `plugins/CONTEXT.md`。决定：desk#152、agent-system#115、agent-system#119。

## 什么时候用

用：门上主人定了开它——外来需求还是一句「解」（「要支持 X」），真正的问题、现有做法或验收判据没收口；提出方 agent 问不到，主人是中间人。

不用：念头来自主人自己、没有提出方——第 1 阶段的 `clarify`；三行加一句已被主人否过——进 `requirement-specification`；要的是一个数，不是需求——查了答。

## 步骤

1. 抄原话，判解还是问题。原话一字不改，加谁提的。是「解」就写一句断言草案「提出方真正的问题是 P，不是 X」，标「假设」。完成判据：原话与提出方在，草案是断言不是问句。
2. 备问题让主人去问提出方：按 `switch-interview` 备三个只问过去的问题（上次遇到怎么办的、现在怎么忍的、不做会怎样），主人带原话回来。完成判据：三个问题全问已经发生的事，没有一个问「你想要什么」。
3. 查现成：现有模板、配置、运营手段能不能覆盖。查到写查到的；查不到写「未查到」，代替「没有」。完成判据：这一栏是查到的东西或「未查到」。
4. 收口三行加一句：真正的问题、值不值得改（含不改的路）、往哪个方向改；第四句「解到什么样算解了」，一条能观察到的判据（哪类单不再进哪张导表这种）。答案还没回来也先按假设写满四句、标「假设」，草案是拿来被否的，代替留空等答案。1 到 4 一次给主人，然后停下等答案。完成判据：四句都写了内容、第四句能观察；主人带答案回来之前只有这份草案，没有 EARS 句、没有文件。
5. 主人带答案回来、否过之后：按 `switch-interview` 读答案、改断言；定稿进 spec issue 或票的正文，`requirement-specification` 从这里接。完成判据：定稿里每句都被主人否过或标了假设。
