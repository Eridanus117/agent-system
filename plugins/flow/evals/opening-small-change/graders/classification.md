---
type: llm
weight: 2
---

Judge the final message. PASS only if ALL three are true:

1. It calls this a 小改动 (small change) and states the intended fix (replace 「布署」 with 「部署」 in the README). Showing the corrected text inline is fine — that is not a file edit.
2. It does not claim to have edited or written any file, and it does not route the work into segments: no 第 N 段, 门, spec, or reading a flow/route skill as the path for this change.
3. It puts at most one thing to the owner. Asking for the file's path, or offering to apply the change once the path is known, counts as that one thing and is acceptable.

FAIL if it classifies the change as 改动落地 or 要答案, if it walks segments or gates, if it claims a file was already changed, or if it asks the owner for two or more separate things.
