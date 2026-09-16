# Skill 库

`plugins/` 下自建 skill 的词汇表。只收这个仓自己的概念，不写实现细节。用词原则：有标准中文用中文，没有就直接用英文，不自造。

## Language

### 主人开口之后

**来往**（interaction）:
主人开口到拿回东西的一次往返。只有三种，按「要拿回什么」分；停下、交接、换机器不是第四种，是三种都能被打断。

**要答案**（answer）:
问、查、看，不动文件。

**小改动**（small change）:
只有一种改法、改完一眼能验的改动。直接做，贴证据，不进任何段。
_Avoid_: 小修（旧规则里的说法）、快速修复

**改动落地**（change delivery）:
要在做法之间选，或改的是合同（规则、接口、路由、数据格式）的改动。走段，每段的门等主人说行，能从任一段进。九段的定义在流程 skill `flow` 的正文；为什么分九段见 wiki《vibeCoding 改动流转》。
_Avoid_: 大改动（分的依据不是体量）、需求

### 进了段之后

**门**（gate）:
一段结束时停下等主人说行的那一下。哪一段有门、门上判什么，写在流程 skill `flow` 的正文。

**步**（step）:
一段里被点名的一件事。由一条 skill 承担；skill 还没建时按路线文字手做。

**可选步**（optional step）:
只在改旧代码时才开的步（先录旧行为、先看影响这类）。开哪几步由 agent 在进第 4 段的门口列出，主人说行时一并定。

### 决定走多长的路线

**路由 skill**（router）:
会改变别的 skill 什么时候被用的 skill——入口、段的门、点名关系都算。其余的 skill 不另起名。
_Avoid_: 入口 skill、流程 skill（那是某一条具体路由 skill 的名字，不是类别）

### 决定 frontmatter 怎么写

**手动调用**（manual invocation）:
只有主人敲 `/名` 才用的 skill；agent 只能说「请敲 /名」然后停下。
_Avoid_: 门 skill、user-invoked

**自动调用**（automatic invocation）:
规则点名后由 agent 自己用的 skill。
_Avoid_: 步 skill、model-invoked

### 写完之后

**反馈**（feedback）:
用一条 skill 时，它让做的和实际做的对不上或别扭的那一次现场，抄原文记成的一条 issue。
_Avoid_: 摩擦、硌手、痛点、坑（「坑」在工作区里指工具链或环境的失败案例，是另一回事）

**上线待办**（rollout）:
一条 skill 写好之后，要让它真正被点名或能敲，还需要在 skill 仓之外做的那几处改动：路由句、可见档、同步投影。
_Avoid_: 路由待办、部署待办

### 评测

**基线**（baseline）:
SKILL.md 还是占位、或不装 skill 时跑出来的结果；正文只针对它写。

**对照组**（control group）:
评测里不装 skill 的那一组运行；装了 skill 的那一组叫**有 skill 组**，两组之差就是差值。
_Avoid_: 臂、with arm、without arm

**fixture**:
用例开跑前准备好的仓库状态与文件。
_Avoid_: 夹具

**mock**:
替代真实外部系统的假东西：假的 `gh`、假的 GitHub API、贴进去的假历史。
_Avoid_: 替身

**dry run**:
授 Bash 的用例在没有沙箱时的写法：agent 只把要执行的命令按顺序写进文件，不执行。
_Avoid_: 干跑

**grader**:
用例里判分的一条；用模型判的那种叫**裁判模型**。
_Avoid_: 评分器
