---
type: llm
weight: 2
---

PASS only if the final message describes the modification path for an existing skill with all three of:

1. The fix is a short-route change driven by this feedback issue: the offending step is changed so it opens a PR and writes the standup update instead of a local merge; no new spec, no ticket splitting, no full nine-stage route.
2. Verification means running the SAME evaluation suite twice, once on the unchanged (old) skill and once after the change, and comparing the two results (wording such as 改前跑一遍、改后跑一遍、改前改后各一份结果 counts). Merely reviewing the text is not enough.
3. The version moves by a semver patch step (for example 0.1.0 to 0.1.1, or "patch 加一") and the marketplace entry version is kept equal to the plugin version. Saying the exact number will be read from plugin.json is fine as long as the patch step is stated.

FAIL if any of the three is missing, if it proposes a major or minor bump without a reason, or if it reopens the whole nine-stage route for this fix.
