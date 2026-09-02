# Matt Pocock Skills 学习笔记

> 核验时间：2026-08-12。上游正文固定在[上游提交 `84fdeffd`](https://github.com/mattpocock/skills/tree/84fdeffd12f2ee307994d1eb6feb48173b6e0502)；动态热度数据只代表本次观察时点。本文是学习材料，不是 `agent-control` 权威或已采纳方案。

## 口径与结论先行

这里的 “Matt Pocock 的 skills” 有明确对象：[仓库 `mattpocock/skills`](https://github.com/mattpocock/skills)（仓库题名 *Skills For Real Engineers*），不是泛指他的 TypeScript 教学、博客、X 帖子或 YouTube 内容。仓库把他日常使用的 Agent 工作法写成可安装的 `SKILL.md`，目标是用工程纪律约束 Claude Code、Codex 等编码 Agent，而不是让一套大框架接管全过程。[仓库总览：真实工程师 Skills](https://github.com/mattpocock/skills/blob/84fdeffd12f2ee307994d1eb6feb48173b6e0502/README.md)

证据标记：

- **直接**：本次读取上游源码、作者一手说明或 GitHub API 得到；可沿链接复核。
- **推断**：根据直接信号作出的解释，尤其是传播原因与对我方的适配判断；不冒充作者自述或采用证据。

## 1. 它是什么、怎样组织、为何走红

### 1.1 不是提示词大包，而是分层的工作法产品

**直接。** 固定提交中共有 35 个 `SKILL.md`：`engineering/` 18 个、`productivity/` 7 个、`misc/` 4 个、`in-progress/` 6 个；Claude 插件只发布前两类的 25 个正式 Skill。仓库用目录表达使用频度与成熟度，用插件清单表达发布边界，而不是把所有公开草稿都交给用户。[代码树：固定提交的 Skills 目录](https://github.com/mattpocock/skills/tree/84fdeffd12f2ee307994d1eb6feb48173b6e0502/skills) [仓库规则：Skill 分桶与发布边界](https://github.com/mattpocock/skills/blob/84fdeffd12f2ee307994d1eb6feb48173b6e0502/AGENTS.md) [插件清单：25 个发布 Skill](https://github.com/mattpocock/skills/blob/84fdeffd12f2ee307994d1eb6feb48173b6e0502/.claude-plugin/plugin.json)

**直接。** 它的主组织轴不是领域，而是“谁能触发”：

- **用户触发**：只由人键入，主要承担编排，如 `grill-me`、`to-spec`、`to-tickets`、`implement`；
- **模型触发**：人和模型都能调用，主要承载可复用纪律，如 `grilling`、`tdd`、`diagnosing-bugs`、`code-review`。

用户触发 Skill 可以调用模型触发 Skill，反向链路被明确排除。Claude 用 frontmatter、Codex 用 `agents/openai.yaml` 表达同一触发政策。[调用模型：用户触发与模型触发](https://github.com/mattpocock/skills/blob/84fdeffd12f2ee307994d1eb6feb48173b6e0502/.agents/invocation.md)

**直接。** 系统还有三层辅助面：`setup-matt-pocock-skills` 一次性写入项目的 Issue tracker、标签和领域文档位置；`ask-matt` 充当整套 Skill 的人工路由器；每个正式 Skill 另有面向人的网页，负责说明何时使用、常见问题、可观察的有效信号和它在整体流程中的位置。运行手册与人类选型说明刻意不互相复制。[项目适配：一次性设置 Skill](https://github.com/mattpocock/skills/blob/84fdeffd12f2ee307994d1eb6feb48173b6e0502/skills/engineering/setup-matt-pocock-skills/SKILL.md) [人工路由：ask-matt](https://github.com/mattpocock/skills/blob/84fdeffd12f2ee307994d1eb6feb48173b6e0502/skills/engineering/ask-matt/SKILL.md) [文档规范：分布式路由页面](https://github.com/mattpocock/skills/blob/84fdeffd12f2ee307994d1eb6feb48173b6e0502/.agents/writing-docs.md)

**直接。** 分发有两种哲学：`skills.sh` 把可编辑副本放进项目，用户自行改造；Claude 官方市场提供只读、随发布更新的订阅式插件。Codex 仍由通用安装器覆盖，原生插件因当前 manifest 不能精确选择两个发布目录而暂缓。[分发决定：Claude 插件与 Codex 暂缓](https://github.com/mattpocock/skills/blob/84fdeffd12f2ee307994d1eb6feb48173b6e0502/.agents/adr/0002-ship-as-a-claude-code-plugin.md)

### 1.2 “网红”有多红，为什么会红

**直接。** GitHub API 在 2026-08-12 返回 214,407 stars、18,496 forks；仓库创建于 2026-02-03。README 还把 `grill-me` / `grill-with-docs` 称作其中最受欢迎的一组，并提供跨 Agent 的一条命令安装与 Claude 官方市场入口。这些足以证明“注意力很高、扩散很快”，但 stars、forks 与视频播放都不能单独证明长期采用或工程效果。[热度快照：GitHub 仓库元数据](https://api.github.com/repos/mattpocock/skills) [作者说明：五个日用 Agent Skills](https://www.aihero.dev/5-agent-skills-i-use-every-day)

**直接。** 作者持续用文章和视频解释具体失败模式、改名、迁移和端到端流程，而非只发布仓库。例如，v1.1 说明了 `grilling` 的三次行为修正：批次提问、实施前确认、事实与决定分离；另有完整工作流视频与专项误用视频。[版本说明：v1.1 与完整工作流](https://www.aihero.dev/skills/skills-changelog-v1-1-wayfinder-to-spec-to-tickets-grilling-improvements) [视频：Skills 端到端工作流](https://www.youtube.com/watch?v=M6mYodf0dJM) [视频：Grill 系列常见误用](https://www.youtube.com/watch?v=UzMNBN6xLLA)

**推断。** 走红更可能是以下因素叠加，而不是某一条神奇提示词：

1. **叙事命中共同痛点**：需求错位、Agent 冗长、代码缺少反馈、架构变泥团，读者能立刻把自己遇到的问题映射到一个 Skill。
2. **复制成本极低**：Markdown 为主、MIT、跨模型安装，既可 fork 改造，也可订阅更新。
3. **“小而可组合”容易传播**：`grill-me` 本体只有一个委派动作，却把复杂纪律交给 `grilling`；一个名字、一个动作、一个可见效果，远比整套方法论易记。
4. **作者已有教学分发能力**：一手文章、变更视频和公开文档把仓库变成持续教学产品。这个解释合理，但本次没有取得能分离各渠道贡献度的数据。

## 2. 三个代表 Skill 的设计

### 2.1 `grill-me` + `grilling`：把“先问清楚”写成决定树

**解决什么。** 在 Agent 过早写计划或动手以前，暴露人和 Agent 对目标、边界与取舍的不同理解。

**触发。** `grill-me` 是只能由用户触发的极薄包装，它只要求运行 `grilling`；`grilling` 是模型可触发的复用原语，描述里列出压力测试计划、决定或想法等命中场景。[包装层：grill-me](https://github.com/mattpocock/skills/blob/84fdeffd12f2ee307994d1eb6feb48173b6e0502/skills/productivity/grill-me/SKILL.md) [原语层：grilling](https://github.com/mattpocock/skills/blob/84fdeffd12f2ee307994d1eb6feb48173b6e0502/skills/productivity/grilling/SKILL.md)

**步骤与边界。** 它把讨论建模为决定树；每轮只问前置条件已确定的“frontier”，同轮可并行问独立问题，依赖未决答案的问题留到下一轮。环境事实由 Agent 查，价值选择由用户答；每轮后重算 frontier。frontier 为空仍不实施，必须先由用户确认共同理解。

**为什么好用（推断）。** `design tree`、`frontier` 是强“leading words”：短词直接携带遍历、依赖和停止条件。包装与原语分开后，其他 Skill 可复用相同问询纪律，而人的入口保持极短。实施前确认又把“聊完了”与“可以动手”分成两个状态，减少自动越界。

### 2.2 `diagnosing-bugs`：先造可信反馈环，再允许解释

**解决什么。** 防止 Agent 看到异常就读代码、猜原因、修改一处，然后把旁边的绿色信号误当成问题已经消失。

**触发。** 描述覆盖困难 bug、性能回退，以及用户说“诊断／调试”或报告 broken、throwing、failing、slow 的情形。[诊断手册：diagnosing-bugs](https://github.com/mattpocock/skills/blob/84fdeffd12f2ee307994d1eb6feb48173b6e0502/skills/engineering/diagnosing-bugs/SKILL.md)

**步骤与边界。** 六阶段依次是：构造 feedback loop → 重现并最小化 → 提出 3–5 个可证伪假设 → 一次只改一个变量地插桩 → 先回归测试后改代码 → 清理与复盘。核心门不是“看懂代码”，而是已经实际运行过一条命令，且它能捕获用户的确切症状、确定、快速、可由 Agent 独立执行。造不出这条红信号时停止推断，改为请求环境、脱敏材料或临时插桩授权。

**为什么好用（推断）。** `tight`、`red-capable` 把抽象的“相信这个复现”变成可检查门；每阶段都有进入与完成判据。它还把秘密脱敏、无正确 test seam、调试日志清理、原始场景复测纳入同一闭环，防止局部改动冒充诊断完成。

### 2.3 `tdd`：用 seam 和 tracer bullet 限制测试幻觉

**解决什么。** 防止 Agent 一次写完想象中的全部测试、耦合实现细节，或为了好测而选错公共边界。

**触发。** 用户明确要求 test-first、red-green-refactor 或集成测试时使用。[测试手册：tdd](https://github.com/mattpocock/skills/blob/84fdeffd12f2ee307994d1eb6feb48173b6e0502/skills/engineering/tdd/SKILL.md)

**步骤与边界。** 先与用户确认要测试的公共 seam；没有确认的 seam 就不写测试。之后每轮只走一条纵向切片：一个失败测试、最少通过实现，再进入下一轮；测试只看公开行为，预期值必须有独立来源。它明确排除实现耦合、同义反复式断言和“先写完所有测试”的横向切片，并把重构放到后续 review 阶段。

**为什么好用（推断）。** `seam` 决定测试位置，`tracer bullet` 决定推进粒度，`red before green` 决定时序；三个词分别压住最常见的三个自由度。规则不试图讲完整测试理论，而是集中改变 Agent 最容易走偏的默认动作。

## 3. 对照我方 `agent-plugins`

对照基线为[我方 `agent-plugins` 提交 `e9e2d03`](https://github.com/Eridanus117/agent-plugins/tree/e9e2d034004597d97ed312a97c66e8822f764ff8)。以下是学习建议，不代表已经批准改变插件结构或触发语义。

### 3.1 值得借鉴的 4 点

| 借鉴点 | 对我方的价值 | 最小第一步 |
| --- | --- | --- |
| **把人类入口与模型原语显式分层** | Matt 用短包装保留用户意图，用长原语承载复用纪律；可降低入口认知负担，同时避免多份流程正文。 | 只做一张现状表：列出每个现有 Skill 是“用户直接请求”“模型可建议但需同意”还是“模型可直接运行”，先找语义冲突，不改 frontmatter。 |
| **为每个正式 Skill 提供人类选型页** | 我方 README 强于版本与治理说明，但新人仍需从长篇正文推断“何时用、看到什么算有效、与谁相邻”。 | 先为 `grilling` 写一页试点，只含 What / When / Common questions / Working signals / Where；正文继续以 `SKILL.md` 为唯一行为源。[我方入口：插件现状总览](https://github.com/Eridanus117/agent-plugins/blob/e9e2d034004597d97ed312a97c66e8822f764ff8/README.md) |
| **用 leading word 配一个可观察完成门** | 我方已有“价值门、可信门、G1–G3”等好例子，但不同 Skill 的写法还可系统检查：短词负责召回，完成门防止提前收口。 | 选一个成熟 Skill 做只读审计，逐段标出 leading word、完成判据和 no-op；只有发现重复且现有测试能守住语义时再提压缩变更。[作者方法：为 Agent 写作](https://github.com/mattpocock/skills/blob/84fdeffd12f2ee307994d1eb6feb48173b6e0502/skills/productivity/writing-for-agents/SKILL.md) |
| **发布面与试验面在目录和清单上双重分开** | `in-progress` 公开收反馈，但不进入正式插件；比“文件存在就算可用”更诚实，也降低误装风险。 | 复用我方已有证据等级，先给现有 Skill／reference 做发布面盘点；不移动文件、不新造成熟度状态，只找“清单暴露与证据等级不一致”的对象。 |

### 3.2 我方已经更好的地方

1. **证据与知识生命周期更完整（直接）。** Matt 的 `research` 要求后台 Agent、第一方来源和单一带引用 Markdown，简洁但没有逐条价值门、可信门、失效条件与下次最少复核；我方 `knowledge-maintenance` 与 `adaptive-problem-solving` 已区分直接验证、一手核验、二手转述、推断，并把知识准入、决策证据和产品证据等级分开。[上游研究 Skill：三步取证](https://github.com/mattpocock/skills/blob/84fdeffd12f2ee307994d1eb6feb48173b6e0502/skills/engineering/research/SKILL.md) [我方知识维护：价值门与可信门](https://github.com/Eridanus117/agent-plugins/blob/e9e2d034004597d97ed312a97c66e8822f764ff8/plugins/knowledge-maintenance/skills/knowledge-maintenance/SKILL.md) [我方问题治理：来源与产品证据分层](https://github.com/Eridanus117/agent-plugins/blob/e9e2d034004597d97ed312a97c66e8822f764ff8/plugins/adaptive-problem-solving/skills/adaptive-problem-solving/SKILL.md)
2. **授权、共享写入与远端后态更完整（直接）。** 我方协作 Skill 有五字段派发合同、排他 owned paths、稳定 Dispatch 身份、写后回读和独立验收；项目入口直接维护远端合同、当前 head 与写入边界。Matt 的 `code-review` 很好地隔离 Standards / Spec 两轴，却只规定“并行 sub-agents + 聚合”，没有持久协调后端、写入所有权或资源收口合同。[上游审查：双轴隔离](https://github.com/mattpocock/skills/blob/84fdeffd12f2ee307994d1eb6feb48173b6e0502/skills/engineering/code-review/SKILL.md) [我方协作：类型化派发与验收](https://github.com/Eridanus117/agent-plugins/blob/main/plugins/orchestrated-collaboration/skills/orchestrated-collaboration/SKILL.md) [我方 GitHub 主干：直接远端合同](../../authority/04-collaboration.md)
3. **同意与成本门更适合负责人场景（直接）。** Matt 的 `grilling` 可由模型按触发语义自动到达，并以遍历 frontier 为结束；我方 `grilling` 必须由用户直接要求或明确接受建议，还允许因剩余价值低、成本过高而降级。这更能保护负责人注意力。[我方盘问：明示同意与退出](https://github.com/Eridanus117/agent-plugins/blob/e9e2d034004597d97ed312a97c66e8822f764ff8/plugins/grilling/skills/grilling/SKILL.md)
4. **跨 Provider 发布与符合性检查更扎实（直接）。** 我方七个 Plugin 同时维护 Claude 与 Codex manifest，并用 TypeScript 检查描述 UTF-8 预算、两端元数据一致性和 README 版本；Matt 当前仍通过通用安装器服务 Codex，原生 Codex 插件处于暂缓状态。[我方符合性测试：多端清单与描述预算](https://github.com/Eridanus117/agent-plugins/blob/e9e2d034004597d97ed312a97c66e8822f764ff8/tests/workflow-routing.test.ts)

### 3.3 不宜照搬

- **不照搬“模型命中关键词即可进入长期盘问”。** 对个人编码流可能顺手，对负责人稀缺注意力场景会放大交互成本；我方应保留明示同意与 ROI 退出门。
- **不照搬极薄的 `implement` 发布语义。** 上游只要求使用 TDD、最终 review、测试与当前分支提交，缺少我方必需的远端合同、分支所有权、写后复核和 PR 生命周期边界。[上游实施编排：implement](https://github.com/mattpocock/skills/blob/84fdeffd12f2ee307994d1eb6feb48173b6e0502/skills/engineering/implement/SKILL.md)
- **不照搬生成 Bash 产品脚本的 `wizard` 方向。** 它与本机“持久脚本只用 Go、Python、TypeScript 或 Rust”的明确规则冲突；最多学习“把人类专属步骤做成可检查向导”的问题形状，不能复制载体。
- **不把热度当质量或采用证据。** 214K stars 说明传播，不证明某个 Skill 在我方授权、中文语境、多 Session 和远端治理边界下有效；进入产品前仍需窄样本与现有证据等级。

## 4. 最大两个启发

1. **Skill 系统的瓶颈不只在 `SKILL.md` 写得好不好，还在“人怎样找到正确入口”。** Matt 把触发类型、`ask-matt` 路由、人类文档、正式／试验发布面连成一体；我方最值得补的是低认知负担的选型面，而不是再增加一个复杂控制器。
2. **最有迁移价值的写法是“一个 leading word + 一个可观察门 + 一个明确退出”。** `frontier`、`tight/red-capable`、`seam/tracer bullet` 都用极少文字限制了 Agent 的搜索空间。把这种写法嵌入我方已有授权、证据和生命周期治理，比复制整套工作流更有价值。

## 复核边界

- 本文直接核验了固定提交中的 README、调用规范、发布 ADR、代表 Skill 和作者一手说明；没有把二手中文解读作为结论来源。
- 本次也检索了作者的 X 公开内容，但没有取得既可稳定复核、又能给上述结论增加新信息的原帖，因此没有把转述或搜索摘要列为证据。
- GitHub 热度和视频传播只支持“受到广泛注意”，不能推出真实留存、生产收益或因果贡献。
- 上游快速演进；下次复核只需先看固定提交之后的 README、`.agents/invocation.md`、代表 Skill 与插件清单差异。若触发模型、发布桶或三个代表 Skill 的完成门变化，再更新本文相应结论。
