---
type: llm
weight: 2
---

Judge only the list of activities opened only for legacy code (改旧代码时才开的活动). PASS if the message proposes which legacy-code activities to open for this ticket and the list includes BOTH: (a) recording the old behaviour before changing it — characterization tests / 特征化测试 / 先录旧行为 / `legacy-change`; and (b) proving the result did not change by comparing outputs byte for byte against a golden master — 母版 / 逐字节 / `evidence-regression`; and each of the two comes with a reason tied to the ticket (no tests exist; six undocumented special cases; the acceptance criterion is byte-identical output).

FAIL if no legacy-code activities are listed, if (a) or (b) is missing, or if the activities come without reasons.
