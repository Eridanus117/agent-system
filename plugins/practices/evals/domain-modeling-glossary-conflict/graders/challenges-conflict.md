---
type: llm
weight: 2
---

Judge whether the agent caught the vocabulary conflict.

PASS if the agent points out that the glossary defines 取消 (Cancellation) as withdrawing the whole order before shipping while the user is describing removing a single line item, and puts exactly one question to the user that resolves that conflict (for example: which meaning 取消 keeps; whether the line-level action needs its own term; or whether withdrawing every item and cancelling the order are the same business event). The agent may recommend an answer and may list what it will ask later. It must stop after that question and not write CONTEXT.md before the user answers.

FAIL if the agent accepts the user's wording without surfacing the conflict with the glossary, or writes CONTEXT.md or code before the user decides, or asks the user to answer several questions at once.
