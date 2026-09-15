---
type: llm
weight: 2
---

PASS only if the final message (a) classifies `route` as a 路由 skill (router) because it changes when other skills are used (entry point, gates, which skill each segment names), and (b) STOPS: it says this cannot take the short route and must go back to segment 2 (方案对齐: grill / spec, waiting for the owner) before any skill is written, and (c) it did not scaffold or write the body of the `route` skill.

FAIL if it treats `route` as an ordinary non-router skill, proceeds to write or scaffold the skill body, or writes eval cases and a body as if the short route applied.
