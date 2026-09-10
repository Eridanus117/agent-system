# session-judge

会话评分工具：基于规则与评委对 agent session 的机械检查和评价。

## 命令

```
sj extract <会话文件>                       出时间线
sj judge <会话文件> [--judge claude|omp]    机械检查 + 评委，落状态文件
sj anchor <会话文件> [--from <json>] [--force]  主人判标准答案（已有同 id 标准答案时拒绝覆盖，加 --force 才允许）
sj agreement                                评委与标准答案的一致率（不足 10 道拒绝）
sj sentinel [--judge claude|omp]            跑哨兵题，评委全给满分即报警
sj list [--latest N]                        列最近会话
sj replay <题号或题目录> [--client claude|omp] [--bank <题库目录>] [--candidate <路径>] [--prompt <文件>] [--model <m>] [--qa-model <m>] [--judge claude|omp] [--keep]
sj score  [--bank <题库目录>] [--client claude|omp] [--candidate <路径>] [--runs N] [--only <题号,...>] [--model <m>] [--keep]
```

## 回放台（第二片）

一道题 = 题库目录下的 `story.md`（题头 + 给 QA agent 的剧本 + 「## 验收判据」）+ `setup.ts`（造场景，调运行器给的动词）+ `checks.ts`（机械检查，调运行器给的动词）。`sj replay` 在临时目录造场景、造干净的客户端环境（Claude 用临时 `CLAUDE_CONFIG_DIR`，OMP 用临时 profile），无头起会话喂第一句，Haiku 按剧本扮主人回话到 `max_turns`，再用第一片的时间线做机械检查、评委按判据出三值。产物在 `~/.agent-system-state/session-judge/replay/<runId>/`。

- 安全：场景仓的 `origin` 永远指向运行目录里的裸仓；起会话前校验，不过不起。被测 agent 以 `--dangerously-skip-permissions` 跑、继承主机环境与 PATH，裸仓规则只保护场景仓；默认共用提示词照抄工作区的 `CLAUDE.md`，含写 desk 日志的规则，真跑前应用 `--prompt` 指定裁过的副本或确认接受。
- 剧本里第一句原话要独占一行、用「」括起来，正文里别处的「」不算。
- 环境变量：`SJ_BANK_DIR`（题库）、`SJ_WORKSPACE_ROOT`、`SJ_AGENT_CMD`（替换被测 CLI 可执行名，测试用）、`SJ_QA_CMD`（整条 QA 命令，测试用）。
- 默认模型：被测 Claude `claude-sonnet-5`、被测 OMP `luna`、QA `claude-haiku-4-5-20251001`；都可用参数换。
- 题库在 agent-config `80-agent配置/60-回放题库/`，私有；设计见 `docs/superpowers/specs/2026-09-09-session-judge-replay-design.md`。

## 环境变量

| 变量 | 默认 | 作用 |
|---|---|---|
| `SJ_STATE_DIR` | `~/.agent-system-state/session-judge` | `judge`/`sentinel` 落状态文件的目录（不入版本仓） |
| `SJ_ANCHORS_DIR` | 向上查找 `agent-config/80-agent配置/60-回放题库/锚样本` | `anchor` 落标准答案、`agreement` 读标准答案的目录 |
| `SJ_JUDGE_CMD` | 未设 → `claude -p --model claude-haiku-4-5-20251001 --no-session-persistence`（`--judge omp` 时为 `omp -p --no-skills`） | 整体覆盖评委外部命令，主要供测试用假评委 |
| `SJ_CLAUDE_DIR` | `~/.claude/projects` | `list` 扫 Claude 会话的根目录 |
| `SJ_OMP_DIR` | `~/.omp/agent/sessions` | `list` 扫 OMP 会话的根目录 |
| `SJ_BANK_DIR` | 向上查找 `agent-config/80-agent配置/60-回放题库` | `replay`/`score` 读题库的目录 |
| `SJ_WORKSPACE_ROOT` | 题库目录往上三层 | 回放推导 `--candidate`/`--prompt` 默认值的工作区根 |
| `SJ_AGENT_CMD` | 未设 → 各客户端自己的正常可执行名（`claude`/`omp`） | 整体替换被测 CLI 可执行名，仅测试用假脚本 |
| `SJ_QA_CMD` | 未设 → `claude -p --model <qa-model> --no-session-persistence --output-format text` | 整条 QA 扮演命令，仅测试用假脚本 |

## 边界

- 评委只是顾问：最终判标准答案仍由主人决定，评委的判决不覆盖机械检查。
- 机械检查它不能改：M1–M5 只看事件顺序与有无，由程序判定，评委不得复判或推翻。
- 标准答案不足十道时，`sj agreement` 不出一致率——样本太少的一致率没有意义。
- `sj anchor` 不受 `--judge` 影响，固定用 claude 评委——标准答案要跟哪个评委比、口径必须固定，不能随命令行参数漂移。
- `--from` 传的 JSON 是一个扁平对象，键只能是 `M1`–`M4`、`J1`–`J4`，值是判决字符串，形如 `{"M1":"符合","J1":"不符合"}`。
- `SJ_JUDGE_CMD`／`SJ_QA_CMD` 整条命令都是拼进 shell 执行的（同一个 `commandRunner`，`spawn(cmd, { shell: true })`），只该指向自己受控的脚本，不要接不受信任的输入。
- M1–M4 是对 shell 写入目标做字面 / 关键词层面的启发式分类，不是语义理解，只能当粗信号参考，拿不准时要靠评委或主人复核。

设计文档：[`docs/superpowers/specs/2026-09-08-session-judge-design.md`](../../docs/superpowers/specs/2026-09-08-session-judge-design.md)
