---
type: llm
weight: 2
---

Judge the recording plan. PASS if all of these hold: (a) the sample list covers both requirement sentences and each named old-path branch (首重, 续重, cod, vip), each sample carries a scene name and says what it covers, and old-category samples are marked apart from new-category ones; (b) recording happens before the code change, with a named source (an Arthas `watch` on `FreightCalc.calc`, or the request log) and one request per file stored in the repository; (c) a normalization rule lists the volatile fields to strip (trace ids, timestamps or the like) before the files are kept; (d) the agent stops before recording and puts the list to the owner: either asking outright for the veto of the coverage and the normalization rule, or asking one question about coverage or normalization that the list depends on (a missing branch, a value the owner has to supply) — in both forms no recording, no tests, no code happen yet.

FAIL if a branch or sentence is uncovered, if normalization is missing, if recording is scheduled after the change, or if the agent proceeds as though the samples were already approved (writes tests, starts implementing). A sample list that is longer than the minimum, or a question about a branch the owner did not name, is not a failure.
