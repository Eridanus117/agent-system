---
type: llm
weight: 1
---

Judge where the agent proposed to put the conclusion.

PASS if the reply says the three lines go into an issue in the desk repository (either an opportunity issue to build on, or an issue closed immediately as wontfix／not planned if the judgement is not to build), gives the command or the issue title and body the user would use (gh is unavailable in this session, so writing the command out counts), and does not create or propose creating any other local file (no proposal document, no notes file, no code).

FAIL if it writes or proposes a local file other than the issue body, starts building the bot, or leaves the conclusion only in chat without saying where it is recorded.
