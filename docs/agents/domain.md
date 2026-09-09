# Domain Docs

How engineering skills should consume this repo's domain documentation.

## Layout

This is a single-context repository.

- `CONTEXT.md` at the repository root is the domain glossary and current domain vocabulary.
- `docs/adr/` contains system-wide architecture decisions.
- If a relevant file does not exist yet, proceed without treating its absence as a defect.
- Create `CONTEXT.md` lazily when domain terms are actually resolved.
- Read relevant ADRs before changing the area they govern.
- Do not treat unapproved proposals, archived material, or agent-generated plans as current authority.

## Vocabulary

When naming a domain concept in an issue, proposal, test, or refactor, use the term defined in `CONTEXT.md`. If the needed term is missing, flag it for domain modeling instead of silently inventing a synonym.

## ADR conflicts

If a proposed change conflicts with an existing ADR, state the conflict explicitly and explain why reopening it is justified.
