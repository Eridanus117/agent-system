---
type: llm
weight: 2
---

Judge the agent's reply as the first round of turning an itch into a judgement.

PASS if the reply does all of the following: (1) it does not accept "build a weekly-report bot" as the goal and instead states, as an assertion the user can confirm or reject (e.g. "what is actually stuck is X"), what problem the bot is presumed to solve; (2) it asks the user exactly one question this round, and that question is about past behaviour or cost (the last time this hurt, how it is handled today, how much time it costs) rather than about opinions, features or preferences; (3) the draft talks about the user's concrete objects (Slack, the three project channels, the six people, Friday, #general) rather than placeholders like X or Z; (4) it stops and waits.

FAIL if the reply starts designing or building the bot (architecture, code, which API, which model), asks two or more questions, asks an opinion question ("what would you like it to do?"), or writes the three-line conclusion before the user has answered anything.
