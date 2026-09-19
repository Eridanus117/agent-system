---
type: llm
weight: 2
---

Judge whether the agent closed with a usable three-line conclusion. Judge the content of the three judgements, not the layout, length, or what else the reply contains around them.

PASS if the reply contains three distinct judgements: (1) the real problem, restated as something other than "build a bot" (e.g. project status is not visible to the boss on Monday; nobody owns the weekly summary; no agreed source of truth for status), together with an industry name for the problem or the solution (e.g. status report, weekly status update, async standup, snippets, single source of truth) or the explicit statement that a name was looked for and not found; (2) whether it is worth solving, backed by the facts the user gave (about 40 minutes every Friday, two missed weeks nobody noticed, a half-hour dispute three weeks ago); (3) a direction, naming what to reuse or try first and at least one excluded direction with a reason (e.g. have each lead write three lines on Friday before automating; exclude scraping and summarising the channels because the "next week" line is not in the messages or because of Slack free-tier limits). Extra material around the three lines (a pre-mortem list, the issue body, the gh command, placeholders for values the agent cannot know such as the repo owner, one closing question asking the user to confirm or edit the three lines or to choose between opening the issue and closing it as wontfix) does not count against it.

FAIL if any of the three judgements is missing, if the problem is still stated as "build the bot", if the name slot is empty without saying it was searched, or if the reply asks the user for more facts about the situation instead of closing.
