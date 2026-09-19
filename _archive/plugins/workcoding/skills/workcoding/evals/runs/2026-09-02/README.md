# 2026-09-02 实跑记录（改写后，`gpt-5.6-luna`，SKILL 内容哈希 `7494fd74f589`）

每个文件是 `omp --mode=json` 的精简版：保留 session 元数据、用户消息、每次工具调用（参数、意图、结果前 300 字）、每条 assistant 消息（正文、thinking 摘要前 200 字），去掉流式增量事件。原始全量 jsonl 约 10 KB–3 MB，不入库。

跑法：隔离 HOME + `--no-rules` + `--config overlay.yml`（关 autolearn / memory / advisor）+ 每 case 独立空 cwd。with_skill 装全部 8 个 workcoding skill；baseline `--no-skills`。结论逐条见 [`../../README.md`](../../README.md)。

| 文件 | 模式 | 一句结论 |
|---|---|---|
| `incoming-requirement.baseline.jsonl` | baseline | 13 次工具调用直奔实施，找不到代码后 block；无路线无确认 |
| `incoming-requirement.with_skill.jsonl` | with_skill | 读 workcoding 与 requirement-insight，输出四行停住 |
| `modify-existing-code.baseline.jsonl` | baseline | 24 次工具调用含子 agent 与 cwd 之外的读取；无路线无确认 |
| `modify-existing-code.with_skill.jsonl` | with_skill | 只读 workcoding，四行停住，路线含 legacy-change |
| `count-query.baseline.jsonl` | baseline | 无工具调用，直接给查法 |
| `count-query.with_skill.jsonl` | with_skill | 只读 workcoding，判查数，路线只 system-analysis 一次 |
| `build-a-tool-itch.with_skill.jsonl` | with_skill | 试读未装的 clarify，未读 workcoding |
| `plain-question.with_skill.jsonl` | with_skill | 读 requirement-translation 后直接答，未读 workcoding |
| `mid-procedure-stall.with_skill.jsonl` | with_skill | 读 legacy-change 就地给判断，未重摆路线 |
| `route-already-confirmed.with_skill.jsonl` | with_skill | 无工具调用，直接给改后句子 |
