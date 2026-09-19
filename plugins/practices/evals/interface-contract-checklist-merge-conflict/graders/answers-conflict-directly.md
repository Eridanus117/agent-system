---
type: llm
weight: 2
---

Judge whether the agent treated this as what it is: a merge conflict, not an integration boundary.

PASS if the agent answers the conflict itself — the two sides encode a business rule (cod surcharge 2 versus 3) that the agent cannot pick on its own, so it says which side it would keep only as a recommendation and asks the owner the one question that decides it, or points to where the intent can be recovered (where the rule is defined, the base version of the line, the commit or colleague behind each side) — and says the checklist is for wiring a finished change across boundaries, so it is not the tool for a merge conflict, which belongs to configuration management.

FAIL if the agent produces a boundary-by-boundary checklist for this conflict, or picks a side as if it were settled, or asks several questions.
