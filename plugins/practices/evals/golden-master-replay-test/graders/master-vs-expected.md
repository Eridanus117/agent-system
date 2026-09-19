---
type: llm
weight: 2
---

Judge the replay test the agent produced. PASS if all of these hold: (a) the two old-category samples (广东, 北京-cod) are compared byte for byte — the serialized actual output equals the text of the approved file, not a partial field check; (b) the new-category sample (新疆-vip) is compared against the literal expected value 26 that comes from the requirement example, and the agent does not generate an approved file for it from the current output; (c) the two kinds of comparison are kept apart (separate tests or clearly separate cases, and the message says which one proves "old path unchanged" and which one proves "new path correct"); (d) the sample files and the replay test live in the repository and the agent says they go into the same PR as the change.

FAIL if the new sample is "approved" from the current output, if old-category assertions are loosened to selected fields, if old and new are mixed into one undifferentiated assertion, or if the assets are placed outside the repository (a test platform, a shared drive).
