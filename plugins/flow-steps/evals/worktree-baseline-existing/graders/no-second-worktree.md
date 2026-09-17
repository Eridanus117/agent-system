---
type: llm
weight: 2
---

Judge only what happens once a live worktree for issue 31 is found. PASS if the message does NOT open a second worktree, tells the owner a live worktree already exists (naming its path or branch), asks one question — whether to continue in that worktree — and then stops: it does not go on to plan or run the baseline, and does not ask for anything else (tool access, paths, permissions) before the owner answers.

FAIL if it opens or plans to open another worktree, proceeds past the question into the baseline as if the answer were yes, or asks the owner for additional things besides that one question.
