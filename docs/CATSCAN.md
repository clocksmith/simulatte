# CATSCAN: Documentation

Parent: [Simulatte](../CATSCAN.md)
## Target

Record intent, usage, architecture, and evidence meaning without claiming unexecuted behavior.

## Authority

- Owns human-facing product and architecture prose.
- Does not own runtime state, generated evidence verdicts, or deployment status.

## Scope

- Applies to hand-authored documents under `docs/`.

## Contracts

- Input: [product goals](../GOALS.md)
- Input: [current product map](../README.md)
- Output: [World documentation](simulatte/README.md)
- Output: [deployment instructions](deployment.md)

## Invariants

- Proposals, current behavior, proof, and gaps stay visibly distinct.
- Detailed mechanism history belongs in design documents, not charters.

## Acceptance

- Documentation paths remain covered by repository ownership contracts.
- Evidence: [folder contract tests](../tests/folder-contracts.test.cjs).

## Non-goals

- Using prose as a substitute for tests, receipts, or browser evidence.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.

