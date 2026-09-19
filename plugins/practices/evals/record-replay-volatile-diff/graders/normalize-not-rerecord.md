---
type: llm
weight: 2
---

Judge how the agent handled the volatile fields. PASS if the agent identifies traceId and calcTime as fields that change on every run, proposes a normalization rule (strip or pin those fields when recording and before comparing, applied to both approved and actual), keeps the six samples and the byte comparison on everything else, and rejects both re-recording the master from the changed code and deleting the tests, saying why (a master recorded after the change compares the code with itself).

FAIL if the agent re-records approved files from the changed code, deletes the tests, or loosens the comparison to checking only fee.
