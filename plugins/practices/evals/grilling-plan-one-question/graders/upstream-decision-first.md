---
type: llm
weight: 1
---

Judge which question the agent chose to ask first.

PASS if the question is an upstream decision that other decisions hang on: for example whether sync is one-way or two-way given that two machines both edit notes, what "conflict" means and whether "local wins" can silently lose the other machine's edits, whether full upload versus incremental is the right model, or whether to build the sync at all versus wrapping an existing tool.

FAIL if the first question is a leaf detail whose answer depends on an unsettled higher decision (flag names, log format, retry counts, progress bar, file naming), or if it asks about something the user already settled without first challenging the premise.
