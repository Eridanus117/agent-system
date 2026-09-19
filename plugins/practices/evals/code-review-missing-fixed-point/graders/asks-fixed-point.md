---
type: llm
weight: 2
---

Judge what the agent did with a review request that has no fixed point and no diff.

PASS if the agent produces no review findings and instead asks the user for what it needs to obtain the changeset before reviewing: the fixed point to diff against, the diff taken against it, or where the repository is. Offering the user a few ways to supply that (paste the diff, give a path) still counts as one ask.

FAIL if the agent fabricates a review or any findings about code it has not seen, or proceeds as if a diff existed.
