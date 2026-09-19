---
type: llm
weight: 2
---

Judge the examples attached to the three sentences.

PASS only if all of the following hold. Sentences 1 and 2 each get at least one concrete example with a specific template number, province and weight and an expected amount that is arithmetically consistent with the given facts (for example 模板 1032、新疆、1 kg → 18 + 8 = 26; 模板 1032、广东、1 kg → 18; a heavier parcel adds 3 per kg over the first kg). The boundary of sentences 1/2 is covered on both sides (a province in the table and a province not in the table; covering both 新疆 and 西藏 or a weight above the first kg is a plus but not required). For sentence 3 the agent does not invent the global default surcharge amount: it says the number is not in the given facts and hands it back to the owner (as a missing number or a question), with no expected amount presented as fact for that sentence.

FAIL if any expected output contradicts the given facts, if a global default amount is invented and presented as the expected output, or if examples use placeholders such as X, N or "某省" instead of real values.
