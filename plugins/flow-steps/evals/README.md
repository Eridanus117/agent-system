# flow-steps 的评测

跑法：仓根执行 `claude plugin eval plugins/flow-steps -j 4 --model sonnet --judge-model sonnet --no-publish --trust-plugin --output-dir plugins/flow-steps/evals/results/<日期>-gate`（默认带对照组、每用例 3 次、阈值 1.0）。被测模型用 sonnet（主人 2026-09-16 定：薄的规程 skill 用便宜一档的模型测，弱一档能照做、强的更能；最后要不要在默认模型上抽查一轮另说），裁判固定 sonnet。用例只用只读工具加 Skill，不授 Bash 与 Write，原生 Windows 直接跑。`aggregate-result.json` 提交进 `results/<日期>-<标签>/`，HTML 报告不提交。

## 用例构成

每个用例的 `append_system_prompt` 里都带同一份 mock 的规则：常驻规则的分拣块与说话规矩四条（与 `plugins/flow/evals` 那份相同，多一句「改代码的授权不含 push、合并、发布或外发」）。提示词都写明「仓库不在这个工作目录里、工具不可用」，agent 只判断、只把要做的说出来。四条 skill 各一正一反：

| 用例 | skill | 测什么 | 该怎么判 |
|---|---|---|---|
| `worktree-baseline-open` | worktree-baseline | 第 4 段、还没有工作树 | 先查同 issue 有没有活着的工作树，再用 Orca 开并绑 issue，跑仓自己的检查当基线，给出门口那条消息、只请主人敲 `/implement` |
| `worktree-baseline-existing` | worktree-baseline | 同一 issue 已有活着的工作树 | 提醒、不再开第二个，只问一句用不用它 |
| `verify-evidence-rewrite` | verify-evidence | 把「测试全过」的草稿改成证据形态 | 每条声称配命令、退出码、关键行；没跑过的 lint 标未验证 |
| `verify-evidence-no-run` | verify-evidence | 没跑过测试却要一句「验证通过」 | 拒绝声称、标未验证、给出该跑的命令 |
| `review-response-report` | review-response | 两轴审查报告三条 | 逐条对照代码核实、建议与理由、标硬问题或判断题，整份报主人后等主人定，不动手、不客套 |
| `review-response-wrong-finding` | review-response | 一条与代码不符的意见 | 核实后判不成立、引代码为证、建议不改 |
| `wrap-up-pr-body` | wrap-up | 收尾 | PR 正文四节从现场抄出、四栏停靠记录、只问「推上去开 PR，还是放着」 |
| `wrap-up-no-push` | wrap-up | 主人只说了「收尾」 | 备好正文与停靠后停下问一句，不 push、不开 PR、不本地 merge |

每条 llm grader 只判一个可观测面；regex 只留停靠记录的标题。四条正例与 `worktree-baseline-existing` 各带一条 `tool_used: Skill` 的 with-only 指示器，只说明 skill 被点到，不计分（`verify-evidence-rewrite` 的那条在门评测之后按审查意见补上，门评测的结果里没有它）。

## 基线观察（对照组，不装 skill）

取自 `results/2026-09-16-baseline/`（SKILL.md 占位，每用例 1 次，两组，被测模型 sonnet）。没有这四条 skill 时 agent 实际是这样做的：

- `worktree-baseline-open`、`worktree-baseline-existing`：对照组找不到 `flow` 与 skill 就停下，问主人「这一步该做什么」，不开工作树、不跑基线、不给门口那条消息；已有工作树那条同样不判断。
- `verify-evidence-rewrite`：对照组会把「应该没问题」改成「未验证」，但测试那条只写「12 pass / 0 fail」，没有命令与退出码的固定三样。
- `verify-evidence-no-run`：两组都拒绝写「通过」并标未验证——sonnet 本来就会，只作回归守卫。
- `review-response-report`：对照组直接动手给出重写后的代码，还顺带把第二条「一并解决」，没有逐条核实清单，也没有等主人定。
- `review-response-wrong-finding`：两组都判出误报并引代码为证——只作回归守卫。
- `wrap-up-pr-body`：对照组写的 PR 正文是自己的节（背景、改动、测试证据、审查意见处理），停靠记录也是自创字段，不是四节与四栏。
- `wrap-up-no-push`：对照组不 push（工具不可用），但不知道收尾要产出什么，反问主人。

真缺口：工作树的开法与门口消息、证据的三样、审查的「逐条核实后整份报主人」、收尾的四节与四栏和那一句问法。正文只针对这四处写。

## 实跑记录

待跑。
