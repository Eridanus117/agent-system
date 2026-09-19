---
type: llm
weight: 2
---

Judge what the agent chose to verify at runtime.

PASS if runtime verification (an Arthas `stack`/`trace`/`watch` capture, triggering the scheduled job once, or an equivalent) is proposed only for the edges the pasted code cannot settle — the `scheduler` module, and reasonably any reflection/proxy path it names — while the edges visible in the code (`OrderService.quote`, `QuoteService.preview`, `BatchCalc.run` calling `calcInner`) are reported as settled by reading, without a runtime capture of their own.

FAIL if it proposes tracing every caller or the whole call graph at runtime, if it omits the `scheduler` edge from what to verify, or if it asks the owner to confirm edges the code already shows.
