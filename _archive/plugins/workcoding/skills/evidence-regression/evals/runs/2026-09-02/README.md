# 2026-09-02 实跑记录（`gpt-5.6-luna`，SKILL 内容哈希 `76b3d6b317e8`）

每个文件是 `omp --mode=json` 的精简版；跑法与结论见 [`../../README.md`](../../README.md)。

| 文件 | 模式 | 一句结论 |
|---|---|---|
| `prove-old-path-unchanged.baseline.jsonl` | baseline | 完整基线方案，但无「否过之前不采」与入仓布局 |
| `prove-old-path-unchanged.with_skill.jsonl` | with_skill | 先冻结样本不采集，老新分开，5/5 |
| `forgot-to-capture-before.baseline.jsonl` | baseline | 从改前提交重建母版并如实标注 |
| `forgot-to-capture-before.with_skill.jsonl` | with_skill | 开关关着即改前等价基线，如实标注，3/3 |
| `rollout-question.with_skill.jsonl` | with_skill | 未读本 skill |
| `unit-test-request.with_skill.jsonl` | with_skill | 未读本 skill |
| `incoming-requirement.with_skill.jsonl` | with_skill | 未读本 skill |
| `plain-question.with_skill.jsonl` | with_skill | 读了本 skill，但只讲解术语 |
