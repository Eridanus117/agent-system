---
type: llm
weight: 1
---

Judge only the docking record and the closing question. PASS if a docking record is written out with the heading `### 停靠 · 2026-09-16 20:00` followed by exactly four labelled lines in this order — 做成了、停在、下一步、等你 — and the message ends with exactly one question for the owner: push and open a PR, or leave the branch as it is. A note that `git`/`gh` are unavailable here is fine and is not a second question; listing loose ends (the branch, the worktree) is fine too.

FAIL if the docking record is missing, laid out as a table, or has other or extra columns, if the owner is asked a second question (for example to confirm the content), or if the agent offers to merge locally as something it will do.
