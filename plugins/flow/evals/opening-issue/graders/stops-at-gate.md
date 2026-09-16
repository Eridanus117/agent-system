---
type: llm
weight: 1
---

Judge only where the message stops. PASS if it stops at the gate of segment 2 and tells the owner to type `/grill-with-docs` (the segment-2 alignment skill only the owner may invoke) as the next thing, rather than starting to design the backup solution itself.

FAIL if it does not name `/grill-with-docs` (or the segment-2 alignment step the owner must trigger), or if it starts the design work now — for example it decides between restic and borg, or asks the owner design questions about the backup.
