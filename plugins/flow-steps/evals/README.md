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

每条 llm grader 只判一个可观测面；regex 只留停靠记录的标题。正例各带一条 `tool_used: Skill` 的 with-only 指示器，只说明 skill 被点到，不计分。

## 基线观察（对照组，不装 skill）

待跑。

## 实跑记录

待跑。
