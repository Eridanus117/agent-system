# note 的评测

跑法：仓根执行 `claude plugin eval plugins/note -j 3 --allow-tools Write --judge-model sonnet --max-cost-usd 20 --no-publish --trust-plugin --output-dir plugins/note/evals/results/<日期>-<标签>`（默认带对照组、每用例 3 次、阈值 1.0）。被测模型用默认模型，裁判固定 sonnet。用例只用只读工具加 Write 与 Skill，不授 Bash，原生 Windows 直接跑；`memex`、`rhizome`、`git` 这些真实入口在沙箱里没有，提示词写明「Bash 不可用，命令按顺序写进 `commands.sh`」，也就是 dry run。`aggregate-result.json` 提交进 `results/<日期>-<标签>/`，HTML 报告不提交。

## 用例构成

每个用例的 `append_system_prompt` 里都带同一份 mock 的常驻规则（中文回复、一轮只问一题、按业界实践、能查清的事实自己查、授权不含 push）。目标知识库是虚构的 `kb/`：它的 `AGENTS.md` 四条规则（落点目录与两位序号、frontmatter 三键、人工索引一行、检索与校验入口）和人工索引现有四行都贴在提示词里，工作目录本身是空的。

| 用例 | 测什么 | 该怎么判 |
|---|---|---|
| `persist-conclusion` | 主人要把「SQLite 在 SMB 网络盘上不能开 WAL」这条结论沉淀进库 | 写之前先找回（读索引、grep、或把 `memex query --lane lexical` 写进 `commands.sh`）；正文进 `10-知识笔记/40-工具/` 接下一个序号、frontmatter 三键齐；索引同一次改；校验、编译、回查没跑到的写「未做」，不说「已同步」 |
| `retrieve-only` | 主人只是想找回以前记过的「Windows 长路径」那条 | 指到索引里已有的条目当来源，写检索命令或说要读那个路径；不新建笔记、不加索引行 |
| `progress-log-not-knowledge` | 主人想把当天进度（改了三处、PR #41 未合、明天继续）记进知识库 | 说这是任务状态，归站会记录或工作日志；不写笔记、不加索引行 |

grader 判可观测行为：`file_exists` 判笔记文件在不在、`regex`（`{source: file, path: 05-索引/10-索引.md}`）判索引行、`retrieve-before-write` 用 `focus: trace` 判「先找回后写」的顺序、`honest-status` 判最后一条消息里没跑的环有没有如实标出。正例带一条 `tool_used: Skill` 的 with-only 指示器，只说明 skill 被点到，不计分。

## 基线观察（对照组，不装 skill）

取自 `results/2026-09-19-gate-as123/` 的对照组（每用例 3 次；这条 skill 是改既有正文，按开场预授权只跑一次改后评测，对照组那一列就是基线）。没有这条 skill 时 agent 实际是这样做的：

- `persist-conclusion`：对照组三次都按贴进去的四条规则写对了文件与索引，也把 `rhizome check`、`memex-sync compile` 写进了 `commands.sh`；差别在「先找回」与「如实报没跑的环」——三次里一次直接开写、没有任何找回动作，同一次的报告只列了 check 与 compile、漏了写后回查（`memex query`）这一环，两条 grader 都判败。真缺口是这两处。
- `retrieve-only`：两组都从索引找到「Windows 长路径与文件锁」那条、指为来源、没有新建笔记。只作回归守卫。
- `progress-log-not-knowledge`：对照组三次都把进度写成了 `20-工作方法/` 下的一篇笔记（两次还加了索引行），其中一次问要不要为「项目进度」新开主题目录；没有一次说这是任务状态、该去站会记录或工作日志。真缺口。

## 实跑记录

2026-09-19，默认模型（`claude-opus-5`），裁判 sonnet，有 skill 组对对照组，每用例 3 次，阈值 1.0，`results/2026-09-19-gate-as123/`（18 次运行，459 秒，5.79 美元）。

| 用例 | 有 skill 组 | 对照组 | 差值 |
|---|---|---|---|
| `persist-conclusion` | 0.87 | 0.80 | +0.07 |
| `retrieve-only` | 1.0 | 1.0 | 0 |
| `progress-log-not-knowledge` | 1.0 | 0 | +1.0 |

平均差值 +0.36。`retrieve-only` 两组同分，只作回归守卫。

没到 1.0 的一条要说清：`persist-conclusion` 0.87——有 skill 组三次里一次 `retrieve-before-write` 三票 PASS FAIL FAIL。那次的回复写明「写前找回降级成读人工索引，4 条里没有相近正文；副本是空的，同义词文件检索无从做起」，文件与索引都对，四环都标了「未做」；这条 grader 用 `focus: trace` 让裁判读整段执行记录，两票 FAIL 是裁判在长记录里没数到找回那一步，不是行为缺口。按开场预授权（评分噪声写 README 不重跑）不为 1.0 硬线重跑。

所有结果 JSON 提交前都跑过 `scripts/scrub-eval-results.ts`，家目录路径里的用户名已换成 `<user>`。
