---
type: llm
weight: 2
---

PASS only if the final message states that `split-tickets` is 人敲的 (user-invoked: only the owner types `/split-tickets`; the agent must not start it), that its SKILL.md frontmatter therefore includes `disable-model-invocation: true`, and that it is NOT a 路由 skill (router), so it takes the short route (it does not change when other skills are used). The message should NOT propose `name-only` as the mechanism for keeping the model away from it (name-only still lets the model invoke it).

FAIL if it omits the user-invoked (人敲的) classification, omits `disable-model-invocation: true`, or sends the work back to a full nine-stage route.
