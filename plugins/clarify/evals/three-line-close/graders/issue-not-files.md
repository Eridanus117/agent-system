---
type: llm
weight: 1
---

Judge where the agent proposed to put the conclusion.

PASS if the reply says the three lines go into an issue in the desk repository (either an opportunity issue to build on, or an issue closed immediately as wontfix／not planned if the judgement is not to build), and gives the user what they need to create it: the issue title and body, and／or the `gh issue create` command (gh is unavailable in this session, so writing the command out counts; a body file passed to `--body-file` is part of that command and is fine). Placeholders for values the agent cannot know (repo owner, parent issue URL) are fine.

FAIL if it creates or proposes any other local artefact (a proposal document, a notes file, a design doc, code), starts building the bot, or leaves the conclusion only in chat without saying it goes into a desk issue.
