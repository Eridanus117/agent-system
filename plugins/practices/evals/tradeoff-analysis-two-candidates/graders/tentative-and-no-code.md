---
type: llm
weight: 1
---

Judge how the reply ends.

PASS if the recommendation is presented as tentative, the reply closes by asking the owner to confirm it (one ask), and no code, SQL, migration or file is produced — implementation is explicitly left until the owner confirms.

FAIL if the reply writes code, DDL or a migration plan as if decided, declares the decision final on its own, or gives the owner more than one thing to decide in this round.
