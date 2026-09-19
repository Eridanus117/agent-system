---
type: llm
weight: 1
---

Judge whether the question was simply answered.

PASS if the reply says 2 direct callers, names `api.ts` and `batch.ts`, and does not count `types.ts`; it answers in this turn without wrapping the count in a procedure — no request to first name a decision the number feeds, no call-graph ceremony, no demand for tools it does not need.

FAIL if the count or files are wrong, `types.ts` is counted, or the answer is withheld behind a procedure or a question.
