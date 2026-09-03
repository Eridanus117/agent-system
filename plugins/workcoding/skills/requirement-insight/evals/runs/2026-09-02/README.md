# 2026-09-02 实跑记录（`gpt-5.6-luna`，SKILL 内容哈希 `5d52e0b3950f`）

每个文件是 `omp --mode=json` 的精简版：session 元数据、用户消息、每次工具调用（参数、意图、结果前 300 字）、每条 assistant 消息（正文、thinking 摘要前 200 字），去掉流式增量事件。原始全量 jsonl 不入库。

跑法：隔离 HOME + `--no-rules` + `--config overlay.yml` + 每 case 独立空 cwd；with_skill 只装本 skill；baseline `--no-skills`。结论逐条见 [`../../README.md`](../../README.md)。

| 文件 | 模式 | 一句结论 |
|---|---|---|
| `product-requirement.baseline.jsonl` | baseline | 把解当既定目标，直接出完整需求定义 |
| `product-requirement.with_skill.jsonl` | with_skill | 七行草案停住，6/6 |
| `colleague-vague-request.baseline.jsonl` | baseline | 七个口径问题加话术加样例，问的是意见 |
| `colleague-vague-request.with_skill.jsonl` | with_skill | 七行草案停住，5/5 |
| `build-a-tool-itch.with_skill.jsonl` | with_skill | 未读本 skill |
| `already-closed-translate.with_skill.jsonl` | with_skill | 直接给 EARS，未重做洞察 |
| `plain-question.with_skill.jsonl` | with_skill | 直接讲解，未读本 skill |
| `count-query.with_skill.jsonl` | with_skill | 直接给查法，未读本 skill |
