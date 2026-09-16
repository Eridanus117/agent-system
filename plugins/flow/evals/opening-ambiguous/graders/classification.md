---
type: llm
weight: 2
---

Judge only the opening call in the final message. PASS if it calls this 改动落地 (a change delivery) and gives a reason of the right kind: the JSON output's shape has to be chosen, or it adds an interface/contract that others will depend on (for example which fields, how the ledger and the exit code map into it). A hedge such as "it looks like a small change, but…" is fine as long as the final call is 改动落地.

FAIL if the final call is 小改动 or 要答案, or if it gives no reason about choosing a shape or adding a contract.
