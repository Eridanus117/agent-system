# 评测用例怎么写、怎么跑

工具是 Claude Code 自带的 `claude plugin eval`（2.1.269 起）。每次运行都给一次性的 HOME、工作目录和配置，只装被测插件，用户级 skill、CLAUDE.md、MCP、记忆都不进去；默认带一个不装插件的对照组并报差值。

## 目录形

```
plugins/<插件>/evals/
  README.md                 用例构成、基线观察、实跑记录
  <用例名>/
    prompt.md               frontmatter + 提示词正文
    case.yaml               可选：scaffold_script、history_file、add_dirs
    graders/<名>.md         一个 grader 一个文件
    fixtures/               可选：fixture （git bundle、示例文件）
  mocks/<server>/<tool>.md  可选：MCP 工具 mock
  results/<日期>-<标签>/     运行结果；提交 aggregate-result.json，不提交 report.html
```

## prompt.md 的 frontmatter

`name`（默认目录名）、`description`、`tags`、`runs`（默认 3）、`max_turns`（默认 10）、`timeout_seconds`（默认 300）、`allowed_tools`、`model`、`append_system_prompt`、`env`（只放行 `EVAL_*` 前缀）。正文就是发给 agent 的原话。

## case.yaml 的 context

- `scaffold_script`：一段 bash，运行前在空工作区里建 fixture （`git init`、提交、分支、从 bundle 克隆）。只有传了 `--scaffold` 才跑，跑在沙箱外、以你的身份。
- `history_file`：一份 `.jsonl` 对话，从它续接。多轮行为（一轮一题的「想清楚」类 skill）靠它把前几轮当假历史贴进去。
- `add_dirs`：只读挂进来的目录。

## 六种 grader

| 类型 | 花钱 | 判什么 | 关键字段 |
|---|---|---|---|
| `regex` | 否 | 输出或执行记录里有没有某个模式 | `pattern`、`target`（`last_message`／`trace`／`files`／`{source: file, path}`） |
| `tool_used` | 否 | 某工具是否被调用、调用了几次、参数匹配 | `tool`、`input_match`、`min`、`max` |
| `tool_order` | 否 | 工具调用顺序 | `before`、`after` |
| `file_exists` | 否 | 某文件是否被创建 | `path`（可 glob）、`exists` |
| `llm` | 是 | 按正文里的判据由裁判模型打分（三票多数） | `weight`、`focus` |
| `baseline` | 是 | 与一份参考对话比 | `baseline_file`、`criteria` |

`arm: with-only` 的 grader （包括 `tool_used: Skill`）只是「skill 被点到」的指示器，不进分数，两组才可比。

## 用例纪律

- 2–3 个用例起步：一个正例（skill 该做的事）、一个易混淆的反例（共享关键词但该归别人或范围外）、需要时一个多轮。
- 提示词自足：对象贴在提示词里（issue 正文、反馈原文），不写「这个任务」「那个文档」；用明显虚构的名字。
- 不指向真实工作区：不写本机路径、仓名下的真实文件；工作区本来就是一次性的，但提示词里的指针会让 agent 去找。
- 判「真正完成」而不是「表面合规」：文件名对但内容空算失败；不确定时举证责任在断言方；一个弱断言上的通过比没测更糟。
- 每条 llm grader 只判一件事，写清 PASS 与 FAIL 各是什么样。
- grader 判可观测行为，不判消息形状：判 agent 做了什么（读了哪个文件、调了什么工具、给出了什么判断、停在哪），而不是回复有没有某个标题、几栏、什么句式。输出形状有要求的，模板放 skill 的 `references/`，正文只引用；grader 判「四栏的内容各是什么」，而不是「有没有那四个字」。正文为了过 grader 而加模板和例子，是把因果倒过来了。

## 跑

```
# 写完用例、SKILL.md 还是占位时：记基线（默认带对照组；基线看对照组那一列）
claude plugin eval plugins/<插件> --runs 1 --allow-tools Write --judge-model sonnet --no-publish --trust-plugin   --output-dir plugins/<插件>/evals/results/<日期>-baseline

# 写完正文：有 skill 组对对照组，默认 3 次
claude plugin eval plugins/<插件> -j 4 --allow-tools Write --judge-model sonnet --max-cost-usd 20 --no-publish --trust-plugin   --output-dir plugins/<插件>/evals/results/<日期>-gate
```

常用旗标：`--case <glob>` 只跑某个用例；`--runs`；`--threshold`（默认 1.0，低于则退出 1）；`--allow-tools`（授 Bash、Write 等被门控的工具）；`--scaffold`；`--keep-temp`（留下沙箱目录查执行记录）；`--report <路径>`；`--model`／`--judge-model`。

提交前跑 `node plugins/skill-authoring/skills/skill-authoring/scripts/scrub-eval-results.ts <结果目录>`，把 JSON 里家目录路径中的用户名换成 `<user>`（ADR-0003）。裁判模型固定用 `--judge-model sonnet`：默认的 haiku 对满足判据的回答也投过三票 FAIL。

读结果：`aggregate-result.json` 里每个用例的 `aggregates.score`、`delta`（有 skill 组减对照组）、每次运行每条 grader 的 `passed` 与 `evidence`。看执行记录（`--keep-temp` 后的 `out/trace.jsonl`）不只看最终答案。对照组也通过的用例没有区分力，只能当回归守卫，要在 README 说明。

## 工具与沙箱

- 只读工具加 `Write` 的用例在原生 Windows 直接跑。
- 授 `Bash` 的用例要求 OS 级沙箱。原生 Windows 的沙箱是灰度特性（环境变量 `CLAUDE_CODE_NANKEEN_KESTREL=1` 开门，`/sandbox install` 装），本机 2026-09-14 实测起不来（desk#145）；这类用例先写成 dry run：提示词里说明 Bash 不可用，让 agent 把要执行的命令按顺序写进 `commands.sh`，用 `file_exists` 加 `regex`（`target: {source: file, path: commands.sh}`）断言命令与参数。沙箱可用后再改回真跑。
- 要真执行时另可选的做法：Codex 原生沙箱 `codex exec --json --ephemeral --ignore-user-config --ignore-rules -C <fixture> -s workspace-write -o 最后一条.md "<提示词>"`（skill 放在 fixture 的 `.agents/skills/<名>` 下，`$名` 调用）；OMP 借 Codex 沙箱 `codex sandbox -- omp -p --mode=json --no-session --no-rules --skills=<名> "/skill:<名> <提示词>" < /dev/null`。判分自己读记录。只在 skill 涉及客户端差异（调用语法、命名空间、可见档）时跑。
