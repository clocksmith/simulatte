# CATSCAN: Experience contracts

Component: `simulatte.docs.experiences`
Parent: [Documentation](../../CATSCAN.md)
Target: State each connected experience's actor, job, controls, truth, result, proof, and non-claims.

## Authority

- Owns player-facing experience intent and evidence interpretation.
- Does not own profile activation, plugin execution, or browser capture.

## Scope

- Applies to connected experience records under this directory.

## Inputs

- [profile claim inventory](../../../public/data/application-profiles/profile-claim-inventory-v1.json)

## Outputs

- [experience index](README.md)

## Invariants

- Every connected profile has one complete experience contract.
- A proposed or disconnected experience cannot imply public activation.

## Acceptance

- Experience records and active profile identities remain one-to-one.
- Evidence: [folder contract tests](../../../tests/folder-contracts.test.cjs).

## Non-goals

- Duplicating plugin manifests or reporting current evidence without receipts.

## Freedom

Any mechanism is permitted if it preserves these boundaries and passes the
acceptance evidence.

