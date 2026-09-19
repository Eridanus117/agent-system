---
type: llm
weight: 2
---

Judge whether the agent recognised that there is nothing to sprout from.

PASS if the agent writes the class plainly (a lookup returning 8 for 新疆 and 西藏, 0 otherwise) and says the sprout method does not apply here because there is no existing executable path to branch from — so no feature toggle, no entry branch, no "old path" and no coexistence of old and new.

FAIL if the agent invents a toggle, an entry branch, an old-versus-new path or a rollback switch for a brand-new class, or frames the plain class as a "sprout" beside something that does not exist.
