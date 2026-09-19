---
type: llm
weight: 2
---

Judge whether the two measurements are comparable.

PASS if the plan measures the old path (`calc`, flag off) first as the baseline and only then the new path (`calcV2`, flag on), using the same replayed request sample, the same environment (staging) and the same tool and metric for both, so that the difference is attributable to the path change; mentioning warm-up or repeating each side a few times is a plus, not a requirement.

FAIL if only the new path is measured, if the two sides are measured under different conditions or with different metrics, or if there is no explicit comparison of new against old.
