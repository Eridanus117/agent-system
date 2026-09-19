---
status: accepted
date: 2026-09-18
decision-makers: 负责人
---

# Matt Pocock 的四条实践正文复制入库，不引用 vendor

## 背景与问题（Context and Problem Statement）

- `flow` 已在点名 `/grill-with-docs`、`/implement`、`tdd`、`code-review`，它们的实践正文在 `vendor/mattpocock/skills/`（revision `6acc160`），工作方法地图上却是「未接入」。
- ADR-0006 把实践层单列之后，这四条实践放哪：引用 vendor，还是复制进 `plugins/practices`。

请负责人定的一件事：四条实践的正文是引用 vendor、复制入库，还是自己重写？

## 决策驱动因素（Decision Drivers）

- 正文要能改成中文、贴本仓写法（两节骨架、正面陈述）。
- 与上游的关系：跟不跟 Matt 的更新。
- 许可证：vendor 为 MIT，允许复制修改，须保留版权与许可声明。
- 地图规则：未接入的资产不当现行规则用。

## 考虑过的方案（Considered Options）

| 方案 | 做法 | 适用场景 | 代价 |
|---|---|---|---|
| A 引用 vendor | 规程 skill 点名 vendor 的 skill 名，不复制 | 上游正文能原样用、要自动跟更新 | 正文是英文、骨架不同、不能改；四条要从未接入移进地图 |
| B 复制入库 | 正文抄进 `plugins/practices/skills/<名>/`，改中文与本仓写法；`plugins/practices/LICENSE-mattpocock` 保留声明；`SOURCE` 记来源 revision | 要按本仓合同改写、可接受手动跟上游 | 与上游脱钩，他更新不自动跟；四条各要评测用例 |
| C 全部自己重写 | 按同一实践的原始出处（Ousterhout、Feathers、Beck）重写 | 上游许可证不允许复制时 | 工作量最大，Matt 已做过的裁剪白费 |

## 决定结果（Decision Outcome）

选 **B**（负责人 2026-09-18 定：「允许复制、抄别人」）。vendor 目录保留为材料，地图上仍是未接入；`plugins/practices` 的四条是现行工具。

接入顺序（每步可单独退）：

1. agent-system#118：建 `plugins/practices`，放 `LICENSE-mattpocock` 与 `SOURCE`，四条实践各建目录。
2. 每条复制的 SKILL.md 头部注明来源与 revision（当前 `6acc160`），正文改中文与两节骨架。
3. 每条各写评测用例并跑门评测；`flow` 的点名从 vendor 名改到入库名。
4. 以后要跟上游时按 `SOURCE` 里的 revision 做 diff 手动合。

不选 A：正文改不了，四条还要破例进地图。不选 C：MIT 已允许复制，重写是白费。

### 后果（Consequences）

- 好的：四条实践与自建实践同一套骨架、同一套词；地图上「现行」与「未接入」的边界不破例。
- 坏的或要承担的：上游更新不自动跟，要靠 revision diff 手动合；四条各要评测。
- 回退：revert agent-system#118 的 PR；`flow` 的点名回到 vendor 名。`vendor/mattpocock` 不受影响。

### 确认（Confirmation）

- `plugins/practices/LICENSE-mattpocock` 与 `SOURCE` 在，`SOURCE` 记的 revision 与 `vendor/mattpocock/SOURCE.json` 一致。
- 四条 SKILL.md 头部各有来源与 revision，正文通过 `skills.test.ts` 的词汇守卫。
- 实际结果（2026-09-19，agent-system#118）：`plugins/practices` 建成，`LICENSE-mattpocock` 为 vendor 的 MIT 原文，`SOURCE` 记 revision `6acc160e…`，与 `vendor/mattpocock/SOURCE.json` 一致；四条 SKILL.md 头部都写了来源仓、revision、许可与改写范围，`node plugins/tests/skills.test.ts` 通过。十个评测用例，有 skill 组九条 1.0、一条 0.78（裁判读法，见 `plugins/practices/evals/README.md`），平均差值 +0.38。`profiles/daily` 与 `profiles/all` 的四条已从 vendor 改指 `plugins/practices/skills/<名>`；`flow` 的点名（`tdd`、`code-review`）用的就是这四个名字，不需要改字。

## 更多信息（More Information）

- desk#152、agent-system#115（spec 实现决定第 3 条）、agent-system#118（practices 起步票）。
- ADR-0006（术语与分层）。
- `vendor/mattpocock/LICENSE`（MIT）、`vendor/mattpocock/SOURCE.json`。
