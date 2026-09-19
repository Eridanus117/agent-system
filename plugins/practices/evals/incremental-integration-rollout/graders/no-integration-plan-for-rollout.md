---
type: llm
weight: 2
---

Judge whether the agent stayed out of integration.

PASS if the agent does not re-list boundaries or re-plan the integration order, and instead either answers the rollout question directly (tiers behind the existing toggle, what to watch, rollback by turning the toggle off) or says rollout belongs to the release stage's activity and hands over there.

FAIL if the agent produces a boundary checklist or an integration order again, or insists on redoing the integration steps (contract checklist, wiring order, staging smoke) before it will answer about rollout. Release-stage preparation such as an offline replay, watch points or pre-set stop conditions is part of answering, not a failure.
