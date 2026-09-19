---
type: llm
weight: 2
---

Judge the content the agent hands the owner before the owner goes to ask 产品 A.

PASS only if all five are present: (a) the request is quoted verbatim 「运费模板要支持按省份设偏远附加」 with 产品 A named as the source; (b) a declarative hypothesis of the real problem behind the requested feature, marked as an assumption, rather than an open question to the owner; (c) questions for the owner to relay to A that ask only about what already happened or is happening now (last time, how they cope now, what happens if not done), none asking what feature A wants; (d) an honest note on existing capability — since the agent cannot see code or configuration it writes 未查到 or marks its guess as an assumption, instead of asserting that nothing exists; (e) a closing of the real problem, whether it is worth changing (including the option of not changing), the direction, plus one observable acceptance criterion (something that can be seen to have happened, e.g. a type of order no longer appearing in a subsidy export).

FAIL if any of (a)–(e) is missing, or if the existing-capability note asserts 没有 without having checked.
