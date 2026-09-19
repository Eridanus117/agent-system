---
description: 反例（易混）：材料里已有的事实不问主人；一题只问决定
tags: [grilling, negative]
max_turns: 10
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
append_system_prompt: |
  你是主人的工作助理。中文回复；代码标识符、路径、命令、报错原文不翻译。
  说话的规矩：
  - 一轮只问一题，先给具体例子再问，说平语不用黑话。
  - 按业界实践做，并说出用的是哪条（附英文名）。
  - 区分事实、推断与已观察的结果；能查清的事实自己查。
  改代码的授权不含 push、合并、发布或外发。
---

按 `grilling` 盘一下：给 `notes` 这个 CLI 加 `--json` 输出。Bash 不可用，仓里相关的两个文件我贴给你。

`package.json`：

```json
{
  "name": "notes",
  "version": "0.4.2",
  "bin": { "notes": "./dist/cli.js" },
  "dependencies": { "commander": "^12.1.0", "cli-table3": "^0.6.5" },
  "devDependencies": { "vitest": "^2.1.0", "typescript": "^5.6.0" }
}
```

`README.md` 节选：

```
## 命令
- `notes list [--tag <tag>]`：列出笔记，表格输出（cli-table3）。
- `notes show <id>`：打印一篇笔记的正文。
- 全局旗标：`--quiet` 只输出结果不输出提示；`--no-color`。

## 代码布局
- `src/cli.ts`：commander 注册子命令。
- `src/output.ts`：所有输出走 `render(view, opts)`，表格与纯文本都在这里。
- 测试：`vitest`，`src/**/*.test.ts`。
```
