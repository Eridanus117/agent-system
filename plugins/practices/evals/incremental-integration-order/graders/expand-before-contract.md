---
type: llm
weight: 2
---

Judge only how the data change is sequenced.

PASS if the new `province_surcharge` table is created first while `region_surcharge` stays in place and the report job keeps reading it unchanged, and dropping or renaming `region_surcharge` is either left out of this order or placed as a separate later step that happens only after the change has been rolled out and the report job has been moved.

FAIL if the old table is dropped, renamed or emptied inside this integration order, if the report job is told to switch before the new path is live, or if the order starts with the code merge before the table exists.
