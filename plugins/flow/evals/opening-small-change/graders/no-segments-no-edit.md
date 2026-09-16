---
type: llm
weight: 1
---

Judge only what the message does NOT do. PASS if it neither claims to have edited or written any file, nor routes the work into segments (no 第 N 段, 门, spec, or reading a flow/route skill as the path for this change), and it asks the owner for at most one thing (the file's path, or a go-ahead to apply the change).

FAIL if it claims a file was already changed, walks segments or gates, or asks the owner for two or more separate things.
