---
type: llm
weight: 2
---

Judge what the agent does right after the opening call. PASS only if ALL three are true:

1. It proceeds without waiting for the owner to confirm the classification (an issue opening means "say it, then act").
2. The actions it lists are the reversible opening actions in this order: check for / bind the session to issue 27 (e.g. an `orca worktree` binding), then read the issue's last docking record (停靠记录) to pick up from its 「下一步」. Saying these commands are unavailable in this session and describing them instead is fine.
3. It then stops at the gate of segment 2 and tells the owner to type `/grill-with-docs` (the segment-2 skill only the owner may invoke), rather than starting to design the backup solution or asking design questions itself.

FAIL if it waits for a confirmation of the classification, skips binding/docking and jumps into designing, asks the owner open-ended "what do you want to do", or does not name `/grill-with-docs` (or the segment-2 alignment step) as the thing the owner should trigger next.
