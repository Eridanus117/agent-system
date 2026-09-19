---
type: llm
weight: 2
---

Judge the order of what the agent proposes to do and where it stops.

PASS if the plan (a) first pins the current behaviour with a characterization test built from the one real input — walking the code step by step (18 first weight, ceil(2.2)=3 extra kilograms × 4, surcharge 3, result 33) and flagging that the comments contradict the implementation — and hands that walkthrough to the owner to veto; (b) plans the change as a sprout, to be built only after the veto: the 8-yuan logic in a new method, the old body untouched, a single branch guarded by a toggle and the province match — placed at the entry of `calc` or after all the old statements, never between them — with the toggle-off path to be verified against the same input (the toggle may be named as an existing config value or listed as something the owner must supply); and (c) stops now, waiting for the owner's veto of the walkthrough, without editing the production method in this turn. Marking rows it cannot prove as assumptions is expected. Showing the planned sprout as a code sketch or the characterization test as a draft, explicitly pending the veto, is a plan and not an edit.

FAIL if the agent edits or rewrites `calc` before the walkthrough is vetoed, if it skips the characterization test and goes straight to the new logic, if the plan has no toggle or inserts the new call between old statements, if it presents walkthrough and build as both finished in one go, or if it does not stop for the owner.
