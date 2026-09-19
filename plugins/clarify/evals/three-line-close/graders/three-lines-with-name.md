---
type: llm
weight: 2
---

Judge whether the agent closed with a usable three-line conclusion.

PASS if the reply contains three distinct judgements: (1) the real problem, restated as something other than "build a bot" (e.g. project status is not visible to the boss on Monday; nobody owns the weekly summary), together with an industry name for the problem or the solution (e.g. status report, weekly status update, standup／daily scrum summary, async status update) or the explicit statement that a name was looked for and not found; (2) whether it is worth solving, backed by the facts the user gave (about 40 minutes every Friday, two missed weeks nobody noticed, a half-hour dispute three weeks ago); (3) a direction, naming what to reuse or try first and at least one excluded direction with a reason (e.g. try a fixed three-line template each lead fills on Friday before automating; exclude scraping the free-tier Slack because of the 90-day history limit or lack of API access).

FAIL if any of the three judgements is missing, if the problem is still stated as "build the bot", if the name slot is empty without saying it was searched, or if the reply asks the user another question instead of closing.
