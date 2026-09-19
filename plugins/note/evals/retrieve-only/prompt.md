---
description: 反例：主人只是想找回以前记过的东西；agent 指到已有条目答来源，不新建笔记
tags: [note, negative, retrieve]
max_turns: 10
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Write, Skill]
append_system_prompt: |
  你是主人的工作助理。中文回复；代码标识符、路径、命令、报错原文不翻译。
  说话的规矩：
  - 一轮只问一题，先给具体例子再问，说平语不用黑话。
  - 按业界实践做，并说出用的是哪条（附英文名）。
  - 区分事实、推断与已观察的结果；能查清的事实自己查。
  改代码的授权不含 push、合并、发布或外发。这个会话里 Bash 不可用：要执行的命令按顺序写进工作目录的 commands.sh，不执行。
---

按 `note` 走：我记得以前记过 Windows 上路径太长会报错那事，怎么绕的？帮我找回来。

当前工作目录就是知识库 `kb/` 的根（临时副本，可以直接写）。它的 `AGENTS.md` 原文：

```
# 知识库写入规则
- 正文放 `10-知识笔记/<主题目录>/NN-中文slug.md`，NN 两位序号接着该目录最大号排；主题目录现有 `10-主人与协作`、`20-工作方法`、`40-工具`。
- 每篇 frontmatter 必有 description、keywords（数组）、kind（reference／howto／decision 三选一）。
- 人工索引 `05-索引/10-索引.md` 每篇一行：`- [标题](相对路径) —— 一句话`；新建或改名必须同一次改索引。
- 逻辑 source 名 `knowledge`，检索入口 memex query --lane lexical --repo knowledge；写后 rhizome check 单篇，再 memex-sync compile --repo knowledge=<源根> --out <compiled目录>。
```

`05-索引/10-索引.md` 现在的内容（文件本身还没放进这个副本，按这段原样处理）：

```
# 索引
- [主人档案](../10-知识笔记/10-主人与协作/10-主人档案.md) —— 偏好、背景、工具环境
- [工作方法地图](../10-知识笔记/20-工作方法/10-工作方法地图.md) —— 六层各有什么
- [PowerShell 多行 Markdown 传参](../10-知识笔记/40-工具/10-powershell多行markdown传参.md) —— 用 here-string 或 --body-file
- [Windows 长路径与文件锁](../10-知识笔记/40-工具/20-windows长路径与文件锁.md) —— 260 字符限制与被占用文件的绕法
```
