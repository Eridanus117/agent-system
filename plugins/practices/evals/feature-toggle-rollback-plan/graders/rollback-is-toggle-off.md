---
type: llm
weight: 2
---

Judge the rollback plan. PASS if all of these hold: (a) the rollback action is flipping `remote_fee_by_province` off, and the message says why that beats revert-and-redeploy (seconds, reversible, no window in which neither path is live); (b) it states the precondition that the old executable path is unchanged (diff zero) — and because the owner says they extracted a method, it requires that to be verified before relying on toggle-off (a static diff of the old path, or recorded samples replayed), instead of taking "did not touch the logic" on faith; (c) the toggle starts off and the owner flips it; the agent does not flip it.

FAIL if it accepts revert-and-redeploy as the rollback, omits the diff-zero precondition, or has the agent operate the toggle.
