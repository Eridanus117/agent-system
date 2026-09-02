# Skill 行为评测跑法

适用于所有带 `evals/evals.json` 的 Skill。`tools/skill_eval/skill-eval.ts` 是**判分器**（`validateDocument` / `validateRunDocument` / `summarizeMode`），**它不执行 agent**——真跑得自己调 agent 走一遍，再把结果喂回打分。

## 跑法

```bash
# baseline（不装 skill）
omp -p --no-session --no-skills --model gpt-5.6-luna "<prompt>"

# with_skill（只装被测 skill）
omp -p --no-session --skills=<skill> --model gpt-5.6-luna "<prompt>"
```

`kind: "trigger"` 的 case 只需跑 `with_skill`（验证它**不该**触发）；
`kind: "behavior"` 的 case 两种模式都要跑，**差值**才是这个 skill 的价值。

## 三条硬约束

### 1. 不得加 `--no-tools`

omp 的 skill 走**渐进披露**：description 进系统提示，正文靠一个工具按需加载。`--no-tools` 把那个加载工具一起关掉，**skill 会静默不生效**，而 agent 仍会正常作答——整轮评测看起来跑完了，实际测的全是 baseline，并会得出「这个 skill 没用」的错误结论。

跑之前先自检：

```bash
omp -p --no-session --skills=<skill> --model <model> "只回答：你当前可用的 skill 有哪些？只列名字。"
```

答不出被测 skill 名，就是没装上，别往下跑。

### 2. 探针 prompt 必须自足，且**不得诱导 agent 去工作区找对象**

这一条比「不要用无主指代」更宽。已知会出事的形态：

- **无主指代**：「**这个**任务」「**这个** bug」「**刚才**定下的方案」「方案 **B**」
- **泛指对象**：「帮我把**方案文档**整理一下」「看看**那个配置**」——即使句子完整，agent 仍会去仓库里找一个叫「方案文档」的东西
- **动词落点为空**：任何「整理 / 修一下 / 更新一下」而没有把对象**贴在 prompt 里**的

**正确写法**：把对象**原文贴进 prompt**，或使用明显虚构的场景（`fizzbuzz-report`、`sum` 函数）。

### 3. 跑前跑后各查一次工作区，这是机械检查不是自觉

规则 2 已经被同一个人在写下它之后又违反过两次。所以不能只靠 prompt 纪律：

```bash
# 跑之前
for r in agent-system delivery-spec-runtime knowledge desk; do (cd C:/Workspace/$r && git status --short); done
for w in C:/Workspace/worktrees/*/*; do (cd "$w" && git status --short); done

# 跑之后重跑一遍，逐行比对；出现新增或修改立即回滚
```

`behavior` 类的 baseline **本来就会写文件**——那正是被测量的行为差异，所以隔离不能靠「让 agent 别写」，只能靠环境或跑后回滚。

## 四次真实事故

| 日期 | 诱因 | 后果 |
|---|---|---|
| 2026-09-01 | 探针「**这个任务**跑到一半卡住了」 | agent 进入他人 worktree，把任务从 `implemented_unverified` 自行标为 `verified`；另一条探针往 `desk/提案/` 与 `knowledge/inbox/` 各写一个文件 |
| 2026-09-02 | 探针「帮我把**方案文档**整理一下格式」 | agent 找到 `worktrees/.../establish-runtime-metrics-baseline/05-改造方案/改造方案.md` 并改写其格式 |
| 2026-09-02 | 探针「你刚才建议对**这个方案**…把 `getTimestamp` 写出来」 | agent 去 `delivery-spec-runtime` 找现有 `now()` 实现（只读未写） |
| 2026-09-02 | 探针「我想给我的笔记做个自动打标签的工具」 | agent 判为「值得解」后按全局立项规则往 `desk/提案/` 写了一份提案 |

四次均已回滚或删除。第一次的缺口（`task-state` 的 `verified` 标记无身份校验）已在 `delivery-spec-runtime` 登记为 `INT-20260901-030`。

> ### 规则挡不住，必须靠环境
>
> 上表四次事故里，**后三次发生在规则 2 写下之后**，其中两次由写下该规则的同一人造成。结论：探针纪律是必要条件、不是充分条件。
>
> 尤其注意最后一次的性质不同——它**不是失控，是合规**：agent 判为「值得解」后按全局 `AGENTS.md` 的立项流程落盘，规则本身正确，错的是评测在没有隔离的环境里跑。**任何遵守全局规则的 agent，在真实工作区里跑评测都会写文件。**
>
> **暂行分工**（在有真隔离环境之前）：
> - `trigger` 类可加 `--no-rules` 跑——路由判断不依赖全局规则，且能切断通往真实工作区的指针
> - `behavior` 类**暂缓**——它测的差异往往正是「按全局规则该不该落盘」，去掉 rules 就测不出；这类必须等隔离环境

## 已知局限

- **单轮 `-p` 模式测不准需要多轮的断言**。例：`clarify` 的 `asks-history-not-opinion` —— 单轮没法追问，skill 的合理降级是「指出缺哪几样证据后停住」而不是真的发问。多轮场景才能测这一条。
- **需要真实外部环境的 skill 跑不起来**。例：多 session 协作、GitHub Issue/PR 流程、依赖外部账户接口的。**跑不起来的评测等于没有评测**——2026-09-02 的退库裁定即以此为据。
- **判分靠人读**。`skill_eval` 校验结构与汇总差值，断言是否满足仍是人工判断。

## 运行记录存哪

按 `delivery-spec-runtime` 2026-09-01 的裁定「可重跑的验证不留日志，不可重跑的必须记录」，加一条边界：

- **通过的运行** → 只存摘要：日期、模型、skill 内容哈希、逐 case pass/fail、一句结论
- **失败且原因不明的运行** → 存全文。它真的不可重跑——重跑可能就过了，那个失败样本就没了
- **边界**：「可重跑所以不留证」这条推理依赖于「谁标的可重跑」本身可信。标记本身也是一次需要身份与依据的判定
