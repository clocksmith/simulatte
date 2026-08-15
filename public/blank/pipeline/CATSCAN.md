# CATSCAN: Create compiler pipeline

Component: `simulatte.create.pipeline`
Parent: [Create](../CATSCAN.md)
Target: Preserve prompt obligations through eight typed, ordered phase boundaries.

## Authority

- Owns phase order, artifact handoffs, and loss attribution boundaries.
- Does not own page coordination or World plugin execution.

## Scope

- Applies to phase implementations under `public/blank/pipeline/`.

## Inputs

- [phase registry](../app/runtime/phase-module-registry.js)
- [pipeline invariants](../../../STYLE_GUIDE.md)

## Outputs

- [scene proof phase](phase-08-scene-proof/CATSCAN.md)

## Invariants

- Phase N consumes Phase N-1 output plus allowed runtime context only.
- The earliest divergence is diagnostic until artifact substitution establishes ownership.

## Acceptance

- All eight phase modules register in the fixed order.
- Evidence: [phase module registry tests](../../../tests/phase-module-registry.test.cjs).

## Non-goals

- Adding hidden phases or cross-phase semantic side channels.

## Freedom

Any mechanism is permitted if it preserves these boundaries and passes the
acceptance evidence.

