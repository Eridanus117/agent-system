# clarify 的评测

跑法：仓根执行 `claude plugin eval plugins/clarify -j 3 --judge-model sonnet --max-cost-usd 20 --no-publish --trust-plugin --output-dir plugins/clarify/evals/results/<日期>-<标签>`（默认带对照组、每用例 3 次、阈值 1.0）。被测模型用默认模型，裁判固定 sonnet。用例只用只读工具加 Skill，不授 Write 与 Bash，原生 Windows 直接跑；提示词写明「Bash 与 gh 不可用，要建 issue 就把命令与正文写出来给主人」。`aggregate-result.json` 提交进 `results/<日期>-<标签>/`，HTML 报告不提交。

2026-09-02 之前用 omp 跑的旧评测（`evals.json` 加 `runs/`）还在 `skills/clarify/evals/`，只作历史记录，跑法见 `plugins/docs/skill-eval-runbook.md`；本次重写起改用这里的 `claude plugin eval` 用例。

## 用例构成

每个用例的 `append_system_prompt` 里都带同一份 mock 的常驻规则（中文回复、一轮只问一题、按业界实践、能查清的事实自己查、授权不含 push）；工具没有共享机制，改一处要同步四份。念头都是同一个：给六人团队做 Slack 周报机器人。两个正例的提示词都显式点名「按 `clarify` 走」，对照组因此也会照澄清式提问的路子做，差值天然偏低。

| 用例 | 测什么 | 该怎么判 |
|---|---|---|
| `build-x-itch` | 主人拿「我想做个周报机器人」来 | 不接受机器人是目标；先给一句可判对错的断言（卡住的是什么），再递一题历史行为，停下；不设计、不写文件 |
| `bug-annoyance` | 「导出按钮又 500 了，烦死了」 | 按缺陷直接处理（推断 TypeError 的原因、要下一步材料），不问该不该做、不出三行 |
| `formed-plan-stress-test` | restic 备份方案已定、脚本已写，主人要压一压 | 归 `grilling` 或直接压方案（恢复没验过、密码只在 NAS 上……），不重判值不值得 |
| `three-line-close` | 三轮历史行为已问完（贴在提示词里），主人要结论 | 三行齐：问题带业界名或「查过，未找到对应名」、值不值得带频率与代价、方向带排除项；结论落 desk 仓 issue（给标题正文或 `gh` 命令），不建别的本地文件 |

grader 判可观测行为：`problem-not-solution`、`handles-as-defect`、`stress-tests-not-rejudges`、`three-lines-with-name`、`issue-not-files` 各判一件事，`tool_used: Write, min 0, max 0` 断言没写文件；正例带一条 `tool_used: Skill` 的 with-only 指示器，只说明 skill 被点到，不计分。

## 基线观察（对照组，不装 skill）

取自 `results/2026-09-19-gate-as123/` 与 `-rerun/` 的对照组（每用例 3 到 6 次；这条 skill 是改既有正文，按开场预授权只跑改后评测，对照组那一列就是基线）。没有这条 skill 时 agent 实际是这样做的：

- `build-x-itch`：六次对照组全部把机器人当成既定目标，自己先定了默认（Slack app 加 `conversations.history`、GitHub Actions cron、用哪个模型），然后问的第一题是「直接发 #general 还是先人工审核（HITL）」——一个设计决定，不是卡住的问题；没有一次把「解」翻回问题。真缺口。
- `bug-annoyance`：两组都按缺陷处理。只作回归守卫。
- `formed-plan-stress-test`：对照组三次都直接压方案、没有重判值不值得；判败的一次是把十来个坑一次摆完（密码只在 NAS、B2 key 带删除权限、从没恢复过……）而没有递一题，grader 要求压方案要「问一题」。两组都守住了「已成形的方案不重判」这条边界，差值来自一轮一题。
- `three-line-close`：对照组六次都给出了长篇建议（别做机器人、改成催收加拼接，引 toil、JTBD 这类名字），结论本身多数是对的，但没有一次收成三行、没有一次说结论落到 desk 仓 issue；两轮合计有三次三行缺其一（没有排除项或没有名字）。真缺口是「收成三行加落 issue」。

## 实跑记录

2026-09-19，默认模型（`claude-opus-5`），裁判 sonnet，有 skill 组对对照组，每用例 3 次，阈值 1.0。

第一轮 `results/2026-09-19-gate-as123/`（24 次运行，513 秒，4.32 美元）：

| 用例 | 有 skill 组 | 对照组 | 差值 |
|---|---|---|---|
| `build-x-itch` | 0.56 | 0.33 | +0.22 |
| `bug-annoyance` | 1.0 | 1.0 | 0 |
| `formed-plan-stress-test` | 1.0 | 0.67 | +0.33 |
| `three-line-close` | 0.50 | 0.42 | +0.08 |

第一轮两条没过的，逐条读了有 skill 组的回复：

- `build-x-itch` 有 skill 组三次里两次只递了一题历史行为（带具体例子、问完停下），没有先给断言。这是正文缺口，不是裁判读法：第 1 步原来把「问历史行为」和「草案写成断言」写成两句并列，agent 第一轮手里没有东西可断言就先问了。改成「每一轮先写一句断言式猜测，再递一题」，并把完成判据改成「每一轮都有一句可判对错的断言加一题」。
- `three-line-close` 有 skill 组三次三行都齐、都带名字（single source of truth、async standup、snippets），两次还给了 `gh issue create` 命令；判败的是 grader 自己：`issue-not-files` 把 `--body-file` 用的正文文件当成「别的本地文件」（与 `references/opportunity-issue.md` 里的命令矛盾），`three-lines-with-name` 把结尾请主人划改三行或选出口的那一问数成「没收口」。两条 grader 改成只判三行内容与落点、允许 `--body-file` 与结尾一问；正文没改。

第二轮只跑这两条，`results/2026-09-19-gate-as123-rerun/<用例>/`（12 次运行，242 秒，2.34 美元）：

| 用例 | 有 skill 组 | 对照组 | 差值 |
|---|---|---|---|
| `build-x-itch` | 1.0 | 0.33 | +0.67 |
| `three-line-close` | 1.0 | 0.58 | +0.42 |

四条用例取各自最后一次结果，平均差值 +0.36；`bug-annoyance` 两组同分，只作回归守卫。

所有结果 JSON 提交前都跑过 `scripts/scrub-eval-results.ts`，家目录路径里的用户名已换成 `<user>`。
