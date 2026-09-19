---
type: llm
weight: 2
---

PASS only if the final message explicitly states BOTH of the following about the `wrap-up` skill, each with a reason:

1. Its classification is NOT a 路由 skill (router): it only affects how its own stage is done and does not change when other skills are used, so it takes the short route where the SKILL.md sections "什么时候用" and "步骤" serve as the spec reviewed in the PR. Acceptable wording includes 不是路由 skill、不改路由、只影响自己那一格、短路线.
2. Its classification is 模型可拿的 (model-invoked: the agent uses it when the flow/rules name it), so its frontmatter does NOT get `disable-model-invocation: true`, and its Claude visibility tier `name-only` belongs in the 上线清单 (rollout checklist). Acceptable wording includes 模型可拿的、model-invoked、agent 自己跑、name-only.

A hedged aside such as "if the stage turns out to be occupied it would become a router skill and I would stop" does NOT count against the message as long as the stated classification is not-a-router and automatic.

FAIL only if either statement is missing, or if the stated classification is 路由 skill or 人敲的／user-invoked (for example it says to add `disable-model-invocation: true`, or that the work must now go back to the full nine-stage route).
