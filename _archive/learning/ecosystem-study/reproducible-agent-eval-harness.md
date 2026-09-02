# A6 可复现 Agent 评测 Harness：让一次成功不再冒充可靠性

> 核验日期：2026-08-12
>
> 结构位置：[关联 #165（生态情报持续改进我们的系统）](https://github.com/Eridanus117/agent-control/issues/165) 的路线 A / A6；上位为[关联 #164（研究与学习程序）](https://github.com/Eridanus117/agent-control/issues/164)。
>
> 增量边界：承接[关联 #159（Agent 记忆与评测）](https://github.com/Eridanus117/agent-control/pull/159)已经形成的 task／trial／grader／trace／outcome 方法，不重做 LangSmith、Braintrust、OpenAI 或 Anthropic 的泛评测综述。本文件只补可执行 harness 的运行身份、环境、重试、评分和版本可比性。
>
> 邻接边界：[关联 #192（A3 互操作边界）](https://github.com/Eridanus117/agent-control/pull/192)处理 A2A、MCP Tasks 与 Orca 的协议选择；本文件不修改它占有的目录索引，也不把评测 harness 变成第二套编排协议。

## 结论先行

生态样本支持一条比“再选一个评测平台”更窄、也更重要的结论：**可靠性证据必须冻结任务、执行配置、环境、尝试语义、评分器和数据版本；否则重复运行只会生成不可比较的数字。**【I：由下列 D/P 证据映射到我方；实际收益仍为 U】

1. Inspect AI 把 task、solver、scorer、sandbox、log、run config 和 eval set 做成可恢复的运行单元；失败样本可在重试时复用，未完成集合可续跑，旧轨迹还可脱离生成阶段重新评分。【P】这说明基础设施重试、独立随机 trial、旧轨迹重评分和环境重放是四种不同事件，不能都叫“再跑一次”。
2. SWE-bench 的容器化 harness 说明可重复环境、gold 基线、构建日志与逐实例结果是 outcome 评测的必要基础；其当前实现又明确提醒缓存只按 `run_id + instance_id` 命中。【P】如果相同身份下换了预测输入，旧结果可能被误复用；稳定名字不是完整实验身份。
3. SWE-bench 从 2024 年人工筛选到 2026 年再次暴露任务与污染问题，τ³-bench `v1.0.1` 也明确说明一次评分修订让受影响域的旧新结果不可直接比较。【P】“已验证 benchmark”不是永久属性；task、grader 与 dataset revision 都是证据的一部分。
4. τ-bench／τ³-bench 优先比较最终数据库状态与必要沟通，而不是强迫 Agent 复制一条参考工具轨迹；只有任务真的要求唯一动作序列时才把动作纳入硬评分。【P】我方也应默认把远端后态作为 outcome，轨迹作为守恒／诊断证据；只有合同明确要求路径时才把它升级为硬门。
5. 我方已有 GitHub 合同真源、Orca Dispatch 事实、直接后态检查、验证报告与 APS 证据等级；[关联 #165（生态情报持续改进我们的系统）的 A1-1 直接实验回执](https://github.com/Eridanus117/agent-control/issues/165#issuecomment-5269292461)也已经冻结一批输入、条件、配置、判据与结果。【D】这份样本存在，但还不是 H1–H4 完整、可独立重放的证据包；当前缺口不是先建平台，而是保留该回执并只补它无法提供的重放、对照、grader 与 attempt／版本处置维度。【D/U】

推荐先在一个真实、重复价值高的防漂移样本中手工运行本文 H1–H4；只有两次异质样本都显示人工证据包的漏项或重放成本成为主瓶颈，才比较 Inspect AI 之类的可替换执行适配器。研究交付不授权安装框架、建设常驻服务或改变当前三方审阅与负责人决定边界。

## 与既有 A6 结论的关系

[关联 #159（Agent 记忆与评测）](https://github.com/Eridanus117/agent-control/pull/159)已经给出八项当前可复用结论：

- task、trial、transcript／trace、outcome、grader、suite 分开；
- outcome grader 与 trajectory grader 分开；
- 确定性检查优先，模型评分补充，人工校准兜底；
- 能力集与回归集分开；
- 多次 trial 才能讨论稳定性；
- 正例与镜像负例并存；
- 读轨迹是 grader 校准的一部分；
- 真实失败回流回归，但回归不代替生产观察。

本文件不改变这些结论，只回答其中尚未落到执行合同的五个问题：

1. 什么字段共同定义“一次可复现运行”？
2. 基础设施重试与独立随机 trial 怎样区分？
3. 怎样证明任务、环境与 grader 本身没有制造假失败或假成功？
4. 哪些轨迹约束是硬门，哪些只是诊断信号？
5. benchmark、task 或 grader 变化后，旧新结果还能否比较？

## 证据分级与观察水位

| 等级 | 含义 | 本文件中的使用 |
| --- | --- | --- |
| D：本次直接核验 | 远端合同、当前仓库文件、GitHub API 返回的上游 commit／release | 我方基线、上游版本与当前文件状态 |
| P：一手来源 | 官方文档、官方仓库、作者论文、产品方公开的方法报告 | 外部 harness 机制、任务修订与已报告局限 |
| S：二手转述 | 非官方解读或聚合 | 不用于关键结论 |
| I：适配推断 | 从 D/P 映射到我方系统的判断 | 所有能力缺口、候选与优先级 |
| U：未知 | 未安装、未运行，或 A1-1 直接实验尚未覆盖的完整重放、独立 grader、attempt／版本处置 | 候选收益、成本、误报与长期稳定性 |

版本水位：Inspect AI 官方仓库固定到 [`d019d808`](https://github.com/UKGovernmentBEIS/inspect_ai/commit/d019d8088b36cce66c50ac4c08ff0268d4b41532)；SWE-bench 固定到 [`f5daed86`](https://github.com/SWE-bench/SWE-bench/commit/f5daed8662c1b6b7c4ca63d3ffacf302d19e48aa)；τ³-bench 的评分语义固定到 release [`v1.0.1`](https://github.com/sierra-research/tau2-bench/releases/tag/v1.0.1)／commit [`fc0055dc`](https://github.com/sierra-research/tau2-bench/commit/fc0055dc4e0a316c3f83133267fbd6faaa770992)。canonical 文档统一 `observedAt=2026-08-12`。

### A1-1 已有直接实验的证据边界

[关联 #165（生态情报持续改进我们的系统）的 A1-1 直接实验回执](https://github.com/Eridanus117/agent-control/issues/165#issuecomment-5269292461)早于本文件提交，必须计入我方直接实验基线：【D】

- **已覆盖**：对象 commit／Skill blob、Codex CLI、模型／reasoning、12 个冻结输入、WITH／WITHOUT 条件、trial 顺序、预注册判据、23/24 条结构化结果、墙钟与 Token，以及失败／未知出口。
- **仍缺**：`--ephemeral` 原始 final 未持久化，A+3 的 WITHOUT 对照缺失，全用户配置消融带来混杂，且没有独立 grader；回执也没有把四类 attempt 与 grader／task 版本处置完整写成 H1–H4 字段。
- **只读回溯能力**：稳定 Issue 评论足以审计预注册内容、冻结对象、汇总结果和已声明限制；无法从中恢复未持久化的原始 final、补造缺失对照，或独立重放回答级判定。因此证据最高仍是当前交付验收，不晋级为完整样本有效。
- **后续补缺**：不事后改写 A1-1 的 v1 判据，也不重复制造“首个样本”；下一次已获准、具备重复价值的运行只补现有回执无法取得的持久原始输出、可比控制面、独立 grader、attempt 分类与版本处置。A1-1 是合成提示直接实验，不计入 H6 的“两次异质自然任务”进入门。

本文件最高只到“研究交付 + 候选形成”。没有安装或运行三个外部 harness，没有复跑 benchmark，没有产生我方样本有效、产品采用或长期依赖证据。

## 一、Inspect AI：把评测运行做成可恢复、可重评分的证据对象

### 生态怎么做

Inspect AI 的结构不是单一 `score`，而是一组职责分开的运行对象：【P】

```text
Task(dataset + solver + scorer + sandbox)
  → sample / epoch
  → model 与工具事件
  → EvalLog（配置、样本、事件、分数、状态）
  → 离线重评分／聚合／诊断
```

- [Eval Sets](https://inspect.aisi.org.uk/eval-sets.html)用专用 log directory 记录一个集合的完成范围；中断后可继续，失败任务可自动重试，并复用已经完成的 sample，避免把基础设施失败前的有效工作全部重做。
- [Eval Logs](https://inspect.aisi.org.uk/eval-logs.html)保存分层 JSON 语义；`inspect log export-config` 可从日志导出 task、model、model roles、generation、solver 与 eval settings，再交给 `--run-config` 重放。
- [Scoring Workflow](https://inspect.aisi.org.uk/scoring-workflow.html)允许生成时暂不评分，也允许对已有日志应用新的 scorer；这把“生成一次轨迹”和“用哪个 grader 解释它”分开。
- [Sandboxing](https://inspect.aisi.org.uk/sandboxing.html)可为执行任意代码、逐样本文件或复杂网络环境提供容器；Docker 是内建类型，工具调用与容器控制动作进入 trace。
- [Scoring Metrics](https://inspect.aisi.org.uk/metrics.html)同时提供 `pass_at_{k}`（k 次至少一次成功）与 `pass_k_{k}`（k 次全部成功），还区分 reduced 与 unreduced epoch 观察。前者回答“给重试机会能不能做成”，后者回答“每次都能不能做成”。

### 对我方的增量启发

Inspect 最值得迁移的不是 Python API，而是**尝试类型和重放边界**：

| 事件 | 是否产生新独立行为证据 | 我方应记录什么 |
| --- | --- | --- |
| 基础设施重试 | 否；目标是补完同一次运行 | 原 attempt、失败阶段、复用 sample、恢复动作与同一配置身份 |
| 独立 trial／epoch | 是；必须从冻结初态重新开始 | trial index、随机性配置、模型／harness／环境 revision 与独立 outcome |
| 旧轨迹重评分 | 否；行为没变，只是 grader 变了 | 原 trajectory identity、新 grader revision、旧新判定与差异 |
| 环境重放 | 视用途而定；默认是可复现性检查 | 相同输入／配置、环境后态、是否出现漂移，不混入能力通过率 |

我方已有 Orca retry／Dispatch 与 GitHub 交付来源，但普通验证报告尚未把这四类事件固定成互斥语义。若把网络重试后的成功当成第二个独立 trial，或把同一轨迹换 grader 后的两个分数当成两个样本，会夸大证据量。【I】

### 不宜照搬

- EvalLog 可以保存运行证据，不能替代 GitHub 上的合同、授权、产品决定或生命周期事实。
- `run config` 能重放技术配置，不能恢复已经变化的 Issue 正文、权威、所有权或负责人决定。
- 自动续跑不能自行消费额度、创建长期调度或绕过当前任务的停止门。
- 多模型 grader 一致性只是评分器证据；它不替代我方三方审阅的同意、回避、密封和授权合同。

## 二、SWE-bench：环境可复现仍不等于任务有效

### 生态怎么做

[SWE-bench 当前 harness](https://github.com/SWE-bench/SWE-bench/blob/f5daed8662c1b6b7c4ca63d3ffacf302d19e48aa/README.md)把真实 GitHub Issue、仓库基线、预测 patch、逐实例 Docker 环境与测试结果连成 outcome 评测：【P】

- Docker 环境用于跨机器复现；gold patch 可先验证 harness 与任务基线；
- 构建日志、逐实例运行日志与最终报告分开保存；
- 旧日志可重新生成报告，不需要再次运行容器；
- 当前 README 明确提示结果缓存只用 `run_id + instance_id`，相同身份下即使 prediction diff 改变，也会复用第一次结果。

最后一条是直接可迁移的负例：一个友好的 `run_id` 不是内容地址。若身份没有绑定输入 hash、task revision、environment image、harness revision 和 scorer revision，缓存命中可能制造假复现。【I】

### benchmark 自身也需要 eval

2024 年的 [SWE-bench Verified 人工核验报告](https://openai.com/index/introducing-swe-bench-verified/)已经说明，原始样本可能有描述缺失、测试过度限定和环境不可复现问题；1,699 个被人工检查的随机样本中，68.3% 因问题描述、测试或其他问题被筛出，最终形成 500 条子集。【P：OpenAI 与 SWE-bench 作者合作报告】

2026 年的 [coding eval 数据质量审计](https://openai.com/index/separating-signal-from-noise-coding-evaluations/)又报告：SWE-bench Verified 已受到设计与污染问题影响；对 731 条 SWE-Bench Pro 公共样本的复核中，自动管线标出 27.4% 问题任务，人工标出 34.1%，主要问题为过严测试、描述缺失、低覆盖测试和误导性提示。【P：OpenAI 自身审计；不是独立第三方复核】

这里重要的不是采用某个百分比，而是版本治理结论：

```text
任务曾经人工核验
  ≠ 任务永远公平
  ≠ 环境永远可复现
  ≠ 数据永远无污染
  ≠ 当前分数仍回答原问题
```

### 对我方的增量启发

我方把 Issue 成功条件映射成 eval task 前，应先回答四个关于 **eval 本身** 的问题：【I】

1. 合同是否把 grader 会要求的内容写给执行者，还是隐藏了实现偏好？
2. 基线／gold 路径在当前环境能否通过，失败是否可能来自 setup 而不是被测能力？
3. outcome 检查是否既能拦住不完整交付，也不会拒绝等价但路径不同的正确结果？
4. task、环境或 grader 修订后，旧结果是否需要标成不可比、重评分或重新运行？

这不是要求每个普通 Issue 都建设 benchmark；只在结果会被重复比较、晋级回归集或支持重要产品决定时进入。

## 三、τ-bench／τ³-bench：可靠性与正确路径是两个问题

### 生态怎么做

原始 [τ-bench 论文](https://arxiv.org/abs/2406.12045)在工具—Agent—用户对话中，以会话结束后的数据库状态对比目标状态，并提出 `pass^k` 衡量多次 trial 全部成功的可靠性。【P】

当前 τ³-bench 的[任务与评分说明](https://github.com/sierra-research/tau2-bench/blob/fc0055dc4e0a316c3f83133267fbd6faaa770992/docs/evaluation.md)进一步把 outcome 与 path 分开：【P】

- 默认 final reward 由任务 `reward_basis` 指定的 DB 与沟通等分量共同决定；
- `actions` 通常只是可生成目标 DB 后态的一条参考轨迹，不是 Agent 必须复制的脚本；
- 只有 `ACTION` 明确进入 `reward_basis` 时，轨迹相似才成为硬门；
- action match 仍可保留为诊断信号，但不能冒充正确性 verdict。

τ³-bench 的 [`v1.0.1` 说明](https://github.com/sierra-research/tau2-bench/releases/tag/v1.0.1)又给出一个版本反例：`banking_knowledge` 的任务评分修订会改变结果，旧于 `1.0.1` 的该域分数不能与新结果直接比较；旧轨迹可以用新任务重评分，需要复现旧行为时则固定旧 tag。【P】仓库还记录了 75+ 项任务质量修订，说明 benchmark task 与 grader 自身也是持续维护资产。

### 对我方的增量启发

我方任务同时存在两类成功：

| 层 | 典型对象 | 默认评分地位 |
| --- | --- | --- |
| outcome | 文件、测试、PR head、远端评论、状态与用户可见后态 | 成功条件的硬门 |
| trajectory | 是否重读当前合同、是否越权、是否错误重试、是否覆盖他人写入 | 守恒／安全硬门，或诊断信号；由合同逐项声明 |

不应把某位成功执行者的一条轨迹冻结成唯一答案；新的 Agent 可能用不同安全顺序得到等价后态。反过来，授权、排他所有权和禁止破坏性动作属于路径守恒，即使终态碰巧正确也不能忽略。【I】因此每个 trajectory grader 必须声明自己是 `hard_gate` 还是 `diagnostic`，不能靠阅读者猜。

## 四、我方能力缺口

| ID | 当前已有 | 仍缺什么 | 风险 |
| --- | --- | --- | --- |
| G1 运行身份 | Issue、commit／PR head、Orca Run／Task／Dispatch 各有稳定身份；A1-1 已冻结对象、模型、输入、条件、顺序与判据 | A1-1 未同时持久化原始 final，也未完整冻结 contract、harness、environment 与独立 grader revision | 同名运行不可比较，缓存或重放可能读错对象 |
| G2 attempt 语义 | 能记录失败、重试、Worker 与验证命令 | `infra_retry`、`independent_trial`、`rescore`、`replay` 尚未成为互斥字段 | 重试成功被误计为独立稳定性证据 |
| G3 eval 质量门 | Issue 有成功条件，验证报告有实际运行／未运行 | 回归样本晋级前没有统一检查 task 可通过、判据可见、基线可跑、等价解不被误杀 | 测到的是任务歧义、环境故障或 grader 偏好 |
| G4 outcome／trajectory 地位 | 既有研究已要求分开，两类证据都能取得 | 单项 grader 没有固定 `hard_gate／diagnostic` 与失败出口 | 轨迹相似被误写成正确性，或安全越界被总分掩盖 |
| G5 版本可比性 | Git 与 GitHub 能固定文件；A1-1 已冻结对象 revision | 还没有跨 dataset／task／grader 修订的样本验证 `comparable／rescore／rerun／retire` 判断 | 版本变化后继续画一条虚假的趋势线 |
| G6 稳定性观察 | 已知道多次 trial 才能讨论可靠性 | 尚无同一我方任务同时报告 `pass@k` 与 `pass^k` 的有界样本 | “偶尔能做成”被误写成“可依赖” |

## 五、候选改进与进入门

以下都是研究候选，不构成实现或平台采用授权。

| 候选 | 最小动作 | 通过信号 | 停止／否决门 |
| --- | --- | --- | --- |
| H1（P0）手工评测证据包 | 复用 A1-1 已有字段；在下一项会重复运行的防漂移样本中，只补 task／contract revision、harness、environment、attempt kind、trial index、独立 grader、持久 outcome／trajectory 和日志定位等现有回执无法取得的维度 | 干净 Session 能判断两个结果是否同条件可比，并定位每条成功条件的直接后态 | 若字段不改变任何比较或恢复判断，删除无辨别力字段；不先建 schema、数据库或平台 |
| H2（P0）四类 attempt 明确分账 | 每次重复动作只选 `infra_retry／independent_trial／rescore／replay` 一类；infra retry 沿用原 trial identity，independent trial 从冻结初态开始 | 汇总时只有 independent trial 进入稳定性分母；失败恢复仍保留完整来源链 | 无法证明初态独立时不计新 trial；重评分不能增加样本数 |
| H3（P0）回归样本晋级前做 eval 自检 | 对候选样本检查：描述完整、gold／baseline 可跑、环境可复现、grader 不隐藏偏好、至少一种等价正确路径不会被误杀 | grader 失败能被归因到被测行为；样本歧义和环境错误有明确 Unknown 出口 | 任一项不成立则留任务证据，不晋级回归集；不为保住样本而事后放宽判据 |
| H4（P0）声明 grader 地位与版本处置 | 每项 grader 记录 `outcome／trajectory`、`hard_gate／diagnostic`、revision；revision 变化时只选 `comparable／rescore／rerun／retire` 一种处置并说明原因 | 新 Session 不读历史讨论即可知道旧新结果能否比较 | 不允许静默覆盖旧分数；诊断信号不能进入总通过门 |
| H5（P1）成对报告机会与可靠性 | 对一个成本允许的真实样本预注册少量独立 trial，同时报告“至少一次成功”和“每次都成功”；保留逐 trial outcome，不只存聚合数 | 能区分可探索能力与可依赖能力，并揭示单次成功掩盖的波动 | 小样本只作描述，不声称统计推广；若独立初态或预算不成立则不运行 |
| H6（条件式）比较可替换执行适配器 | 只有两次异质自然样本都证明 H1–H5 的人工维护或重放成本成为主瓶颈，才用同一冻结样本比较普通脚本与 Inspect AI | 更少漏项／误复用、更低总周期，且 GitHub／Orca 真源和授权边界不变 | 需要常驻服务、第二合同真源、自动派发／消费权限或平台锁时停止；不因功能丰富而采用 |

### 推荐的下一份补缺样本

保留 A1-1 的 v1 回执；下一次已经获准的 Skill 正负触发或防漂移回归，只补现有回执无法取得的维度，而不是创造新 benchmark：

```text
1 个应触发样本 + 1 个镜像负例
  × 少量独立 trial
  + 1 次基础设施失败恢复（仅在自然发生时记录，不故意制造）
  + outcome hard gates
  + trajectory hard gates / diagnostics 分开
  + 同时报告“至少一次成功”与“每次都成功”
```

开始前冻结 task、input、model／reasoning、Skill／Plugin revision、环境、grader 与成本上限；结束后只填观察、失败归因、版本可比性和下一步。没有真实重复价值或当前授权时等待，不为填满表格运行实验。

## 六、路线比较

| 路线 | 收益 | 代价／风险 | 判断 |
| --- | --- | --- | --- |
| A：继续只写普通验证报告 | 零新增字段，单次交付最快 | 重试／trial／重评分混写；版本变化后难判断可比性 | 适合普通一次性交付，不足以支持回归或可靠性结论 |
| B：用现有 Issue 与远端对象手工补齐 H1–H4 证据包 | 不新增控制平面；复用 A1-1 已有字段，只补不可回溯维度；最快检验字段是否有辨别力 | 有人工记录成本，聚合能力弱 | **推荐，置信度高；后续仍需两次异质自然任务样本** |
| C：立即接入 Inspect AI 或自建 runner | 重试、日志、sandbox、重评分与统计工具完整 | 安装、适配、状态迁移、运行成本与第二事实面；当前没有主瓶颈证据 | 当前暂缓；仅在 B 的翻转条件命中后比较 |

### 最强反方

我方已有 Issue、Orca、Git、测试与验证模板；给一次 eval 再加证据包，会把简单任务流程化并增加 Agent 判断税。

这一反方对普通单次交付完全成立，所以 H1–H5 只进入“会重复比较、晋级回归或支撑重要决定”的样本。它们的价值不是记录更多，而是阻止四种具体错读：把基础设施重试当独立 trial、把旧轨迹重评分当新样本、把 benchmark 修订前后分数直接比较、把参考轨迹相似当 outcome 正确。若两次自然样本没有实际避免任何错读或恢复成本，候选应退出。

### 会翻转推荐的条件

- 两次异质样本显示人工证据包没有改变可比性、失败归因或恢复结果，维护时间却显著增加；
- 现有 Issue／Dispatch／commit／验证回执已天然包含全部有辨别力字段，H1 只是重复投影；
- 自然任务频繁出现中断续跑、批量重评分或逐样本 sandbox，人工路径成为总周期主瓶颈；
- 外部适配器能保持 GitHub 合同真源、Orca 运行事实和当前授权边界，并以可替换格式输出稳定来源；
- task／grader revision 已能由现有 Git 对象自动、无歧义地决定可比性，不需要新字段。

## 七、必须保留的边界

- Eval log、trace、runner 数据库和 benchmark leaderboard 都不是合同、授权、产品决定或生命周期真源。
- 自动 retry 只恢复已授权工作，不产生新的执行预算、外部写入或无人值守调度权限。
- outcome 成功不能抹掉越权、共享写入碰撞或破坏性路径；trajectory 漂亮也不能替代真实后态。
- LLM grader、多 judge agreement 和多数票不能产生负责人专属授权，也不能替代三方审阅合同。
- benchmark 分数只对固定 task、environment、harness、model、grader 和 revision 成立；不外推整个 Agent 系统能力。
- 不安装 Inspect AI、SWE-bench 或 τ³-bench，不运行付费模型，不接入第三方 trace，不新增 scheduler、Hook、Webhook、常驻服务或离线唤醒。
- 不修改权威、Skill、Plugin、Orca、Project、Issue 正文或状态；后续实验与实现需要独立、当前、明确的合同和排他写入所有权。

## 八、知识维护回执

### 本轮直接复用的当前结论

- [关联 #159（Agent 记忆与评测）](https://github.com/Eridanus117/agent-control/pull/159)的 outcome／trajectory、确定性／模型／人工 grader、能力／回归集、多 trial、镜像负例和生产回流边界。
- [A4／A6 既有候选](./capability-gaps.md)中的合同—trial—outcome 三联表、镜像回归、预注册实验和 judge 校准。
- [A7 长程治理研究](./long-horizon-self-improvement.md)中“目标 eval + 回归不变量只提供候选资格”的边界。

### 本轮新增、冲突与缺口

- **新增**：attempt 四分法、完整运行身份、grader 地位、版本可比性处置和 `pass@k／pass^k` 双观察。
- **冲突**：没有发现与当前边界直接冲突的生态机制；外部 runner 的自动续跑与我方授权边界存在潜在张力，因此保持适配器而非控制器定位。
- **缺口**：已有 A1-1 直接实验，但它不是 H1–H4 完整、可独立重放的证据包；仍没有外部 harness 运行数据或两次异质自然任务的维护成本比较，候选不能进入当前知识或产品采用。

### 价值门与可信门

- **价值门**：可靠性、回归或重要决定会复用该结果时，运行身份与版本处置可避免高代价错读；普通一次性任务不进入。
- **可信门**：外部机制来自一手文档、固定 commit／release 与作者论文；A1-1 只支持直接实验已存在及其冻结字段，我方收益仍是推断，等待补齐不可回溯维度的可重复自然任务样本。
- **去向**：本文件保留为路线 A／A6 学习证据和知识候选，不修改 `authority/` 或当前知识入口。

### 失效条件与下次最少复核

命中任一条件时只复核受影响部分：

1. Inspect AI 的 log schema、eval set retry／resume、run config、epoch reducer 或 sandbox 语义变化；
2. SWE-bench 的 cache identity、gold 验证、Docker 环境或数据版本策略变化；
3. τ³-bench 发布会改变 task／grader／可比性的版本，或 `reward_basis`／`pass^k` 语义变化；
4. 我方出现按 H1–H5 补齐不可回溯维度的自然任务样本、真实版本不可比事故或重复评测瓶颈；
5. 当前 Issue、Orca 或验证回执已新增等价字段，使本文候选变成重复来源。

最少复核：重读当前合同与本文件版本 pin → 只检查命中对象的 changelog／canonical 文档 → 对照一个现有证据包判断字段、处置或边界是否仍有辨别力 → 无变化即停止。

## 一手来源索引

### Inspect AI（UK AI Security Institute）

- [官方仓库固定 commit `d019d808`](https://github.com/UKGovernmentBEIS/inspect_ai/commit/d019d8088b36cce66c50ac4c08ff0268d4b41532)
- [Eval Sets：重试、sample 复用与续跑](https://inspect.aisi.org.uk/eval-sets.html)
- [Eval Logs：日志、schema 与 run config 重放](https://inspect.aisi.org.uk/eval-logs.html)
- [Scoring Workflow：旧轨迹重评分](https://inspect.aisi.org.uk/scoring-workflow.html)
- [Scoring Metrics：epoch、`pass@k` 与 `pass^k`](https://inspect.aisi.org.uk/metrics.html)
- [Sandboxing：逐样本环境与 trace](https://inspect.aisi.org.uk/sandboxing.html)

### SWE-bench 与数据质量

- [SWE-bench 官方仓库固定 commit `f5daed86`](https://github.com/SWE-bench/SWE-bench/commit/f5daed8662c1b6b7c4ca63d3ffacf302d19e48aa)
- [SWE-bench 当前 harness README](https://github.com/SWE-bench/SWE-bench/blob/f5daed8662c1b6b7c4ca63d3ffacf302d19e48aa/README.md)
- [OpenAI：SWE-bench Verified 人工核验方法（2024，2025 更新）](https://openai.com/index/introducing-swe-bench-verified/)
- [OpenAI：coding eval 数据质量审计（2026-07-08）](https://openai.com/index/separating-signal-from-noise-coding-evaluations/)

### τ-bench／τ³-bench

- [τ-bench 原始论文（arXiv 2406.12045）](https://arxiv.org/abs/2406.12045)
- [τ³-bench release `v1.0.1`](https://github.com/sierra-research/tau2-bench/releases/tag/v1.0.1)
- [任务与评分说明固定到 `fc0055dc`](https://github.com/sierra-research/tau2-bench/blob/fc0055dc4e0a316c3f83133267fbd6faaa770992/docs/evaluation.md)

## 交付水位

本文件补齐 A6 的可复现 harness 研究单元：给出外部机制、我方既有基线、六项能力缺口、六条带门候选、路线比较、知识维护出口和失效条件。它没有实施 runner、运行 benchmark 或证明我方 Agent 已经可靠；下一项有价值的证据是保留 A1-1 直接实验回执，在一个具备重复价值且已获准的自然任务中只补 H1–H4 无法从该回执取得的维度，再决定是否需要 H5 或外部执行适配器。
