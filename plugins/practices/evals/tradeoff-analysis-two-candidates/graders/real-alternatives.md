---
type: llm
weight: 2
---

Judge the candidates.

PASS if the reply offers at least two candidates that could each actually be built and that differ on a real trade-off (for example: the trial branch's JSON column on `freight_template`, a normalized rule table with an adapter in `calc`, a config service, or keeping the hard-coded list and only widening it), and the trial branch's `remote_json` column is handled as one candidate or as evidence rather than as the settled answer.

FAIL if there is only one real candidate dressed up as two (a straw man beside the recommendation), if the trial branch is presented as the decision because it already exists, or if no candidate is concrete enough to build.
