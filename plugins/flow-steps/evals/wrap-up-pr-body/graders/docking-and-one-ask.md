---
type: llm
weight: 1
---

Judge only the docking record and the closing ask. PASS if a docking record is written out with the heading `### 停靠 · 2026-09-16 20:00` and exactly the four labelled lines 做成了、停在、下一步、等你, and the message closes with exactly one thing for the owner — push and open a PR, or leave the branch as it is. Listing loose ends (the branch, the worktree) is fine.

FAIL if the docking record is missing or has other columns, if the owner is asked more than one thing, or if the agent offers to merge locally as something it will do.
