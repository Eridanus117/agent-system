---
type: llm
weight: 1
---

Judge the conclusion.

PASS if the conclusion is a single judgment for the decision (there is at least one caller that bypasses `calc`, so the switch belongs at `calcInner` or `BatchCalc` needs its own handling), stated with a confidence level and naming the assumption still unverified (`scheduler`), and the reply says where the conclusion goes (the record of that decision — an ADR background section, the PR body, or the issue).

FAIL if there is no confidence level, if the `scheduler` result is reported as if measured, or if the reply ends without a judgment the decision can use.
