---
type: llm
weight: 2
focus: {source: file, path: src/test/java/FreightCalcCharacterizationTest.java}
---

Judge the characterization test the agent wrote for the one real input (template 1032, 新疆, 3.2 kg, vip=false, cod=false).

PASS if the test pins what the code actually does today: the final expected value is the literal 33 (18 first-weight, plus 3 extra kilograms × 4 = 12 because Math.ceil(2.2) is 3, plus the 西北 surcharge 3, cod adds nothing), and each step is readable from the test — either one assertion per step or one comment per step — naming the input field looked at, the branch taken or skipped, and how the number changes (18 → 30 → 33). The two places where the comments contradict the implementation (the comment says 0.5 kg rounding but the code ceils to whole kilograms; the comment says vip is exempt from the extra-weight charge but the code halves the unit price) are flagged, with the implementation treated as the truth.

FAIL if the expected value is 41 or any other wanted-but-not-current value, if steps do not name the field, branch and number change for this input, if the comment-vs-code discrepancies are not flagged, or if the file is empty or only a skeleton.
