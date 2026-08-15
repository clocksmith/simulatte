# CATSCAN: Shared contracts

Component: `simulatte.shared.contracts`
Parent: [Shared browser runtime](../CATSCAN.md)
Target: Define restrictive, versioned wire and validation contracts shared across browser components.

## Authority

- Owns shared schemas and deterministic contract validation primitives.
- Does not own runtime defaults, product policy, or data activation.

## Scope

- Applies to schemas and validators under `public/shared/contracts/`.

## Inputs

- [schema rules](../../../STYLE_GUIDE.md)

## Outputs

- [mission schema](mission.schema.json)
- [contract validator](contract-validator.js)

## Invariants

- Absence and explicit disablement retain distinct meanings.
- Validators reject undeclared structure by default.

## Acceptance

- Shared schemas accept valid fixtures and reject boundary violations.
- Evidence: [shared domain contract tests](../../../tests/shared-domain-contracts.test.cjs).

## Non-goals

- Inventing behavior-changing defaults during validation.

## Freedom

Any mechanism is permitted if it preserves these boundaries and passes the
acceptance evidence.

