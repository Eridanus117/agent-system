# 2026-09-02 实跑记录（`gpt-5.6-luna`，SKILL 内容哈希 `c8c7814c1f1e`）

每个文件是 `omp --mode=json` 的精简版；跑法与结论见 [`../../README.md`](../../README.md)。

| 文件 | 模式 | 一句结论 |
|---|---|---|
| `wire-in-after-build.baseline.jsonl` | baseline | 26 次工具调用含子 agent 与越出 cwd 的读取，顺序无退法 |
| `wire-in-after-build.with_skill.jsonl` | with_skill | 集成清单形态，5/5 |
| `data-change-expand-contract.baseline.jsonl` | baseline | 直接给 DDL 与回填 SQL |
| `data-change-expand-contract.with_skill.jsonl` | with_skill | 先扩后缩，报表任务为边界，4/4 |
| `rollout-question.with_skill.jsonl` | with_skill | 未读本 skill |
| `merge-conflict.with_skill.jsonl` | with_skill | 未读本 skill |
| `incoming-requirement.with_skill.jsonl` | with_skill | 未读本 skill |
| `plain-question.with_skill.jsonl` | with_skill | 未读本 skill |
