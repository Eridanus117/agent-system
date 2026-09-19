---
type: llm
weight: 1
---

Judge only where the message stops. PASS if it stops at the gate of stage 2 and tells the owner to type `/grill-with-docs` (the stage-2 alignment skill only the owner may invoke) as the next thing. Listing the topics the alignment will have to settle (for example "target repo", "where snapshots go") is fine — that is previewing the stage, not doing it.

FAIL if it does not name `/grill-with-docs` (or the stage-2 alignment step the owner must trigger), or if it does the design work now — it decides between restic and borg itself, or asks the owner to answer design questions in this message instead of leaving them for the alignment.
