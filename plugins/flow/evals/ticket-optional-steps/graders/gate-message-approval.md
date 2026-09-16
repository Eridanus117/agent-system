---
type: llm
weight: 1
---

Judge only the shape of the segment-4 gate message. PASS if the optional steps appear in the same message as the rest of the segment-4 preparation (a worktree with a branch, the baseline) and that message asks the owner to approve — say 「行」 — so the plan is settled in one round. Asking, in that same closing line, for the output of commands that are unavailable in this session (for example `orca` or `gh` output) does not count against it.

FAIL if the message asks a separate yes/no question such as "is this old code?" before listing the steps, or if it starts implementing the streaming change instead of stopping at the gate.
