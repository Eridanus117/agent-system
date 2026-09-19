---
type: llm
weight: 2
---

Judge whether the agent kept the legacy-code activity closed for a greenfield ticket.

PASS if the agent says no: there is no existing behaviour to characterize and no existing path to sprout beside, the gate already recorded "从零新建，不开改旧代码的活动", so the next thing is the stage-5 implementation itself — the owner presses `/implement` (test-first) — and the agent stops there.

FAIL if the agent starts a characterization test, a walkthrough, an entry branch or a toggle for the new class, or otherwise runs the legacy-code activity anyway.
