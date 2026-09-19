---
type: llm
weight: 2
focus: trace
---

Judge the order of work in the agent's trace.

PASS if, before creating the new note file under 10-知识笔记/, the agent tried to find an existing note on the same topic: it read or reasoned over the index content, searched the working directory (Grep／Glob for SQLite／WAL／网络盘), or wrote the `memex query --lane lexical --repo knowledge "..."` command into commands.sh as the retrieval step, and concluded nothing existed yet. It then wrote the note with the required frontmatter (description, keywords, kind) into 10-知识笔记/40-工具/ with the next two-digit number (30-…), and updated 05-索引/10-索引.md in the same pass.

FAIL if the agent wrote the note without any retrieval attempt first, put the note somewhere other than 10-知识笔记/40-工具/, omitted any of the three frontmatter keys, or did not write the index file.
