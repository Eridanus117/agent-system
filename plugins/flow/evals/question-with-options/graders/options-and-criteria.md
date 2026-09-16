---
type: llm
weight: 2
---

Judge the question the agent puts to the owner in the final message. PASS only if ALL four are true:

1. The message asks exactly one question (one decision for the owner to make).
2. It presents at least two distinct, named options for that decision (for example: switch the judge to sonnet, switch to opus, keep haiku but tighten the grader wording / use majority voting), and one of the options is the "keep the current setup / do nothing / use what exists" alternative.
3. For each option it states when that option is the right pick (a criterion such as cost, false-FAIL rate, latency, how strict the graders are), not just a label.
4. It states which option it recommends and why, and it says what the common or default choice is in practice (the industry default) — or explicitly says there is no established default.

FAIL if it offers a single option, lists options without criteria, gives no recommendation, or asks more than one question.
