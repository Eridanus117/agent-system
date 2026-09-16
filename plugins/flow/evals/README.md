# flow 的评测

跑法：仓根执行 `claude plugin eval plugins/flow -j 4 --judge-model sonnet --no-publish --trust-plugin --output-dir plugins/flow/evals/results/<日期>-gate`（默认带对照组、每用例 3 次、阈值 1.0）。用例只用只读工具加 Skill，不授 Bash 与 Write，原生 Windows 直接跑。`aggregate-result.json` 提交进 `results/<日期>-<标签>/`，HTML 报告不提交。

## 用例构成

每个用例的 `append_system_prompt` 里都带同一份 mock 的规则：常驻规则里的分拣块（三种来往怎么分、开场那一句、等不等）与说话规矩四条。它是 agent-config 共用规则里那一块的副本，改共用规则的分拣块时要同步这里的八份；对照组也有这份规则，所以判分拣与说话规矩的用例差值预期为 0，只作回归守卫。

| 用例 | 测什么 | 该怎么判 | 接缝 |
|---|---|---|---|
| `opening-issue` | 机会 issue 开场 | 一句判改动落地、机会 issue、从第 2 段进；说完就动：绑定、读停靠、停在第 2 段门口请敲 `/grill-with-docs`，不问「怎么走」 | 分拣句 + 路线 |
| `opening-small-change` | 自由文本的小改动 | 判小改动、说打算怎么改、等主人一句；不读 `flow`、不进段 | 分拣句 |
| `opening-ambiguous` | 自由文本的两可句（加 `--json` 输出） | 判改动落地（要选输出形状、改接口）、从第 2 段进、等主人一句 | 分拣句 |
| `opening-want-to-build` | 主人说「想建一个东西」 | 先说业界叫什么、现成解法、差在哪，再最多问一题并先给例子 | 说话规矩 |
| `question-with-options` | 要 agent 问一题让主人定 | 一题、至少两个选项、每个选项的判据、业界默认、推荐与理由，含「不换」 | 说话规矩 |
| `ticket-optional-steps` | 票开场、改没有测试的旧代码 | 判票、从第 4 段进；第 4 段门口列出可选步（先录旧行为、母版逐字节比）和理由，请主人说行 | 路线 |
| `docking-record` | 主人说「先停」 | 固定标题、四栏顺序、「等你」只写一件 | 路线 |
| `enter-at-segment-4` | 主人指定从第 4 段进、没有 spec | 接受、做第 4 段准备、跳过的段留一句为什么，不逼回第 2 段 | 路线 |

路线用例各带一条 `tool_used: Skill` 的 with-only 指示器，只说明 skill 被点到，不计分；`opening-small-change` 的 `no-flow-read` 则计分（有 skill 组不读 `flow`）。

## 基线观察（对照组，不装 skill）

待跑。

## 实跑记录

待跑。
