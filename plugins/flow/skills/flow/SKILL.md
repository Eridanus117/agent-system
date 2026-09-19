---
name: flow
description: >-
  判为常规变更、或主人开场直接敲了阶段里的 skill 时读：常规变更的路线——九个阶段的门与产物、每个阶段点名的活动、改旧代码时才开的活动、会话绑定、站会记录。The route for a normal change: nine stages with their gates and outputs, the activities each stage names, the activities opened only for legacy code, session binding, and standup updates.
---

# 常规变更的路线

用词按本仓词汇表（`plugins/CONTEXT.md`）：常规变更（normal change）、阶段（stage）、门（gate）、活动（activity）、站会记录（standup update）。哪种请求、开场那一句、等不等主人，由常驻规则定；这里只管判为常规变更之后的事。

## 什么时候用

用：常驻规则判为常规变更；或主人开场直接敲了阶段里的 skill（`/grill-with-docs`、`/to-spec`、`/to-tickets`、`/implement`）——先读这里，再跑那条 skill。

不用：查询与标准变更按常驻规则直接做。一个例外：标准变更做到一半发现要在做法之间选，改判为常规变更，回到这里从第 2 阶段进。

## 步骤

### 开场后的可撤动作

issue、票、PR 开场时说完就动：先说开场那一句（形状由常驻规则定：「这是常规变更，〈issue 类型〉，从第 N 阶段进」），再按顺序做，做完直接给起始阶段门上那条消息：

1. 绑定。`orca worktree show --worktree issue:N` 查这个 issue 有没有活着的 worktree（只按编号查，查到的核对是不是同一个仓）：已有就告诉主人它的路径与分支，只问一句用不用它（做法在 `worktree-baseline`）；没有就 `orca worktree set --worktree active --issue N`。PR 绑它关联的 issue。会话不在 Orca worktree 里（比如站在工作区根）就跳过绑定。
2. 读它最后一条站会记录（issue 下最后一条四栏评论：做成了、停在、下一步、等你；公开仓的事在 desk 里对应的父 issue 上），从「下一步」接着做；复用原范围内的决定，已有授权不因换会话失效，范围也还是原来那几件动作。
3. 定起始阶段：机会 issue（第 1 阶段的产物）→ 第 2 阶段；spec issue（第 2 阶段的产物）或票 → 第 4 阶段；PR → 第 6 阶段；主人指定「从第 N 阶段进」→ 就从第 N 阶段进，跳过的阶段留一句为什么。起始阶段的活动标了「主人敲」的（第 2 阶段的 `/grill-with-docs`），门上那条消息最后那件事就是请主人敲它，方案的洞察与提问留给那条 skill。
4. 在哪做：第 2 到 8 阶段在目标仓的 worktree 里做，第 1、9 阶段哪里都行。会话不在目标仓：说明要换仓，写站会记录、解绑，再到目标仓开 worktree。

工具不可用（没有 `gh`、`orca`、测试命令）时，把要做的按顺序说出来，说到停下为止，结果等主人贴回来再记。

完成判据：第一条回复以开场那一句起头，里面有绑定结果、最后一条站会记录的「下一步」、起始阶段，然后是那个阶段门上那条消息。

### 九个阶段

| 阶段 | 门（等主人说行时判什么） | 产物 | 点名的活动 |
|---|---|---|---|
| 1 需求分析 | 三行结论判对错 | 机会 issue（desk 仓），或「不是需求」（desk 仓 issue 写理由后以 `wontfix` 关） | `clarify` |
| 2 方案对齐 | 每轮判对错、确认测试接缝、收 ADR | 词汇表（`CONTEXT.md`）、ADR、spec issue | `/grill-with-docs`、`/to-spec`（主人敲） |
| 3 拆票 | 粒度与阻塞边 | 带阻塞边的票 | `/to-tickets`（主人敲；一个会话做得完就跳过，留一句） |
| 4 开工准备 | 开哪些改旧代码时才开的活动、基线过没过 | worktree 加分支（常规变更一律开），基线测试过 | `worktree-baseline`（用 Orca 开工作树并绑 issue，跑仓自己的检查当基线） |
| 5 实现 | 动手前确认接缝 | 测试与实现的 commit | `/implement`（主人敲，内含 `tdd`）；产出是一条自建 skill 时按 `skill-authoring` 走 |
| 6 验证与审查 | 违例修不修、审查认不认 | 命令输出、审查报告、修正 commit | `verify-evidence`（每条声称配命令、退出码、关键行）；`code-review`；`review-response`（逐条核实、整份报主人、主人定了再改） |
| 7 收尾 | 开 PR 还是放着；合由主人做 | PR，或放着的分支 | `wrap-up`（PR 正文四节、站会记录、挂起物，只问一句推不推；合并由主人做） |
| 8 发布 | 灰度三档、回滚点 | 观测点与线上比对 | 多数改动跳过；要发布时 `rollout-observe` |
| 9 落家与交接 | 无门，随时 | 工作日志、裁决、耐用结论、交接文档 | `note`（沉淀）、工作日志（没有 issue 的外部变更）、`/handoff`（主人敲）、站会记录 |

规矩：

- 门：每个阶段结束停下等主人说行，门上判什么见表；主人说行再进下一个阶段。
- 标「主人敲」的活动由主人启动：agent 说「这是第 N 阶段，请敲 /名」然后停下；那个活动里的事（第 2 阶段的一轮一题、第 5 阶段的写代码）等它启动后再做。
- 第 1、2 阶段是想清楚的阶段：一轮只问一题、先给具体例子再问、说平语。
- 回退：哪个阶段的结论被推翻，回那个阶段重跑，过了它的门再往下。
- 跳过：留一句为什么，写在产物里（spec、PR 正文或站会记录）。
- 停下不做：第 1、2 阶段想清楚之后主人说不做，写进 issue 关掉（念头以 `wontfix` 关；机会 issue 写理由后关）。

完成判据：每次停下时，能说出现在在第几阶段、门上等主人判什么。

### 门上那条消息

到一个阶段的门或起始阶段的入口，给主人的那条消息先说在第几阶段、门上判什么，再列这个阶段要做或已做的，最后只留一件要主人做的事。模板与两个例子见 [references/gate-message.md](./references/gate-message.md)。

完成判据：消息里能数出阶段号、门、产物或准备、一件要主人做的事，缺一样就还没到门。

### 改旧代码时才开的活动

八条：`requirement-insight`（需求收口成验收判据）、`requirement-translation`（EARS 一句一例）、`architecture-design`（两候选攻防）、`system-analysis`（一个决定查一个数）、`legacy-change`（特征化测试加萌芽）、`regression-evidence`（录母版、回放逐字节比）、`integration`（列边界定顺序）、`rollout-observe`（放量三档加观测点）。

按缺口挑（wiki《方法论模型》表三的四个关注点）：拆——需求不清 → `requirement-insight`、`requirement-translation`；方案——两条路要比 → `architecture-design`、`system-analysis`；做——旧行为没有测试、要改的地方牵连广 → `legacy-change`、`integration`；证——改完要证明没变 → `regression-evidence`、`rollout-observe`。

在进第 4 阶段的门上列出（见 gate-message.md 的第二个例子），和 worktree、基线一起给主人，主人说行时一并定。判据 agent 自己查：有没有测试、改动牵连几处。从零新建的写一句「从零新建，不开改旧代码的活动」，一个都不开。

完成判据：第 4 阶段门上那条消息里有清单和理由，或写明从零新建、不开。

### 站会记录

时刻：每到一个阶段的门停下等主人；主人说「先停」「我去忙了」「收工」；换仓或换 worktree 之前；开 PR、合入、发布、有关键决定或验证出结果。

写在哪：绑定 issue 下的评论（`gh issue comment`）；公开仓的事写 desk 里对应的父 issue；没绑 issue 的会话不写。`gh` 不可用就把记录贴在回复里，让主人贴。

形状：标题 `### 站会 · YYYY-MM-DD HH:MM`（本机时间），下面四栏顺序固定、各一行——做成了、停在、下一步、等你；「等你」只写一件需要主人定的事，没有的栏写「无」。模板与例子见 [references/standup-update.md](./references/standup-update.md)。

完成判据：最后一条站会记录就是现状，下一个会话读它就能接；四栏一栏不多一栏不少。

### 会话绑定

1. 一个会话或 worktree 只绑一个 issue；同一个 issue 同一时间最多一个活着的 worktree。
2. 事情要换仓：先写站会记录，解绑旧 worktree（`orca worktree set --worktree active --issue null`），再在目标仓开新 worktree 并绑对应 issue。
3. 会话里聊出另一件事：先为它建 issue，再继续。没绑 issue 的会话一发现一次做不完，当场建 issue 并绑上。

### 结束时

1. 有后效的产出（裁决、结论、开放疑问）当场写进对应资产（去处见常驻规则「东西放哪」），对话只是草稿。
2. 挂起物（开了 PR、建了 worktree、翻成待验收）在产生那一刻登记进工作项容器或在本会话收尾。
3. 没有 issue 的外部变更（部署、本机配置、环境调整）追加工作日志；有 issue 的进展写站会记录。
4. 撞到工具链或环境的坑并绕过去：当场记一行（desk 仓「失败案例：」issue），说清撞的是什么、怎么绕过的。
5. 得出耐用结论：提议沉淀（`note`）。
6. 用一条 skill 时它让做的和实际做的对不上或别扭：建 agent-system 的反馈 issue（「反馈：<skill 名>：一句话」，`needs-triage`），手上的事接着做。

## 产出

每个阶段的产物见表；站会记录在绑定 issue 下。本 skill 自己不留文件。

## 出口

一条常规变更走到第 7 阶段的合、开 PR 或放着为止；第 8 阶段多数跳过；第 9 阶段随时。主人说「先停」也是出口：写站会记录，停下。

## 为什么在哪

- 决定与取舍：desk#142（方案对齐记录）、agent-system#108（spec）、ADR-0005（请求判法在常驻提示词、路线放这里）、ADR-0004（可见档）、ADR-0006（术语只用业界词，agent-system#115、#117 换词）。
- 为什么分九个阶段：wiki《vibeCoding 改动流转》；改旧代码时才开的活动的四个关注点：wiki《方法论模型》表三。
- 词汇：`plugins/CONTEXT.md`。
