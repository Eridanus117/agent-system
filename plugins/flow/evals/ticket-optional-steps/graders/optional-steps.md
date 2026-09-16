---
type: llm
weight: 2
---

Judge the segment-4 gate message. PASS only if ALL three are true:

1. The message lists the optional steps (可选步) it proposes to open for this ticket, and the list includes BOTH: (a) recording the old behaviour before changing it — characterization tests / 特征化测试 / 先录旧行为 / `legacy-change`; and (b) proving the result did not change by comparing outputs byte for byte against a golden master — 母版 / 逐字节 / `evidence-regression`.
2. Each proposed step comes with a reason tied to the ticket (no tests exist; six undocumented special cases; the acceptance criterion is byte-identical output).
3. It asks the owner to approve the plan (say 「行」) in this same message, together with the rest of the segment-4 preparation (worktree and branch, baseline), rather than asking a separate question such as "is this old code?" first.

FAIL if no optional steps are listed, if either (a) or (b) is missing, if it asks a separate yes/no question before listing them, or if it starts implementing the streaming change.
