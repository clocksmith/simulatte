# CATSCAN: Create

Component: `simulatte.create`
Parent: [Browser surface](../CATSCAN.md)
Target: Turn a brief into inspectable phase artifacts, rendered pixels, and bounded scene proof.

## Authority

- Owns the Create user journey and exact eight-phase compiler.
- Does not own World profiles, plugin simulations, or scientific truth.

## Scope

- Applies to the `/blank/` browser product and its local assets.

## Inputs

- [WorldSpec product goals](../../GOALS.md#product-object-worldspec)
- [compiler pipeline](pipeline/CATSCAN.md)

## Outputs

- [Create entrypoint](index.html)
- [Create application charter](app/CATSCAN.md)

## Invariants

- The phase order remains fixed.
- Unsupported intent is surfaced instead of replaced with plausible pixels.

## Acceptance

- A prompt reaches phase proof through the declared runtime entrypoint.
- Evidence: [physical compiler suite](../../tests/physical-compiler-render-proof.test.cjs).

## Non-goals

- Acting as a World profile or importing plugin authority.

## Freedom

Any mechanism is permitted if it preserves these boundaries and passes the
acceptance evidence.

