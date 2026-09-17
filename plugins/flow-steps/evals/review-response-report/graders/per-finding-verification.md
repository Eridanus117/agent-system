---
type: llm
weight: 2
---

Judge only the per-finding treatment. PASS if each of the three findings gets all of: a restatement of what is being asked; a check against the provided code or test list (for example: the `endsWith("\r")` handling really is there; `tmp2` really is unexplained; the three listed tests contain no 200 MB memory test); a recommendation — fix, don't fix, or partial — with a reason; and a label 硬问题 or 判断题.

FAIL if any finding is missing the check against the code, the recommendation, or the reason.
