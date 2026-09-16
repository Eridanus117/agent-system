---
type: llm
weight: 2
---

Judge the question the agent puts to the owner in the final message. PASS only if ALL four are true:

1. The message asks exactly one decision question — one thing for the owner to decide. A side request such as "tell me where the eval code lives" or "paste me the path" does NOT count as a second question.
2. It presents at least two distinct, named options for that decision (for example: switch the judge to sonnet, switch to opus, keep haiku but fix the grader wording or use majority voting, measure judge agreement first), and one of the options is a "keep the current setup / do nothing / fix the rubric instead of the model" alternative.
3. For each option it states when that option is the right pick (a criterion such as cost, false-FAIL rate, latency, how strict or vague the graders are), not just a label.
4. It states which option it recommends and why, and it says what the common or default choice is in practice (the industry default) — or explicitly says there is no established default.

FAIL if it offers a single option, lists options without criteria, gives no recommendation, or asks two or more decision questions.
