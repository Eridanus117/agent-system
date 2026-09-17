---
type: llm
weight: 2
---

Judge only the shape of the two verified claims (tests, typecheck). PASS if each is rewritten as evidence: the exact command, its exit code, and the key output line(s) — for the tests "12 pass / 0 fail" (or the equivalent counts), for the typecheck "exit code 0, no errors". Quoting a few key lines is right; pasting the whole raw log or giving only a prose summary ("tests pass") without command and exit code is not.

FAIL if either verified claim lacks the command or the exit code, or if the section is a prose summary without the key output lines.
