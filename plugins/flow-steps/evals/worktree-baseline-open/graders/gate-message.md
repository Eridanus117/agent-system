---
type: llm
weight: 1
---

Judge only the gate message at the end. PASS if it says this is 第 4 段 (segment 4) and names the gate criteria, lists the worktree name and branch, the baseline command with its result or pending status, states that no optional steps are opened, and closes with exactly one thing for the owner — type `/implement` (or say 行 to enter segment 5).

FAIL if the worktree or the baseline is missing from the message, if it asks the owner for more than one thing, or if there is no gate message at all.
