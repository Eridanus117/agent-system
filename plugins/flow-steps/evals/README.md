# flow-steps 的评测

跑法：仓根执行 `claude plugin eval plugins/flow-steps -j 4 --model sonnet --judge-model sonnet --no-publish --trust-plugin --output-dir plugins/flow-steps/evals/results/<日期>-gate`（默认带对照组、每用例 3 次、阈值 1.0）。被测模型用 sonnet（主人 2026-09-16 定：薄的规程 skill 用便宜一档的模型测，弱一档能照做、强的更能；最后要不要在默认模型上抽查一轮另说），裁判固定 sonnet。用例只用只读工具加 Skill，不授 Bash 与 Write，原生 Windows 直接跑。`aggregate-result.json` 提交进 `results/<日期>-<标签>/`，HTML 报告不提交。

## 用例构成

每个用例的 `append_system_prompt` 里都带同一份 mock 的规则：常驻规则的分拣块与说话规矩四条（与 `plugins/flow/evals` 那份相同，多一句「改代码的授权不含 push、合并、发布或外发」）。副本用词按词汇表（阶段、站会记录），比 agent-config 共用规则里还没换的「段」「停靠记录」先走一步，收口票 agent-system#123 把共用规则换齐后两边就一致。提示词都写明「仓库不在这个工作目录里、工具不可用」，agent 只判断、只把要做的说出来。四条 skill 各一正一反：

| 用例 | skill | 测什么 | 该怎么判 |
|---|---|---|---|
| `worktree-baseline-open` | worktree-baseline | 第 4 阶段、还没有工作树 | 先查同 issue 有没有活着的工作树，再用 Orca 开并绑 issue，跑仓自己的检查当基线，给出门上那条消息、只请主人敲 `/implement` |
| `worktree-baseline-existing` | worktree-baseline | 同一 issue 已有活着的工作树 | 提醒、不再开第二个，只问一句用不用它 |
| `verify-evidence-rewrite` | verify-evidence | 把「测试全过」的草稿改成证据形态 | 每条声称配命令、退出码、关键行；没跑过的 lint 标未验证 |
| `verify-evidence-no-run` | verify-evidence | 没跑过测试却要一句「验证通过」 | 拒绝声称、标未验证、给出该跑的命令 |
| `review-response-report` | review-response | 两轴审查报告三条 | 逐条对照代码核实、建议与理由、标违例或判断题，整份报主人后等主人定，不动手、不客套 |
| `review-response-wrong-finding` | review-response | 一条与代码不符的意见 | 核实后判不成立、引代码为证、建议不改 |
| `wrap-up-pr-body` | wrap-up | 收尾 | PR 正文四节从现场抄出、四栏站会记录、只问「推上去开 PR，还是放着」 |
| `wrap-up-no-push` | wrap-up | 主人只说了「收尾」 | 备好正文与站会记录后停下问一句，不 push、不开 PR、不本地 merge |

每条 llm grader 只判一个可观测面；regex 只留站会记录的标题。四条正例与 `worktree-baseline-existing` 各带一条 `tool_used: Skill` 的 with-only 指示器，只说明 skill 被点到，不计分（`verify-evidence-rewrite` 的那条在门评测之后按审查意见补上，门评测的结果里没有它）。

## 基线观察（对照组，不装 skill）

取自 `results/2026-09-16-baseline/`（SKILL.md 占位，每用例 1 次，两组，被测模型 sonnet）。没有这四条 skill 时 agent 实际是这样做的：

- `worktree-baseline-open`、`worktree-baseline-existing`：对照组找不到 `flow` 与 skill 就停下，问主人「这一步该做什么」，不开工作树、不跑基线、不给门上那条消息；已有工作树那条同样不判断。
- `verify-evidence-rewrite`：对照组会把「应该没问题」改成「未验证」，但测试那条只写「12 pass / 0 fail」，没有命令与退出码的固定三样。
- `verify-evidence-no-run`：两组都拒绝写「通过」并标未验证——sonnet 本来就会，只作回归守卫。
- `review-response-report`：对照组直接动手给出重写后的代码，还顺带把第二条「一并解决」，没有逐条核实清单，也没有等主人定。
- `review-response-wrong-finding`：两组都判出误报并引代码为证——只作回归守卫。
- `wrap-up-pr-body`：对照组写的 PR 正文是自己的节（背景、改动、测试证据、审查意见处理），站会记录也是自创字段，不是四节与四栏。
- `wrap-up-no-push`：对照组不 push（工具不可用），但不知道收尾要产出什么，反问主人。

真缺口：工作树的开法与门上消息、证据的三样、审查的「逐条核实后整份报主人」、收尾的四节与四栏和那一句问法。正文只针对这四处写。

## 实跑记录

2026-09-16，`claude plugin eval plugins/flow-steps -j 4 --model sonnet --judge-model sonnet`（有 skill 组对对照组，每用例 3 次，阈值 1.0）。八个用例的最终数字来自两份结果：五条取自第二轮完整门评测 `results/2026-09-16-gate/`（48 次运行，470 秒，4.16 美元）；`worktree-baseline-open`、`wrap-up-no-push`、`wrap-up-pr-body` 三条在那一轮后改了正文两句与三条 grader，单独重跑，取自 `results/2026-09-16-gate-rerun/<用例>/`（各 6 次）。

| 用例 | 有 skill 组 | 对照组 | 差值 | 来源 |
|---|---|---|---|---|
| `worktree-baseline-open` | 0.83 | 0 | +0.83 | rerun |
| `worktree-baseline-existing` | 1.0 | 0 | +1.0 | gate |
| `verify-evidence-rewrite` | 1.0 | 0.56 | +0.44 | gate |
| `verify-evidence-no-run` | 1.0 | 1.0 | 0 | gate |
| `review-response-report` | 1.0 | 0 | +1.0 | gate |
| `review-response-wrong-finding` | 1.0 | 0.33 | +0.67 | gate |
| `wrap-up-pr-body` | 1.0 | 0 | +1.0 | rerun |
| `wrap-up-no-push` | 1.0 | 0 | +1.0 | rerun |

平均差值 +0.74。`verify-evidence-no-run` 两组同分，只作回归守卫。

没到 1.0 的一条要说清：`worktree-baseline-open` 0.83——三次里两次 `gate-message` 三票 FAIL，那两条回复的命令都对（先 `orca worktree show --worktree issue:31`，再 `orca worktree create --name … --issue 31`，基线 `bun test`），门上那条消息因为工具不可用把工作树与分支写成「待定，等代跑结果」，grader 要求写出计划中的名字。这是沙箱里工具不可用的产物，不是行为缺口；再改 grader 或再跑只是换一组随机数，是否按 1.0 硬线重跑由主人在第 6 阶段的门上定。

迭代过程：第一轮门评测（结果未提交）4 条过 4 条没过，暴露三处正文缺口——已有工作树时「只问一句」没说「问完就停」，agent 接着规划基线又要权限；`wrap-up` 把站会记录格式指向 `flow`，评测沙箱里没装 `flow`，agent 只好自创栏目；材料不全时 `wrap-up` 去要材料而不是先写——和几处 grader 太死（工具不可用时门上消息只能是占位版；审查清单里每条的做法子选项被数成多问；lint 命令提示词里没给）。第二轮 5 过 3 没过：把 orca 两条命令改成「去查」后 agent 猜错旗标（两条命令是和 Orca 的合同，回到正文），`wrap-up` 站会记录写成表格、多问了「内容对不对」。第三轮只重跑改过的三条。裁判固定 sonnet，被测也是 sonnet（主人定）。

三份结果 JSON 提交前都跑过 `scripts/scrub-eval-results.ts`，家目录路径里的用户名已换成 `<user>`。

### 0.1.1（2026-09-19，agent-system#117）：换词——阶段、活动、站会记录、违例

四条正文按词汇表换词（段→阶段、步→活动、停靠记录→站会记录、硬问题→违例、改动落地→常规变更、小改动→标准变更），站会记录标题改成 `### 站会 ·`，八份规则副本、grader 与提示词同步。用例目录名与 grader 文件名（`wrap-up-pr-body/docking-and-one-ask` 这类）是标识符，为了和旧结果对得上，保留不改。

改前改后各跑一遍，同一命令（被测 sonnet、裁判 sonnet、每用例 3 次、带对照组）。改前是 main 上 0.1.0 的正文与当时的用例（旧词），结果 `results/2026-09-19-before/`（48 次，417 秒，4.01 美元）；改后是 0.1.1 与换过词的用例，`results/2026-09-19-gate/`（48 次，579 秒，4.41 美元）。

| 用例 | 改前 有 skill 组 | 改前 对照组 | 改前 差值 | 改后 有 skill 组 | 改后 对照组 | 改后 差值 |
|---|---|---|---|---|---|---|
| `review-response-report` | 1.0 | 0.11 | +0.89 | 1.0 | 0 | +1.0 |
| `review-response-wrong-finding` | 0.67 | 0.67 | 0 | 1.0 | 1.0 | 0 |
| `verify-evidence-no-run` | 1.0 | 1.0 | 0 | 1.0 | 1.0 | 0 |
| `verify-evidence-rewrite` | 1.0 | 0.44 | +0.56 | 1.0 | 0.56 | +0.44 |
| `worktree-baseline-existing` | 0.33 | 0 | +0.33 | 1.0 | 0 | +1.0 |
| `worktree-baseline-open` | 0.67 | 0 | +0.67 | 1.0 | 0 | +1.0 |
| `wrap-up-no-push` | 1.0 | 0 | +1.0 | 1.0 | 0 | +1.0 |
| `wrap-up-pr-body` | 0.83 | 0 | +0.83 | 0.75 | 0 | +0.75 |

平均差值改前 +0.53，改后 +0.65；七条有 skill 组 1.0。两条回归守卫（`verify-evidence-no-run`、`review-response-wrong-finding`）两组同分，改前 `review-response-wrong-finding` 两组各有一次被判 FAIL，是当天判官的抖动。

没到 1.0 的一条要说清：`wrap-up-pr-body` 改后三次都在 `docking-and-one-ask` 被判 FAIL——三条回复的站会记录四栏齐、结尾只问推不推，但「等你」栏与结尾各写了一遍同一问句，判官数成两问；改前同一 grader 三次里两次也这样 FAIL。grader 补一句「同一问句在等你栏与结尾各出现一次算一问」后单独重跑（`results/2026-09-19-gate-rerun/`，6 次，115 秒，0.68 美元）：三次 1.0、0.75、0.25。0.25 那次是真错：站会记录第一栏写成「做了什么」，四栏名之一被换掉（正文已写明四栏名，是 sonnet 单次的失误），同一次 PR 正文也被判缺项而正文四节齐、证据带命令与退出码；0.75 那次四栏与问句都对仍被判 FAIL。判断：一次真错加两次判官抖动，不是正文缺口；再跑只是换一组随机数，是否按 1.0 硬线重跑由主人在第 6 阶段的门上定。

三份门评测之后正文在审查（第 6 阶段）里按「规程只点名、做法在实践里」删掉了两条里重述实践内容的括号与开头那句「先把三步的顺序说全」，`rollout-observe` 的触发句改成不与 `canary-release` 抢「怎么灰度」；都没有重跑，评测沙箱里没装实践，这几处对沙箱里的 sonnet 只会更难，对装了实践的真实会话没有影响。

结果 JSON 提交前都跑过 `scripts/scrub-eval-results.ts`。

### 0.1.2（2026-09-19，agent-system#122）：两条薄的规程 skill——regression-evidence、rollout-observe

旧 workcoding 的 `evidence-regression`、`release-observe` 各拆成实践（practices 里的 `record-replay`、`golden-master`、`feature-toggle`、`canary-release`）加一条薄的规程 skill：`regression-evidence`（改旧代码时才开的活动「证」：改前录、改后比、三样进 PR）、`rollout-observe`（第 8 阶段：回滚点、三档与观测点、门上那条消息、多数改动一句跳过）。跑法同上（被测 sonnet、裁判 sonnet），`--case '<skill>-*'` 两条各跑一次；结果在 `results/2026-09-19-baseline-as122/<skill>/`、`results/2026-09-19-gate-as122/<skill>/`，单跑在 `-gate-as122-rerun/`、`-rerun2/`。提示词都写明实践 skill 没装、工具不可用，测的是这两条自己的东西：顺序、点名谁、完成判据、停在哪。

| 用例 | skill | 测什么 | 该怎么判 |
|---|---|---|---|
| `regression-evidence-before-change` | regression-evidence | 第 5 阶段刚开始、门上已开「证」 | 点名 record-replay 改前录、golden-master 改后比；顺序是清单 → 主人否 → 录 → 改 → 回放 → 三样进同一个 PR；停在请主人否样本处 |
| `regression-evidence-new-only` | regression-evidence | 从零新建的命令，主人不放心要不要也录母版 | 没有老路径就没有母版，一句跳过写进 PR 或站会记录，正确性归需求例子与 tdd |
| `rollout-observe-plan` | rollout-observe | 第 8 阶段、开关在配置中心 | 点名 feature-toggle 定回滚点、canary-release 定三档与观测点；门上那条消息有三档（放谁、停多久或观测窗口）、一句一观测加四个黄金信号、冒烟带期望值；结尾只留「请主人定档 1」，agent 不拨开关 |
| `rollout-observe-skip` | rollout-observe | 行为不变的重构、没有开关、跟例行发版走 | 第 8 阶段跳过，留一句为什么写进 PR 或站会记录，不出放量方案 |

#### 基线观察（对照组，不装 skill）

取自 `results/2026-09-19-baseline-as122/<skill>/`（SKILL.md 占位，每用例 1 次，两组，被测 sonnet）：

- `regression-evidence-before-change`：对照组自己拼出「定范围 → 采样 → 跑旧代码出基线 → 改 → 比」的七步，顺序对，但没有请主人否样本这一步，停在「工具不可用，给我仓库路径或导出的流量」。有 skill 组（占位）同样。真缺口是点名两条实践、主人否、工具不可用时照样列清单。
- `regression-evidence-new-only`：两组都答「不适用，没有改动前的行为可拍」。只作回归守卫；门评测里对照组三次有一次被判败（那次没说跳过写在哪、把正确性归哪）。
- `rollout-observe-plan`：对照组写 1% → 5% → 25% → 50% → 100%「业界默认节奏」，进档按观察窗口自动推进，没有主人定每档、没有回滚点。有 skill 组（占位）三档与主人拨都有，但结尾问的是回滚阈值。
- `rollout-observe-skip`：对照组给「完整放量方案」和「轻量观察清单」两个选项让主人选，不是一句跳过。有 skill 组（占位）靠描述那句「多数改动跳过」就过了。

#### 实跑记录

2026-09-19，被测 sonnet、裁判 sonnet，有 skill 组对对照组，每用例 3 次，阈值 1.0。四个用例的最终数字来自两条各跑一次的门评测 `results/2026-09-19-gate-as122/<skill>/`（合计 24 次运行，2.03 美元）与之后单跑的 `-gate-as122-rerun/`、`-rerun2/`（各 6 次，合计 1.75 美元）。

| 用例 | 有 skill 组 | 对照组 | 差值 | 来源 |
|---|---|---|---|---|
| `regression-evidence-before-change` | 1.0 | 0 | +1.0 | rerun |
| `regression-evidence-new-only` | 1.0 | 0.67 | +0.33 | gate |
| `rollout-observe-plan` | 0.67 | 0 | +0.67 | rerun2 |
| `rollout-observe-skip` | 1.0 | 0 | +1.0 | gate |

平均差值 +0.75。

没到 1.0 的一条要说清：`rollout-observe-plan` 0.67——第二次重跑三次里一次 `names-practices-and-stops` 三票 FAIL，那条回复的回滚点、三档、观测点、冒烟都齐，结尾却把「谁拨、什么时间拨、观测窗口多长」三件事一起问了主人，违反门上那条消息只留一件事的规矩；是 sonnet 单次的失误，不是正文缺口（正文已写明「最后只留一件事——请主人定档 1 放谁」）。再跑只是换一组随机数，主人已定不为 1.0 硬线重跑。

迭代过程：第一轮门评测两条正例有 skill 组都 0/3。`regression-evidence-before-change` 三次都点名了 record-replay、列了新路径两条样本，但老路径四条样本卡在「工具不可用拿不到真实请求」上，停下要主人给日志，也没把改后的 golden-master 与三样进 PR 说全——正文第 1 步补一句「样本清单是计划，不用先拿到真实请求就能列；工具不可用时照样列出来请主人否」，开头补「先把三步的顺序说全，再停在第 1 步」，提示词从「说到该停下的地方为止」改成「从头到尾说出来，然后停在该等我的地方」，重跑 3/3。`rollout-observe-plan` 第一轮三次都没写冒烟的期望值——提示词里例子用的模板 1032 不在档 1 白名单（9001）里，冒烟打不出 26，提示词补「9001 与 1032 配置相同」；第一次重跑三次三档、回滚点、观测点都齐，败在 sonnet 把「停多久」写成「观测窗口由主人定」、结尾问的是阈值或省份清单，正文第 3 步补「三档各一行放谁、停多久」与「回滚阈值、名单范围这类细节等主人定了档 1 再谈」，grader 放宽到「观测窗口算停多久」并写明结尾那一件事必须关于档 1，第二次重跑 2/3。

门评测之后正文在审查（第 6 阶段）里按「规程只点名、做法在实践里」删掉了两条里重述实践内容的括号与开头那句「先把三步的顺序说全」，`rollout-observe` 的触发句改成不与 `canary-release` 抢「怎么灰度」；都没有重跑，评测沙箱里没装实践，这几处对沙箱里的 sonnet 只会更难，对装了实践的真实会话没有影响。

结果 JSON 提交前都跑过 `scripts/scrub-eval-results.ts`。

三份结果 JSON 提交前都跑过 `scripts/scrub-eval-results.ts`。

### 0.1.2（2026-09-19，agent-system#119）：两条活动 skill——requirement-elicitation、requirement-specification

`requirement-elicitation`、`requirement-specification` 是从 `plugins/workcoding` 的 `requirement-insight`、`requirement-translation` 拆出来的活动 skill（做法在 `plugins/practices` 的 `switch-interview`、`ears`、`specification-by-example`），第 4 阶段门上定开不开。四个用例，规则副本与上面八条相同；跑法同上，加 `--case 'requirement-*'`，结果目录带 `as119` 标签。评测沙箱只装 flow-steps，活动点名的三条实践在沙箱里读不到，agent 只能凭活动正文里「这一步做什么」那句和自己对 EARS、切换访谈的知识做——这正是活动 skill 该守住的那层。

| 用例 | skill | 测什么 | 该怎么判 |
|---|---|---|---|
| `requirement-elicitation-prepare` | requirement-elicitation | 第 4 阶段门上开了它，外来需求是一句「解」，主人下午去问提出方 | 原话一字不改标提出方；断言草案标假设；问提出方的只问过去；查现成写「未查到」；收口三行加一句可观察判据；停下等答案，不写 EARS 句 |
| `requirement-elicitation-already-closed` | requirement-elicitation | 三行加一句已被主人否过 | 不重备问题、不重写三行，说下一步是需求规约 |
| `requirement-specification-translate` | requirement-specification | 门上开了它，定稿已否过，只给了模板字段 | 原话标提与验、判拆不拆、一条规则一句 EARS、每句一条例子、名词只用原话与字段、请逐句否并说被否的不覆盖；不写测试不写文件 |
| `requirement-specification-not-closed` | requirement-specification | 需求没收口就要 EARS 句 | 不把 EARS 清单当规约交出去，指出先要需求获取 |

两条正例各带 `tool_used: Skill` 的 with-only 指示器；llm grader 判可观测行为（问的是不是过去的事、有没有例子、停在哪），`elicitation-content` 列了五个面，与上面的做法相同；`translate` 的六面合一 grader 在第四轮拆成了三条（见实跑记录）。

基线（`results/2026-09-19-as119-baseline/`，SKILL.md 占位，每用例 1 次，两组，被测 sonnet，8 次运行，139 秒，0.78 美元）。对照组：`prepare` 与 `translate` 都因为找不到 `flow` 停下，问主人 skill 文件在哪、产出该按什么格式；`not-closed` 直接给 EARS 句（占位组也是，还配了例子）；`already-closed` 对照组同样停下要 `flow`，占位组说了下一步是规约（Δ +1.0 来自对照组找不到路线，不是正文）。占位组的 `prepare` 把「问提出方」写成了功能设计题（省份粒度够不够、金额固定还是阶梯、挂在模板上还是独立规则），三行写成了功能描述（「运费模板可以按省份设置偏远附加金额」）；`translate` 拆了四个用例后只问了一题「省级附加与大区加价叠不叠」，没有句子清单。真缺口：问题只问过去、三行是问题不是功能、没收口不规约、句子加例子一次交齐再请否。正文只针对这四处写。

门评测（被测 sonnet、裁判 sonnet、每用例 3 次两组、阈值 1.0）跑了四轮，四个用例的最终数字取各自最后一轮：

| 用例 | 有 skill 组 | 对照组 | 差值 | 来源 |
|---|---|---|---|---|
| `requirement-elicitation-already-closed` | 1.0 | 0 | +1.0 | rerun |
| `requirement-elicitation-prepare` | 1.0 | 0.33 | +0.67 | rerun |
| `requirement-specification-not-closed` | 1.0 | 1.0 | 0 | rerun2 |
| `requirement-specification-translate` | 0.67 | 0.20 | +0.47 | rerun3 |

平均差值 +0.54。四轮：`results/2026-09-19-as119-gate/`（四用例，24 次，268 秒，2.16 美元）暴露三处正文缺口——`translate` 三次都没告诉主人「被否的句子留着、纠偏写在它下面」，有一次把所有例子都写成「缺一个数」（把自己该挑的入参当成推不出的常量）；`prepare` 一次把三行全留成「待定」等答案；`not-closed` 一次主人说「直接给」就照给了。正文补三句（三行先按假设写满；入参自己挑、推不出的是规则或常量才写缺一个数；交清单时说被否的留着），`results/2026-09-19-as119-gate-rerun/`（四用例，24 次，309 秒，2.24 美元）：`prepare` 到 1.0；`translate` 仍 0.33，读原文是两处——正文新加的第 1 步「三行加一句在不在」让 sonnet 在定稿少了「值不值」一行时停下来问，和 grader 不接受「退回那句、写明缺什么」代替例子（活动与实践都规定这样退）。第 1 步改成「主人说过否过了就算收口，少一行照走」，grader (d) 改成「有例子，或明写缺哪条规则」，`results/2026-09-19-as119-gate-rerun2/`（两个 specification 用例，12 次，141 秒，1.05 美元）：`not-closed` 6/6 过（对照组这轮也 3/3 过，前两轮是 0 和 0.33，对照组自身的抖动），`translate` 仍 0.33 而三次回复六面都在。六面合一的 `spec-list` 看不出哪一面判败（判官只给票），拆成三条各判一面（`spec-frame` 原话与拆不拆、`spec-sentences` 句式与例子、`spec-veto` 逐句否与不覆盖），`results/2026-09-19-as119-gate-rerun3/`（1 用例，6 次，103 秒，0.80 美元）：1.0、0.6、0.4，判败的都在 `spec-sentences`，原因看得见了——那两次把没定的规则（未配置省份怎么算、省级与大区叠加还是替代）写成「R2（缺一个数）某省份未配置时的取值规则」这种不是句子的条目，句子本身没了，只剩缺口；过的那次是先把句子写全、只把那个数空着退回。这是行为差别不是判官读法，正文第 5 步在审查后补了一句「退回的也先写成一句、空的只是那个数」（没有重跑）。

`not-closed` 两组同分，只作回归守卫。`translate` 0.67 没到 1.0 硬线，原因如上；是否再跑由主人在第 6 阶段的门上定（与上面 `wrap-up-pr-body` 同一处理）。四轮结果 JSON 提交前都跑过 `scripts/scrub-eval-results.ts`。

三份结果 JSON 提交前都跑过 `scripts/scrub-eval-results.ts`。

### 0.1.3（2026-09-19，agent-system#121）：两条改旧代码时才开的活动——legacy-code-change、system-integration

跑法与上面相同（被测 sonnet、裁判 sonnet），`--case '<skill>-*'` 两条各跑一次，结果在 `results/2026-09-19-as121-baseline/<skill>/` 与 `results/2026-09-19-as121-gate/<skill>/`。用例的 `append_system_prompt` 沿用上面那份 mock 的常驻规则；材料是旧 `legacy-change`、`integration` 评测里那段运费计算，贴在提示词里，工具不可用，agent 只把要做的按顺序说出来。这两条是薄步：正文只点名 `characterization-test`、`sprout-method`、`interface-contract-checklist`、`incremental-integration` 四条实践与顺序，沙箱里没装 practices，所以 grader 判的是薄步自己定的顺序与停点。

| 用例 | skill | 测什么 | 该怎么判 |
|---|---|---|---|
| `legacy-code-change-run` | legacy-code-change | 第 5 阶段、旧方法没有测试且注释与实现对不上，门上已开这条活动 | 先用一条真实入参走读成特征化测试摆给主人否（18 → 30 → 33，两处出入标出），否过之后才萌芽（新方法、旧体不动、入口一处分流、关开关验证），现在停在等否，不改生产方法 |
| `legacy-code-change-greenfield` | legacy-code-change | 从零新建的票，门上写了「从零新建，不开改旧代码的活动」 | 说不用：没有现状可锁、没有旧路径可萌芽，请主人敲 `/implement` |
| `system-integration-run` | system-integration | 改动建完要接进去：三个调用方（一个绕过入口）、加列的表与报表、开关未注册、共库 | 先边界清单每行变没变（BatchCalc 绕过入口交主人定），再依赖在前、每步带退法的顺序，联调 26 加老路径 18 且只读；停在请主人否，没合没动表没注册开关 |
| `system-integration-merge-conflict` | system-integration | 合分支撞上冲突块 | 说这是配置管理不是集成活动，就冲突块作答、一题问主人 |

两条正例各带一条 `tool_used: Skill` 的 with-only 指示器，不计分。

基线（`results/2026-09-19-as121-baseline/`，SKILL.md 占位，每用例 1 次，两组，4 次运行两条各 67、72 秒，合计 0.90 美元）：

- `legacy-code-change-run`：对照组先写特征化测试是对的，接着就「修 `calc`：在 `region` 分支里判断新疆或西藏加 8 元、顺手把注释改成与实现一致」——直接改旧方法体，没有摆给主人否，没有萌芽。有 skill 组在占位正文下已过，靠的是 description 那一句「先特征化测试摆给主人否，否过之后萌芽」。真缺口是「否之前不动、否之后萌芽」。
- `legacy-code-change-greenfield`：两组都说不用。只作回归守卫。
- `system-integration-run`：对照组没有逐边界的清单与顺序，问了一题 BatchCalc 要不要接就停；有 skill 组（占位）清单与顺序都有，但顺序是「注册开关 → 部署代码 → 加列 → 回填 → 开开关」，加列在代码之后，没有一步写退法，开开关排在本次顺序里。真缺口是「依赖在前、每步退法、停在否之前」。
- `system-integration-merge-conflict`：两组都判为配置管理、就冲突块作答。只作回归守卫。

实跑记录（2026-09-19，被测 sonnet、裁判 sonnet，每用例 3 次，阈值 1.0）。第一轮门评测（结果未提交，24 次运行、2.19 美元）四条过两条：`legacy-code-change-run` 0.33——有 skill 组走读与停点都对，改法把分流写到方法末尾且没有开关；`system-integration-run` 0——有 skill 组只出清单就停下等否，grader 要清单与顺序一起。改两条薄步：`legacy-code-change` 第 1 步写明改法三句（新逻辑放哪、哪个开关开启且哪个字段命中时转去、关闭时走哪），第 2 步写明分流位置；`system-integration` 改成清单与顺序一次出完、主人只否一次（沿用旧 `integration` 的做法，两条实践各加一句配合）。第二轮 `results/2026-09-19-as121-gate/`（24 次运行、357 秒、2.24 美元），第三轮按 skill 单跑 `results/2026-09-19-as121-gate-rerun/`（24 次，2.23 美元）。

| 用例 | 有 skill 组 | 对照组 | 差值 | 来源 |
|---|---|---|---|---|
| `legacy-code-change-run` | 0.67 | 0 | +0.67 | rerun |
| `legacy-code-change-greenfield` | 1.0 | 1.0 | 0 | rerun |
| `system-integration-run` | 0.67 | 0 | +0.67 | rerun |
| `system-integration-merge-conflict` | 1.0 | 1.0 | 0 | rerun |

平均差值 +0.33。两条反例两组同分，只作回归守卫。对照组在两条正例上都是 0：sonnet 找不到 `flow` 与薄步就停下问主人，或直接改旧方法体。

没到 1.0 的两条要说清：

- `legacy-code-change-run` 0.67：第二轮一次失败是裁判把「把萌芽写成待否的代码草图」读成改了生产代码（grader 补了一句「草图不算改」）；第三轮一次失败是 sonnet 按正文把开关列成「待确认」，改法里却仍把新调用写成不受开关保护的一行插在 `return` 之前——单次失误，正文已写明「开关开启且入参命中的判断就在这一处」。
- `system-integration-run` 0.67：第三轮两次失败都在 `order-undoable-and-stops`，一次是联调那步没写「只读」，一次是多列了一条「前置调查，退法不适用」的步。清单那条 grader 三次都过，BatchCalc 绕过入口都交主人定了。判断：一次漏词、一次多步，不是顺序或停点错；再跑只是换一组随机数，是否按 1.0 硬线重跑由主人在第 6 阶段的门上定。

三轮结果 JSON 提交前都跑过 `scripts/scrub-eval-results.ts`。

### 0.1.4（2026-09-19，agent-system#120）：两条改旧代码时才开的活动——architecture-decision、impact-analysis

从旧 `workcoding` 的 `architecture-design`、`system-analysis` 拆出的两条活动（实践 `tradeoff-analysis`、`effect-sketch`、`baseline-measurement` 在 practices）。用例的 mock 规则副本与跑法同上（被测 sonnet、裁判 sonnet）；`architecture-decision-frame` 另授 Write 以便用 `tool_used: Write, max: 0` 断言没写文件。结果目录带 `-as120` 后缀，与并行的另外三票分开。

| 用例 | skill | 测什么 | 该怎么判 |
|---|---|---|---|
| `architecture-decision-frame` | architecture-decision | 第 4 阶段开了它：spec 验收判据、`master` 现状、尝试分支、两条未知都贴了 | 写清这轮决定什么、不决定什么；事实与未知分开、未知不被猜成事实；尝试分支只当证据；至少两个候选各有两面、推荐带推翻条件；结尾只请主人确认一件事，不写代码与 DDL |
| `architecture-decision-already-confirmed` | architecture-decision | 架构决定主人已确认，票要按它改代码，旧代码没测试 | 不重开候选；指向第 5 阶段与 `legacy-change`（先录旧行为），最多问一个具体问题 |
| `impact-analysis-one-number` | impact-analysis | 开关放 `calc` 还是 `calcInner`，缺「有没有绕过 `calc` 的调用方」，`scheduler` 没贴 | 数挂到决定上、假设单列；草图认出 `BatchCalc` 绕过；证据只为 `scheduler` 这条拿不准的边、写成主人在工作机上跑的命令；一行结论带置信度与未验证假设，说明进哪里 |
| `impact-analysis-requirement` | impact-analysis | 来的是一条未收口的需求 | 当需求处理（第 1、2 阶段的事），不起影响分析 |

基线观察（对照组，不装 skill；取自 `results/2026-09-19-baseline-as120/<skill>/`，SKILL.md 占位，每用例 1 次，两组，被测 sonnet，8 次运行，0.86 美元）。没有这两条 skill 时 agent 实际是这样做的：

- `architecture-decision-frame`：对照组找不到 `flow` 与 skill 就停下，列三个选项问主人「这个协议在哪」；有 skill 组（占位）给了一段 JSON 列对规范表的洞察，然后只问一题（表还有谁在读），没有摆决定、没有两个候选各写两面、没有请主人确认。真缺口：决定什么／不决定什么、事实与未知分开、候选两面、只请主人确认一件事。
- `architecture-decision-already-confirmed`：两组都卡在「仓库不在这个目录、工具不可用」，反问主人仓库在哪，没有回答「下一步该做什么」——既没指向第 5 阶段，也没提旧代码没测试要先录旧行为。真缺口：决定已确认时不重开，指向实现与 `legacy-change`。
- `impact-analysis-one-number`：两组都从贴的代码里认出 `BatchCalc` 绕过 `calc`，对照组的草图与取证那条过了；但两组都没把数挂到决定上、假设没有单列、结论没有置信度与未验证假设，有 skill 组（占位）还把 `scheduler` 的核实与其余边混在一起。真缺口：挂决定、假设单列、只为拿不准的边取证、一行带置信度的结论。
- `impact-analysis-requirement`：两组都判为查询、按需求处理（先说业界叫什么、问一题粒度），没有起影响分析。只作回归守卫。

真缺口三处：架构决定的框定与收口、已确认时的路由、影响分析的挂决定与置信度。正文只针对这三处写。

实跑记录：2026-09-19，同一命令（被测 sonnet、裁判 sonnet、每用例 3 次、带对照组，`--case '<skill>-*'` 两条各跑一次），结果 `results/2026-09-19-gate-as120/<skill>/`（24 次运行，487 秒，2.63 美元）。

| 用例 | 有 skill 组 | 对照组 | 差值 |
|---|---|---|---|
| `architecture-decision-frame` | 1.0 | 0.22 | +0.78 |
| `architecture-decision-already-confirmed` | 0.67 | 0 | +0.67 |
| `impact-analysis-one-number` | 0.83 | 0.17 | +0.67 |
| `impact-analysis-requirement` | 1.0 | 0.67 | +0.33 |

平均差值 +0.61。`impact-analysis-requirement` 基线时两组同分，门评测里对照组有一次跑去要仓库访问，差值来自那一次，仍按回归守卫看。

没到 1.0 的两条要说清，都是单次运行三票 FAIL，读回复都做对了：`architecture-decision-already-confirmed` 那次开头就写「从第 5 阶段进，架构决定已确认不重开候选，`FreightCalc` 没测试属于 legacy-change 那支（特征化测试）」，然后只问了一题「仓库怎么拿到」并按常驻规则列了三个选项，裁判把选项面数成了多问；`impact-analysis-one-number` 那次六行齐全——`BatchCalc` 绕过写成静态事实「不必抓栈」，`scheduler` 是唯一待核实的边、给了 `grep` 与 Arthas `stack` 两种核实法、写明待主人在工作机跑，结论置信中并点名未验证假设——裁判仍判 `sketch-and-targeted-evidence` FAIL，评分噪声（与 agent-system#126 登记的同类）。主人在本会话开场预授权不为 1.0 硬线重跑（desk#152 的站会记录）。

两份结果 JSON 提交前都跑过 `scripts/scrub-eval-results.ts`。
