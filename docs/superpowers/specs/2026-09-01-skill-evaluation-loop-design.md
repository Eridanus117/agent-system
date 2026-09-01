# Skill 评估闭环设计

## 目标

参考 Anthropic 官方 `skill-creator` 的实践，把 Skill 的质量从“文件存在、静态合同通过”推进到“触发与行为有可复核证据”，但不把本仓扩展成模型评测平台。

外部参考：

- [VoltAgent awesome-agent-skills — Official Claude Skills](https://github.com/VoltAgent/awesome-agent-skills#official-claude-skills)
- [Anthropic skill-creator](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md)

## 范围

本次只改现有 `skill-maintenance` Plugin 及其验证面：

- 在 Skill 维护流程中增加按需评估分支；
- 为评估用例定义稳定、可移植的 JSON 合同；
- 提供 TypeScript 确定性校验与汇总工具；
- 为 `skill-maintenance` 自身提供最小评估样例；
- 更新生命周期、符合性和使用入口文档。

不做：

- 不引入新的 `skill-evaluation` Plugin；
- 不复制 Anthropic 官方 Skill 实现；
- 不自动调用 Claude、Codex 或其他模型；
- 不新增 daemon、服务、远程结果库、凭据管理或自动调度；
- 不修改默认 `plugins/skill-imports.toml`；
- 不把评估分数直接变成发布、安装、装配或退役决定。

## 设计

### Skill 层

`skill-maintenance/SKILL.md` 只保留分支判断和顺序：

1. 当变更影响新能力、核心行为或 description 触发面时，要求预注册评估；
2. 为真实提示建立正例、边界例和 near-miss 负例；
3. 对新建 Skill 运行无 Skill 基线，对已有 Skill 运行旧版本对照；
4. 记录结果、失败原因、Token／耗时和运行端边界；
5. 只有结果能解释触发、行为和成本变化时，才修改正文或 description；
6. 评估闭环结束后回到现有版本、生成物、Marketplace 和独立审查流程。

详细字段与目录规则下沉到 `references/evaluation-loop.md`，避免增加常驻上下文。

### 评估用例合同

每个需要行为评估的 Skill 可以在自身目录提供 `evals/evals.json`：

- `skill_name`：必须与父目录 Skill 名称一致；
- `evals[]`：稳定 ID、名称、提示、期望结果、输入文件和断言；
- `kind`：`trigger` 或 `behavior`；
- `expected_trigger`：`yes` 或 `no`；
- `expected_output`：人可读的成功门；
- `assertions`：只描述可观察结果，不断言模型内部思考；
- `files`：相对评估用例目录的输入文件路径。

结果包分为 `baseline`、`with_skill`、`old_skill` 三类。工具只校验结构并汇总已存在的结果，不假定缺失结果为通过。

### 工具边界

新增 `tools/skill_eval/skill-eval.ts`，提供两个确定性子命令：

- `validate <evals.json>`：校验字段、ID 唯一性、触发值、路径安全性和至少一个正/负触发用例；
- `summarize <result-dir>`：读取结果 JSON，计算完成率、断言通过率、触发误报／漏报和成本差异，并明确列出缺失或失败结果。

工具不执行任意 eval 提示，不读取环境凭据，不启动客户端，不写入仓库外路径。

### 证据边界

- 静态校验只能证明评估包格式正确；
- 结果汇总只能证明已提交结果的机械统计；
- with/without Skill 对照才支持行为改进判断；
- 真实客户端运行和新会话回读仍是“已安装并生效”的唯一证据；
- 评估通过仍不替代负责人授权、版本发布、Marketplace 安装和独立审查。

## 兼容性与错误处理

- 缺少结果目录、结果字段非法、断言失败或触发结果缺失时，命令以非零状态退出；禁止静默按成功处理。
- 汇总保留 `unknown`，不把未运行、客户端不可用或结果格式错误折叠成失败率。
- 所有路径必须解析在指定评估根目录内，拒绝 `..` 穿越和绝对路径输入。
- 现有 Skill 路由图、生命周期字段、复杂度计量和 Marketplace 格式保持兼容。

## 验证

1. 工具单元测试覆盖合法合同、重复 ID、缺少正/负用例、路径穿越、缺失结果、断言失败和成本汇总。
2. `skill-maintenance` 的评估样例通过工具校验。
3. 现有 `node plugins/tests/workflow-routing.test.ts` 必须继续通过。
4. 运行完整仓库相关测试；若工具声明真实客户端行为，只报告未执行，不用静态结果冒充。
5. 修改完成后由独立审查 pass 检查触发边界、错误处理、路径安全和文档一致性。
