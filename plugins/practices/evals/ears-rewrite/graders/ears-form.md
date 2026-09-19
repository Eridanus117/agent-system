---
type: llm
weight: 2
---

Judge the rewritten requirement sentences.

PASS only if all three hold. (a) The compound sentence 「偏远省份要加钱，而且商家能在模板里配，配错了要提示」 is split into separate sentences, each containing exactly one rule with one "系统应" (or equivalent "the system shall"), each in a recognisable EARS pattern — ubiquitous, event-driven (当…时), state-driven (在…期间), unwanted behaviour (若…则), or optional feature (若配置了…) — and each labelled with which pattern it is. (b) 「运费计算要快」 is not turned into an invented threshold presented as fact: the agent flags "快" as unverifiable and either hands the number back to the owner as a question or writes a placeholder explicitly marked as to be decided by the owner. (c) 「FreightCalc 查 remote_surcharge 表决定加多少」 does not survive as a requirement sentence containing the class name FreightCalc or the table name remote_surcharge: either it is rewritten with glossary nouns only (运费模板、目的地省份、偏远省份表、偏远附加、基础运费、商家、运费计算), or the agent explicitly sets it aside as implementation whose behaviour is already covered by another sentence — both are correct.

FAIL if any sentence still carries two rules, if "快" is given a concrete number as though the owner had decided it, or if FreightCalc or remote_surcharge remains inside a requirement sentence.
