# Skill 库

`plugins/` 下自建 skill 的词汇表。只收这个仓自己用到的概念，不写实现细节。

用词合同（ADR-0006）：每个词都是有出处的业界词——能在标准、书、知名框架或项目文档里查到；中文用通行译名，标题带英文原词与出处。查不到出处的概念不起名，用平语句子说清楚。旧名以 `_旧名_` 一行保留到收口票（agent-system#123）关闭为止，之后删掉。

词条形状（`plugins/tests/skills.test.ts` 守着）：

```
**中文**（English；出处：哪个标准、书或文档）:
定义。
_旧名_: 换下来的词
_Avoid_: 容易混进来的近义词，和为什么不用
```

## Language

### 主人开口之后

**请求**（request；出处：ITIL 4 服务请求管理）:
主人开口到拿回东西的一次往返。不设总称，按「要拿回什么」分成下面三种；停下、交接、换机器不是第四种，是三种都能被打断。
_旧名_: 来往

**查询**（query；出处：CQRS，Greg Young）:
问、查、看，不动文件。
_旧名_: 要答案

**标准变更**（standard change；出处：ITIL 4 变更使能）:
预先批准、风险低、只有一种改法、改完一眼能验的变更。直接做，贴证据，不进任何阶段。
_旧名_: 小改动
_Avoid_: 小修、快速修复

**常规变更**（normal change；出处：ITIL 4 变更使能）:
要在做法之间选，或改的是合同（规则、接口、路由、数据格式）的变更。按阶段走，每个阶段的门等主人说行，能从任一阶段进。九个阶段的定义在流程 skill `flow` 的正文；为什么分九个见 wiki《vibeCoding 改动流转》。
_旧名_: 改动落地
_Avoid_: 大改动（分的依据不是体量）、需求

### 进了阶段之后

**阶段**（stage；出处：Cooper 的 Stage-Gate）:
常规变更被切成的九个阶段之一，每个阶段有门和产物；顺序、门、产物在 `flow` 正文的九段表。
_旧名_: 段

**门**（gate；出处：Cooper 的 Stage-Gate）:
一个阶段结束时停下等主人说行的那一下。哪个阶段有门、门上判什么，写在 `flow` 的正文。

**活动**（activity；出处：ISO/IEC/IEEE 12207、PMBOK）:
一个阶段里被点名的一件事，由一条 skill 或一段手做承担。改旧代码时才开的活动不另起名，就这么说（最近的业界概念是 12207 的裁剪 tailoring）；开哪几个在第 4 阶段的门口定。
_旧名_: 步；可选步（指改旧代码时才开的那几个）

**站会记录**（standup update；出处：Scrum Guide 每日站会的三问加阻塞项）:
一件事停下时写在它 issue 下的固定四栏评论（做成了、停在、下一步、等你），最后一条就是现状。
_旧名_: 停靠记录
_Avoid_: 交接记录（那是第 9 阶段 `/handoff` 的产物，给换机器或换人用）

### 验证与审查

**证据**（evidence；出处：ISO 19011 审核证据）:
支撑一条声称的东西，三样齐才算（哪三样与怎么贴见 `verify-evidence`）；没有的声称标「未验证」。
_Avoid_: 「应该没问题」「看着能过」

**违例**（violation；出处：静态分析的 rule violation）:
审查意见里违反仓里文档化规则或 spec 明写要求的那种。
_旧名_: 硬问题

**判断题**（judgement call；出处：Google 代码审查指南）:
审查意见里不是违例的其余那些。两个标签只帮主人分拣，修不修都由主人定。

### 决定走多长的路线

**路由 skill**（router skill；出处：Matt Pocock 的 writing-for-agents）:
会改变别的 skill 什么时候被用的 skill——入口、阶段的门、点名关系都算。其余的 skill 不另起名。
_Avoid_: 入口 skill、流程 skill（那是某一条具体路由 skill 的名字，不是类别）

### 决定 frontmatter 怎么写

**人敲的**（user-invoked；出处：Claude Code Skills 文档的 `disable-model-invocation`）:
只有主人敲 `/名` 才用的 skill；agent 只能说「请敲 /名」然后停下。
_旧名_: 手动调用
_Avoid_: 门 skill

**模型可拿的**（model-invoked；出处：Claude Code Skills 文档的 `disable-model-invocation`）:
规则点名后由 agent 自己用的 skill。
_旧名_: 自动调用
_Avoid_: 步 skill

### 写完之后

**反馈**（feedback；出处：通用词）:
用一条 skill 时，它让做的和实际做的对不上或别扭的那一次现场，抄原文记成的一条 issue。
_Avoid_: 摩擦、硌手、痛点、坑（「坑」在工作区里指工具链或环境的失败案例，是另一回事）

**上线清单**（rollout checklist；出处：Google SRE 的 launch checklist）:
一条 skill 写好之后，要让它真正被点名或能敲，还需要在 skill 仓之外做的那几处改动：路由句、可见档、同步投影。
_旧名_: 上线待办
_Avoid_: 路由待办、部署待办

### 工作项容器

**在制品**（work in progress, WIP；出处：Kanban 的 WIP limit）:
正在推进的事，挂在根 issue 正文最上面；上限 3 就是 WIP limit。
_旧名_: 焦点

**主题**（theme；出处：SAFe 与通用敏捷层级）:
根 issue 下第一层、对应一个长期方向的 issue；工作项挂不到当前事项时挂到所属主题下。
_旧名_: 领域分支

### 评测

**基线**（baseline；出处：受控实验的基线）:
SKILL.md 还是占位、或不装 skill 时跑出来的结果；正文只针对它写。

**对照组**（control group；出处：受控实验）:
评测里不装 skill 的那一组运行；装了 skill 的那一组叫**有 skill 组**，两组之差就是差值。
_Avoid_: 臂、with arm、without arm

**fixture**（fixture；出处：xUnit Test Patterns，Meszaros）:
用例开跑前准备好的仓库状态与文件。
_Avoid_: 夹具

**mock**（mock；出处：xUnit Test Patterns，Meszaros）:
替代真实外部系统的假东西：假的 `gh`、假的 GitHub API、贴进去的假历史。
_Avoid_: 替身

**dry run**（dry run；出处：命令行工具的 `--dry-run` 惯例）:
授 Bash 的用例在没有沙箱时的写法：agent 只把要执行的命令按顺序写进文件，不执行。
_Avoid_: 干跑

**grader**（grader；出处：Claude Code `claude plugin eval` 文档）:
用例里判分的一条；用模型判的那种叫**裁判模型**。grader 判可观测行为，不判消息形状（见 skill-authoring 的 eval-cases）。
_Avoid_: 评分器
