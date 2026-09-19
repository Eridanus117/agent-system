---
type: llm
weight: 2
focus: trace
---

Judge the test and implementation the agent wrote (read the Write calls).

PASS if the test exercises the public interface only (builds a cart with createCart/add, calls applyCoupon, observes through total or the returned cart), asserts an independent literal expected value (for example a cart totalling 100 or 120 ends at 90 or 110, written as a literal rather than recomputed from the inputs the way the code would), covers exactly the one behaviour of this slice, uses no mocks of internal modules, and the implementation does only what this slice needs: it may be deliberately minimal (Fake It, even a constant discount), but it must not implement expiry or invalid-code handling yet. The agent then names the next slice and stops.

FAIL if the test mocks pricing or couponRepo, or asserts a recomputed expected value, or the agent writes tests for expiry or invalid codes in this round, or implements expiry or invalid handling now, or does not stop after the first slice.
