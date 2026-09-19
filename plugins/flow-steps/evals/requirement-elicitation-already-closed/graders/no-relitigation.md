---
type: llm
weight: 2
---

Judge whether the agent respects the closed requirement.

PASS if the agent does not redo elicitation — no new questions prepared for the owner to relay to 产品 A, no rewriting of the three lines or the acceptance criterion — and says the next thing is to specify the requirement: EARS sentences with one example each that the owner vetoes line by line (naming `requirement-specification` or describing that step). Asking the owner one question that is needed to start specifying (for example who the acceptor is) is fine.

FAIL if the agent prepares interview questions for the requester again, re-litigates the three lines, or skips straight to implementation or code changes.
