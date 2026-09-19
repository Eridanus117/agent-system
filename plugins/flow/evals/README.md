# flow 的评测

跑法：仓根执行 `claude plugin eval plugins/flow -j 4 --judge-model sonnet --no-publish --trust-plugin --output-dir plugins/flow/evals/results/<日期>-gate`（默认带对照组、每用例 3 次、阈值 1.0）。用例只用只读工具加 Skill，不授 Bash 与 Write，原生 Windows 直接跑。`aggregate-result.json` 提交进 `results/<日期>-<标签>/`，HTML 报告不提交。

## 用例构成

每个用例的 `append_system_prompt` 里都带同一份 mock 的规则：常驻规则里的分拣块（三种请求怎么分、开场那一句、等不等）与说话规矩四条。它是 agent-config 共用规则里那一块的副本，改共用规则的分拣块时要同步这里的八份和 `plugins/flow-steps/evals` 的八份；副本用词按词汇表（阶段、站会记录），比 agent-config 共用规则里还没换的「段」「停靠记录」先走一步，收口票 agent-system#123 把共用规则换齐后两边就一致；对照组也有这份规则，所以判分拣与说话规矩的用例差值预期为 0，只作回归守卫。提示词都写明「仓库不在这个工作目录里，不用找也不用问在哪」，否则 agent 会去搜空目录再问路径。

| 用例 | 测什么 | 该怎么判 | 接缝 |
|---|---|---|---|
| `opening-issue` | 机会 issue 开场 | 一句判常规变更、机会 issue、从第 2 阶段进；说完就动：绑定、读站会记录、停在第 2 阶段门上请敲 `/grill-with-docs`，不问「怎么走」 | 分拣句 + 路线 |
| `opening-small-change` | 自由文本的标准变更（README 全文贴在提示词里） | 判标准变更、说打算怎么改、不动文件、不进阶段、最多问一件事（问路径算这一件） | 分拣句 |
| `opening-ambiguous` | 自由文本的两可句（加 `--json` 输出） | 判常规变更（要选输出形状、改接口）、不动手、最多一个要主人定的问题 | 分拣句 |
| `opening-want-to-build` | 主人说「想建一个东西」 | 先说业界叫什么、现成解法、差在哪，再问 | 说话规矩 |
| `question-with-options` | 要 agent 问一题让主人定 | 至少两个选项、每个选项的判据、业界默认、推荐与理由，含「不换」 | 说话规矩 |
| `ticket-optional-steps` | 票开场、改没有测试的旧代码 | 判票、从第 4 阶段进；第 4 阶段门上列出改旧代码时才开的活动（先录旧行为、母版逐字节比）和理由，请主人说行 | 路线 |
| `docking-record` | 主人说「先停」 | 固定标题、四栏顺序、「等你」只写一件 | 路线 |
| `enter-at-segment-4` | 主人指定从第 4 阶段进、没有 spec | 接受、做第 4 阶段准备、跳过的阶段留一句为什么，不逼回第 2 阶段 | 路线 |

每条 llm grader 只判一个可观测面（开场那一句、动作顺序、停在门上、改旧代码时才开的活动清单、门上消息的形状……），一个用例两到三条；regex 只留站会记录的标题。路线用例各带一条 `tool_used: Skill` 的 with-only 指示器，只说明 skill 被点到，不计分；`opening-small-change` 的 `no-flow-read` 也是指示器（有 skill 组不读 `flow` 才亮）。

「一轮一题」不在评测里判：试过三种写法（恰好一题、最多一个要定的事、最多两件事），裁判模型都把「先给例子」那句例子（常写成问句）和「把材料贴给我」数成另一问，三票全 FAIL，而回复本身只问了一件要主人定的事。这条留给真实会话的反馈来守。

## 基线观察（对照组，不装 skill）

取自 `results/2026-09-16-baseline/`（SKILL.md 占位，每用例 1 次，两组）。没有这条 skill 时 agent 实际是这样做的：

- `opening-issue`：说了「这是常规变更」，但报不出机会 issue 该从第几阶段进，转而问主人「flow 缺失怎么办」；绑定、读站会记录的顺序能说出，不会停在第 2 阶段门上请主人敲。有 skill 组读到占位后同样停下。
- `opening-small-change`：两组都没说「这是标准变更」——直接搜 README，找不到就问路径，开场那一句被跳过。用例随后改成把 README 全文贴进提示词。
- `opening-ambiguous`：两组都判「常规变更」且理由对（输出是新的合同），但没有停：接着给洞察和一题（带选项面）。grader 原写「停下等主人」，改为「不动手、最多一个要主人定的问题」。
- `opening-want-to-build`：两组都先说业界名（handoff note、SBAR、站会三问）再问。
- `question-with-options`：两组都给了一题加四个选项、判据、业界默认、推荐，但都顺带问了「代码在哪」。提示词加「不用找也不用问在哪」。
- `ticket-optional-steps`：两组都给出特征化测试／golden master 的洞察（业界知识），但没有阶段号、没有改旧代码时才开的活动清单、没有请主人说行，停在「代码不在」。
- `docking-record`：两组都自创格式（`## 停靠记录`、五六个小节），没有四栏；对照组还问模板在哪。
- `enter-at-segment-4`：两组都拒绝从第 4 阶段进（「没有 flow 定义阶段」），问 flow 在哪。

共同点：说话规矩四条在对照组已基本成立（洞察先行、选项面、推荐），mock 规则的写法可用；真缺口是路线——issue 类型到阶段的映射、门上那条消息的形状、站会记录的固定格式、改旧代码时才开的活动、接受从任一阶段进。正文只针对这五处写。

## 实跑记录

2026-09-16，`claude plugin eval plugins/flow -j 4 --judge-model sonnet`（有 skill 组对对照组，每用例 3 次，阈值 1.0）。八个用例的最终数字来自两份结果：五条取自完整一轮 `results/2026-09-16-gate/`（48 次运行，1040 秒，12.0 美元）；`opening-issue`、`opening-small-change`、`ticket-optional-steps` 三条在那一轮后按判官反馈改了 grader 措辞和正文一句（开场那一句先说），单独重跑，取自 `results/2026-09-16-gate-rerun/<用例>/`（各 6 次）。

| 用例 | 有 skill 组 | 对照组 | 差值 | 来源 |
|---|---|---|---|---|
| `opening-issue` | 1.0 | 0 | +1.0 | rerun |
| `opening-small-change` | 0.89 | 0.89 | 0 | rerun |
| `opening-ambiguous` | 1.0 | 1.0 | 0 | gate |
| `opening-want-to-build` | 1.0 | 1.0 | 0 | gate |
| `question-with-options` | 1.0 | 1.0 | 0 | gate |
| `ticket-optional-steps` | 0.92 | 0 | +0.92 | rerun |
| `docking-record` | 1.0 | 0.08 | +0.92 | gate |
| `enter-at-segment-4` | 1.0 | 0 | +1.0 | gate |

平均差值 +0.48。路线类四条（`opening-issue`、`ticket-optional-steps`、`docking-record`、`enter-at-segment-4`）差值 +0.92 到 +1.0，是这条 skill 真正带来的行为；分拣与说话规矩类四条两组同分，是 mock 规则在起作用，只作回归守卫。

两条没到 1.0 的要说清：

- `opening-small-change` 0.89：三次里一次 `no-segments-no-edit` 三票 FAIL，那条回复是「这是标准变更，我打算把第 3 行的布署改成部署」加一段 diff 和改好的全文，既没进阶段也没说改过文件；对照组同一位置同样一次 FAIL。判官把 diff 块读成了「已经改了」。
- `ticket-optional-steps` 0.92：三次里一次 `gate-message-approval` 两票 FAIL，那条回复的门上消息齐全，收尾是「请贴最后一条站会记录」，grader 已写明这算合法收尾，判官仍投了两票 FAIL。

两处都是判官对合规回复的抖动，不是行为缺口；再改 grader 或再跑只是在换一组随机数。决定是否按 1.0 硬线要求重跑，由主人在第 6 阶段的门上定。

迭代过程：第一轮门评测（未提交）路线类四条全过、四条分拣类没过，原因是判官把「先给例子」的问句和「把材料贴给我」数成第二问；随后去掉数问题的 grader，把 9 条多面 llm grader 拆成 19 条各判一件事（仓内 eval-cases 的规则），删掉与 llm 判同一件事的 regex；再一轮完整门评测后又对齐了三条 grader 与正文的规则（会话不在 Orca worktree 里跳过绑定是对的；贴改好的文本不算改；问目标仓在哪算门上的合法收尾）。裁判模型固定用 sonnet。

两份结果 JSON 提交前都跑过 `scripts/scrub-eval-results.ts`，家目录路径里的用户名已换成 `<user>`。

### 0.1.1（2026-09-16，desk#140）：九个阶段那张表第 4、6、7 阶段四格改点名 flow-steps 的四条

改前的结果就是上面那份（默认模型）。改后按主人当天的省钱决定用 `--model sonnet` 每用例 1 次复跑，结果在 `results/2026-09-16-v0.1.1-sonnet/`：有 skill 组 `docking-record`、`opening-issue`、`opening-ambiguous`、`opening-small-change`、`opening-want-to-build` 1.0；`enter-at-segment-4` 0.5（sonnet 在 orca、gh 不可用时停下来要主人贴绑定结果和站会记录，没给第 4 阶段门上那条消息）；`ticket-optional-steps` 0.75（门上消息齐全，收尾问了两件事）；`question-with-options` 0.33（选项里少了「不换」那一项）。三处都发生在改表没碰的地方，是 sonnet 单次运行的行为，不是这次改动引入的退化；被测模型不同，数字不与上面那份直接比。

### 0.1.2（2026-09-19，agent-system#117）：换词——阶段、活动、站会记录、常规变更

正文按词汇表换词（来往→请求、要答案→查询、小改动→标准变更、改动落地→常规变更、段→阶段、步→活动、可选步→改旧代码时才开的活动、停靠记录→站会记录、硬问题→违例、上线待办→上线清单），站会记录标题改成 `### 站会 ·`，读取时按四栏认；门上那条消息与站会记录的模板和例子移到 `references/`，正文只引用。八份规则副本、grader 与提示词同步。用例目录名与 grader 文件名（`docking-record`、`enter-at-segment-4`、`no-segments-no-edit` 这类）是标识符，为了和旧结果对得上，保留不改。

同一命令跑了四份（默认模型、裁判 sonnet、每用例 3 次、带对照组）：

- `results/2026-09-19-before/`：改前，main 上 0.1.1 的正文与当时的用例（旧词）。48 次，745 秒，12.72 美元。
- `results/2026-09-19-gate/`：换词后第一轮。48 次，841 秒，12.71 美元。`opening-issue` 三次都在 `stops-at-gate` FAIL——agent 绑定、读站会记录、定第 2 阶段都对，接着自己做起了方案对齐的洞察与提问，没停下请主人敲 `/grill-with-docs`；改前那一轮同一 grader 三次里一次也这样。原因是原来正文里「请敲 /grill-with-docs」的例子随模板搬进了 references。补的不是模板，是两句正面句：起始阶段的活动标了「主人敲」的，门上那条消息最后那件事就是请主人敲它，洞察与提问留给那条 skill；标「主人敲」的活动里的事等它启动后再做。
- `results/2026-09-19-gate-rerun/`：补两句后只重跑 `opening-issue`，三次 1.0。6 次，116 秒，1.32 美元。
- `results/2026-09-19-gate-final/`：审查意见改完正文（已有工作树先问一句、两处禁令挪到正面句后、references 例子与九阶段表对齐）后在最终正文上全套重跑，改后数字以它为准。48 次，804 秒，12.93 美元。

| 用例 | 改前 有 skill 组 | 改前 对照组 | 改前 差值 | 改后 有 skill 组 | 改后 对照组 | 改后 差值 |
|---|---|---|---|---|---|---|
| `opening-issue` | 0.93 | 0 | +0.93 | 1.0 | 0 | +1.0 |
| `opening-small-change` | 0.89 | 1.0 | -0.11 | 0.78 | 1.0 | -0.22 |
| `opening-ambiguous` | 1.0 | 1.0 | 0 | 1.0 | 1.0 | 0 |
| `opening-want-to-build` | 1.0 | 0.67 | +0.33 | 1.0 | 1.0 | 0 |
| `question-with-options` | 1.0 | 1.0 | 0 | 1.0 | 1.0 | 0 |
| `ticket-optional-steps` | 1.0 | 0 | +1.0 | 0.83 | 0 | +0.83 |
| `docking-record` | 1.0 | 0 | +1.0 | 1.0 | 0 | +1.0 |
| `enter-at-segment-4` | 0.83 | 0.17 | +0.67 | 0.92 | 0.33 | +0.58 |

平均差值改前 +0.48、改后 +0.40；差在对照组这次在 `opening-want-to-build`、`enter-at-segment-4` 上也拿了分，不是有 skill 组退了。路线类四条（`opening-issue`、`ticket-optional-steps`、`docking-record`、`enter-at-segment-4`）改后差值 +0.58 到 +1.0，仍是这条 skill 带来的行为；分拣与说话规矩类四条是回归守卫。

改后三条没到 1.0 的要说清，各是三次里一次（`ticket-optional-steps` 两次）：

- `opening-small-change` 0.78：一次 `classification` FAIL，那条回复直接给了改好的全文、没先说「这是标准变更」。分拣句在 mock 规则里、对照组同一用例 1.0，不是 flow 正文的事。
- `ticket-optional-steps` 0.83：两次 `gate-message-approval` FAIL，回复都先列了绑定、读站会记录三条命令并写「输出贴回来之前不往下动」，再给第 4 阶段的清单；grader 把「贴输出」算合法收尾，判官仍按「一串问题」判。
- `enter-at-segment-4` 0.92：一次 `segment-4-prep` FAIL，那条回复把读站会记录的命令写成 `gh issue comment` 又自行更正，worktree 与基线都在。

三处都是判官对合规回复的抖动或 agent 单次口误，不是正文缺口；再跑只是换一组随机数，是否按 1.0 硬线重跑由主人在第 6 阶段的门上定。

四份结果 JSON 提交前都跑过 `scripts/scrub-eval-results.ts`。
