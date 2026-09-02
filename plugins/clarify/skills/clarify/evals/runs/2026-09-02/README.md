# 2026-09-02 实跑记录（`gpt-5.6-luna`，SKILL 内容哈希 `fc0922c04391`）

每个文件是 `omp --mode=json` 的精简版：保留 session 元数据、每次工具调用（参数、意图、结果前 300 字）、每条 assistant 消息（正文、thinking 摘要前 200 字），去掉流式增量事件。原始全量 jsonl 约 100–300 KB，不入库；精简版足以复盘「模型读了什么、为什么这么答」。

| 文件 | 跑法 | 结论 |
|---|---|---|
| `*.污染-全局规则未剥离.jsonl` | cwd 临时目录 + `--no-rules`，**HOME 未隔离** | baseline 首条 thinking 就是「Planning clarify skill inspection」，随后去读 `C:/Workspace/knowledge/notes/主人档案.md` 等四个文件，最后输出三行——与 with_skill 无差。原因见 runbook 第五次事故。 |
| `build-x-itch.baseline.jsonl` | 同上 + `HOME`/`USERPROFILE` 指向空目录、`PI_CODING_AGENT_DIR` 指回原 agent 目录 | 只读了 cwd 与 overlay.yml，输出完整 MVP 方案、架构图、CLI 命令与四个反问。**没有三行，没有把解翻回问题。** |
| `build-x-itch.with_skill.jsonl` | 同上，隔离 HOME 下装入新版 SKILL.md | 唯一工具调用是 `read skill://clarify`，输出三行，判「先不解」并指出缺的证据。`same-object-no-jargon` 通过。 |
