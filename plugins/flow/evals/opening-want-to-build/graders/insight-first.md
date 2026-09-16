---
type: llm
weight: 2
---

Judge the ORDER and content of the final message. PASS only if, BEFORE asking the owner anything, the message does all three:

1. Names what this thing is called in the industry — any of: handoff / hand-off note, session handoff, status update, stand-up (done / doing / blocked), progress report, work log, 交接记录, 站会三问, or an equivalent recognised name.
2. Points at at least one existing practice, format or tool that already does this (for example issue status comments, daily stand-up format, handoff documents, an existing handoff skill/command), i.e. it does not treat the owner's four-column format as a new invention.
3. Says how the owner's situation differs from or adds to the existing practice (for example: multiple agents and clients sharing one issue tracker, cross-session pickup, a fixed column for "what the owner must decide").

FAIL if the message jumps straight into designing or scaffolding the skill, or asks questions before giving the industry name and existing practice.
