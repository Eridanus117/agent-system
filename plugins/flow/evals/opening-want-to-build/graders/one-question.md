---
type: llm
weight: 1
---

Count the decision questions put to the owner in the final message — questions that ask the owner to decide or choose something. A request for information the sandbox lacks (where a file or repository is, "paste me your four columns") does not count as a decision question.

PASS if there is at most one decision question, and — if there is one — it is preceded by a concrete example (a sample of what the record or the choice would look like) and is written in plain language rather than jargon.

FAIL if the message asks two or more decision questions, or asks a decision question with no example before it.
