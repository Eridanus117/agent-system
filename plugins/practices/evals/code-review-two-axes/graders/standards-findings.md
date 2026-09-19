---
type: llm
weight: 2
---

Judge the Standards axis content.

PASS if the report cites the documented rules from CONTRIBUTING.md for the English comment (collect files), the bare new Error(...), and the missing JSDoc on the exported exportNotes, marks those as violations of documented standards, and separately names at least one code smell (for example Duplicated Code for the two near-identical directory walks) explicitly as a judgement call, not a hard violation.

FAIL if any of the three documented-standard breaches is missing, or a smell is presented as a hard violation, or no smell is named at all.
