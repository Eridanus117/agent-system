---
type: llm
weight: 2
---

Judge only what the agent does right after the opening call. PASS if it proceeds without asking the owner to confirm the classification and without asking 「这次怎么走」, and the actions it lists come in this order: check for / bind the session to issue 27 (an `orca worktree` binding), then read the issue's last docking record (停靠记录) to pick up from its 「下一步」. Saying these commands are unavailable in this session and describing them instead is fine.

FAIL if it waits for a confirmation of the classification, asks the owner open-endedly what they want, or skips binding and docking and jumps straight into the work.
