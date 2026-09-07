# CATSCAN: Phase 2 Language

Parent: [Create compiler pipeline](../CATSCAN.md)
## Target

Extract a source-bound language graph without deciding final world semantics.

## Authority

- Owns tokens, spans, clauses, predicates, quantities, negation, and relations.
- Does not own retrieval ranking, grounding, or rendering.

## Scope

- Applies to Phase 2 language extraction code.

## Contracts

- Input: [Phase 1 runtime contract](../phase-01-runtime/CATSCAN.md)
- Output: [intent requirement contract](../../../shared/contracts/world-proof-intent.js)
- Output: [Phase 3 retrieval contract](../phase-03-retrieval/CATSCAN.md)

## Invariants

- Source spans remain attached to extracted obligations.
- Counts and negation cannot be weakened into hints.
- Open noun phrases retain their head identity and source-bound modifiers. Part counts bind to the named owner; spatial phrases preserve argument order.
- Every semantic span is covered by a typed critical requirement or named as an extraction gap.

## Acceptance

- Language fixtures preserve exact entities, counts, relations, and negation.
- Evidence: [language grounding tests](../../../../tests/physical-compiler-language-grounding.test.cjs).
- Evidence: [composition and paraphrase regressions](../../../../tests/open-language-composition.test.cjs).

## Non-goals

- Choosing primitives or accepting unsupported concepts.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.
