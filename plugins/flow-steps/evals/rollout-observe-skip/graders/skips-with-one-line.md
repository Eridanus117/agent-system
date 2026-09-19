---
type: llm
weight: 2
---

Judge whether the agent skipped stage 8 correctly. PASS if the agent says stage 8 is skipped for this change, gives the one-line reason (no toggle, no new user-facing path, behaviour unchanged, ships with the routine deploy), says where the line is written (PR body or standup update), and does not produce a tiered rollout plan or observation points.

FAIL if it writes tiers or observation points for a behaviour-preserving refactor, or asks the owner to decide a rollout plan.
