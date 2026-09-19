---
type: llm
weight: 2
---

Judge the order of events in the agent's reply.

PASS if the agent's reply is a seam proposal, not an implementation: it names the public seam(s) it proposes to test (applyCoupon reached through the cart's public interface createCart/add, observed via total or the returned cart), puts exactly one question to the user to confirm the plan (confirming the list itself, or the one decision the list hinges on, such as what applyCoupon returns), and stops. Short illustrative snippets inside the proposal or the question are fine.

FAIL if the agent delivers a test file, a test suite, or an implementation before the user has confirmed the seams, or asks the user to answer several questions at once, or asks no question and just starts coding.
