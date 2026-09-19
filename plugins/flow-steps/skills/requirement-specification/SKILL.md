---
name: requirement-specification
description: >-
  改旧代码时需求不清才开的活动，第 4 阶段门上定：三行加一句被主人否过之后，把需求翻成可验证的句子——大的先按用例拆，每条规则一句 EARS，每句配一条例子，主人逐句否，例子变测试。Requirement specification as a stage-4 activity: split by use case, one EARS sentence per rule, one example per sentence, the owner vetoes line by line, the examples become the tests.
---

# 需求规约

改旧代码时才开的活动之一，开不开在第 4 阶段的门上定（`flow`）。需求规约（requirements specification；出处：ISO/IEC/IEEE 29148）。做法在实践里：句式归 `ears`，例子归 `specification-by-example`；这里只写这一步做什么、点名哪些实践、完成判据。用词按 `plugins/CONTEXT.md`。决定：desk#152、agent-system#115、agent-system#119。

## 什么时候用

用：门上主人定了开它，且三行加一句已被主人否过（`requirement-elicitation` 的定稿）。

不用：三行加一句还没有——先 `requirement-elicitation`；例子已变成测试并通过——进第 5 阶段的实现；直接的改代码指令——按票做，不翻需求。

## 步骤

1. 核对收口：主人说过「否过了」「定稿」，或给了真正的问题与验收判据，就算收口（少一行照走，不为它停）。手上只有一句「解」、问题与判据都没有，就是没收口：停下，说明先做 `requirement-elicitation`、把要问提出方的那三题备好，主人说「直接给句子」也一样，代替照给一份规约。完成判据：收口了就往下走，没收口就停下并备好三题。
2. 抄原话，加谁提的、谁验收。完成判据：原话一字不改，提与验都在。
3. 判拆不拆：一个使用者、一个目标、一次坐下来能完成，是一个用户目标层用例（user-goal level use case；出处：Cockburn《编写有效用例》），不拆；多个目标或多个使用者，先拆成用例，每个标使用者与目标。规则密集的补一张决策表（decision table；出处：同书的业务规则表，条件对结果一行一条）。完成判据：写了拆不拆和依据。
4. 每条规则一句：按 `ears` 写，名词只用原话与词汇表里的。完成判据：一句一件事，没有类名、表名、字段名。
5. 每句配一条例子：按 `specification-by-example` 写真实入参加期望输出；推不出的是规则或常量时写「缺一个数」交主人，那句照写、空的只是那个数。完成判据：没有一句没例子或没写明缺什么，例子里没有编的规则。
6. 1 到 5 一次给主人，请逐句否，并告诉主人：被否的句子留着，纠偏写在它下面。主人否完之前只有这份清单：不写测试、不写文件、不走读代码。完成判据：交出去的是句子清单与例子，末尾有「逐句否」与「被否的留着」两句。
7. 主人否过之后：句子与例子进 spec issue 或 PR 正文；例子原样变成测试（`tdd` 的第一批），测试名就是那句需求，全过即自测验收。完成判据：每条例子能指到一条测试。
