---
type: llm
weight: 2
---

Judge the agent's reply as one round of an interview about the plan.

PASS if the reply puts exactly one question to the user to answer this round, that question carries the agent's own recommended answer (a concrete "I would pick X because ...", not just a list of options), and the agent then stops and waits for the user. Laying out the map of pending decisions (a tree or numbered list of what will be asked later, without asking them now) is fine and does not count as extra questions. No design write-up, no code, no file writes.

FAIL if the reply asks the user to answer two or more questions in this round, or the one question comes without the agent's recommendation, or the agent starts designing or implementing the sync instead of asking.
