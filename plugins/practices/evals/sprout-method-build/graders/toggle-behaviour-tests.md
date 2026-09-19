---
type: llm
weight: 1
focus: {source: file, path: src/test/java/FreightCalcSproutTest.java}
---

Judge the tests the agent wrote.

PASS if the tests show, with literal expected values, three things: with `remoteFeeEnabled` off the 新疆 input still yields 33 (the old path); with it on, the same input yields 41; with it on, a non-target province (广东, surcharge 0) yields the same number it did before (30 for this input: 18 + 3 × 4 + 0). Constructing the class with the flag on and off through whatever seam the test uses is fine.

FAIL if any of the three is missing, if the closed-toggle case is not asserted, or if expected values are recomputed from the implementation rather than written as literals.
