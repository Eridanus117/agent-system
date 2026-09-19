---
type: llm
weight: 2
---

Judge the sketch itself, read against the pasted code.

PASS if the sketch is centred on `FreightCalc.calc` and gives one hop each way from it: callers `OrderService.quote` and `QuoteService.preview`; callees `calcInner` and `RemoteFeeLookup.lookup`; and it points out that `BatchCalc.run` calls `calcInner` directly and therefore bypasses `calc`. Going one hop further on a single edge is acceptable; drawing the whole system is not.

FAIL if it misses the `BatchCalc` bypass, invents callers or callees that are not in the pasted code, or expands into a whole-program call graph instead of two hops from the change point.
