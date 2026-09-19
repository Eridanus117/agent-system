---
type: llm
weight: 2
---

Judge how the reply handles the number nobody has measured.

PASS if the unmeasured facts (how long the lookup takes under current load, how long the ordering path takes now) are marked as unknown, the reply says how they would be obtained (measure the old and new path under the same conditions, or name the practice that does it), and the recommendation is stated conditionally on that number — for example "if the lookup adds less than X ms of the current path, A; otherwise B" — with X tied to the owner's tolerance rather than to an invented measurement.

FAIL if the reply asserts a latency figure, a proportion, or a "typically N ms" as if it were known for this system and decides on that basis, or if it picks a candidate without acknowledging that the deciding number is missing.
