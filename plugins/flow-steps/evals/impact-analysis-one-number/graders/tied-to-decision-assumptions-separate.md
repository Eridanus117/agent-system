---
type: llm
weight: 1
---

Judge the opening of the analysis.

PASS if the reply first states which decision the number feeds (where the routing switch goes: `calc` entry or `calcInner`) and lists its assumptions separately from what it read in the code (for example: "all freight calculation goes through `calc`" is written as an assumption, not as a fact).

FAIL if the number is not tied to the decision, or if assumptions are mixed into the facts without being marked.
