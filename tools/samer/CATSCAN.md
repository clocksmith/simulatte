# CATSCAN: Improvement control plane

Component: `simulatte.tools.samer`
Parent: [Repository tools](../CATSCAN.md)
Target: Evaluate candidates against frozen populations and retain promotion, rejection, and negative-learning evidence.

## Authority

- Owns trial contracts, populations, candidates, controls, adjudication, and promotion gates.
- Does not own silent production mutation or final human authority.

## Scope

- Applies to SAME-R tooling and policies under `tools/samer/`.

## Inputs

- [model selection policy](model-selection-policy.json)
- [construction contract](simulatte-construction-contract.json)

## Outputs

- [candidate registry](model-candidate-registry.json)
- [evidence charter](evidence/CATSCAN.md)

## Invariants

- Train, selection, and held-out populations remain separate.
- No single fitness number hides critical semantic or visual failure.

## Acceptance

- Candidate trials preserve controls, budgets, identities, and sealed evidence.
- Evidence: [construction trial tests](../../tests/samer-construction.test.cjs).

## Non-goals

- Promoting a candidate because it ran or improved one unguarded metric.

## Freedom

Any mechanism is permitted if it preserves these boundaries and passes the
acceptance evidence.

