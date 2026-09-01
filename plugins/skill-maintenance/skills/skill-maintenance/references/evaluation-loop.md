# Skill 评估闭环

仅在变更影响以下任一项时读取本文件：新能力、核心行为、description 触发面、正文与相邻 Skill 的边界。纯格式、版本同步和生成物重建不单独触发评估。

## 1. 预注册

在编辑前创建 `evals/evals.json`，至少包含：

- 一个预期触发的真实提示；
- 一个共享关键词但预期不触发的 near-miss 提示；
- 每个用例的可观察成功门和输入文件；
- 行为用例的断言，断言只描述最终输出或文件状态，不描述模型内部思考。

运行：

```text
bun tools/skill_eval/skill-eval.ts validate <skill-dir>/evals/evals.json
```

## 2. 配对运行

为新 Skill 运行 `baseline` 与 `with_skill`；为已有 Skill 变更运行 `old_skill` 与 `with_skill`，需要时保留 `baseline`。每个运行方保存一个 JSON 文件：

```text
<result-dir>/baseline.json
<result-dir>/with_skill.json
<result-dir>/old_skill.json
```

结果必须包含 `skill_name`、`mode` 和每个用例的 `eval_id`、`triggered`、`status`、`assertions`。`status=unknown` 表示未运行、客户端不可用或证据不足，不能当作通过或失败。

## 3. 汇总与判断

运行：

```text
bun tools/skill_eval/skill-eval.ts summarize <result-dir> --evals <skill-dir>/evals/evals.json
```

重点查看：

- 触发准确率、误触发和漏触发；
- 行为用例通过率与断言通过率；
- 平均耗时和 Token 差异；
- 缺失、unknown、格式错误和单边结果。

汇总工具遇到缺失配对结果、非法结果、重复结果、unknown、触发误报／漏报、失败状态或失败断言时以非零状态退出。所有这些失败仍保留在输出中，不静默折叠到成功率。

## 4. 迭代与停止

先修复能解释失败的最小正文或 description 变化，再用同一批提示重跑。只有触发、行为和成本变化都能解释，且没有新的 near-miss 回归时才收口；如果评估没有减少关键未知，停止增加规则并返回普通维护流程。

评估结果不能单独证明 Skill 已发布、已安装或已在运行端生效。发布仍需版本、双端 Marketplace、生成物和独立审查；运行端生效仍需目标客户端回读与真实新会话证据。
