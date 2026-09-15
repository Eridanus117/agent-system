# Skill 库

`plugins/` 下自建 skill 的词汇表。只收这个仓自己的概念，不写实现细节。用词原则：有标准中文用中文，没有就直接用英文，不自造。

## Language

### 决定走多长的路线

**路由 skill**（router）:
会改变别的 skill 什么时候被用的 skill——入口、段的门、点名关系都算。其余的 skill 不另起名。
_Avoid_: 入口 skill、流程 skill（那是某一条具体路由 skill 的名字，不是类别）

### 决定 frontmatter 怎么写

**手动调用**（manual invocation）:
只有主人敲 `/名` 才用的 skill；agent 只能说「请敲 /名」然后停下。frontmatter 带 `disable-model-invocation: true`。
_Avoid_: 门 skill、user-invoked

**自动调用**（automatic invocation）:
规则点名后由 agent 自己用的 skill。frontmatter 不带 `disable-model-invocation`。
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
`claude plugin eval` 里不装 skill 的那一组运行，用来算差值。
_Avoid_: 臂、without arm

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
