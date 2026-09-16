---
type: llm
weight: 1
---

Judge only the shape of the segment-4 gate message. PASS if the optional steps appear in the same message as the rest of the segment-4 preparation (a worktree with a branch, the baseline) and the message closes by telling the owner what is needed to proceed. Any of these closings counts: say 「行」; move the session to the target repository or tell the agent where that repository is (this session has no repository files); make `gh` / `orca` / the test command available or paste their output. The point is that the plan is settled in one round rather than through a chain of questions.

FAIL if the message asks a separate yes/no question such as "is this old code?" before listing the steps, or if it starts implementing the streaming change instead of stopping at the gate.
