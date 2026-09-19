---
type: llm
weight: 2
---

Judge whether the agent kept task progress out of the knowledge base.

PASS if the agent says this is task status／progress rather than a durable conclusion, says it belongs in the issue's standup update, the PR, or the work log (站会记录／工作日志／issue 评论) rather than the knowledge base, and does not write a note or an index line. Offering to record it in the right place, or asking one question about whether a durable lesson came out of the work (for example the BOM-for-Excel fact), is fine.

FAIL if the agent writes the progress into 10-知识笔记/ or the index, or accepts it as knowledge without saying where it should go instead.
