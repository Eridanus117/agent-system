---
type: llm
weight: 2
---

Judge how the decision is framed before any candidate is argued.

PASS if the reply states what this round decides (how the per-province surcharge configuration is carried and where it is read) and what it does not decide; keeps `master` facts apart from the unknowns (the ops back-office UI, the size and other readers of `freight_template` stay listed as unknown, not answered by guesswork); and treats the trial branch's `remote_json` column as evidence or as one candidate, not as the settled answer.

FAIL if unknowns are silently filled in as facts, if the trial branch is presented as the decision because it already exists, or if the reply never says what is being decided.
