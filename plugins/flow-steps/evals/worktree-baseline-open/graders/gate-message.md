---
type: llm
weight: 1
---

Judge only the gate message at the end. PASS if it says this is 第 4 段 (segment 4) and names the gate criteria, lists the worktree name and branch (planned names are fine when tools are unavailable), the baseline command with its result or its pending status, states that no optional steps are opened, and closes with one path forward for the owner: either type `/implement` (baseline done), or — because the tools are unavailable here — run the listed commands and report the results back. Saying that `/implement` comes after those results is part of that same path, not a second ask.

FAIL if the worktree or the baseline is missing from the message, if the owner is given two unrelated things to do, or if there is no gate message at all.
