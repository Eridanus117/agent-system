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

每条 llm grader 判一个行为，行为有几个可观测面就在同一条里列出来（`good-first-test-one-slice`、`flags-coupling`、`standards-findings` 各列了两到六个面），与 flow-steps 的做法相同；拆成一面一条会把裁判费用翻几倍而分数的信息量不变，审查里作判断题留着。`axes-separate` 判的「各轴各自小结」是两轴分开的可观测结果，不是消息形状。判文件内容的用 `focus: {source: file, path: …}`，判「先问后写」这类顺序的用 `focus: trace`。正例各带一条 `tool_used: Skill` 的 with-only 指示器，只说明 skill 被点到，不计分；`domain-modeling-just-reading` 用 `tool_used: Write, min: 0, max: 0` 断言没写文件。

## 基线观察（对照组，不装 skill）

取自 `results/2026-09-19-baseline/`（SKILL.md 占位，每用例 1 次，两组，默认模型，20 次运行，427 秒，5.58 美元）。没有这四条 skill 时 agent 实际是这样做的：

- `grilling-plan-one-question`：对照组把整个方案的问题一次摆完（丢笔记的场景、不是 sync 是 upload、3000 个 PUT 的代价……），没有一题带推荐停下来等。有 skill 组在占位正文下也过了，靠的是 mock 规则里「一轮只问一题」，区分力来自对照组那一侧。
- `grilling-facts-self-served`：两组都没把材料里的事实拿去问主人，问的是「`--json` 覆盖哪些子命令」。只作回归守卫。
- `domain-modeling-glossary-conflict`：两组都发现了「取消」的冲突，但接着就自己主张「取消的对象是行项」、补「发货」词条、按聚合展开整套模型，没有一题问主人哪个算数就停下。真缺口是「指出冲突、问一句、停」。
- `domain-modeling-update-inline`：两组都把「行项撤回」写进了 `CONTEXT.md`、带 `_Avoid_`、没建 ADR；判文件内容那条 grader 基线时看的是最后一条消息（两组都在消息里讨论 `withdrawn_at` 该放哪张表），门评测前改成 `focus: files`，门评测又发现它只给文件名，再改成 `{source: file, path: CONTEXT.md}`（见实跑记录）。词条本身两组都对，真缺口在别处。
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

迭代过程：第一轮门评测（结果已提交）暴露的是 grader 问题多于正文问题——有 skill 组失败的运行逐条读执行记录，行为都对：`tdd-seams-first` 三次都只列公共接缝、问一题、没写测试，裁判把选项里的示例片段当成写了测试（grader 改成允许片段、回到看最后一条消息）；`domain-modeling-glossary-conflict` 两次都指出冲突、一题问完停下，裁判要求问法必须是「哪个意思算数」（grader 放宽到「一题解决这个冲突」）；`domain-modeling-update-inline` 三次写出的 `CONTEXT.md` 都干净，`focus: files` 给裁判的只是文件名（改成 `{source: file, path: CONTEXT.md}`）；`code-review-missing-fixed-point` 一次问的是「diff 怎么给我」而不是「固定点」（grader 改成「要到变更集就算」）；`domain-modeling-just-reading` 一次多问了一句「你的测试是整单还是行项」（grader 改成只判定义、不改文件、不产词条）。第二轮 `just-reading` 有一次是裁判调用断线（`judge call failed: Connection lost`），第三轮 6/6 过。门评测之后正文只在审查（第 6 阶段）里改了四处，都没有重跑：四条头部补「与原版的差别」一句；`tdd` 探索前读 `CONTEXT.md` 那句并进第 1 步；`code-review` 删掉「为什么分两轴」一节并入来源段、第 4 步降级时加「报告开头写明两轴未隔离」。

所有结果 JSON 提交前都跑过 `scripts/scrub-eval-results.ts`，家目录路径与目录 slug 里的用户名已换成 `<user>`（这次补了两种写法：执行记录被当字符串再嵌进 JSON 的四反斜杠，和 Claude Code 的 `C--Users-<名>` slug）。

### 0.1.1（2026-09-19，agent-system#122）：从 workcoding 拆出的四条实践——golden-master、record-replay、feature-toggle、canary-release

旧的 `evidence-regression`、`release-observe` 两条正文各拆成两条实践：证据侧是 `record-replay`（挑样本、改前录、规整规则）与 `golden-master`（母版来源、两类比对、判 diff、三样进 PR）；发布侧是 `feature-toggle`（一个开关、回滚即关开关、验 diff 为零的前提、主人拨）与 `canary-release`（三档、一句一观测加四个黄金信号、冒烟、每档主人定）。跑法同上，`--case '<skill>-*'` 四条各跑一次，被测默认模型、裁判 sonnet；结果在 `results/2026-09-19-baseline-as122/<skill>/` 与 `results/2026-09-19-gate-as122/<skill>/`，改过 grader 或提示词后按用例单跑的在 `-gate-as122-rerun/`、`-rerun2/`、`-rerun3/`。用例都是同一条运费改动（`FreightCalc.calc` 加偏远附加按省份查表，开关 `remote_fee_by_province`），四条 skill 各两到三个用例：

| 用例 | skill | 测什么 | 该怎么判 |
|---|---|---|---|
| `golden-master-replay-test` | golden-master | 三条样本已录、改动已完成，要写回放测试 | 老类别逐字节比 approved，新类别比需求例子的 26 而不是从当前输出生成 approved，两类分开，三样进同一个 PR |
| `golden-master-post-change-capture` | golden-master | 改完才想起没录母版，主人要把当前分支输出存成 approved | 不编 approved 的数字；关着的开关只在老路径 diff 为零时等于改前，先验这一条再录 |
| `golden-master-diff-triage` | golden-master | 三条红：一条只差 calcTime、一条老类别 cod 费 4→6、一条新类别 24≠26，主人想全 approve 了合 | 归三类：规整、老路径回归（修代码不 approve）、新路径算错（期望留 26） |
| `record-replay-sample-plan` | record-replay | 还没改代码，要定采集方案 | 样本覆盖每条需求句与老路径每个分支、各带场景名；改前用 Arthas 或日志录、一请求一文件；规整规则列字段；否过之前不录 |
| `record-replay-volatile-diff` | record-replay | 回放全红只差 traceId 与 calcTime，主人想用改后代码重录或删测试 | 补规整规则、两边共用，不重录、不删 |
| `feature-toggle-rollback-plan` | feature-toggle | 主人打算 revert PR 再部署当回滚 | 回滚是关开关；「只抽了个方法」也要验老路径 diff 为零；开关主人拨 |
| `feature-toggle-second-toggle` | feature-toggle | 分流开关已在，主人想再加一个发布开关 | 分流开关就是发布开关，白名单、百分比挂在它上面，不加第二个 |
| `canary-release-three-tiers` | canary-release | 开关在配置中心，要出发布方案 | 三档各写放谁、停多久；每档主人定、不按「指标正常即进」自动推进；一句一观测加四个黄金信号对上现有指标；档 1 后用例子冒烟带期望值；结尾只请主人定档 1 |
| `canary-release-no-toggle-system` | canary-release | 只有进程级环境变量当开关 | 如实退化为开／关，不假装有百分比；观测点、回滚（清掉变量重启）、主人拨照旧 |

#### 基线观察（对照组，不装 skill）

取自 `results/2026-09-19-baseline-as122/<skill>/`（SKILL.md 占位，每用例 1 次，两组；`golden-master-diff-triage` 是门评测前补的，没有单独的基线，它的对照组数字看门评测）。没有这四条 skill 时 agent 实际是这样做的：

- `golden-master-replay-test`、`golden-master-post-change-capture`：两组都对——对照组自己就说「第三条不能进 golden master 集合，期望值只能来自需求例子」、「approved 的数值我给不了，flag=off 跑出来的才是合法母版」。门评测里对照组三次有两次在新类别上还是落回了「跑一遍写成 `.received.json` 供人工审后提升」，也就是从当前输出造 approved，差值才出来。
- `record-replay-sample-plan`：对照组讲采集点定在哪、一条记录录什么，没有带场景名、分新老、覆盖四个分支的样本清单，也没有请主人否就往下写。真缺口。
- `record-replay-volatile-diff`：两组都判出 traceId、calcTime 是易变字段、补规整、不重录。只作回归守卫。
- `feature-toggle-rollback-plan`：对照组写「三级回滚梯度」，关开关是 L1，revert 重新部署留作 L3 兜底；不验「只抽了个方法」这句。真缺口是回滚只有关开关一种，且前提要验。
- `feature-toggle-second-toggle`：对照组按 Fowler 的开关分类法把 `remote_fee_release` 设计出来了（长命分流开关加短命发布开关）。真缺口是主人定过的「分流开关就是发布开关」。
- `canary-release-three-tiers`：对照组写 ring-based 的 S0 到 S3 加「最短观察」，进档按指标规则；有 skill 组（占位）三档与主人拨都对，但没有冒烟例子与期望值。真缺口是每档主人定、冒烟带期望、结尾只问一件。
- `canary-release-no-toggle-system`：对照组把「三档」改成按爆炸半径分档并先加一档补指标，没有把退化为开／关这件事说出来。真缺口。

有 skill 组在占位正文下就过了六条，靠的是 frontmatter 的描述把规则写全了；区分力来自对照组那一侧。

#### 实跑记录

2026-09-19，默认模型（`claude-opus-5`），裁判 sonnet，有 skill 组对对照组，每用例 3 次，阈值 1.0。九个用例的最终数字来自四条各跑一次的门评测 `results/2026-09-19-gate-as122/<skill>/`（合计 54 次运行，12.85 美元），以及改过提示词或 grader 后按用例单跑的 `-gate-as122-rerun/`、`-rerun2/`（各 6 次）。每条 skill 连基线在内的花费都在 20 美元以内（golden-master 6.40、record-replay 5.14、feature-toggle 3.59、canary-release 7.52）。

| 用例 | 有 skill 组 | 对照组 | 差值 | 来源 |
|---|---|---|---|---|
| `golden-master-replay-test` | 1.0 | 0.33 | +0.67 | gate |
| `golden-master-post-change-capture` | 1.0 | 1.0 | 0 | gate |
| `golden-master-diff-triage` | 1.0 | 1.0 | 0 | gate |
| `record-replay-sample-plan` | 1.0 | 0 | +1.0 | rerun |
| `record-replay-volatile-diff` | 1.0 | 1.0 | 0 | gate |
| `feature-toggle-rollback-plan` | 1.0 | 0 | +1.0 | gate |
| `feature-toggle-second-toggle` | 1.0 | 0 | +1.0 | gate |
| `canary-release-three-tiers` | 0.33 | 0 | +0.33 | rerun3 |
| `canary-release-no-toggle-system` | 1.0 | 0 | +1.0 | gate |

平均差值 +0.56。三条两组同分的只作回归守卫：`golden-master-post-change-capture`、`golden-master-diff-triage`、`record-replay-volatile-diff`——默认模型自己就会拒绝拿改后输出当母版、会把红的归类、会补规整而不重录；golden-master 这条实践的价值在把这几条主人定过的规矩放在一处让薄的规程 skill点名，不在纠正模型。

没到 1.0 的一条要说清：`canary-release-three-tiers` 0.33——第三次重跑三条回复的形状与 `references/release-plan.md` 的例子一致：三档各带放谁、停多久，回滚是关开关加 diff 为零的前提，两条需求句各一个观测点加四个黄金信号对上 p99、QPS、错误率、线程池占用，冒烟用 9001 新疆 3.2kg vip 期望 26，结尾只问档 1 放谁；同一份内容裁判三次分别投出 3/3 FAIL、3/3 PASS、1/3 PASS。这是裁判读法的抖动，不是行为缺口（第二次重跑三条同样形状的回复也被判 3/3 FAIL，那次是 grader 第 (d) 面写死了「模板 1032」而正确的冒烟该用 9001，已改）。主人已定不为 1.0 硬线重跑。

迭代过程：第一轮门评测有 skill 组三条 0/3，逐条读回复后都不是行为缺口——`record-replay-sample-plan` 三次都给了带场景名的清单、规整规则、改前录、否过不录，结尾问的是一道覆盖问题（要不要加「模板没配表」那条），grader 把它数成「没请主人否」（改成「请否或问一道清单依赖的覆盖问题都算」，重跑 3/3）；`canary-release-three-tiers` 三次都指出提示词自身的矛盾（例子模板 1032 不在档 1 白名单里，冒烟打不出 26）并问主人怎么收（提示词补一句「9001 与 1032 配置相同」，重跑 1/3：另两次「档 3 全量」没写停多久，而这正是 `references/release-plan.md` 例子的写法，例子改成「档 3 全量，看满一个完整业务周期再收口」、grader 放宽到档 3 不要求停多久，再跑一次得 1/3，见上）。门评测之后正文只在审查（第 6 阶段）里改了几处，都没有重跑：golden-master 的两处出处措辞；record-replay 与 canary-release 各补一句主人定过的「纠偏留痕」（否了哪一行，原话记在那行下面）；两份 references 例子末尾与 SKILL.md 重复的禁令句删掉；「档」「规整」两个词补英文。

所有结果 JSON 提交前都跑过 `scripts/scrub-eval-results.ts`。
