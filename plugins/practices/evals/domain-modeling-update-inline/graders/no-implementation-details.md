---
type: llm
weight: 2
focus: {source: file, path: CONTEXT.md}
---

Judge the final content of CONTEXT.md in the workspace files.

PASS if the new 行项撤回 entry defines the concept in one or two sentences (removing a line item before shipping, the rest of the order proceeds), lists the avoided synonyms, and keeps implementation details out of CONTEXT.md: no withdrawn_at column, no orders table, no withdrawLineItem function name. The existing entries (订单, 行项, 取消) are preserved.

FAIL if the entry or any other part of CONTEXT.md mentions the column, the table, or the function, or if existing entries were dropped or rewritten in substance.
