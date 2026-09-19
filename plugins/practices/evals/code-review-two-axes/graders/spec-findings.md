---
type: llm
weight: 2
---

Judge the Spec axis content.

PASS if the report identifies, quoting or citing the spec lines, that (a) the .trash/ directory is not skipped (requirement 2 missing), (b) the zip size is not printed (requirement 3 only partially done: count printed, size not), and (c) the gzip-level option is behaviour the spec did not ask for (scope creep).

FAIL if any of the missing or partial requirements or the scope creep is not reported.
