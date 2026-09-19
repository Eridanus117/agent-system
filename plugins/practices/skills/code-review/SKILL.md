---
name: code-review
description: >-
  审一条分支、PR 或在制的改动时用：以主人给的固定点取 diff，分标准与 spec 两轴各派一个子代理审，违例与判断题分开标，两份报告并排给出、各轴各自小结。Two-axis code review of the diff since a fixed point: Standards (repo conventions plus a Fowler smell baseline) and Spec (does it do what the issue asked), reported side by side.
---

# 两轴审查（code-review）

来源：Matt Pocock 的 `code-review`（github.com/mattpocock/skills，revision 6acc160，MIT，许可全文见 `plugins/practices/LICENSE-mattpocock`），按 ADR-0007 复制入库改写。与原版的差别：找 spec 时没有 `docs/agents/issue-tracker.md` 就直接 `gh issue view`（原版让先跑 `/setup-matt-pocock-skills`）；git 不可用而主人贴来 diff 时接受贴的（原版要求 `git rev-parse` 必须解析）；派不了子代理时自己按顺序做两轴并在报告里写明两轴没有隔离（原版只允许并行子代理）。用词按 `plugins/CONTEXT.md`：违例、判断题；固定点（fixed point；出处：Matt Pocock 的 code-review）指 diff 比对的基点，即 git 的 merge-base。报告的下一站是 `review-response`（逐条核实、整份报主人）。分两轴是因为一个改动可以一轴过、一轴不过：每条标准都守却做错了东西，或做的正是 issue 要的却破了项目约定；分开报，一轴不会遮住另一轴。

## 什么时候用

用：主人要审一条分支、一个 PR、在制的改动，或说「从 X 起审一下」；规程在验证与审查阶段点名。

不用：没有固定点也没有 diff，先一题问固定点，不编报告；主人要的是接审查意见，那是 `review-response`；要的是重构建议而不是审查，那是 `improve-codebase-architecture` 一类。

## 步骤

1. 钉住固定点。主人说的就是固定点：commit、分支、tag、`main`、`HEAD~5` 都行；没说就一题问清。diff 用三点：`git diff <固定点>...HEAD`（对 merge-base 比）；commit 列表 `git log <固定点>..HEAD --oneline`。先确认 `git rev-parse <固定点>` 能解析、diff 非空；解析不了或为空在这里就停，不带进两个子代理。git 不可用而主人把 diff 贴过来了，就用贴的。完成判据：固定点、diff 命令、commit 列表三样在手，diff 非空。
2. 找 spec 的来源，按顺序：commit 信息里的 issue 引用（`#123`、`Closes #45`），按仓的 `docs/agents/issue-tracker.md` 取，没有这份文档就 `gh issue view`；主人传来的路径；`docs/`、`specs/`、`.scratch/` 下和分支或功能同名的 spec；都没有就问主人一句，主人说没有，Spec 轴跳过并在报告里写「没有 spec」。完成判据：spec 正文在手，或已记「没有 spec」。
3. 找标准的来源：仓里写着代码该怎么写的一切，比如 `CODING_STANDARDS.md`、`CONTRIBUTING.md`、`AGENTS.md` 里的代码约定。在这之上，Standards 轴永远带着 [smell-baseline.md](./references/smell-baseline.md) 的坏味道基线（Fowler《重构》第 3 章的固定一组）；两条规矩：仓里的标准优先，基线一律是判断题。工具已经强制的不报。完成判据：标准文件清单在手，基线文件读过。
4. 并行派两个子代理，各自不看对方的上下文。派不了子代理就自己按顺序做两轴，两轴的发现分开记，报告开头写明「两轴未隔离」。
   - **Standards 子代理**给：diff 命令与 commit 列表；第 3 步的标准文件清单；基线全文贴进去，子代理没有别的途径拿到它。要求：「按文件或 hunk 报 (a) 每处违反文档化标准的地方，引标准（文件加那条规则）；(b) 看到的每个基线坏味道，说名字、引 hunk。违例与判断题分开标：违反文档化标准的可以是违例，基线坏味道一律判断题，仓里的标准盖过基线。工具强制的跳过。400 字以内。」
   - **Spec 子代理**给：diff 命令与 commit 列表；spec 的路径或正文。要求：「报 (a) spec 要的、diff 里缺的或只做了一半的；(b) diff 里 spec 没要的行为（范围蔓延）；(c) 看着做了但做得不对的。每条引 spec 的原句。400 字以内。」
   没有 spec 就不派 Spec 子代理，报告里说明。完成判据：两份报告回来，各自只讲自己那一轴。
5. 汇总。两份报告放在 `## Standards` 与 `## Spec` 两个标题下，原样或轻微整理；不合并、不跨轴重排，两轴是故意分开的。结尾一行小结：每轴几条、每轴内最重的一条；不跨轴挑一个总赢家，那正是分轴要防的重排。完成判据：报告里能分别数出两轴的条数和各自最重的一条，没有总评分。

## 产出

两轴并排的审查报告，交给 `review-response`。

## 为什么在哪

- ADR-0007（复制入库）、ADR-0006（术语与分层）、desk#152。
- 原版正文：`vendor/mattpocock/skills/code-review/SKILL.md`。
