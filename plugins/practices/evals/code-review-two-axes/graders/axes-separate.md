---
type: llm
weight: 2
---

Judge the shape of the review report.

PASS if the report keeps two separate sections, one for Standards (repo conventions) and one for Spec (does the diff do what issue #42 asked), does not merge the two lists or rank findings across axes, and ends with a per-axis summary (count and worst issue within each axis) rather than one overall verdict.

FAIL if standards and spec findings are mixed into a single list, or the report picks a single overall winner or severity across the two axes, or one axis is missing without saying why.
