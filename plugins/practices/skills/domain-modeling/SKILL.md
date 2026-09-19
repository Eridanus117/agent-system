---
name: domain-modeling
description: >-
  设计途中要敲定领域术语、建或改统一语言、记一条架构决定时用：对着词汇表挑战用词，用具体场景逼清边界，和代码对照，词一定下就写进 CONTEXT.md，只在难回头的取舍上提 ADR。Build and sharpen a project domain model: challenge terms against the glossary, write CONTEXT.md the moment a term settles, offer an ADR only for hard-to-reverse trade-offs.
---

# 领域建模（domain-modeling）

来源：Matt Pocock 的 `domain-modeling`（github.com/mattpocock/skills，revision 6acc160，MIT，许可全文见 `plugins/practices/LICENSE-mattpocock`），按 ADR-0007 复制入库改写。与原版的差别：`CONTEXT.md` 与 ADR 的格式先按仓里既有的约定（本仓词条带英文原词与出处、ADR 用 MADR），没有才用 `references/` 里原版的默认；查词汇表时连带看 `docs/adr/`；普通实现决定进 issue 或 PR，不进词汇表。用词按 `plugins/CONTEXT.md`；统一语言（ubiquitous language）与限界上下文（bounded context）出自 Evans《领域驱动设计》。

## 什么时候用

用：设计途中主人用了新词、用词和词汇表打架、要定一个概念的边界，或一条难回头的决定要记下来；`grill-with-docs`、`improve-codebase-architecture` 这类 skill 内含本实践。这是在**改**模型。

不用：只是读 `CONTEXT.md` 查一个词的意思，答就是了，任何 skill 都能做这一行，不进本实践的步骤；只是记一次普通实现决定，那进 issue 或 PR，不进词汇表也不写 ADR。

## 步骤

1. 找到词汇表。仓根有 `CONTEXT-MAP.md` 就按它找本话题所属 context 的 `CONTEXT.md`；只有仓根 `CONTEXT.md` 就是单 context；都没有就先不建，第一个词敲定时再建。同时看 `docs/adr/` 里和这块相关的 ADR。完成判据：知道这个话题的词汇表在哪、现有哪些词。
2. 对着词汇表挑战用词。主人的用词和词汇表已有定义冲突，当场指出，一题问清哪个算数：「词汇表里『取消』是撤回整张订单，你说的是去掉一件商品，是哪个？」用词含糊或一词多义，提一个精确的规范词：「你说『账号』，是指客户还是用户？这是两回事。」完成判据：冲突没有被默默接受，主人定了哪个算数。
3. 用具体场景逼清边界。讨论概念之间的关系时，编几个探边界的场景逼主人把边界说准：「发货前撤回一个行项，已经开了发票怎么办？」完成判据：每个新词都能回答至少一个边界场景。
4. 和代码对照。主人说某处怎么运作，去查代码是不是这样；矛盾就摆出来：「代码里取消的是整张订单，你刚说可以只撤一件，以哪个为准？」完成判据：主人的说法和代码的说法要么一致，要么矛盾已摆明并由主人裁。
5. 词一定下就写进 `CONTEXT.md`，当场写，不攒。格式按仓里既有的；没有就按 [context-format.md](./references/context-format.md)。`CONTEXT.md` 只收概念定义：表、列、函数名、spec、草稿都不进去。完成判据：新词条是一两句定义加 `_Avoid_`，里面没有实现细节，旧词条原样在。
6. 三条都成立才提 ADR：难回头、不看背景会奇怪、真有取舍。缺一条就不提。写法按仓里既有的 ADR 约定；没有就按 [adr-format.md](./references/adr-format.md)。完成判据：提出的每份 ADR 能逐条对上三条；容易回头的命名决定没有 ADR。

## 产出

更新过的 `CONTEXT.md`（或 `CONTEXT-MAP.md`）；够格时一份 ADR。

## 为什么在哪

- ADR-0007（复制入库）、ADR-0006（术语与分层）、desk#152。
- 原版正文：`vendor/mattpocock/skills/domain-modeling/`。
