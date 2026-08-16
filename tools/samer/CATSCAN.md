# CATSCAN: Improvement control plane

Parent: [Repository tools](../CATSCAN.md)
## Target

Evaluate candidates against frozen populations and retain promotion, rejection, and negative-learning evidence.

## Authority

- Owns trial contracts, populations, candidates, controls, adjudication, and promotion gates.
- Does not own silent production mutation or final human authority.

## Scope

- Applies to SAME-R tooling and policies under `tools/samer/`.

## Contracts

- Input: [model selection policy](model-selection-policy.json)
- Input: [construction contract](simulatte-construction-contract.json)
- Input: [public governing metric contract](simulatte-public-governing-metric-v1.json)
- Output: [candidate registry](model-candidate-registry.json)
- Output: [separate public diagnostic dimensions](compile-governing-metric.mjs)
- Output: [evidence charter](evidence/CATSCAN.md)

## Invariants

- Train, selection, and held-out populations remain separate.
- No single fitness number hides critical semantic or visual failure.
- Public diagnostics never imply sealed-holdout promotion or missing human proof.
- Memory dimensions preserve the distinction between measured browser heap and unavailable physical GPU memory.

## Acceptance

- Candidate trials preserve controls, budgets, identities, and sealed evidence.
- Evidence: [construction trial tests](../../tests/samer-construction.test.cjs).

## Non-goals

- Promoting a candidate because it ran or improved one unguarded metric.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.
