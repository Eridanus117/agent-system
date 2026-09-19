# 2026-09-02 实跑记录（`gpt-5.6-luna`，重跑，SKILL 内容哈希 `9ff15bd16653`）

每个文件是 `omp --mode=json` 的精简版；跑法与结论见 [`../../README.md`](../../README.md)。`首轮-边界失守/` 是收紧 description 之前那轮里失守的两条，留作对照。

| 文件 | 模式 | 一句结论 |
|---|---|---|
| `translate-closed-requirement.baseline.jsonl` | baseline | 八节需求文档，无例子无否 |
| `translate-closed-requirement.with_skill.jsonl` | with_skill | 四句 EARS 加例子，请逐句否；例子缺具体数字 |
| `big-requirement-split.baseline.jsonl` | baseline | 长文档加方案取舍 |
| `big-requirement-split.with_skill.jsonl` | with_skill | 拆 4 用例，5 句加例子加决策表，4/4 |
| `not-yet-closed.with_skill.jsonl` | with_skill | 读了本 skill，给候选规则待产品确认 |
| `plain-question.with_skill.jsonl` | with_skill | 未读本 skill |
| `after-acceptance-integrate.with_skill.jsonl` | with_skill | 读了本 skill，但输出集成面而非重翻 |
| `direct-code-change.with_skill.jsonl` | with_skill | 未读本 skill |
