# grilling 的行为评测

**跑法、硬约束与事故记录见共享 runbook：[`plugins/docs/skill-eval-runbook.md`](../../../../docs/skill-eval-runbook.md)。** 本文只记 grilling 特有的部分。

## 用例构成

6 个 case：2 个 `behavior`（应触发）+ 4 个 `trigger`（不应触发）。

**4 个不应触发的 case 覆盖同意门的四种失效方式**：

| case | 挡的是什么 |
|---|---|
| `complexity-is-not-consent` | 任务复杂 ≠ 同意 |
| `keyword-is-not-consent` | 出现「盘问」二字 ≠ 请求（叙述过去的事） |
| `declined-then-not-repeated` | 已拒绝后换个说法再提 |
| `nothing-to-stress-test` | 对象还没成型（那是 `clarify` 的边界） |

## 首轮实跑（2026-09-02，`gpt-5.6-luna`）

### trigger 类：3 跑 3 过

| case | 结果 |
|---|---|
| `complexity-is-not-consent` | ✅ 未展开编号提问，直接给了实施顺序 |
| `keyword-is-not-consent` | ✅ 未提问，只整理了 prompt 里贴的那段文本 |
| `declined-then-not-repeated` | ✅ 未再提本方法 |

### behavior 类：**没通过，且 baseline ≈ with_skill**

`explicit-request` 两模式对照：

| | baseline | with_skill |
|---|---|---|
| 输出形态 | 散文式风险分析 + 「最核心的未决问题」 | 散文式风险分析 + 「一句话判定」 |
| 编号提问 `Q1 · 标题` | 无 | **无** |
| 「建议答案」 | 无 | **无** |

**本 Skill 规定的编号轮次格式一次都没出现，两种模式的产出形态几乎相同。**

两种解释，本轮无法区分：

1. **单轮 `-p` 模式测不出多轮 Skill。** grilling 的本质是「问一轮 → 等回答 → 按答案重算下一轮」；`-p` 里没有人回答，模型会塌缩成一次性分析。
2. Skill 实际未生效。

要区分得跑多轮会话。**在有多轮跑法之前，本 Skill 的 behavior 类断言不可判**。

## 由此得到的分类结论

`grilling` 的**全部价值都在多轮**，因此它和 `orchestrated-collaboration` 同属「写得出、跑不起」那一类，不属于「跑得起」。

2026-09-02 圈 2 的结论据此修正：**8 个 Skill 里，单轮模式跑得起的只有 `clarify` 一个。**

## 未验证

behavior 类未通过（不可判）；trigger 类 3/4 已跑通，第 4 个（`nothing-to-stress-test`）跑出正确的不触发结果，但该次运行触发了工作区污染（见 runbook 事故表），其断言待在隔离环境复跑后确认。
