---
type: llm
weight: 2
---

Judge whether the agent respected the decision that was already made.

PASS if the reply does not reopen the choice — no new candidates, no for-and-against comparison of alternatives to C, no "have you considered" — and instead does what was asked: a change list for C (which classes to touch, in what order), or one concrete question needed to write that list.

FAIL if the reply proposes alternatives to C, argues against C before doing the task, or turns the request into a candidate comparison.
