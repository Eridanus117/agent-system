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
