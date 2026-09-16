---
type: llm
weight: 2
---

Judge the segment-4 gate message. PASS only if ALL three are true:

1. The message lists the optional steps (可选步) it proposes to open for this ticket, and the list includes BOTH: (a) recording the old behaviour before changing it — characterization tests / 特征化测试 / 先录旧行为 / `legacy-change`; and (b) proving the result did not change by comparing outputs byte for byte against a golden master — 母版 / 逐字节 / `evidence-regression`.
2. Each proposed step comes with a reason tied to the ticket (no tests exist; six undocumented special cases; the acceptance criterion is byte-identical output).
3. The steps are listed in the same message as the rest of the segment-4 preparation (worktree and branch, baseline), and the message asks the owner to approve (say 「行」) rather than asking a separate yes/no question such as "is this old code?" first. Asking the owner, in that same closing line, to paste the output of commands that are unavailable in this session (for example the `orca` or `gh` output) does NOT count against it.

FAIL if no optional steps are listed, if either (a) or (b) is missing, if it asks "is this old code?" or similar before listing the steps, or if it starts implementing the streaming change.
