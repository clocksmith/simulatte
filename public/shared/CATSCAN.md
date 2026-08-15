# CATSCAN: Shared browser runtime

Component: `simulatte.shared`
Parent: [Browser surface](../CATSCAN.md)
Target: Provide narrow contracts and reusable deterministic behavior without becoming a hidden product coordinator.

## Authority

- Owns cross-product schemas, core simulation helpers, design assets, language support, and plugin sources.
- Does not own Create phase orchestration or World application state.

## Scope

- Applies to reusable browser code under `public/shared/`.

## Inputs

- [shared contracts](contracts/CATSCAN.md)

## Outputs

- [shared plugin boundary](plugins/CATSCAN.md)
- [shared core boundary](core/CATSCAN.md)

## Invariants

- Shared code has explicit consumers and no upward hidden authority.
- Product-specific decisions stay in their owning product.

## Acceptance

- Shared contracts load without cross-product dependency leaks.
- Evidence: [shared domain contract tests](../../tests/shared-domain-contracts.test.cjs).

## Non-goals

- Becoming a high-fan-in product policy hub.

## Freedom

Any mechanism is permitted if it preserves these boundaries and passes the
acceptance evidence.

