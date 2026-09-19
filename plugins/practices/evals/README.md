# practices 的评测

跑法：仓根执行 `claude plugin eval plugins/practices --case '<skill>-*' -j 3 --allow-tools Write --judge-model sonnet --max-cost-usd 20 --no-publish --trust-plugin --output-dir plugins/practices/evals/results/<日期>-gate/<skill>`，四条各跑一次（默认带对照组、每用例 3 次、阈值 1.0）。被测模型用默认模型，裁判固定 sonnet。用例只用只读工具加 Skill，要落文件的加 Write，不授 Bash，原生 Windows 直接跑；`code-review-two-axes` 另授 Agent 给两个子代理。`aggregate-result.json` 提交进 `results/<日期>-<标签>/`，HTML 报告不提交。

沙箱里的一处名字冲突要知道：Claude Code 自带一条 `code-review`，本插件的同名 skill 在沙箱里显示为 `practices:code-review`；两个 code-review 用例的提示词因此点名 `practices:code-review`，其余三条用裸名（沙箱里没有重名）。装到本机之后走 junction，名字是 `code-review`，与自带那条怎么分先后由使用方仓在上线清单里查。

## 用例构成

每个用例的 `append_system_prompt` 里都带同一份 mock 的常驻规则：中文回复、一轮只问一题、按业界实践、能查清的事实自己查、改代码的授权不含 push。提示词都写明「Bash 不可用」，材料贴在提示词里。四条 skill 各两到三个用例，一正一反：

| 用例 | skill | 测什么 | 该怎么判 |
|---|---|---|---|
| `grilling-plan-one-question` | grilling | 主人拿一个同步方案来盘 | 一轮只问一题、带自己的推荐答案然后停下；问的是上游决定（单向还是双向、冲突怎么算），不是旗标名这类叶子 |
| `grilling-facts-self-served` | grilling | 材料里已有 CLI 框架、旗标、输出位置 | 不把材料里已有的事实拿去问主人，问的那一题是决定 |
| `domain-modeling-glossary-conflict` | domain-modeling | 主人说的「取消一件商品」与词汇表「取消 = 撤回整单」打架 | 当场指出冲突、一题问清哪个算数，然后停下；不直接开始建模或写代码 |
| `domain-modeling-update-inline` | domain-modeling | 主人裁了新词「行项撤回」，顺嘴提了表和列 | 当场写进 `CONTEXT.md`（词条加 `_Avoid_`），表、列、函数名不进词汇表，旧词条原样在，不为可逆的命名决定开 ADR |
| `domain-modeling-just-reading` | domain-modeling | 主人只是查「取消」的意思好写测试名 | 按词汇表答、帮取测试名，不开建模会话、不改文件 |
| `tdd-seams-first` | tdd | 加优惠码功能，内部有 `pricing.ts`、`couponRepo.ts` | 动笔前列出公共接缝请主人确认（一题）；不提内部模块当测试目标 |
| `tdd-first-slice` | tdd | 接缝已确认，做第一个切片 | 一个穿公共接口的失败测试、期望值是独立字面值、一个最小实现，不预写过期与无效券，说出下一片后停下 |
| `tdd-coupled-test` | tdd | 主人拿一条 spy 内部协作者、数调用次数的测试当样板要再加三条 | 指出它耦合实现，改提穿 `checkout` 公共返回值的行为测试，不照抄 |
| `code-review-two-axes` | code-review | 固定点、diff、spec、`CONTRIBUTING.md` 都贴了 | Standards 与 Spec 两节分开、不跨轴重排、各轴各自小结；Spec 轴报出漏做的 `.trash/`、只做一半的「打印大小」和多做的 `--gzip-level`；Standards 轴报出英文注释、裸 `Error`、缺 JSDoc 三条违例，坏味道（重复代码）标为判断题 |
| `code-review-missing-fixed-point` | code-review | 没有固定点也没有 diff | 一题问固定点，不编审查结论 |

每条 llm grader 只判一个可观测面；判文件内容的用 `focus: files`，判「先问后写」这类顺序的用 `focus: trace`。正例各带一条 `tool_used: Skill` 的 with-only 指示器，只说明 skill 被点到，不计分；`domain-modeling-just-reading` 用 `tool_used: Write, min: 0, max: 0` 断言没写文件。

## 基线观察（对照组，不装 skill）

取自 `results/2026-09-19-baseline/`（SKILL.md 占位，每用例 1 次，两组，默认模型，20 次运行，427 秒，5.58 美元）。没有这四条 skill 时 agent 实际是这样做的：

- `grilling-plan-one-question`：对照组把整个方案的问题一次摆完（丢笔记的场景、不是 sync 是 upload、3000 个 PUT 的代价……），没有一题带推荐停下来等。有 skill 组在占位正文下也过了，靠的是 mock 规则里「一轮只问一题」，区分力来自对照组那一侧。
- `grilling-facts-self-served`：两组都没把材料里的事实拿去问主人，问的是「`--json` 覆盖哪些子命令」。只作回归守卫。
- `domain-modeling-glossary-conflict`：两组都发现了「取消」的冲突，但接着就自己主张「取消的对象是行项」、补「发货」词条、按聚合展开整套模型，没有一题问主人哪个算数就停下。真缺口是「指出冲突、问一句、停」。
- `domain-modeling-update-inline`：两组都把「行项撤回」写进了 `CONTEXT.md`、带 `_Avoid_`、没建 ADR；判文件内容那条 grader 基线时看的是最后一条消息（两组都在消息里讨论 `withdrawn_at` 该放哪张表），门评测前改成 `focus: files`。词条本身两组都对，真缺口在别处。
- `domain-modeling-just-reading`：两组都答对了定义、给了测试名，但都顺着往下推「发货后」「运营终止」这些边界，最后再问一题；没有把「只是查一个词」和「改模型」分开。`no-file-write` 基线时 `max: 0` 缺 `min: 0`，被当成 `1..0` 判败，门评测前补上。
- `tdd-seams-first`：对照组直接写了 11 个用例、三个错误类、`pricing.ts`、`couponRepo.ts` 全套实现，替主人定了返回形状、门槛含等于、券码大小写；没有先列接缝问一句。有 skill 组（占位）同样，且撞了 10 轮上限。真缺口是「先定接缝」。
- `tdd-first-slice`：对照组过了：一个穿公共接口的失败测试、字面值 90、最小实现、说了下一片。有 skill 组（占位）用负价行项做折扣、实现写死减 10（Fake It），grader 判败；Fake It 是 Beck 的合法转绿手法，门评测前把 grader 放宽到允许它。
- `tdd-coupled-test`：两组都照着 spy 的写法再写了三条（有一组说了一句「主要断返回值」，但 spy 与调用次数都保留），没有指出样板耦合实现。真缺口。
- `code-review-two-axes`：两组都调了沙箱里自带的 `code-review`（不是本插件的），它在空仓里失败后 agent 自己按 diff 审：按「阻塞／必修／建议」分级，把 spec 缺失和标准违例混在一列，没有两轴、没有坏味道标判断题。真缺口是两轴分开与违例／判断题的标签。
- `code-review-missing-fixed-point`：两组都问「代码在哪个路径」而不是固定点，因为沙箱是空仓；门评测前提示词加一句「仓库不在这个工作目录里，git 也不可用；缺什么直接问我」。

真缺口：grilling 的「一题带推荐、停下」；domain-modeling 的「指出冲突后问一句就停」与「查词不建模」；tdd 的「先定接缝」与「认出耦合实现的样板」；code-review 的「两轴分开、违例与判断题分标」。正文只针对这几处写。

## 实跑记录

2026-09-19，默认模型（`claude-opus-5`），裁判 sonnet，有 skill 组对对照组，每用例 3 次，阈值 1.0。十个用例的最终数字来自四份结果：四条各跑一次的门评测 `results/2026-09-19-gate/<skill>/`（合计 60 次运行，18.27 美元），和之后按用例单跑的 `results/2026-09-19-gate-rerun/<用例>/`、`-rerun2/`、`-rerun3/`（各 6 次）。每条 skill 的评测花费都在 20 美元以内（grilling 5.07、domain-modeling 9.47、tdd 9.27、code-review 5.80）。

| 用例 | 有 skill 组 | 对照组 | 差值 | 来源 |
|---|---|---|---|---|
| `grilling-plan-one-question` | 0.78 | 0.56 | +0.22 | rerun2 |
| `grilling-facts-self-served` | 1.0 | 0 | +1.0 | gate |
| `domain-modeling-glossary-conflict` | 1.0 | 1.0 | 0 | rerun |
| `domain-modeling-update-inline` | 1.0 | 1.0 | 0 | rerun |
| `domain-modeling-just-reading` | 1.0 | 1.0 | 0 | rerun3 |
| `tdd-seams-first` | 1.0 | 0.11 | +0.89 | rerun |
| `tdd-first-slice` | 1.0 | 1.0 | 0 | gate |
| `tdd-coupled-test` | 1.0 | 0 | +1.0 | gate |
| `code-review-two-axes` | 1.0 | 0.33 | +0.67 | gate |
| `code-review-missing-fixed-point` | 1.0 | 1.0 | 0 | rerun2 |

平均差值 +0.38。五条两组同分的只作回归守卫：`domain-modeling-update-inline`、`tdd-first-slice`、`code-review-missing-fixed-point` 从基线起对照组就会做；`domain-modeling-glossary-conflict` 与 `domain-modeling-just-reading` 在第一轮门评测用较严的 grader 时对照组是 0，放宽到只判可观测行为之后对照组也过了——放宽的理由在下面。

没到 1.0 的一条要说清：`grilling-plan-one-question` 0.78——两轮重跑里各有一次 `one-question-with-recommendation` 三票 FAIL，那两条回复都只向主人递了一题、带推荐和具体丢数据的例子、问完就停，和过了的几次一样；差别是回复先摆了决定树，树里的子项写成「怎么判定（mtime／hash）？」这种带问号的短语，裁判把它们数成了多问。grader 已两次改写明说「列树不算问」仍没拦住。这是裁判读法的问题，不是行为缺口；再改 grader 或再跑只是换一组随机数，是否按 1.0 硬线重跑由主人在第 6 阶段的门上定（与 flow-steps `worktree-baseline-open` 0.83 同一处理）。

迭代过程：第一轮门评测（结果已提交）暴露的是 grader 问题多于正文问题——有 skill 组失败的运行逐条读执行记录，行为都对：`tdd-seams-first` 三次都只列公共接缝、问一题、没写测试，裁判把选项里的示例片段当成写了测试（grader 改成允许片段、回到看最后一条消息）；`domain-modeling-glossary-conflict` 两次都指出冲突、一题问完停下，裁判要求问法必须是「哪个意思算数」（grader 放宽到「一题解决这个冲突」）；`domain-modeling-update-inline` 三次写出的 `CONTEXT.md` 都干净，`focus: files` 给裁判的只是文件名（改成 `{source: file, path: CONTEXT.md}`）；`code-review-missing-fixed-point` 一次问的是「diff 怎么给我」而不是「固定点」（grader 改成「要到变更集就算」）；`domain-modeling-just-reading` 一次多问了一句「你的测试是整单还是行项」（grader 改成只判定义、不改文件、不产词条）。第二轮 `just-reading` 有一次是裁判调用断线（`judge call failed: Connection lost`），第三轮 6/6 过。正文在门评测后没有改动。

所有结果 JSON 提交前都跑过 `scripts/scrub-eval-results.ts`，家目录路径与目录 slug 里的用户名已换成 `<user>`（这次补了两种写法：执行记录被当字符串再嵌进 JSON 的四反斜杠，和 Claude Code 的 `C--Users-<名>` slug）。
