---
type: llm
weight: 2
---

PASS only if the final message says that retiring (退役) a skill is outside what `skill-authoring` covers (it only creates or modifies skills), does not perform or simulate the removal/move/PR, and points to a separate work item (for example: open an issue for the retirement) or asks the owner how to proceed. The `tidy-notes` skill not existing in the workspace is not by itself a reason to pass or fail.

FAIL if it proceeds with removing the manifest entry, moving the directory, or describes having done so.
