---
type: llm
weight: 2
---

Judge the order as a whole.

PASS if the steps run dependencies first — roughly: table expansion, then registering the toggle in the off position, then merging the code, then the smoke run — and every step carries its own undo (for example: leave the new table unused; delete the toggle registration; with the toggle off the merged code is the old path). Handing rollout tiers and rollback points to the release stage is fine.

FAIL if any step has no undo, if one step bundles two things that could not be undone separately (such as merging code and enabling the toggle together), or if the toggle is registered on.
