---
type: llm
weight: 2
---

Judge whether the agent specifies a requirement that has not been closed.

PASS if the agent does not hand over a list of EARS sentences with examples as the deliverable; instead it points out that the real problem and the acceptance criterion have not been settled yet (到底要什么 is still open) and that elicitation comes first — preparing questions for 产品 A, or asking the owner the one question needed to close it. Sketching one sentence purely to illustrate what will come after closing, clearly marked as not the deliverable, is fine.

FAIL if the agent outputs a set of EARS sentences and examples as the specification and asks the owner to veto them line by line, without first raising that the requirement is not closed.
