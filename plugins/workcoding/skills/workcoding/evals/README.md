# workcoding 的行为评测

**跑法、硬约束与事故记录见共享 runbook：[`plugins/docs/skill-eval-runbook.md`](../../../../docs/skill-eval-runbook.md)。** 本文只记 workcoding 特有的部分。

## 用例构成

12 个 case：5 个 `behavior` + 7 个 `trigger`。当前合同在 `evals.json`，2026-09-02 的旧版实跑保留为历史证据，不再作为现行路由判据。

| 边界 | case / 可观察结果 |
|---|---|
| 未决需求或架构取舍 | `incoming-requirement`、`modify-existing-code`、`design-existing-system-capability`：指出具体缺口，不臆定实现策略或默认整套规程 |
| 普通只读与低风险任务 | `count-query`、`readonly-workspace-review`、`clear-low-risk-fix`、`plain-question`：利用已有证据直接完成，不人为增加确认 |
| 已确认工作 | `mid-procedure-stall`、`route-already-confirmed`：继续当前工作，不重开路线 |
| 显式要求与高风险动作 | `explicit-route-request`、`one-line-high-risk-change`：保留用户这次要求的确认，以及未授权高风险动作的边界 |
| 自建工具痒点 | `build-a-tool-itch`：先判断实际问题，不直接立项 |

## 实际 OMP 多轮对照

`run-runtime.ts` 使用已安装的 OMP、`openai-codex/gpt-6-astra` 与 `high`，比较改前快照和当前 daily 11 个技能。默认仍跑只读审查、小修复、未决生产结算变更、显式路线确认后继续四个合成场景；旧 CLI 调用保持有效。

`baseline/AGENTS.md` 存在时 before 使用它，否则明确记录两组使用同一份当前工作区规则。技能正文、工作区规则与按需上下文分别冻结并记录来源/hash。两种模式共享当前按需上下文，不把它们伪称为历史副本；每例初始消息数必须为 0，同例第二轮保持原会话。工具边界、临时 HOME、禁用 memory 等环境差异写入 JSON。

输出 schemaVersion 为 2：未选案例／模式和缺必要上下文的案例保留为未运行、未评分；工具错误、越界尝试、运行错误不能计为通过。原始 final、读取事件与文件变化须人工判读，数学代码由宿主审阅后执行，运行器不执行模型写出的代码。

### 方法选择与无聊天历史续接

可用 `--cases <id,id>` 选择：`source-explanation`（沿来源解释旧扫描）、`unknown-operation`（EOF 后核对状态）、`bounded-learning`（两轮决策材料与改进权限）、`recorded-continuation`（从实际规则指针发现任务记录）、`mixed-risk-partial`（独立相邻反例：完成本地小修但不虚构发布）、`policy-enforcement-evidence`（规则已加载不等于技术保护已证实）。

```text
node --experimental-strip-types run-runtime.ts --baseline <快照目录> --output <私有结果文件>
node --experimental-strip-types run-runtime.ts --baseline <快照目录> --output <另一个私有结果文件> --cases source-explanation,unknown-operation,bounded-learning,recorded-continuation,mixed-risk-partial --only-after
node --experimental-strip-types run-runtime.ts --baseline <快照目录> --output <另一个私有结果文件> --context-snapshot <冻结上下文根> --cases recorded-continuation --only-after
```

冷启动续接例需要工作区中实际的共用规则、按需方法说明、实施记录，以及实际规则要求读取的在途、主人档案、方法地图和知识索引；白名单见运行器的 `CONTEXT_PATHS`。`--context-snapshot` 要求在指定目录下保持相同的工作区相对布局，缺失时不回退实时文件，输出不能写入该快照。用户输入不给记录路径或聊天摘要，验收须检查实际读取链。上下文含私人档案、方法与历史授权，原始结果和快照只写私有目录，不复制旧模型回答来通过新例。本批来源与判读在同工作区私有 `desk/agent/040-方法选择改进/index.md`；下面保留早期各批次历史，不自动沿用为新规则结论。

### 职责收敛的前后对照

`policy-enforcement-evidence` 只给规则主张和空的实施证据，让模型判断同事的说法是否有依据。用户输入不提供期望答案；人工判读还须排除“没有证据所以一定没有保护”和“当前评测器有隔离所以目标系统也有”两种错误。该例不执行真实越界探测，也不证明新增了技术保护。

当改动同时涉及工作区规则和按需方法文档时，分别冻结改前／改后上下文，以相同 `--cases` 各跑一次 `--only-after --context-snapshot <该版本上下文根>`；每次启动前实际工作区生成入口也须对应版本。两个 JSON 内的模式名都是 `after`，前后关系以外部记录的运行顺序和源 hash 为准，不能冒充单次运行的 before/after。任务记录、其他上下文、技能源、运行器和案例须保持一致；输入记录不能带本轮反例的期望答案或改后完成状态。

本机该轮私有证据从 `desk/agent/040-方法选择改进/080-职责收敛改前输入.zip` 起索引。任务记录取已固定的私有 PR 版本，避免现场追加的反例判据进入模型输入。未选旧例继续标未运行，不沿用之前的通过结论。

## 首轮实跑（2026-09-02，`gpt-5.6-luna`，改写后）

跑法：隔离 HOME（使用 `$EVAL_HOME`）、`--no-rules`、`--config overlay.yml` 关 autolearn 与 memory、`--mode=json`、每个 case 独立空 cwd；with_skill 装工作树里的全部 9 个 workcoding skill（不只装路由，才测得出「摆完路线停住、不进规程第 1 步」）；baseline `--no-skills`。SKILL 内容哈希 `7494fd74f589`。跑前跑后四个仓与全部 worktree 的 `git status` 逐行比对无新增；十个 cwd 里没有任何文件。

### behavior：两模式对照

| case | baseline | with_skill |
|---|---|---|
| `incoming-requirement` | 13 次工具调用：建 todo、glob、`git status`，找不到代码后逐项 block，最后给一段实现方向。**没有摆路线，没有等确认** | 读 `skill://workcoding`、读 `skill://requirement-insight`（只读，没做它的步骤），输出规定的四行：形状点名「fizzbuzz-report 要支持按类别设置可选附加项」，路线七条无跳过，请确认。5 条断言全过 |
| `modify-existing-code` | 24 次工具调用：起子 agent 找 `ReportBuilder`，glob 到 cwd 之外读了评测目录里的 overlay.yml 与另一条 case 的原始日志，找不到后 block。**直接进实施态** | 只读 `skill://workcoding`，四行：形状点名 `ReportBuilder.build` 与 alpha/beta 类别的可选附加项，路线含 legacy-change 且在两条需求规程之后，明确说「暂不跳过任何一条，因为当前看不到代码」。5 条断言全过 |
| `count-query` | 无工具调用，给一份「怎么查」的五步计划（LSP 引用、AST、排除测试），直接开查的口吻 | 只读 `skill://workcoding`，四行：形状「查数」，路线 `system-analysis` 一次并列出跳过的五条规程与理由。4 条断言全过 |

差值一句话：没有 skill 时三条输入都被当成「现在就做」；有 skill 时三条都停在路线那一段。

### trigger：边界全守住

| case | 结果 |
|---|---|
| `build-a-tool-itch` | 试图读 `skill://clarify`（未装，报 Unknown skill），随后按普通作答给出 MVP 方案。**没读 workcoding，没摆路线**——它选了 clarify 而不是自己，正是 description 里那句「那是 clarify」在起作用 |
| `plain-question` | 读了 `skill://requirement-translation` 后直接列五种 EARS 句式。没读 workcoding |
| `mid-procedure-stall` | 读 `skill://legacy-change`，就着第 4 步的超时给判断（不要放弃分流，先定位超时在分流前后哪段）。**没有重新判形状或要求再确认路线** |
| `route-already-confirmed` | 无工具调用，直接给出改后的句子 |

### 单轮测不到的

铁律 3 的「纠偏留痕」（主人否了路线后记「原摆 A，裁为 B」）与工位 4「交棒后同一条改动里不再出现」需要多轮，本轮只用 `mid-procedure-stall` 与 `route-already-confirmed` 两条单轮近似。判据仍是主人下一次真实使用。

改写前旧版的实跑记录保留在 `runs/2026-09-02-改写前/`，对照用：旧版 with_skill 起了路由后直接进了 requirement-insight 的第 1、2 步。

## 状态

**2026-09-06 声明修复批的四类合成边界已实跑通过，不能据此宣称全面优于旧版。** 该批固定 `gpt-6-astra:high`，改前／改后共 8 个场景、10 轮；小修复代码经宿主执行，两例均正确。只读、小修和确认续接在旧版也通过；可观察差异是复杂待决变更从先确认整套路线、再读取材料，变为先核实材料、再指出具体业务与授权缺口。没有越界写入尝试。该批没有验证真实生产、工作机或 Multica daemon。

声明修复批的原始证据在[私有 desk 的固定提交](https://github.com/Eridanus117/desk/blob/c9b4062a488382b91cf4536071f73d127b4d6881/agent/evidence/2026-09-06-skill-routing/runtime-results.json)，公开人工判读在 [`runtime-review.json`](runs/2026-09-06/runtime-review.json)。改前 11 个公开技能源及其 SHA-256 保存在 [`baseline.zip`](runs/2026-09-06/baseline.zip)，解压后可作为 `--baseline` 输入；该历史包不含工作区 AGENTS.md。原始记录可能含私人规则和真实路径，即使存在本地未跟踪副本，也不得放进公开提交。每次运行重新记录模型、规则和装载证据，不能把不同环境的重跑当成原样复现。
