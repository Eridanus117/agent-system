---
description: 正例：主人要把一条耐用结论沉淀进知识库；agent 先检索再写、正文与索引同一次改、没跑到的环如实写「未做」
tags: [note, positive]
max_turns: 15
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

按 `note` 把下面这条结论沉淀到知识库。

结论是我们刚在排查里得出的：SQLite 数据库放在 Windows 映射的网络盘（SMB）上时不能开 WAL 日志模式，WAL 依赖共享内存映射，SMB 不保证，会出现 `database disk image is malformed`；本机盘用 WAL 没问题。结论：库文件在网络盘上就用 `PRAGMA journal_mode=DELETE`，在本机盘才开 WAL；已经坏掉的库用 `.recover` 导出重建。证据：sqlite.org 的 WAL 文档「不能在网络文件系统上使用」一节，加上我们 9 月 17 日在 `\\nas\share` 上复现了两次。

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
