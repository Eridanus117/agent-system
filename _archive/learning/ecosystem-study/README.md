# A 路线生态研究索引

<!-- markdownlint-disable MD013 -->

> 服务对象：[关联 #165（生态情报持续改进我们的系统）](https://github.com/Eridanus117/agent-control/issues/165)。
>
> 本目录把路线 A 的生态研究收进一张可恢复地图；研究仍是学习证据，不是当前权威、产品采用或实施授权。首批五源综合覆盖 A1、A2、A4／A6，后续 A3、A5、A7 与有界增量按各自文件保留来源、候选和实施门。

## 一眼看懂

现有研究共同指向一条分层路线：外部生态已经把 Skill、编码 Agent、编排、上下文、记忆、评估与自我改进做成可复用构件；我方不需要复制新的控制平面，而应把其中的触发评估、工具权限、可恢复摘要、来源／时态和轨迹评估嵌入既有治理层，并只在真实外部边界出现时增加薄互操作适配。

```text
A1 技能产品化
  找得准（触发）→ 做得完（行为门）→ 验得出（正负样本）→ 装得下（上下文预算）

A2 编码 Agent
  可替换执行器 → 能力画像／权限 → 上下文与恢复 → 双层并发 → 环境与迁移

A3 多 Agent 编排
  控制边／终止／恢复 → GitHub／Orca 真源分层 → 外部 Agent／异步工具的条件式互操作

A4 记忆与检索（并向 A6 评测提供部分材料）
  原始来源 → 候选抽取 → 冲突／时态 → 两道准入门 → 作用域检索 → 合同—轨迹—结果评估

A5 上下文工程
  上下文预算 → 防火墙 → 回锚／交接 → 长程恢复

A7 长程治理与自我改进
  反思／评测 → 状态与证据分层 → 有门自我改进
```

具体落点见[能力缺口与改动候选](./capability-gaps.md)；本次横向增量见[MCP 生态现状与工具安全边界（2026 当前态）](./mcp-ecosystem-and-tool-safety.md)，只回答单个具体 Server 的安全准入证据与边界，不代表安装、连接或权限变更授权。

## A1｜技能与提示产品化

- [关联 #157（Matt Pocock Skills）](https://github.com/Eridanus117/agent-control/pull/157)：以 `grilling`、诊断和 TDD 为代表，说明短的人类入口、可复用模型原语、leading word、可观察完成门与正式／试验发布面如何把工作法做成产品；[原文件（固定 head）](https://github.com/Eridanus117/agent-control/blob/fcd95cf64c5574a84cb1ef64a41eb65d60c095f1/learning/skills-study/mattpocock.md)。
- [关联 #158（Skills 图景）](https://github.com/Eridanus117/agent-control/pull/158)：横向归纳官方样本、强方法套件、插件市场、分发层与大目录，得到触发、闭环、边界、渐进披露、可发现性及正负评估的共同模式；[原文件（固定 head）](https://github.com/Eridanus117/agent-control/blob/80e1fabc9de9a55304c7f764ee337f3ae5b8e4c7/learning/skills-study/landscape.md)。

两份研究互补而不重复：前者解释少数代表 Skill 怎样限制 Agent 的自由度，后者解释整套 Skill 资产怎样被发现、组合、分发和评估。

## A2｜编码 Agent 架构

- [关联 #160（Kilo Code）](https://github.com/Eridanus117/agent-control/pull/160)：沿 Cline／Roo／OpenCode 谱系深挖 Kilo 的共享执行内核、工具权限、上下文压缩、子 Agent 与 worktree 级并发，并把可迁移点落到合同／运行事实投影和逐工具权限；[原文件（固定 head）](https://github.com/Eridanus117/agent-control/blob/a683855f0b07febb11016576cb2e305815ea5f61/learning/ecosystem-study/kilo-code.md)。
- [关联 #162（coding-agent 图景）](https://github.com/Eridanus117/agent-control/pull/162)：比较 Cline、Roo Code、Aider、Continue、Kilo Code 与 Cursor，归纳可替换 harness、能力型 Mode、分层上下文、可逆副作用、窄交接和逐项迁移六种设计；[原文件（固定 head）](https://github.com/Eridanus117/agent-control/blob/bf6b473203352868ffea59aca33a4e0dafff494c/learning/ecosystem-study/coding-agents-landscape.md)。

两份研究的 Kilo 部分共享证据基线，综合时只计一组设计：深挖稿提供机制细节，图景稿提供横向对照和翻转条件，不按两份独立证据重复加权。

## A3｜多 Agent 编排与互操作

- [关联 #179（多 Agent 编排生态研究）](https://github.com/Eridanus117/agent-control/pull/179)：比较 LangGraph、CrewAI、AutoGen／Magentic-One 与 OpenAI Agents SDK，把控制边、恢复、终止、独立审阅和跨源事件包收敛到 GitHub／Orca 现有边界；[研究文件](./multi-agent-orchestration.md)。
- [A2A v1.0.1 与 MCP Tasks 增量](./agent-interoperability-protocols.md)：补开放互操作协议缺口，区分独立外部 Agent、异步工具与受控 Orca worker，并给出协议翻译卡、对象选择门和翻转条件。

两份研究的关系是“框架内编排基线＋跨系统边界增量”；后者不重复前者的框架横评，也不产生适配器实施授权。

## A4｜记忆与检索

- [关联 #159（Agent 记忆与评测）](https://github.com/Eridanus117/agent-control/pull/159)：以 Mem0、Letta、Zep／Graphiti、cognee、LangSmith、Braintrust 和 Agent eval 为样本，把记忆收敛为写入治理、来源、双时间、作用域与检索流水线，把评估收敛为合同—轨迹—结果闭环；[原文件（固定 head）](https://github.com/Eridanus117/agent-control/blob/4db938b9204a0db0851d2f2b62140ebea7a6ff31/learning/ecosystem-study/agent-memory-and-eval.md)。

该研究主体归入 A4，同时为 A6「评测与可靠性」提供现有的部分材料；本目录不据此补建 A6 叶子，也不扩大本次范围。

## A5｜上下文工程

- [关联 #168（上下文工程研究）](https://github.com/Eridanus117/agent-control/pull/168)：把压缩、子 Agent、检索增强、回锚与交接映射到长程恢复边界；[研究文件](./context-engineering.md)。

## A7｜长程治理与自我改进

- [关联 #180（长程治理与自我改进研究）](https://github.com/Eridanus117/agent-control/pull/180)：比较反思、自我改进、评测与可恢复状态实践，形成带证据门的候选；[研究文件](./long-horizon-self-improvement.md)。

## 阅读边界

- 研究均不因读取外部设计就自动安装框架、协议 SDK、记忆平台或评估 SaaS；架构主张主要来自官方源码／文档，运行收益仍待我方自然样本。
- 外部热度、下载量、厂商基准和目录规模只说明传播或自述，不承担采用结论。
- 本仓当前 `origin/main` 已经包含结构化触发 BM25 检索器、检索卡和自然旁路证据口径；早期研究中的“先建词法基线”已被吸收，综合清单只保留自然采用与条件式语义对照等增量。
- 各研究在自己的候选、进入门和翻转条件处停止；新增增量必须绑定一个会被改变的系统决定，不修改 `authority/`，也不把研究完成写成产品采用。
