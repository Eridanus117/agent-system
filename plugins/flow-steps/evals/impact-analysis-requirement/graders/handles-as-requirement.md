---
type: llm
weight: 1
---

Judge whether the agent treated this as a requirement rather than as an impact analysis.

PASS if the reply handles it as an unsettled requirement — says what kind of request this is and which practice or stage applies (requirement clarification / 需求分析, the first stages of a normal change), gives an insight or asks one question about what the requirement means — and does not start an impact analysis: no call-graph sketch, no Arthas commands, no "which decision does this number feed".

FAIL if the reply produces a caller sketch, asks for runtime evidence, or otherwise treats the requirement as a number to be measured.
