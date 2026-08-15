# CATSCAN: Phase 4 Grounded Intent

Parent: [Create compiler pipeline](../CATSCAN.md)
## Target

Produce the accepted semantic world graph with assumptions, refusals, and provenance.

## Authority

- Owns semantic acceptance, canonical nodes, typed relations, assumptions, and unsupported rows.
- Does not own solver selection, layout, or pixel proof.

## Scope

- Applies to Phase 4 grounding and graph synthesis code.

## Contracts

- Input: [Phase 3 retrieval contract](../phase-03-retrieval/CATSCAN.md)
- Output: [Phase 5 simulation contract](../phase-05-simulation/CATSCAN.md)

## Invariants

- Every accepted node has provenance.
- Inferences remain distinguishable from direct grounding.

## Acceptance

- Grounding fixtures expose unsupported concepts and preserve stronger prompt evidence.
- Evidence: [language grounding tests](../../../../tests/physical-compiler-language-grounding.test.cjs).

## Non-goals

- Inventing visual substitutes for rejected concepts.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.

