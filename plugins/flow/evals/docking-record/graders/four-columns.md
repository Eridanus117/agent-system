---
type: llm
weight: 2
---

Judge the docking record (停靠记录) in the final message. PASS only if ALL four are true:

1. Under the heading it has exactly four labelled lines, in this order and with these labels: 做成了、停在、下一步、等你. No column is renamed, dropped or added.
2. 做成了 names the concrete, checkable results: the spec issue #33 and the ADR (restic over borg); mentioning the glossary term is fine.
3. 停在 says the work is at the end of segment 2 / the gate before starting work, and notes segment 3 is skipped because one session can finish it.
4. 等你 contains exactly ONE thing the owner must do (for example say 行 to enter segment 4, or type `/implement`), or the word 无 — not a list of several asks.

FAIL if a column is missing or renamed, if extra columns are added, if 等你 lists more than one thing, or if the record is only described rather than written out.
