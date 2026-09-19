# 2026-09-02 实跑记录（`gpt-5.6-luna`，SKILL 内容哈希 `5a70fba81606`）

每个文件是 `omp --mode=json` 的精简版；跑法与结论见 [`../../README.md`](../../README.md)。

| 文件 | 模式 | 一句结论 |
|---|---|---|
| `rollout-plan-with-toggle.baseline.jsonl` | baseline | 多阶段自动推进的发布长文 |
| `rollout-plan-with-toggle.with_skill.jsonl` | with_skill | 三档加回滚加一句一观测，每档等主人，5/5 |
| `no-toggle-system.baseline.jsonl` | baseline | 环境变量方案，未说是降级 |
| `no-toggle-system.with_skill.jsonl` | with_skill | 明说不能伪装百分比灰度，退化为开/关 |
| `integration-question.with_skill.jsonl` | with_skill | 读了本 skill，但输出接入顺序 |
| `golden-master-question.with_skill.jsonl` | with_skill | 未读本 skill |
| `plain-question.with_skill.jsonl` | with_skill | 未读本 skill |
| `slo-design-request.with_skill.jsonl` | with_skill | 未读本 skill |
