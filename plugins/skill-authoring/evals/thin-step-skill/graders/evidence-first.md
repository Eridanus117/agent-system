---
type: llm
weight: 2
---

Judge the ORDER of work in the plan given in the final message. PASS if ALL three are true:

1. The plan includes writing 2-3 evaluation cases (scenarios / test prompts with graders, e.g. `claude plugin eval` cases) for `wrap-up`.
2. The plan includes running a baseline evaluation while the `wrap-up` SKILL.md body is still empty or a placeholder (wording such as 基线、baseline、占位、不带 skill 跑一遍 counts).
3. Both of the above come BEFORE writing the SKILL.md body in the stated order.

FAIL if the plan writes the SKILL.md body first, or never mentions evaluation cases, or never mentions a baseline run.
