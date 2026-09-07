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
- Input: [WorldSpec contract](../../../shared/contracts/world-spec.js)
- Output: [user override grounding](simulatte-user-override-grounding.js)
- Output: [semantic provenance projection](simulatte-semantic-provenance.js)
- Output: [validated WorldSpec authoring input](simulatte-world-spec-input.js)
- Output: [intent settlement helper](simulatte-intent-proof.js)
- Output: [semantic proof helper](simulatte-semantic-proof.js)
- Output: [Phase 5 simulation contract](../phase-05-simulation/CATSCAN.md)

## Invariants

- Every accepted node has provenance.
- WorldSpec authoring fields normalize before publication; controls require declared finite parameters within their bounds.
- Every accepted entity, relation, property, exact quantity, and prohibition has source-bound provenance.
- Inferences remain distinguishable from direct grounding.
- Unresolved prompt nodes remain editable requirements; they do not acquire executable causal edges from rule or label matches.
- User overrides replace the accepted graph only through explicit patch provenance.
- Removing an accepted node also reconciles its dependent relations and execution obligations.
- Every Phase 2 critical requirement remains accepted, explicitly refused, unresolved, or lost.
- User-edited semantic fields bind append-only patch IDs instead of retaining false prompt authority.
- Public authoring history remains an explicit projection beside the effective execution graph; replay preserves both.
- Grounding evidence, unsupported rows, and unresolved rows remain compiler-owned when a user edits executable intent.

## Acceptance

- Grounding fixtures expose unsupported concepts and preserve stronger prompt evidence.
- Evidence: [language grounding tests](../../../../tests/physical-compiler-language-grounding.test.cjs).
- Evidence: [user override propagation tests](../../../../tests/world-spec.test.cjs).

## Non-goals

- Inventing visual substitutes for rejected concepts.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.
