# skill-authoring 的评测

跑法：仓根执行 `claude plugin eval plugins/skill-authoring -j 4 --allow-tools Write --judge-model sonnet --output-dir plugins/skill-authoring/evals/results/<日期>-gate`（默认带对照组、每用例 3 次、阈值 1.0）。用例只用只读工具加 Write，不授 Bash，原生 Windows 直接跑。`aggregate-result.json` 提交进 `results/<日期>-<标签>/`，HTML 报告不提交。

## 用例构成

| 用例 | 测什么 | 该怎么判 |
|---|---|---|
| `thin-step-skill` | 一条薄的、自动调用的 skill 的机会 issue | 判不改路由、自动调用；计划里用例与基线排在正文之前 |
| `gate-skill` | 手动调用的 skill 的机会 issue | 判手动调用；frontmatter 加 `disable-model-invocation: true`；仍是不改路由 |
| `routing-skill-stops` | 路由 skill 的机会 issue | 判路由 skill；停下回第 2 段，不动手 |
| `retire-out-of-scope` | 易混淆：要求退役 | 范围外，另立事项，不执行 |
| `feedback-modify` | 反馈 issue，主人已说改 | 修改路径：改前改后各跑一遍，patch 加一 |

每个用例都带一条 `tool_used: Skill` 的 with-only 指示器，只说明 skill 被点到，不计分。

## 基线观察（对照组，不装 skill）

取自 `results/2026-09-15-gate/` 的对照组（每用例 3 次）。没有这条 skill 时 agent 实际是这样做的：

- `thin-step-skill`：先争论载体（skill、hook 还是 subagent）、定文件布局和行数，直接进入怎么写正文；没有「是不是路由 skill」「手动还是自动调用」的判断，没有用例，没有基线。
- `gate-skill`：三次里两次知道该用 `disable-model-invocation: true`（这是 Claude Code 的通用知识，所以这条差值小），一次把它做成别的形态；都没有把「不改路由、走短路线」说出来。
- `routing-skill-stops`：停下了，但理由是「环境里没有那几条 skill 和路线原文」，不是「这是路由 skill、要回第 2 段等主人」。
- `retire-out-of-scope`：停下了，理由是「文件不存在」；没有判退役在范围外，也没有另立事项。
- `feedback-modify`：给出改法（把 merge 改成条件路径），但没有改前改后各跑一遍同一套用例，也没提 patch 版本。

共同点：没有词汇、没有顺序，遇到不确定就把问题抛回主人。正文只针对这五处写。更早的一轮基线（SKILL.md 占位、`--ablation none`）在 2026-09-14 跑过，观察相同，但有 skill 组点到的是占位 skill，混进了「skill 是空壳」的反应，所以不再保留，以对照组为准。

## 实跑记录

2026-09-15，`claude plugin eval plugins/skill-authoring -j 4 --allow-tools Write --judge-model sonnet`（有 skill 组对对照组，每用例 3 次，阈值 1.0），结果在 `results/2026-09-15-gate/aggregate-result.json`：5 个用例全过，总分 1.0，平均差值 0.84，30 次运行无超时，花费约 7.6 美元。

| 用例 | 有 skill 组 | 对照组 | 差值 |
|---|---|---|---|
| `thin-step-skill` | 1.0 | 0 | 1.0 |
| `gate-skill` | 1.0 | 0.78 | 0.22 |
| `routing-skill-stops` | 1.0 | 0 | 1.0 |
| `retire-out-of-scope` | 1.0 | 0 | 1.0 |
| `feedback-modify` | 1.0 | 0 | 1.0 |

两点要说清：

- `gate-skill` 差值小：issue 正文已写明「只有主人敲」，对照组多数也知道该加 `disable-model-invocation: true`。这条主要是回归守卫；下次改用例时把 issue 写得含蓄一点，让它更有区分力。
- 迭代过程：第一版 `thin-step-skill` 是「照 issue 做到停下为止」的重用例，agent 会在沙箱里起脚手架、写用例，12 轮或 300 秒内做不完，三次里两次超时；改成和其余四条同形态的「只判断、只列计划、不建文件」轻用例后稳定通过。真正起脚手架的用例要等评测沙箱能给仓库写权限时再加。裁判模型固定用 sonnet：默认的 haiku 对满足判据的回答也投过三票 FAIL。

结果 JSON 提交前跑过 `scripts/scrub-eval-results.ts`，家目录路径里的用户名已换成 `<user>`。

2026-09-19，改后一轮（agent-system#116：写法合同改成两节骨架、业界词、正面句，版本 0.1.1；改前那份沿用上面的 2026-09-15-gate），同一命令，结果在 `results/2026-09-19-gate/aggregate-result.json`：5 个用例全过，总分 1.0，平均差值 0.87，30 次运行无超时，608 秒，花费约 8.0 美元。

| 用例 | 有 skill 组 | 对照组 | 差值 |
|---|---|---|---|
| `thin-step-skill` | 1.0 | 0 | 1.0 |
| `gate-skill` | 1.0 | 0.67 | 0.33 |
| `routing-skill-stops` | 1.0 | 0 | 1.0 |
| `retire-out-of-scope` | 1.0 | 0 | 1.0 |
| `feedback-modify` | 1.0 | 0 | 1.0 |

`gate-skill` 仍是回归守卫（理由同上）。这一轮 grader 没改，判的仍是分类、停下、改前改后各跑一遍这些行为，不判消息形状。
