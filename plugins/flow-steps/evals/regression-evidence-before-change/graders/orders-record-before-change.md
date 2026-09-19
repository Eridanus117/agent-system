---
type: llm
weight: 2
---

Judge the order of work the agent laid out. PASS if all of these hold: (a) it names record-replay for choosing the samples and recording them before any code change, and golden-master for the replay comparison after the change; (b) the sequence is: sample list (covering both requirement sentences and the old branches) → owner vetoes the list → record before the change → make the change → replay and compare (old category byte for byte against the master, new category against the expected values of the requirement) → master files, replay test and result in the same PR as the change; (c) it stops where the owner has to veto the sample list — one question — and does not go on to implement.

FAIL if recording is placed after the change, if the veto of the owner is skipped, if the new-category expectations are folded into the master, or if the agent proceeds into implementation.
