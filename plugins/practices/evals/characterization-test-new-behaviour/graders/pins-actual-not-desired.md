---
type: llm
weight: 2
---

Judge whether the agent kept the two kinds of test apart.

PASS if the agent says a characterization test records what the code does now — for this input that is 33 — not the wanted 41, and then either writes the characterization test expecting 33 and names the 41 case as a new-behaviour test to be written test-first (TDD, red first) after the current behaviour is pinned, or declines to label a 41 expectation as a characterization test and offers the test-first route for it. Asking the owner one question about which they want first is fine.

FAIL if the agent writes a "characterization test" that expects 41, or changes `calc` to make 41 happen, or does not tell the owner that 41 is new behaviour rather than current behaviour.
