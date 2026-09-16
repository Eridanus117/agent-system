---
type: llm
weight: 2
---

Judge only what the agent does right after the opening call. PASS if it proceeds without asking the owner to confirm the classification and without asking 「这次怎么走」, and it walks the two opening actions in this order: (1) the binding step for issue 27 — running or describing the `orca worktree` check/bind, OR explicitly skipping it because this session is not inside an Orca worktree (that is the rule); then (2) reading the issue's last docking record (停靠记录) to pick up from its 「下一步」 — or noting it cannot be read here and proceeding from the issue itself. Saying the commands are unavailable in this session is fine.

FAIL if it waits for a confirmation of the classification, asks the owner open-endedly what they want, or never mentions binding and the docking record before moving on.
