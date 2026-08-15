# CATSCAN: Documentation

Component: `simulatte.docs`
Parent: [Simulatte](../CATSCAN.md)
Target: Record intent, usage, architecture, and evidence meaning without claiming unexecuted behavior.

## Authority

- Owns human-facing product and architecture prose.
- Does not own runtime state, generated evidence verdicts, or deployment status.

## Scope

- Applies to hand-authored documents under `docs/`.

## Inputs

- [product goals](../GOALS.md)
- [current product map](../README.md)

## Outputs

- [World documentation](simulatte/README.md)
- [deployment instructions](deployment.md)

## Invariants

- Proposals, current behavior, proof, and gaps stay visibly distinct.
- Detailed mechanism history belongs in design documents, not charters.

## Acceptance

- Documentation paths remain covered by repository ownership contracts.
- Evidence: [folder contract tests](../tests/folder-contracts.test.cjs).

## Non-goals

- Using prose as a substitute for tests, receipts, or browser evidence.

## Freedom

Any mechanism is permitted if it preserves these boundaries and passes the
acceptance evidence.

