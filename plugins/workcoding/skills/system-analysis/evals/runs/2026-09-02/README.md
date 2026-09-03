# 2026-09-02 实跑记录（`gpt-5.6-luna`，重跑，SKILL 内容哈希 `89334b50ebec`）

每个文件是 `omp --mode=json` 的精简版；跑法与结论见 [`../../README.md`](../../README.md)。`首轮-边界失守/` 是收紧 description 之前失守的那条。

| 文件 | 模式 | 一句结论 |
|---|---|---|
| `count-with-decision.baseline.jsonl` | baseline | 写文件、出审计规程 |
| `count-with-decision.with_skill.jsonl` | with_skill | 六行，6/6 |
| `stuck-in-change-plan.baseline.jsonl` | baseline | 长文加无依据阈值 |
| `stuck-in-change-plan.with_skill.jsonl` | with_skill | 六行，5/5 |
| `incoming-requirement.with_skill.jsonl` | with_skill | 未读本 skill |
| `direct-code-change.with_skill.jsonl` | with_skill | 读了本 skill，但未输出六行 |
| `plain-question.with_skill.jsonl` | with_skill | 未读本 skill |
| `load-test-request.with_skill.jsonl` | with_skill | 读了本 skill，但输出仍是压测方案 |
