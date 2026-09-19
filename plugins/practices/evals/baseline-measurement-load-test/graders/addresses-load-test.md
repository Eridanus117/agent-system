---
type: llm
weight: 1
---

Judge whether the agent answered the question that was asked.

PASS if the reply gives a load-test plan — concurrency levels, duration, and the metrics to watch (latency percentiles, error rate, throughput, resource use) — possibly naming it as performance testing; it may ask one clarifying question but still engages with the load test as such.

FAIL if it replaces the load test with tracing a single request, refuses until a decision is named, or answers something other than a load-test plan.
