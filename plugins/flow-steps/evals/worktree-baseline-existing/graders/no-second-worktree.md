---
type: llm
weight: 2
---

Judge only what happens with the existing worktree. PASS if the message does NOT open a second worktree for issue 31; it tells the owner a live worktree already exists (naming its path or branch) and asks one question — whether to continue in that worktree (or what to do with it).

FAIL if it opens or plans to open another worktree, proceeds silently as if none existed, or asks the owner more than one thing.
