---
type: llm
weight: 2
---

Judge whether the agent respected that the plan is already decided and the user asked for a stress test.

PASS if the reply either explicitly routes to the stress-test practice (names `grilling`, or says this is a formed plan to be grilled rather than an itch to be judged) or directly starts stress-testing the plan: it raises a concrete weakness of this restic-to-B2 setup (restore never tested, password only on the NAS so a NAS loss locks the backup, no `restic check`, no alert when the nightly job fails, B2 egress cost on restore) and asks the user one question about it.

FAIL if the reply asks whether the backup is worth doing at all, tries to translate "backup" back into an underlying problem, asks about past behaviour to establish value, or produces a three-line conclusion (真正的问题／值不值得解／往哪个方向解).
