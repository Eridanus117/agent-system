---
type: llm
weight: 2
---

Judge whether the agent knew when the activity does not apply. PASS if the agent says this activity proves an existing path unchanged, so with no old path there is nothing to record as a master; it skips the activity with one line (and says the line goes into the PR body or the standup update), and points the correctness of the new command at the requirement examples and the tests written under tdd during implementation. It does not build a sample list or a recording plan.

FAIL if the agent proposes recording a master for the brand-new command, or sets up a golden-master workflow anyway.
