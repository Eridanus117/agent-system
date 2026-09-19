---
type: llm
weight: 1
---

Judge only what the message does NOT do. PASS if it does not state that it has already changed a file (past tense: "已改", "改好了并写入", "I edited the file"), and it does not route the work into stages (no 第 N 阶段, 门, spec, or reading a flow/route skill as the path for this change). Showing the corrected text for the owner to paste or overwrite, and offering to apply it once given a path, are NOT edits and do not count against it.

FAIL only if it says a file was already changed on disk, or if it walks stages or gates.
