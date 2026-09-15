---
name: skill-authoring
description: >-
  写一条自建 skill 或改一条既有自建 skill 时用：从机会 issue 或反馈 issue 走到「PR 开了、上线待办建了」，先跑基线再动笔。Author or modify a self-built skill, from an opportunity issue or a feedback issue to an installable skill directory plus a rollout todo, baseline first.
---

# 写一条自建 skill

用词按本仓词汇表（`plugins/CONTEXT.md`）：是不是路由 skill 决定路线长短，手动调用还是自动调用决定 frontmatter，反馈是用中撞到的问题，上线待办是出口的另一半。frontmatter 与可见档的取舍已在 ADR-0004 定过，这里只执行，不重新论证。

## 什么时候用

用：流程 skill 在第 5 段点名，或主人敲 `/skill-authoring`；手上有一条 desk 仓的机会 issue（带三行结论）要变成新 skill，或一条 agent-system 仓的反馈 issue、主人已说「改」，要改既有 skill。

不用，说一句该归谁然后停：

- 退役一条 skill（删 manifest 条目、归档目录）：范围外，另立事项，等主人定，不动手。
- 改 vendor 的 skill：不改；描述抢路由就在 agent-config 设档或进抽屉。
- 只是想知道 skill 怎么写：读 `references/` 就够，不用走步骤。

## 步骤

每一步末尾都有验收标准，对不上就没做完。

1. **读起点。** 新建：机会 issue 的三行结论（真正的问题、值不值得、往哪个方向）。修改：反馈 issue 的四样（哪一步、它让做什么的原文、实际做了什么和为什么、任务现场）。缺一样就先补，不猜。验收标准：能用一句话复述要解的问题和这条 skill 会做的事。

2. **判两件事，原话写进最后的汇报和 PR 正文。**
   - 是不是路由 skill。只影响自己那一格、不改别的 skill 什么时候被用 → 不是路由 skill，走短路线：SKILL.md 的「什么时候用」「步骤」两节就是 spec，主人在 PR 里审，不另写 spec、不拆票。会改别的 skill 什么时候被用（入口、段的门、点名关系）→ 路由 skill，到此停下，说明要回第 2 段方案对齐（grill、spec，等主人），本 skill 只在第 5 段回来。不给路由 skill 起脚手架、不写用例、不写正文。
   - 手动调用还是自动调用。只有主人敲 `/名`、agent 不能自己启动 → 手动调用，frontmatter 加 `disable-model-invocation: true`。规则点名后 agent 自己用 → 自动调用，什么都不加，Claude 侧的 `name-only` 写进上线待办。`name-only` 挡不住模型调用，手动调用不能靠它。
   验收标准：汇报里写明是不是路由 skill、手动还是自动调用，各带一行理由。

3. **起脚手架。** `plugins/<名>/.claude-plugin/plugin.json`（semver，新建 `0.1.0`），`skills/<名>/SKILL.md` 只写 frontmatter 加一行占位，`.claude-plugin/marketplace.json` 与 `profiles/daily/manifest.json`、`profiles/all/manifest.json` 各一条。frontmatter 按 [agent-skills-spec.md](./references/agent-skills-spec.md) 核对。验收标准：`claude plugin validate` 与 `node plugins/tests/skills.test.ts` 通过。

4. **先写用例，后写正文。** 2–3 个真实口吻的场景写成 `claude plugin eval` 用例（[eval-cases.md](./references/eval-cases.md)）：一个正例、一个易混淆的反例、多轮行为用假历史。fixture 与 mock 按 [fixtures-and-mocks.md](./references/fixtures-and-mocks.md)；授 Bash 的用例在没有可用沙箱时写成 dry run。用例纪律：提示词自足、不指向真实工作区、每条 grader 只判一件事。验收标准：`evals/<用例>/prompt.md` 与 `graders/` 在，`evals/README.md` 有用例构成表。

5. **跑基线。** SKILL.md 还是占位时跑 `claude plugin eval plugins/<名> --runs 1`（默认带对照组），结果落 `evals/results/<日期>-baseline/`；基线看对照组那一列——那是 agent 没有 skill 时实际怎么做，写进 `evals/README.md`「基线观察」，一个用例一两句。有 skill 组此时只是占位，应当同样失败，否则用例没区分力。这就是真缺口，正文只针对它写。跑不了（当前会话没有 Bash）就把用例备好、写明下一步是跑基线，停在这里等。验收标准：README 里每个用例都有一条来自对照组的观察。

6. **写正文。** 五节骨架：什么时候用、步骤、产出、出口、为什么在哪；写法按 [writing-rules.md](./references/writing-rules.md)。想清楚类的 skill 再加：一轮只递一题、说平语、先给具体例子。附件分 `scripts/`、`references/`、`assets/`，引用一层直达。验收标准：正文过了剪枝四查，不超过 500 行。

7. **跑有 skill 组对对照组。** `claude plugin eval plugins/<名> --output-dir evals/results/<日期>-gate`（默认带对照组、每用例 3 次）。看差值和每条 grader 的证据，读执行记录不只读最终答案；改正文再跑，直到有 skill 组全过、差值总体为正——某条差值为 0 的要在 README 说明它只是回归守卫。修改既有 skill：同一套用例在改前、改后各跑一遍，两份结果都提交；版本 patch 加一（`plugin.json` 与 `.claude-plugin/marketplace.json` 同步改）。跑完用 `scripts/scrub-eval-results.ts` 把结果里的本机用户名换成 `<user>`（ADR-0003）再提交。验收标准：`aggregate-result.json` 在 `evals/results/<日期>-<标签>/`，里面没有本机用户名。

8. **收口。** 逐条过 [definition-of-done.md](./references/definition-of-done.md)：validate、测试、目录页重生成、manifest 与 marketplace、版本、结果提交、PR 四节。

9. **出口。** 开 PR；在使用方仓建上线待办（模板在 definition-of-done.md）：路由句加在当前路线真源的哪一句、可见档、合并后 sync 与描述检查。到此为止。

## 用中记反馈

用一条 skill 时它让做的和实际做的对不上，或别扭：不打断手上的事。建 agent-system 的 issue「反馈：<skill 名>：一句话」，正文四样（哪一步；它让做什么的原文；实际做了什么、为什么；任务现场：仓、issue、第几段），打 `needs-triage`，然后接着做手上的任务。等主人说「改」，再在新会话里从第 1 步走修改路径。

## 产出

- 可装的 skill 目录：`plugin.json`、`SKILL.md`、`references/`、`evals/`（用例、README、结果）。
- marketplace 与两份 manifest 的条目，重生成的目录页。
- PR（四节）与上线待办 issue。
- 修改时：改前、改后两份评测结果。

## 出口

只有一个：PR 开了、上线待办建了。合并、`deploy.ts sync`、路由句生效由上线待办驱动，不在本 skill 里做。

## 为什么在哪

- 决定与取舍：desk#139（方案对齐记录）、agent-system#104（spec）、ADR-0004（frontmatter 与可见档）。
- 三家指南吸收与排除：[vendor-adoption.md](./references/vendor-adoption.md)。
- 词汇：`plugins/CONTEXT.md`。
