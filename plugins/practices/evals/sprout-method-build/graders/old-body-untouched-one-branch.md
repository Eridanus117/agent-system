---
type: llm
weight: 2
focus: {source: file, path: src/main/java/FreightCalc.java}
---

Judge the production file the agent wrote.

PASS if every statement of the old `calc` body is still there unchanged and contiguous — same statements, same order, not moved into a new private method, not renamed, not rewritten — and the only edit to existing code is one guarded call site whose guard checks both `remoteFeeEnabled` and that the province is 新疆 or 西藏, placed either at the entry of `calc` (returning the new method's result) or after all the old statements and before the old `return` (passing the old fee into the new method), and the new logic lives in a new method such as `calcRemoteFee` (or a new class) that does not call back into the same guard.

FAIL if any old statement was moved, split, renamed or edited; if the new call was inserted between old statements (for example between the surcharge line and the cod line); if the call site is unconditional or guarded by the toggle alone with the province check hidden inside the new method, so that with the toggle off (or for a non-target province) the old path still enters the new code; or if the file has no new method.
