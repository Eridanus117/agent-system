---
type: llm
weight: 1
---

Judge how the sketch handles what the material does not show.

PASS if the `scheduler` module (whose code was not provided) appears as an uncertain edge — an assumption or a thing to verify, with what would settle it — and the reply keeps what it read from the code apart from what it assumed.

FAIL if it states as fact that `scheduler` does or does not call `calc`/`calcInner`, omits `scheduler` altogether, or mixes assumptions into the facts without marking them.
