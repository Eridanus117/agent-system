# flow 的评测

跑法：仓根执行 `claude plugin eval plugins/flow -j 4 --judge-model sonnet --no-publish --trust-plugin --output-dir plugins/flow/evals/results/<日期>-gate`（默认带对照组、每用例 3 次、阈值 1.0）。用例只用只读工具加 Skill，不授 Bash 与 Write，原生 Windows 直接跑。`aggregate-result.json` 提交进 `results/<日期>-<标签>/`，HTML 报告不提交。

## 用例构成

每个用例的 `append_system_prompt` 里都带同一份 mock 的规则：常驻规则里的分拣块（三种来往怎么分、开场那一句、等不等）与说话规矩四条。它是 agent-config 共用规则里那一块的副本，改共用规则的分拣块时要同步这里的八份；对照组也有这份规则，所以判分拣与说话规矩的用例差值预期为 0，只作回归守卫。提示词都写明「仓库不在这个工作目录里，不用找也不用问在哪」，否则 agent 会去搜空目录再问路径。

| 用例 | 测什么 | 该怎么判 | 接缝 |
|---|---|---|---|
| `opening-issue` | 机会 issue 开场 | 一句判改动落地、机会 issue、从第 2 段进；说完就动：绑定、读停靠、停在第 2 段门口请敲 `/grill-with-docs`，不问「怎么走」 | 分拣句 + 路线 |
| `opening-small-change` | 自由文本的小改动（README 全文贴在提示词里） | 判小改动、说打算怎么改、不动文件、不进段、最多问一件事（问路径算这一件） | 分拣句 |
| `opening-ambiguous` | 自由文本的两可句（加 `--json` 输出） | 判改动落地（要选输出形状、改接口）、不动手、最多一个要主人定的问题 | 分拣句 |
| `opening-want-to-build` | 主人说「想建一个东西」 | 先说业界叫什么、现成解法、差在哪，再问 | 说话规矩 |
| `question-with-options` | 要 agent 问一题让主人定 | 至少两个选项、每个选项的判据、业界默认、推荐与理由，含「不换」 | 说话规矩 |
| `ticket-optional-steps` | 票开场、改没有测试的旧代码 | 判票、从第 4 段进；第 4 段门口列出可选步（先录旧行为、母版逐字节比）和理由，请主人说行 | 路线 |
| `docking-record` | 主人说「先停」 | 固定标题、四栏顺序、「等你」只写一件 | 路线 |
| `enter-at-segment-4` | 主人指定从第 4 段进、没有 spec | 接受、做第 4 段准备、跳过的段留一句为什么，不逼回第 2 段 | 路线 |

路线用例各带一条 `tool_used: Skill` 的 with-only 指示器，只说明 skill 被点到，不计分；`opening-small-change` 的 `no-flow-read` 也是指示器（有 skill 组不读 `flow` 才亮）。

「一轮一题」不在评测里判：试过三种写法（恰好一题、最多一个要定的事、最多两件事），裁判模型都把「先给例子」那句例子（常写成问句）和「把材料贴给我」数成另一问，三票全 FAIL，而回复本身只问了一件要主人定的事。这条留给真实会话的反馈来守。

## 基线观察（对照组，不装 skill）

取自 `results/2026-09-16-baseline/`（SKILL.md 占位，每用例 1 次，两组）。没有这条 skill 时 agent 实际是这样做的：

- `opening-issue`：说了「这是改动落地」，但报不出机会 issue 该从第几段进，转而问主人「flow 缺失怎么办」；绑定、读停靠的顺序能说出，不会停在第 2 段门口请主人敲。有 skill 组读到占位后同样停下。
- `opening-small-change`：两组都没说「这是小改动」——直接搜 README，找不到就问路径，开场那一句被跳过。用例随后改成把 README 全文贴进提示词。
- `opening-ambiguous`：两组都判「改动落地」且理由对（输出是新的合同），但没有停：接着给洞察和一题（带选项面）。grader 原写「停下等主人」，改为「不动手、最多一个要主人定的问题」。
- `opening-want-to-build`：两组都先说业界名（handoff note、SBAR、站会三问）再问。
- `question-with-options`：两组都给了一题加四个选项、判据、业界默认、推荐，但都顺带问了「代码在哪」。提示词加「不用找也不用问在哪」。
- `ticket-optional-steps`：两组都给出特征化测试／golden master 的洞察（业界知识），但没有段号、没有可选步清单、没有请主人说行，停在「代码不在」。
- `docking-record`：两组都自创格式（`## 停靠记录`、五六个小节），没有四栏；对照组还问模板在哪。
- `enter-at-segment-4`：两组都拒绝从第 4 段进（「没有 flow 定义段」），问 flow 在哪。

共同点：说话规矩四条在对照组已基本成立（洞察先行、选项面、推荐），mock 规则的写法可用；真缺口是路线——issue 类型到段的映射、门口那条消息的形状、停靠记录的固定格式、可选步、接受从任一段进。正文只针对这五处写。

## 实跑记录

待跑。
