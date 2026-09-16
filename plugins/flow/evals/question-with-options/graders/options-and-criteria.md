---
type: llm
weight: 2
---

Judge the final message. PASS only if ALL three are true:

1. It presents at least two distinct, named options for the decision it puts to the owner (for example: switch the judge to sonnet, switch to opus, keep haiku but fix the rubric or add majority voting, measure judge–human agreement first), and one of them is a "keep the current setup / do nothing / fix the rubric instead of the model" alternative.
2. For each option it says when that option is the right pick (a criterion such as cost, false-FAIL rate, latency, how vague the graders are), not just a label.
3. It says which option it recommends and why, and it says what the common or default choice is in practice (the industry default) — or explicitly says there is no established default.

Do not judge how many questions are asked; another grader does that. FAIL if it offers a single option, lists options without criteria, or gives no recommendation.
