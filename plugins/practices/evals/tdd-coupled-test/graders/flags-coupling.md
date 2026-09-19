---
type: llm
weight: 2
focus: trace
---

Judge whether the agent recognised the pasted test as implementation-coupled.

PASS if the agent says the existing test is coupled to implementation (it spies on the internal collaborator paymentService and asserts call counts and arguments, so it breaks on refactors that keep behaviour) and proposes instead behaviour tests through the public result of checkout (status, orderId) for the three requested cases, with mocks only at true system boundaries if at all, checking with the user before writing more tests in the pasted style.

FAIL if the agent simply writes three more tests in the same spy-and-call-count style, or writes tests without addressing the coupling.
