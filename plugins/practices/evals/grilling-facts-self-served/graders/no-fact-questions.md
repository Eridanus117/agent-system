---
type: llm
weight: 2
---

Judge whether the agent asked the user for facts it already had.

PASS if the agent does not ask the user anything answerable from the pasted package.json and README (which CLI framework is used, whether a quiet flag exists, where output is rendered, which test framework, which subcommands exist), and the one question it asks is a decision: for example whether the JSON flag applies to every subcommand or only to list, whether the JSON shape is a stable contract, or how the JSON flag interacts with quiet and no-color.

FAIL if the agent asks the user for a fact that is stated in the pasted materials, or asks no question and instead starts implementing.
