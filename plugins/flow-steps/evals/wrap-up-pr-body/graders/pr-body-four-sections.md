---
type: llm
weight: 2
---

Judge only the PR body. PASS if it has exactly these four sections as headings (a `##` heading or a bold label is fine), in order: 做了什么、为什么、怎么验证的、怎么回退; the 为什么 section points at spec #29 and ticket #31; and the 怎么验证的 section carries the three commands with their exit codes and key lines (12 pass / 0 fail; tsc exit 0; RSS peak 180 MB under a 256 MB cap) — not a prose summary.

FAIL if a section is missing, renamed or added, if the evidence is summarised without commands and exit codes, or if the body invents work that was not in the scene.
