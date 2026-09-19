---
type: llm
weight: 2
---

Judge the sketch and the evidence plan, read against the pasted code.

PASS if the two-hop sketch from `FreightCalc.calc` finds, as a fact from the code, that `BatchCalc.run` calls `calcInner` directly and so bypasses `calc`; marks the `scheduler` module (code not provided) as the uncertain edge; and proposes evidence only for that uncertain edge, as concrete commands the owner runs on the work machine (Arthas `stack`/`trace`/`sm` on `calcInner` during a scheduler run, or an equivalent), not a whole-program call graph and not a load test. Nothing is claimed to have been run.

FAIL if the `BatchCalc` bypass is missed, if evidence is proposed for every edge indiscriminately, if the `scheduler` answer is invented as a fact, or if the reply claims to have executed anything.
