---
type: llm
weight: 1
---

Judge the frame of the specification the agent hands the owner.

PASS if both hold: (a) the original request 「运费模板要支持按省份设偏远附加」 is quoted verbatim with 产品 A named as proposer and 业务 B as acceptor; (b) the agent states whether to split into use cases and gives the reason in terms of actors and goals (one actor with one goal completed in one sitting = one use case; more actors or goals = split).

FAIL if the quote is missing or altered, the proposer or acceptor is missing, or the split decision comes without an actor-and-goal reason.
