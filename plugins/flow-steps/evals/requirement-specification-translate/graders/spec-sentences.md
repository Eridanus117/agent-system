---
type: llm
weight: 2
---

Judge the requirement sentences and their examples.

PASS if all hold: (c) the requirement sentences are EARS-shaped — 当…时／若…则／在…期间／系统应… or the English When/If-then/While/shall — with one rule per sentence; (d) every sentence either has a concrete example underneath it (specific inputs such as a template, a province, a weight, a configured surcharge amount, and an expected output) or is explicitly sent back to the owner naming the missing rule or number (for example whether the province surcharge stacks on the existing region surcharge), and at least one sentence carries a concrete example; (e) no sentence contains implementation names — class, table, column, service or queue names; domain nouns come from the request and the given fields (运费模板、省份、偏远附加、基础运费、首重、续重、区域加价), and role words such as 运营 or 商家 are fine.

FAIL if a sentence bundles two rules, if a sentence has neither an example nor a named gap, or if an implementation name appears inside a sentence.
