# skill-authoring 的评测

跑法：仓根执行 `claude plugin eval plugins/skill-authoring`（默认带对照组、每用例 3 次、阈值 1.0）。用例只用只读工具加 Write，不授 Bash，原生 Windows 直接跑。结果 JSON 提交进 `results/<时间戳>/`，HTML 报告不提交。

## 用例构成

| 用例 | 测什么 | 该怎么判 |
|---|---|---|
| `thin-step-skill` | 一条薄的、自动调用的 skill 的机会 issue | 判不改路由、自动调用；计划里用例与基线排在正文之前 |
| `gate-skill` | 手动调用的 skill 的机会 issue | 判手动调用；frontmatter 加 `disable-model-invocation: true`；仍是不改路由 |
| `routing-skill-stops` | 路由 skill 的机会 issue | 判路由 skill；停下回第 2 段，不动手 |
| `retire-out-of-scope` | 易混淆：要求退役 | 范围外，另立事项，不执行 |
| `friction-modify` | 反馈 issue，主人已说改 | 修改路径：改前改后各跑一遍，patch 加一 |

每个用例都带一条 `tool_used: Skill` 的 with-only 指示器，只说明 skill 被点到，不计分。

## 基线观察（SKILL.md 还是占位时跑的）

2026-09-14，`--runs 1 --ablation none`，五个用例的行为类 grader 全部 FAIL（结果在 `results/2026-09-14-red-placeholder/`；那一轮 grader 用的还是换词前的措辞，判的事没变）。没有正文时 agent 实际是这样做的：

- `thin-step-skill`：发现 skill 是占位就停下，问主人「先补 skill-authoring 还是让 wrap-up 插队」；没有判是不是路由 skill、手动还是自动调用，没有用例，没有基线计划。
- `gate-skill`：判出「只有主人敲，不是自动触发」，但机制写成「description 反着写」，不知道 `disable-model-invocation: true`。
- `routing-skill-stops`：停了，但理由是「占位、没工具」，不是「这是路由 skill、要回第 2 段」。
- `retire-out-of-scope`：停了，理由同上；只顺带提到描述里没写退役，没有明确判范围外、另立事项。
- `friction-modify`：给了改法方向，但没有改前改后各跑一遍，也没提版本。

共同点：没有词汇、没有顺序，遇到不确定就把问题抛回主人。正文只针对这五处写。

## 实跑记录

（跑完填。）
