# 三家指南：吸收了什么、排除了什么

对照过的三份：superpowers 的 `writing-skills`、Anthropic 的 `skill-creator`、Matt Pocock 的 `writing-for-agents`（都在 `vendor/` 下，只当材料）。本工作区的前提是：路由权归规则和主人，不归描述；skill 通过 manifest 安装、junction 投影到三个客户端。

## 吸收

| 来源 | 步骤 | 为什么在这里仍成立 |
|---|---|---|
| superpowers | 动笔前先不带 skill 跑一遍，逐字记 agent 实际怎么做 | 保证写的是真缺口；三家共同的最高价值步骤 |
| superpowers | 按错法选表达形式（容易走捷径的用禁令加借口表，形状错的用配方） | 与调用方式无关 |
| superpowers | 只有重参考和可复用工具才拆文件；引用一层直达；不用 `@文件` | junction 投影下路径不稳，强加载更危险 |
| superpowers | 措辞做小样本对照（≥5 次、带无指引对照组、方差是指标） | 便宜，不依赖触发 |
| skill-creator | 从当前对话抠出主人已演示过的工作流，补缺后让主人确认 | 起手式，符合「主人确认」的风格 |
| skill-creator | 判分纪律：真正完成而非表面合规；举证责任在断言方；反过来批评弱断言 | 写进用例纪律 |
| skill-creator | 从反馈泛化不过拟合；读执行记录不只读最终产物；重复手写的脚本固化进 `scripts/` | 迭代纪律 |
| skill-creator | 如实描述内容不让主人意外 | 装进 manifest 等于一次批准长期生效 |
| Anthropic 指南 | 路径正斜杠；正文 <500 行；`scripts/`／`references/`／`assets/`；引用不嵌套 | 硬约束 |
| Matt | 只由人敲的 skill 用 `disable-model-invocation: true`，描述只给人看 | 就是手动调用的 skill 的机制（ADR-0004） |
| Matt | 路由 skill：一个 user-invoked 的 skill 列出其余 skill 各自何时用，只提示不触发 | 流程 skill 的形态 |
| Matt | 每步写完成判据；写完过一遍的四条检查；正面陈述不靠禁令 | 文档组织判据，与调用方式无关 |

## 排除

| 来源 | 做法 | 为什么不要 |
|---|---|---|
| skill-creator | 推销式描述（「even if they don't explicitly ask」） | 与「描述不抢路由」直接冲突，agent-config 的检查会拦 |
| skill-creator | 描述触发词优化循环（20 条 query、train/test 切分） | 自建 skill 不参与自动触发 |
| skill-creator | `.skill` 打包交付、Claude.ai／Cowork 分支 | 走 manifest 与 junction，不走包 |
| superpowers | 把违规症状写进描述 | 同样是 model-invoked 的路由手段 |
| superpowers | 按加载频率定词数（<150／<200 词） | 自建 skill 不常驻上下文，只剩 sprawl 与无效句两把剪刀 |
| superpowers | 部署即推到 fork、回贡 PR | 部署是 manifest 加 sync |
| superpowers | 压力场景全套（3 种以上压力叠加） | 人点名才跑的 skill 绕过风险低；只对有诱惑走捷径的流程保留一两个 |
| Anthropic skill-creator 的评测脚本 | 子代理与你共用机器、HOME、工作区 | 没有沙箱；用 `claude plugin eval` |
