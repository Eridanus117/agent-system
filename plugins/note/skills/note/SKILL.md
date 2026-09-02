---
name: note
description: 把当前对话的探索结论沉淀进本地 Markdown 知识库。当用户说「沉淀到知识库」「记到 KB」「/note」时使用。
---

# 沉淀到知识库

知识库是纯 Markdown + git 的内容仓，**没有工具链依赖**。当前实例：

- **个人知识库**：`C:\Workspace\knowledge`
- （工作知识库建立后在此登记）

只沉淀耐用的东西：结论、关键证据或推理、未解决的疑问。过程性试错、任务状态、TODO 不进知识库。

**写入前先判定归属**（细则见目标库 `rules/核心规则.md` 的「知识的归属」）：项目局部知识写项目自己的仓，不进知识库；项目死了仍有价值的才进；拿不准留项目仓，第二次用到再晋升；工作/雇主语境 → 工作库，通用 → 个人库。

**写入规范以目标库的 `AGENTS.md` → `rules/核心规则.md` 为准**：先检索后合并、description/keywords frontmatter、中文文件名、同步维护 index.md、pre-commit 校验报错就修不许绕过。

## 旧世界（只读，不写入）

`C:\Users\Morni\workspace\knowledge\`（llm-kb 等领域仓）和 `C:\Users\Morni\personal\knowledge\orrery-kb\` 是已退役的旧知识库，连同 rhizome / memex / kb 工具链一起废弃。不要往里写、不要调用那些命令；可以只读参考——仍然有效的结论摘出来写成新笔记（注明来源路径），旧文件保持原样。

## 收尾

`git add` + `git commit`（hook 会跑校验）。向主人报告：写到了哪个库哪个位置、新建还是更新，以及这次探索中**未沉淀的开放疑问**（列出来，它们是下次探索的入口）。
