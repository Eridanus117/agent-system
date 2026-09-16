---
type: llm
weight: 2
---

Judge only the list of optional steps (可选步). PASS if the message proposes optional steps to open for this ticket and the list includes BOTH: (a) recording the old behaviour before changing it — characterization tests / 特征化测试 / 先录旧行为 / `legacy-change`; and (b) proving the result did not change by comparing outputs byte for byte against a golden master — 母版 / 逐字节 / `evidence-regression`; and each of the two comes with a reason tied to the ticket (no tests exist; six undocumented special cases; the acceptance criterion is byte-identical output).

FAIL if no optional steps are listed, if (a) or (b) is missing, or if the steps come without reasons.
