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
```

## 环境变量

| 变量 | 默认 | 作用 |
|---|---|---|
| `SJ_STATE_DIR` | `~/.agent-system-state/session-judge` | `judge`/`sentinel` 落状态文件的目录（不入版本仓） |
| `SJ_ANCHORS_DIR` | 向上查找 `agent-config/80-agent配置/60-回放题库/锚样本` | `anchor` 落标准答案、`agreement` 读标准答案的目录 |
| `SJ_JUDGE_CMD` | 未设 → `claude -p --model claude-haiku-4-5-20251001`（`--judge omp` 时为 `omp -p --no-skills`） | 整体覆盖评委外部命令，主要供测试用假评委 |
| `SJ_CLAUDE_DIR` | `~/.claude/projects` | `list` 扫 Claude 会话的根目录 |
| `SJ_OMP_DIR` | `~/.omp/agent/sessions` | `list` 扫 OMP 会话的根目录 |

## 边界

- 评委只是顾问：最终判标准答案仍由主人决定，评委的判决不覆盖机械检查。
- 机械检查它不能改：M1–M5 只看事件顺序与有无，由程序判定，评委不得复判或推翻。
- 标准答案不足十道时，`sj agreement` 不出一致率——样本太少的一致率没有意义。
- `sj anchor` 不受 `--judge` 影响，固定用 claude 评委——标准答案要跟哪个评委比、口径必须固定，不能随命令行参数漂移。
- `--from` 传的 JSON 是一个扁平对象，键只能是 `M1`–`M4`、`J1`–`J4`，值是判决字符串，形如 `{"M1":"符合","J1":"不符合"}`。
- `SJ_JUDGE_CMD` 整条命令是拼进 shell 执行的（`spawn(cmd, { shell: true })`），只该指向自己受控的脚本，不要接不受信任的输入。
- M1–M4 是对 shell 写入目标做字面 / 关键词层面的启发式分类，不是语义理解，只能当粗信号参考，拿不准时要靠评委或主人复核。

设计文档：[`docs/superpowers/specs/2026-09-08-session-judge-design.md`](../../docs/superpowers/specs/2026-09-08-session-judge-design.md)
