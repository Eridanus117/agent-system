# clarify 的行为评测：怎么跑

`evals.json` 是评测定义，`skill_eval` 是判分器（`validateDocument` / `validateRunDocument` / `summarizeMode`），**它不执行 agent**。真跑得自己调 agent 走一遍，再把结果喂回打分。

## 跑法

```bash
# baseline（不装 skill）
omp -p --no-session --no-skills --model gpt-5.6-luna "<prompt>"

# with_skill（只装 clarify）
omp -p --no-session --skills=clarify --model gpt-5.6-luna "<prompt>"
```

`kind: "trigger"` 的 case 只需跑 `with_skill`（验证它**不该**触发）；
`kind: "behavior"` 的 case 两种模式都要跑，差值才是这个 skill 的价值。

## 三条硬约束（2026-09-01 事故后加，缺一不可）

### 1. 不得加 `--no-tools`

omp 的 skill 是**渐进披露**：description 进系统提示，正文靠一个工具按需加载。`--no-tools` 把那个加载工具一起关掉，**skill 会静默不生效**，而 agent 仍会正常作答——整轮评测看起来跑完了，实际测的全是 baseline，并会得出「这个 skill 没用」的错误结论。

自检：跑一句「你当前可用的 skill 有哪些」，答不出 `clarify` 就是没装上。

### 2. 必须跑在隔离或只读环境，且审批模式不得为 `yolo`

`behavior` 类 case 的 baseline **本来就会写文件**——那正是被测量的行为差异（baseline 落 `desk/提案/` 与 `knowledge/inbox/`，with_skill 落 0 个）。所以隔离不能靠「让 agent 别写」，只能靠环境。

2026-09-01 的实际事故：评测在可写的真实工作区跑，一条探针让 agent 找到了另一个会话的 worktree，**把一个任务从 `implemented_unverified` 改成了 `verified`**，另一条往 `desk/提案/` 和 `knowledge/inbox/` 各写了一个文件。均已回滚删除。

### 3. 探针 prompt 必须自足，不得含无主指代

「**这个**任务」「**这个** bug」「**刚才**定下的方案」——在无上下文的单轮 `-p` 里，agent 会去真实工作区**找**这些指代的对象，然后对找到的东西动手。这是上述事故的直接诱因。

现在的 trigger 类 prompt 一律自带虚构场景（`fizzbuzz-report`、`sum` 函数），不指向任何真实仓库。

## 已知的评测局限

- **`asks-history-not-opinion` 这条断言在单轮 `-p` 模式下判不准**：单轮没法多轮追问，实测中 skill 的合理降级是「指出缺哪三样历史证据后停住」，而不是真的发问。多轮场景才能测这一条。
- **判分目前靠人读**：`skill_eval` 校验结构与汇总差值，断言是否满足仍是人工判断。

## 运行记录存哪

按 `delivery-spec-runtime` 2026-09-01 的裁定「可重跑的验证不留日志，不可重跑的必须记录」，再加一条边界：

- **通过的运行** → 只存摘要：日期、模型、skill 内容哈希、逐 case pass/fail、一句结论
- **失败且原因不明的运行** → 存全文。它真的不可重跑——重跑可能就过了，那个失败样本就没了
- **注意**：「可重跑所以不留证」这条推理，依赖于「谁标的可重跑」本身可信。标记本身也是一次判定，需要身份与依据
