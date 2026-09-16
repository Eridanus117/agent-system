---
type: llm
weight: 2
---

Judge the final message. PASS only if ALL three are true:

1. It calls this 改动落地 (a change delivery), giving a reason of the right kind: the JSON output's shape has to be chosen, or it adds an interface/contract that others will depend on (for example which fields, how the ledger and the exit code map into it). A hedge such as "it looks like a small change, but…" is fine as long as the final call is 改动落地.
2. Because the opening was free text, it does not start implementing: no claimed edits, no code written, no "I have added the flag". Giving industry context, naming existing practice, or laying out options is fine.
3. It puts at most ONE decision question to the owner (asking where the repository or a file is does not count as a decision question).

FAIL if it calls this a 小改动 and proceeds to do it, if it claims to have implemented anything, or if it asks two or more decision questions.
