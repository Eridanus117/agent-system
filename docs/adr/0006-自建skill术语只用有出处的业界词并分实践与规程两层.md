---
status: accepted
date: 2026-09-18
decision-makers: 负责人
---

# 自建 skill 的术语只用有出处的业界词，实践与规程分两层

## 背景与问题（Context and Problem Statement）

- 自建 skill 的核心词（来往、段、门、步、停靠记录、上线待办、硬问题、焦点、领域分支）全是自造概念，`plugins/CONTEXT.md` 用一整份词汇表加 Avoid 列表定义它们；那份词汇表第 3 行写「不自造」，同一份里却有两条标「自造」（停靠记录、硬问题）。
- 八条工程规程（`plugins/workcoding`）各自把实践内联进正文。对照 Matt Pocock 的 writing-for-agents：预训练里已有的词（leading word）一个 token 就能招来模型先验，自造词要用定义句去买；实践单独成 skill、规程只组合，正文才薄。
- 自造词分布（2026-09-18 统计）：flow 62 处、skill-authoring 24、worktree-baseline 16、wrap-up 15、review-response 5、verify-evidence 3；workcoding 八条 0 处。

请负责人定的一件事：术语用什么、实践与规程分不分层。

## 决策驱动因素（Decision Drivers）

- 模型读 skill 的可靠性：有先验的词比定义出来的词稳。
- 主人读 skill 的成本：想读任何一条 skill 都遇不到要先学的私有词汇。
- 一处真源：一条实践只在一个文件里。
- 跨仓一致：常驻规则、skill、评测用同一套词。

## 考虑过的方案（Considered Options）

| 方案 | 做法 | 适用场景 | 代价 |
|---|---|---|---|
| A 保留自造词，只瘦身正文 | 词汇表不动，删沉积节 | 词汇已经稳定、模型读得可靠 | 先验问题不解决，词汇表继续膨胀 |
| B 只用有出处的业界词，实践与规程分层 | 概念必须能引用标准、书或知名项目文档；中文用通行译名附英文与出处；实践 skill 进 `plugins/practices`，薄步进 `plugins/flow-steps`，`flow` 单独 | 词汇要被三个客户端与主人共同读懂 | 一次性改名波及常驻规则与 41 份评测文件；个别概念（停靠记录）业界词不完全贴合 |
| C 只准英文原词 | 正文里术语一律英文 | 读者全是英文语境 | 中文正文难读，与「中文回复」冲突 |

## 决定结果（Decision Outcome）

选 **B**。判据：概念必须有可引用的既有名字；查不到就不起名，用平语句子。替换表见 agent-system#115 实现决定第 2 条；盲测不一致的四行（来往、步、硬问题、上线待办）经两个独立 Sonnet 会话盲测后由 agent 推荐、负责人定。

接入顺序（每步可单独退，对应 agent-system#115 的三批）：

1. 合同（本 ADR 随行的 PR，agent-system#116）：`plugins/CONTEXT.md` 改成「业界词加英文原词加出处」的词汇表，旧词以「旧名」别名保留到收口票；Avoid 里的 user-invoked／model-invoked 转正为词条名；writing-rules 的骨架、术语、禁令三条改；eval-cases 加「判行为不判形状」；`skills.test.ts` 加两条机械守卫。
2. 常驻规则（agent-config#57）：共用规则第 23、35、45、60 行的来往、焦点、领域分支换掉，第 60 行改「只用业界词」。
3. flow 与 flow-steps（agent-system#117）：五条正文与评测副本、grader 同步换词。
4. practices（agent-system#118 到 #122）：Matt 的四条实践复制入库（ADR-0007），workcoding 八条拆成实践加薄步。
5. 收口（agent-system#123）：删「旧名」别名，`workcoding` 目录归档。

不选 A：先验问题不解决，正文瘦了词汇表还在长。不选 C：中文正文难读。

### 后果（Consequences）

- 好的：任何一条 skill 里的术语都能在业界查到；一条实践只改一个文件；规程一眼看出点名了哪些实践；正面陈述让 agent 的注意力落在目标行为上。
- 坏的或要承担的：改名波及常驻规则与评测文件，分三批做；站会记录（standup update）与停靠记录的语义不完全重合，靠词条定义补；旧名别名在收口前两套词并存。
- 回退：revert 引入本 ADR 的 PR（agent-system#116 的 PR），词汇表与写法规则回到自造词版本；后续批次各自 revert。评测结果文件不需要回退。

### 确认（Confirmation）

- `node plugins/tests/skills.test.ts` 通过：所有 SKILL.md 与 `plugins/CONTEXT.md` 不含「自造」标记；词汇表每条带英文原词与出处。
- `plugins/CONTEXT.md` 每个词条标题形如 `**中文**（English；出处：…）:`，替换表 15 行都有对应词条或平语说明。
- 第二、三批合并后：常驻规则编译出的 CLAUDE.md／AGENTS.md 与 flow、flow-steps 正文里没有旧词（别名行除外）。
- 落地后回来补实际结果。

## 更多信息（More Information）

- desk#152（机会 issue 与方案对齐记录）、agent-system#115（spec，含替换表与盲测备注）。
- ADR-0004（自建 skill 靠入口路由、按人敲的／模型可拿的分两档，本 ADR 只换名不改两档）、ADR-0005（路线放在流程 skill）、ADR-0007（Matt 的四条实践复制入库）。
- Matt Pocock，writing-for-agents（`vendor/mattpocock/skills/`，revision `6acc160`）。
