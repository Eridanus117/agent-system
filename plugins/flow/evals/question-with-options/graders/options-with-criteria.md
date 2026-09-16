---
type: llm
weight: 2
---

Judge only the option space offered. PASS if the message presents at least two distinct, named options for the decision it puts to the owner (for example: switch the judge to sonnet, switch to opus, keep haiku but fix the rubric or add majority voting, measure judge–human agreement first), one of them is a "keep the current setup / do nothing / fix the rubric instead of the model" alternative, and each option says when it is the right pick (a criterion such as cost, false-FAIL rate, latency, how vague the graders are) rather than just a label.

FAIL if it offers a single option, lists options without criteria, or has no do-nothing / keep-current alternative.
