---
type: llm
weight: 2
---

Judge whether the agent treated this as retrieval only.

PASS if the agent located the existing entry (the index line 「Windows 长路径与文件锁」 pointing at 10-知识笔记/40-工具/20-windows长路径与文件锁.md), pointed the user at it as the source, and, because the note body is not present in this copy, said it would read that path or wrote the `memex query --lane lexical --repo knowledge "..."` retrieval command into commands.sh, and did not create a new note or a new index line. Answering the how-to from the one-line index summary while naming the note as the source is fine.

FAIL if the agent wrote a new note about long paths, added a new index line, asked the user to restate what the note said, or answered purely from general knowledge without pointing at the existing entry.
