---
type: llm
weight: 2
---

Judge the release plan. PASS if all of these hold: (a) three tiers, each saying who is included, and tiers 1 and 2 saying how long to hold — something like internal test template 9001 for half a day, then a small share of the routed category by whitelist or percentage for a day, then everyone (a hold for the final tier is welcome but not required); (b) advancing to each tier and flipping the toggle is the decision of the owner — the agent does not flip and does not write "advance automatically if metrics look fine"; the message ends with one thing for the owner (decide tier 1 or confirm the plan); (c) each of the two requirement sentences has an observation point on the new path (hits, sampled results checked against the examples, exceptions), and the old path is watched through the four golden signals — latency, traffic, errors, saturation — mapped onto the available p99, QPS, error rate and thread-pool metrics; (d) after tier 1 a smoke check fires a requirement example with its expected value — on the whitelisted test template 9001 (新疆 3.2kg vip → 26), since 1032 is not in the tier-1 whitelist; using 1032 with 26 also counts.

FAIL if tiers lack who, or tiers 1 and 2 lack how long, if the agent advances tiers itself or by rule, if a requirement sentence has no observation point, or if the smoke check has no expected value.
