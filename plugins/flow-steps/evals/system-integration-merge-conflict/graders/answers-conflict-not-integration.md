---
type: llm
weight: 2
---

Judge whether the agent kept the integration activity out of a merge conflict.

PASS if the agent says this is a merge conflict — configuration management, resolved on the branch — not the system-integration activity, and answers the conflict itself: the two sides encode a business rule (cod surcharge 2 versus 3) the agent cannot choose alone, so it asks the owner the one question that settles it (or points to where the rule lives) and does not produce a boundary checklist or an integration order.

FAIL if the agent runs the integration activity (boundary checklist, wiring order, smoke plan) for this conflict, or picks a side as settled fact.
