# CATSCAN: Browser surface

Parent: [Simulatte](../CATSCAN.md)
## Target

Boot Create and World from static assets with visible readiness, execution, proof, or refusal.

## Authority

- Owns browser entrypoints and deployable static runtime assets.
- Does not own build-time data acquisition or unbound claims.

## Scope

- Applies to the complete static hosting surface under `public/`.

## Contracts

- Input: [product goals](../GOALS.md)
- Input: [hosting contract](../docs/deployment.md)
- Output: [World entrypoint](index.html)
- Output: [Create charter](blank/CATSCAN.md)

## Invariants

- Hosted behavior uses canonical public assets.
- A JavaScript object is not proof of visible or behavioral success.

## Acceptance

- Both hosting surfaces package from declared entrypoints.
- Evidence: [hosting surface tests](../tests/hosting-surfaces.test.cjs).

## Non-goals

- Server-only state or silent production fallbacks.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.

