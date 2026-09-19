---
name: ears
description: >-
  把一条已收口的需求写成可验证的句子时用：EARS 五种句式，一句只装一条规则，名词只用原话与词汇表里的，出手前过 ISO 29148 的四条属性。Write requirements in EARS (Easy Approach to Requirements Syntax): one rule per sentence in one of five patterns, nouns from the original words and the glossary only, checked against four ISO 29148 attributes.
---

# EARS 需求句式

出处：EARS（Easy Approach to Requirements Syntax），Mavin、Wilkinson、Harwood、Novak 2009（Rolls-Royce）；检查用的属性出自 ISO/IEC/IEEE 29148。本仓里由 `requirement-specification` 点名；句子配例子归 `specification-by-example`。用词按 `plugins/CONTEXT.md`。

## 什么时候用

用：要把一条已收口的需求写成「系统应…」的句子，或检查一组现成的需求句。

不用：问「EARS 有几种句式」——直接答；句子要写的是「怎么实现」——EARS 只写系统可观察的行为，实现归设计。

## 步骤

1. 一条规则一句，选五种句式之一（形状与一对输入输出见 [references/patterns.md](./references/patterns.md)）：
   - 普适（ubiquitous）：系统应 <行为>。
   - 事件驱动（event-driven）：当 <触发> 时，系统应 <行为>。
   - 状态驱动（state-driven）：在 <状态> 期间，系统应 <行为>。
   - 非期望行为（unwanted behaviour）：若 <条件>，则系统应 <行为>。
   - 可选特性（optional feature）：若配置了 <特性>，系统应 <行为>。
   两种以上合在一句里是复合句（complex）；先试拆成两句，拆不开再复合。完成判据：每句只有一个「系统应」，能说出它是哪种句式。
2. 名词只用原话与项目的领域词汇表（`domain-modeling` 维护的那份 `CONTEXT.md`）里的。原话与词汇表都没有的词，先补词条再写句。类名、表名、字段名、接口名是实现，写成它们指代的领域对象。完成判据：每个名词能指到原话或一条词条。
3. 出手前过 29148 最常破的四条属性：可验证（verifiable；能配一条例子；「快」「合理」这类量词换成可测的量，定不了就把这句退回主人要那个数）、单一（singular；一句一件事）、无歧义（unambiguous；名词都有出处）、必要（necessary；删掉这句会有人做错决定）。破一条改一句。完成判据：每句四条都过，或那句被退回并写明缺什么。

## 产出

一组带句式标签的需求句；退回的句子各带一句「缺什么」。

## 为什么在哪

- desk#152（方案对齐）、agent-system#115（spec）、agent-system#119（拆分）。
- 旧正文 `plugins/workcoding/skills/requirement-translation`（归档进度见 agent-system#123）。
