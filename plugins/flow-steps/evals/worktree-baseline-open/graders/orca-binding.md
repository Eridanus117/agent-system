---
type: llm
weight: 2
---

Judge only how the worktree is opened. PASS if the message (1) first checks whether issue 31 already has a live worktree (an `orca worktree show --worktree issue:31` style lookup), and (2) then opens the worktree with Orca bound to the issue (an `orca worktree create … --issue 31` style command, branch from main). Describing the commands instead of running them is fine here.

FAIL if it opens the worktree with plain `git worktree add` into a `.worktrees/` or similar directory, skips the existing-worktree check, does not bind the issue, or first asks the owner whether they want a worktree at all.
