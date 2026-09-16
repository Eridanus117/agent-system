---
type: llm
weight: 2
---

Judge the final message. PASS only if ALL three are true:

1. It accepts the owner's entry point: it treats this as 改动落地 entering at 第 4 段 (segment 4, preparation to start) and does NOT insist on going back to segment 2 or 3 first, and does NOT ask design questions about the backup approach.
2. It lays out the segment-4 preparation: a worktree with a branch for issue #27, and running the existing 12 unit tests as the baseline before any change (describing the commands is fine since they are unavailable here).
3. It says that the skipped segments (no spec, no tickets) will be noted with a one-line reason in the product — the PR body, the docking record, or the issue — so the skip is on record.

FAIL if it refuses to start without a spec, sends the owner back to alignment, asks about the design, or never mentions leaving a reason for the skipped segments.
