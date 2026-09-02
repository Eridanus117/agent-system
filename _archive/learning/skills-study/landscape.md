# 网红 Agent／Claude Code Skills 图景研究

> 性质：学习材料，不是当前权威、产品决定或实施授权。
> 核验时间：2026-08-12；对象是各仓库当日默认分支。
> 研究问题：热门 Skills 集如何组织、为什么容易传播，以及哪些设计规律值得 `agent-plugins` 吸收。

## 先说结论

热门项目已经把 Skill 从“一段好提示词”推进为三种产品：可按需装载的行为包、可组合的工作流套件，以及可搜索／安装／更新的分发生态。真正拉开质量差距的不是 Skill 数量，而是四件事能否同时成立：**找得准（触发）、做得完（闭环）、验得出（证据）、装得下（上下文成本）**。

**对我们最大的启发：下一阶段不应优先扩充 Skill 数量，而应把“触发准确率 × 行为闭环率 × 证据等级 ÷ 常驻上下文成本”变成每个 Skill 都能被观察和改进的产品回路。**

## 证据口径与边界

本文按核验距离分级：

- **E1｜本次直接核验**：用 GitHub API 读取仓库元数据、默认分支 head、文件树或原文件；别人可以按链接和提交重复检查。
- **E2｜一手来源核验**：项目维护者或平台官方文档的明确说明；能证明其设计或自述，不能替代实际行为试验。
- **E3｜二手转述**：Awesome 列表、媒体或社区归纳；只作发现线索，不支撑关键设计结论。
- **E4｜本文推断**：由传播数据与结构特征归纳的解释，明确不冒充项目方结论。

“热门”只取 GitHub Star 作为统一、低成本的传播代理量，并同时看仓库结构与活跃度。Star、Fork、安装量和目录规模都不能证明 Skill 在真实任务中有效，也不能证明安全、许可兼容或长期可维护。本文选择五个**角色互补**的样本，不做全网排名：官方参考实现、强方法套件、大型插件市场、跨 Agent 分发层、社区聚合目录。

当前认可知识中没有覆盖这份外部图景的现成知识包；本次只复用我方已经确认的守恒律，以及 `agent-plugins` 的资产／符合性模型作为对照基线。研究结果按派发合同落在 `learning/`，通过价值门但尚未作为当前知识或权威准入。

## 五个代表性样本

### 1. Anthropic `skills`：官方格式与生产级复杂样本

截至核验时，该仓库约 **168.4k Stars**；默认分支 head 为 `f17010c`，文件树中有 **18 个 `SKILL.md`**。[E1：仓库](https://github.com/anthropics/skills/tree/f17010c9bb483898c1d9c9f42dde2b3a98889434)

它把每个 Skill 做成自包含目录：`SKILL.md` 承载元数据和主流程，复杂能力再带 `scripts/`、`references/`、`assets/`。Marketplace 没有把 18 个 Skill 全塞进一个安装单元，而是分成文档套件、示例套件和 Claude API 三组；其中 `docx`、`pdf`、`pptx`、`xlsx` 是实际产品能力的参考实现，但许可证与多数开源示例不同。[E1/E2：Marketplace](https://github.com/anthropics/skills/blob/f17010c9bb483898c1d9c9f42dde2b3a98889434/.claude-plugin/marketplace.json)、[E2：README](https://github.com/anthropics/skills/blob/f17010c9bb483898c1d9c9f42dde2b3a98889434/README.md)

最值得研究的是 `skill-creator`：它不把“写完 `SKILL.md`”当完成，而是先捕获意图和触发语境，再用真实提示做有 Skill／无 Skill 对照、量化与人工评价、迭代描述，最后扩大样本。[E1：`skill-creator`](https://github.com/anthropics/skills/blob/f17010c9bb483898c1d9c9f42dde2b3a98889434/skills/skill-creator/SKILL.md)

为何流行：官方身份、格式示范、生产文件能力的可读实现，以及从极简模板到复杂脚本包的完整梯度共同降低了学习成本。[E4] 但仓库自己也明确说这些资产主要用于示范和教育，关键任务仍需在自己的环境中测试；因此“官方”也不是无条件生产背书。[E2]

### 2. `obra/superpowers`：把 Skills 组合成一条强约束开发方法

截至核验时约 **271.0k Stars**；head 为 `44c9b2d`，有 **14 个 `SKILL.md`**。[E1：仓库](https://github.com/obra/superpowers/tree/44c9b2d6e889982ac18c27d05a19fefe335194e1)

它不是零散技巧合集，而是一条可组合的工程路径：先 brainstorming，再 worktree、plan、执行／子 Agent、TDD、代码审查、完成分支；`using-superpowers` 作为启动 Skill 要求每次行动前先检查适用 Skill。各环节分别成 Skill，靠显式前序／后序和 REQUIRED SUB-SKILL 串联，并为多个 Agent 运行端提供安装适配。[E1/E2：基本工作流](https://github.com/obra/superpowers/blob/44c9b2d6e889982ac18c27d05a19fefe335194e1/README.md)、[E1：启动 Skill](https://github.com/obra/superpowers/blob/44c9b2d6e889982ac18c27d05a19fefe335194e1/skills/using-superpowers/SKILL.md)

它的 `writing-skills` 尤其强调 Skill Discovery Optimization：描述写触发症状和搜索词，不在元数据里复述整个流程；先用无 Skill 的失败样本做 RED，再写最小指导、用压力场景复测，并收集 Agent 的合理化借口修补边界。[E1：`writing-skills`](https://github.com/obra/superpowers/blob/44c9b2d6e889982ac18c27d05a19fefe335194e1/skills/writing-skills/SKILL.md)

为何流行：用户买到的是一套有鲜明主张、能自动衔接的完整开发方法，而不是要自己挑选拼装的提示词；跨运行端分发又放大了网络效应。[E4] 代价同样鲜明：其“哪怕只有 1% 可能适用也必须调用”和许多无条件硬门，容易把简单任务升级成固定仪式；这一点与我方按风险、可逆性和 ROI 选择方法的原则冲突。

### 3. `wshobson/agents`：细粒度、跨运行端的大型插件市场

截至核验时约 **38.7k Stars**；head 为 `c4b82b0`。仓库首页自述 94 Plugins、175 Skills，而同一 head 的完整树中实际可数到 **180 个 `SKILL.md`**；数量差异说明目录统计只是随版本变化的观察值。[E1：仓库](https://github.com/wshobson/agents/tree/c4b82b0ad771190355eb8e204b1329732a18449a)、[E2：首页自述](https://github.com/wshobson/agents/blob/c4b82b0ad771190355eb8e204b1329732a18449a/README.md)

它以领域 Plugin 为安装单位，每个 Plugin 可组合 agents、commands、skills、references、assets 和 Claude／Codex 清单。用户先添加 Marketplace，再只安装 Python、后端、安全等所需插件；项目明确把单一职责、细粒度安装、少载入上下文和编排器组合专用插件列为设计原则。[E1/E2：插件设计](https://github.com/wshobson/agents/blob/c4b82b0ad771190355eb8e204b1329732a18449a/docs/plugins.md)

它还把 Claude Code 源文件投影为多运行端的原生资产，编写指南要求描述含显式触发短语、正文用动作而不是某个运行端的工具名、详细材料放 `references/`。仓库另提供自述的三层 PluginEval：静态检查、LLM Judge、Monte Carlo；本文只核验了设计与代码资产存在，没有运行该框架，因此不能采用其质量分数或“认证”结论。[E1/E2：跨端编写指南](https://github.com/wshobson/agents/blob/c4b82b0ad771190355eb8e204b1329732a18449a/docs/authoring.md)、[E2：评估框架说明](https://github.com/wshobson/agents/blob/c4b82b0ad771190355eb8e204b1329732a18449a/docs/plugin-eval.md)

为何流行：覆盖面广却允许按插件窄装，兼顾“一站式目录”和上下文节制；多运行端适配扩大了可用人群。[E4] 风险是规模越大，计数漂移、重复能力、版本映射和质量一致性越难人工维持。

### 4. `vercel-labs/skills`／skills.sh：让 Skill 变成可搜索、可安装的生态对象

截至核验时约 **28.7k Stars**；head 为 `c6f69c6`。它自身不是大型 Skill 内容库（树中只有 1 个 `SKILL.md`），而是面向开放 Agent Skills 生态的 CLI 和发现层。[E1：仓库](https://github.com/vercel-labs/skills/tree/c6f69c631292444cc541ac6d91e2226b0ff247da)

其产品形状接近包管理器：从 GitHub／GitLab／任意 Git／本地路径发现 Skill，可搜索、列出、安装、更新、移除，也可临时 `use` 而不安装；按项目或全局作用域分发到 Claude Code、Codex、Cursor 等大量 Agent 的原生目录，并用 canonical copy＋symlink 减少同机重复副本。[E1/E2：CLI 说明](https://github.com/vercel-labs/skills/blob/c6f69c631292444cc541ac6d91e2226b0ff247da/README.md)

为何流行：它解决的不是“怎么写一个 Skill”，而是“用户怎么找到、试用、更新和卸载”；熟悉的 `npx skills add/find/update/remove` 心智模型显著降低采用摩擦。[E4] 搜索实现按安装量排序，[E1：`find.ts`](https://github.com/vercel-labs/skills/blob/c6f69c631292444cc541ac6d91e2226b0ff247da/src/find.ts) 但安装量仍只是热度信号；分发便利还会放大供应链风险，不能替代来源、许可、权限和行为审查。

### 5. `ComposioHQ/awesome-claude-skills`：大目录、分类导航与行动型 Skill

截至核验时约 **72.3k Stars**；head 为 `be2a406`。README 自述“1000+ production ready”，同一 head 文件树中可数到 **864 个 `SKILL.md`**；二者可能采用不同统计口径，本文不把宣传数字当精确事实。[E1：仓库](https://github.com/ComposioHQ/awesome-claude-skills/tree/be2a406907dbc61b73e6827ded415c96139d13a2)、[E2：README 自述](https://github.com/ComposioHQ/awesome-claude-skills/blob/be2a406907dbc61b73e6827ded415c96139d13a2/README.md)

它同时容纳仓内 Skill、外链 Skill 和自有集成，按文档、开发、数据、营销、写作、创意、协作、安全等主题导航；大量 SaaS automation Skill 把工作流与 MCP 工具序列、参数和陷阱结合起来。贡献规则要求真实用例、示例、测试、安全确认、可移植性和来源归属。[E1/E2：贡献规则](https://github.com/ComposioHQ/awesome-claude-skills/blob/be2a406907dbc61b73e6827ded415c96139d13a2/CONTRIBUTING.md)

为何流行：超大可浏览目录覆盖“我想让 Agent 做什么”的长尾需求，分类与一行摘要让非专家也能快速发现，MCP 集成又把“会说”推进到“能行动”。[E4] 不过它混合第一方内容、第三方链接、营销入口与不同许可证；目录收录不能替代逐项核验，且首页中的平台用法或模型示例可能比各平台官方文档更快失效。

## “好 Skill”的共性设计模式

### 1. 触发条件是检索接口，不是宣传文案

官方要求 `description` 同时说清“做什么”和“何时用”，用第三人称、具体对象、文件类型、任务语境和用户常用词；Claude 会从可能上百个 Skill 中依赖这段元数据选择。[E2：官方写作指南](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) Superpowers 的实测经验又提示：若把完整流程塞进描述，Agent 可能只照摘要行动而不读取正文。[E2]

二者可以兼容：**描述写能力边界＋正向触发＋关键排除条件，但不展开执行步骤**。例如“在用户要验收当前 PR head 或处理审查反馈时使用；不用于普通本地代码浏览”比“帮助处理 PR”更可发现，也不让元数据冒充正文。

### 2. 主体是可执行闭环，不是知识堆叠

复杂任务普遍使用清晰步骤、检查清单和“运行验证器 → 修正 → 重验”的反馈环。官方还要求按任务脆弱程度分配自由度：开放判断给原则，存在优选路径时给参数化模板，迁移或危险操作则给精确脚本和护栏。[E2：自由度与反馈环](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)

好步骤至少交代输入、动作、验证、失败分支、停止条件和输出。只有顺序而没有失败门，会得到“做过”；有可重复验证面才有“做成”。

### 3. 边界／禁止触发和正向触发同等重要

社区样本普遍擅长扩大召回，却不总擅长控制误触发。对有副作用、会打断用户或改变授权的 Skill，应明确“不适用”与普通路径；禁止项最好绑定可观察条件，而不是堆叠抽象的 MUST／NEVER。安全上还应声明依赖、权限、外部写入和破坏性动作的确认门。官方明确警告 Skill 可以诱导工具调用和代码执行，只应使用可信来源。[E2：官方安全边界](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)

### 4. 组合靠窄职责和显式路由，不靠巨型总 Skill

Anthropic 按安装组打包，Superpowers 用多个流程 Skill 串联，wshobson 用细粒度 Plugin 隔离上下文。共性是：一个 Skill 有稳定职责，主 Skill 只保留选择与主流程，子能力通过明确条件引用；编排器负责路由，不复制每个子 Skill 的正文。组合深度过大则会增加漏读和冲突，应给唯一前序、后序或退出路径。

### 5. Progressive disclosure 是信息架构，不只是拆文件

平台采用三级加载：常驻 metadata、触发后 `SKILL.md`、按需 resources／scripts。官方建议正文少于 500 行，引用文件从 `SKILL.md` 直接一层可达，长 reference 带目录；脚本执行时只把输出带回上下文。[E2：三级加载](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)、[E2：引用结构](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)

因此，拆分的判据不是“文件太长”，而是“当前任务是否需要读这部分”。一个总 reference 再递归指向深层文件，形式上拆了，发现和完整读取仍可能失败。

### 6. 描述预算和正文预算解决不同问题

当前官方 frontmatter 约束是 `description` 最多 1,024 **字符**，正文建议少于 500 行；我方跨运行端采用 1,000 **UTF-8 字节**上限，是更紧的工程预算，不能与官方字符上限混为一谈。[E2：官方约束](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)、[E1：我方守恒律](../../authority/00-map.md)、[E1：符合性检查](https://github.com/Eridanus117/agent-plugins/blob/e9e2d034004597d97ed312a97c66e8822f764ff8/docs/conformance.md)

描述预算保护每次会话常驻上下文，正文预算保护触发后的工作上下文，references 则承载真正按需的深度。三者都需要，但不能用“放到 reference”掩盖触发描述失真，也不能为了短而删掉会改变行为的边界。

### 7. 可发现性有三层

1. **Agent 内发现**：稳定名称、具体触发词、同义词、错误症状、文件类型；
2. **人类目录发现**：按问题域分类、一行价值说明、示例与手动入口；
3. **生态发现**：Marketplace、搜索、安装／更新／移除、来源和版本。

大目录证明“找到它”本身是产品能力；但热度排序只能帮助浏览，不能承担质量门。最好同时保留自动触发和显式入口，让用户在自动选择不稳定时有可预测回退。

### 8. 测试应覆盖“该触发”和“不该触发”

官方推荐先记录无 Skill 的失败，建立至少三个真实评估，再写足以修复这些失败的最小指导，并在计划使用的模型上复测；`skill-creator` 进一步做有／无 Skill 对照。Superpowers 把压力场景用于纪律型 Skill，wshobson 则尝试把结构、语义和多次采样分层。[E2：官方评估路径](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)

静态格式检查只能证明“像一个 Skill”，不能证明召回准确、步骤被执行、结果更好。好评估至少分开：触发精确率、任务结果、成本／耗时、误触发副作用，以及不同模型／运行端的差异。

## 对照 `agent-plugins`

我方对照对象为 `agent-plugins` 的 `e9e2d03`（2026-08-12）；本次直接读取其 Skill、Marketplace、符合性说明和 CF-6 卡片，未把安装缓存当作来源。[E1：版本化来源](https://github.com/Eridanus117/agent-plugins/tree/e9e2d034004597d97ed312a97c66e8822f764ff8)

### 可借鉴的五点与最小第一步

| 可借鉴点 | 对我们的具体价值 | 最小第一步 |
| --- | --- | --- |
| 给触发器做正负对照评估 | 我方描述边界很完整，但静态路由测试不能证明自然语言下的误触发／漏触发 | 先选一个窄 Skill 和一个宽 Skill，各写 3 条应触发、3 条不应触发的真实提示，在 Codex、Claude 新 Session 各跑一轮，记录实际加载与错误类型；不先建通用评测平台 |
| 把自由度与风险匹配 | 我方治理 Skill 的精确门很多；若开放判断也被写成固定序列，会增加判断税 | 在一个高频 Skill 中标出一段“原则判断”、一段“参数化模板”、一段“不可变硬门”，用现有样本检查 Agent 是否在正确层级自由发挥 |
| 把 reference 做成直接可选的导航面 | 我方已按需读取，但部分 Skill 仍通过索引再进入卡片；深层跳转可能带来漏读 | 先审一个引用最多的 Skill，在 `SKILL.md` 放“任务类型 → 直接读取哪一份 reference”的窄表；只修真实漏读，不为结构整齐批量搬迁 |
| 把目录新鲜度机械化 | 外部大仓的自报数量与树计数漂移，说明人工首页很快失真 | 在现有 TypeScript 符合性检查中先增加一项：Marketplace 插件名、版本和 README 当前清单一致；不引入新脚本或服务 |
| 提供“临时试用而不安装”的低成本入口 | 永久安装会扩大常驻发现面；Vercel 的 `use` 模式让用户先取得行为证据 | 先为一个候选 Skill 写一次性、新 Session 的手工试用协议，跑完即退出；只有产生正向样本后再讨论产品化入口 |

这五项中优先级最高的是第一项：它直接检验 description 是否“找得准”，也是后续改描述、压预算或拆 reference 时最便宜的回归面。

### 我们已经做得更好的地方

- **授权和任务合同更强**：公共 Skill 多关注“怎么做”；我方把当前权威、有效派发、共享写入所有权、远端回读和不扩张授权纳入行为合同，能防止一个好流程越权执行。[E1：我方权威根](../../_archive/authority/00-map.md)
- **常驻规则有守恒律**：官方给平台上限和建议，我方进一步规定 1,000 UTF-8 字节描述门、新规则必须说明置换对象，并用测试防止依赖截断生存；这比“尽量简洁”更可执行。[E1]
- **证据不越级**：我方明确区分格式、安装、生命周期、行为、投入产出，以及“实现完成 → 当前交付验收 → 样本有效 → 产品采用 → 长期依赖”；外部项目常把“生产级”“认证”或收录标签混在一个传播面上。[E1：符合性模型](https://github.com/Eridanus117/agent-plugins/blob/e9e2d034004597d97ed312a97c66e8822f764ff8/docs/conformance.md)
- **三方审阅不是多开三个 Reviewer**：wshobson 的多 Reviewer 模式擅长分维度、去重和校准严重度；我方 CF-6 还要求替代授权、独立运行身份、起草／实施者回避、先密封后公开、稳定键绑定和机械回读，并在未知／否决时回到负责人。当前能力证据仍诚实保持 M0，尚无自然成功样本。[E1：CF-6 卡片](https://github.com/Eridanus117/agent-plugins/blob/e9e2d034004597d97ed312a97c66e8822f764ff8/plugins/orchestrated-collaboration/skills/orchestrated-collaboration/references/collaboration-shapes/cf-6.md)
- **共同正文与运行端证据分离**：我方一个 Skill 正文服务两端，但 Claude／Codex 清单和安装证据分开；这既避免双份语义漂移，也不假装两端格式相似就行为等价。wshobson 的跨端投影提供了旁证，但我方分层符合性和回滚边界更明确。[E1：资产模型](https://github.com/Eridanus117/agent-plugins/blob/e9e2d034004597d97ed312a97c66e8822f764ff8/docs/asset-model.md)

### 不宜照搬的点

- **不照搬全局强制调用**：Superpowers 的 1% 规则、所有创作都先完整 brainstorming 等硬门有利于强化单一方法品牌，却会让低风险、易回退任务付出固定流程税，也可能与用户明确授权或上层入口冲突。
- **不照搬“越多越好”的巨型目录目标**：Skill 数量、Stars 和安装量适合发现，不适合验收。规模扩张会同时放大重名、过期、许可证、供应链、描述常驻成本和维护注意力。
- **不照搬未经核验的“production ready／certified”标签**：静态评分、LLM Judge 或收录规则都可作为候选证据；没有真实任务、对照、运行端和版本信息时，不能升级为产品采用。
- **不照搬绑定单一运行端的正文**：工具名、Hooks、slash command 和模型别名若写进共同语义，会让另一端只能做脆弱翻译；运行端特性应留在包装或适配层。
- **不照搬只追求召回的“pushy description”**：过度扩召回会增加误触发和用户打断。描述优化必须同时看 should-trigger 与 should-not-trigger，并保留明确手动入口。

## 建议的最小后续动作

只做一个可逆实验：从 `agent-plugins` 选一个窄边界 Skill（例如 `grilling`）和一个宽边界 Skill（例如 `adaptive-problem-solving`），冻结当前描述，建立 12 条正负触发提示，在 Codex 与 Claude 各运行一次；记录是否加载、是否越过同意／授权门、结果是否优于普通路径及新增 Token／墙钟的可见近似。成功判据应在运行前写死；实验只回答“当前描述和边界是否找得准”，不以此宣称整个 Skills 体系已有效。

## 仍未知、失效条件与下次最少复核

- **仍未知**：本文没有运行外部 Skill、安装其 Marketplace 或复现其评估框架；“为什么流行”均为 E4 推断。没有证据比较这些项目在相同任务、模型和权限下的净收益。
- **计数失效条件**：任一仓库默认分支、README 口径或文件树变化；下次只需重新读取仓库元数据、head 和递归树，不必重做全文研究。
- **设计结论失效条件**：Agent Skills 规范改变 metadata 加载、描述上限、引用读取或跨端发现机制；下次先复核官方 overview 与 best practices，再只检查五个样本的变化、冲突和缺口。
- **我方对照失效条件**：`agent-plugins` 的守恒律、符合性测试、三方审阅或 reference 结构发生实质变化；下次只复核当前版本的对应文件和真实样本证据。
- **不能推出**：这些观察不授权修改 `agent-plugins`、安装第三方 Skill、建设新 Marketplace／评测平台，也不证明任何外部仓库可直接用于高风险任务。
