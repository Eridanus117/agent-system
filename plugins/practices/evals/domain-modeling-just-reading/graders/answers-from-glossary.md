---
type: llm
weight: 2
---

Judge whether the agent treated this as a lookup, not a modeling session.

PASS if the reply states the glossary definition of 取消 (the customer withdraws the whole order before shipping; after that the order does not ship) and applies it to the test name, and the agent does not rewrite CONTEXT.md, does not present new or changed glossary entries as its deliverable, and does not create an ADR. Anything else in the reply (caveats about cases the glossary does not cover, a follow-up question about which case the test covers) does not affect the verdict.

FAIL only if the definition is missing or wrong, or the agent edits CONTEXT.md, or its main deliverable is new or changed glossary entries or an ADR.
