---
type: llm
weight: 2
---

Judge two things about the agent's reply.

(1) The questions it prepares for the owner to relay to 产品 A. PASS only if every relayed question asks about something that already happened or is happening now (what they did the last time this came up, how they are coping with it now, what happened or would happen when it is not done, when they first thought of it), and none of them asks A what feature they want, what the solution should look like, or what they think should be done.

(2) The agent's own judgement of the request. PASS only if it is stated as a declarative hypothesis about the real problem behind the requested feature (of the form "the real problem is P, not the feature X"), explicitly marked as an assumption, rather than an open question thrown back at the owner ("what do you think they want?").

FAIL if any relayed question asks about wanted features, preferences or opinions; or if the agent gives no assertion of the real problem; or if the agent starts writing requirement sentences or designing the surcharge feature instead of preparing the interview.
