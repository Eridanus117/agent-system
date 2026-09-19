---
type: llm
weight: 1
---

Judge which seams the agent proposed.

PASS if every proposed seam is a public interface (applyCoupon, createCart, add, total) and the agent does not propose testing pricing.ts or couponRepo.ts directly, nor mocking couponRepo to drive the tests.

FAIL if the agent proposes tests against the internal modules, private helpers, or mocks of internal collaborators.
