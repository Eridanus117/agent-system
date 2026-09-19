---
type: llm
weight: 1
---

Judge how the reply ends.

PASS if it closes with a single thing for the owner: confirm (or reject) the tentative recommendation and the remaining unknowns; no code, DDL, migration or file is produced, and implementation is explicitly left until the owner confirms.

FAIL if the reply writes code or schema changes, declares the decision final, or hands the owner two or more unrelated things to decide.
