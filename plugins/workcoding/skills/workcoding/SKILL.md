---
name: workcoding
description: 主人接到一个需求、要改一段既有代码、要出技术方案、要发布或要证明改动没改坏老逻辑时用。触发语包括「来了个需求」「这个需求怎么拆」「帮我改 X」「出个方案」「怎么灰度」「怎么证明老流程没变」。它只做路由：判形状、摆路线、等主人确认，然后把活交给对应的规程 skill（requirement-insight / requirement-translation / system-analysis / legacy-change / integration / release-observe / evidence-regression）。不用于「我想建个工具」类痒点（那是 clarify）。
---

# workcoding：先摆路线，再动手

主人的工作方法有四个同时开着的关注点——**拆、方案、做、证**——不是四步。真源在个人知识库 `notes/方法论模型.md` 与 `notes/两套生命周期模型.md`；本 skill 只放路由，不放步骤。

## 第一件事：判形状，摆路线，等确认

接到任何输入，先用一句话摆出来，**主人点头前不动手**：

> 这是〈改既有代码 / 从零新建 / 查数 / 只改规则或文档〉，走〈哪几个 skill〉，理由是〈一句〉。

| 形状 | 路线 |
|---|---|
| 改既有代码 | requirement-insight → requirement-translation → (system-analysis，卡住时) → legacy-change → integration → evidence-regression → release-observe |
| 从零新建 | requirement-insight → requirement-translation → 暂无规程：说明后临场做，把做法记进改动记录 |
| 查数 | system-analysis 一次，出一行数加置信度，不进后面的 skill |
| 只改规则或文档 | 不走技术 skill，改完直接留 |

主人否了路线就改路线；可以不走某条规程，但不能不说。

## 四个关注点各自「什么算完」

| 关注点 | 用哪些 skill | 完成判据 |
|---|---|---|
| 拆 | requirement-insight、requirement-translation、system-analysis | 每个系统用例有 EARS 句加例子；改动点清单成文 |
| 方案 | legacy-change 第 1、2 步、release-observe 第 1–3 步 | 现状 / 改法 / 灰度 / 可观测 / 发布五节齐，主人否过 |
| 做 | legacy-change 第 4 步、integration | 老路径 diff 为零；集成面与顺序成文；联调过 |
| 证 | evidence-regression、requirement-translation 第 6 步、release-observe 第 3、4 步 | 母版回放通过；例子变的测试通过；灰度样本比对无异常 |

关注点之间来回是常态：写方案发现要重新拆、摸现状时顺手采出入参，都对。

## 一条改动一份改动记录

所有关注点的产物写进同一份「改动记录」，每个关注点一节，PR 正文即是它。主人每次否的原话记在被否的那段下面，不覆盖旧版。

## 主人固定出手的点

问提出方、否三行加一句、**确认路线**、否需求句、否走读与改法、每档放量裁定、联调。其余都是 agent。拿不出证据的一句只能写「假设」，不能写断言。

## 选实践时

同一个槽位有多种做法时，先看个人知识库 `notes/实践备选库.md` 的适用场景栏对号；选了哪个、没选哪个写进改动记录。
