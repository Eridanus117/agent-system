---
type: llm
weight: 2
---

Judge the checklist's coverage.

PASS if every boundary named in the material appears with an explicit verdict: the three callers OrderService, QuoteService and BatchCalc; the `remote_fee` table (new column, old columns kept) together with the report job that reads it; the template config's new field; and the `remote_fee_by_province` toggle. Each row says either 不变 (unchanged) or what changed and who must know (for example: `calc` signature unchanged; BatchCalc unchanged because the new branch never reaches it; `remote_fee` gains a column, the report job must know; template config gains a field, unset means no surcharge). Rows marked as inferred from the material, pending the owner's confirmation, still count as having a verdict. The colleague's concurrent edit to the cod line is handed to configuration management (merge / branch conflict), not treated as a contract row that this checklist decides.

FAIL if any boundary from the material is missing, if any row is left without a verdict, or if the colleague's concurrent change is silently dropped or "resolved" here.
