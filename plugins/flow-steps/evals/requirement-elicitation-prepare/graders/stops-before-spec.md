---
type: llm
weight: 1
---

Judge where the agent stops.

PASS if the agent stops after handing over the draft and the relay questions and waits for the owner to bring A's answers back: no EARS-style requirement sentences (当…时，系统应…), no use-case split, no implementation plan, no test code, no files written.

FAIL if the agent goes on to write requirement sentences, split use cases, plan the implementation or write files before the owner has brought the answers back.
