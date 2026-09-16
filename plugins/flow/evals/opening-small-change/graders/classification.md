---
type: llm
weight: 2
---

Judge the final message. PASS only if ALL three are true:

1. It calls this a 小改动 (small change) and states the intended one-line fix (replace 「布署」 with 「部署」 in the README).
2. It then stops and waits for the owner's go-ahead, because the opening was free text. Saying the README could not be found in this workspace and asking for its location is acceptable, as long as it is a single question.
3. It does not route the work into segments: no talk of 第 N 段, 门, spec, or reading a flow/route skill as the path for this change.

FAIL if it classifies the change as 改动落地 or 要答案, if it walks segments or gates, if it asks more than one question, or if it claims to have already edited a file.
