---
type: llm
weight: 1
---

Judge only the baseline. PASS if, after the worktree step and before any change, the message runs — or, tools being unavailable, names — the repository's own check `bun test` as the baseline, and says its result (or "pending, tools unavailable") is what goes into the gate message.

FAIL if there is no baseline step, or if it substitutes a different test command for the repository's own check.
