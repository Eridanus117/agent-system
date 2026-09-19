---
name: specification-by-example
description: >-
  给需求句配例子、让例子变测试时用：每句一条真实入参加期望输出，边界两侧各一条，推不出的数交回主人，举不出例子的句子退回去；主人否过之后例子原样变成测试。Specification by Example: one concrete input and expected output per requirement sentence, both sides of every boundary, unknown numbers handed back, not invented; vetoed examples become the tests.
---

# 实例化需求（Specification by Example）

出处：Gojko Adzic《Specification by Example》（2011）；BDD 里同一件事叫「用例子说明」（Dan North）。一句话：没有例子的句子不算需求句，举不出例子说明这句还没想清。本仓里由 `requirement-specification` 点名；句子怎么写归 `ears`，例子变测试归 `tdd`。用词按 `plugins/CONTEXT.md`。

## 什么时候用

用：有一组需求句要配例子；主人否过的例子要变成测试；一句需求看不出对不对，用例子核对。

不用：手上只有一句「解」、还没有需求句——先 `requirement-elicitation`；例子已经变成测试并通过——那是验证阶段的事，归 `verify-evidence`。

## 步骤

1. 每句至少一条关键例子（key example；出处同上）：具体入参加期望输出，用真实数据（真实的模板号、省份、重量），代替 X、N、某省。入参自己挑（会员等级、金额、配置进去的附加金额都是入参）；期望输出只从句子、词汇表或主人给的事实推；推不出来的是规则或常量（默认附加是多少、叠加还是替代）时写「缺一个数：…」交回主人。完成判据：每句下面有例子，例子里没有编出来的规则。
2. 边界两侧各一条：句子里的条件有边界（在表中／不在表中、等于门槛、未配置）就两侧各配一条。完成判据：每个条件的两侧都有例子。
3. 举不出例子的句子退回：那句照写、空的只是那个数，下面只写缺什么（一个数、一个决定）加一行「有了数，例：…」的骨架，回 `ears` 改句或交主人定，代替把整句换成一条「缺一个数」的备注，或先摆一张填着猜测入参（猜的省份名单、猜的基础运费）的例子表。完成判据：没有一句停在「例子待补」，退回的句子下面没有整张猜出来的表。
4. 精炼（refine；出处同上）：删掉不改变结论的细节，剩下的每个值都在决定结果。完成判据：改动例子里任一值，期望输出会变。
5. 主人否过之后，例子原样变成测试（`tdd` 的第一批测试就是它们），测试名就是那句需求；全过即自测验收（确认，validation；出处：ISO/IEC/IEEE 12207）。完成判据：每条例子能指到一条测试，测试的期望值是例子里的字面值。

## 产出

每句需求下面的例子；一对输入输出见 [references/example.md](./references/example.md)。

## 为什么在哪

- desk#152（方案对齐）、agent-system#115（spec）、agent-system#119（拆分）。
- 旧正文 `requirement-translation` 已归档在 `_archive/plugins/workcoding/skills/requirement-translation`（agent-system#123）。
