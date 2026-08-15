# CATSCAN: World

Parent: [Browser surface](../CATSCAN.md)
## Target

Execute governed profiles with deterministic controls, dynamics, safety, settlement, replay, and receipts.

## Authority

- Owns the World browser product and selected profile lifecycle.
- Does not own Create compilation or plugin-private logic.

## Scope

- Applies to World runtime code under `public/simulatte/`.

## Contracts

- Input: [governed data charter](../data/CATSCAN.md)
- Input: [platform charter](platform/CATSCAN.md)
- Output: [World runtime manifest](app/world-runtime-script-manifest.js)
- Output: [journey verifier](verifier/CATSCAN.md)

## Invariants

- Profile, world, plugin, seed, and controls bind every run.
- Unsupported or unsafe execution refuses visibly.

## Acceptance

- World loads the selected governed profile and reaches a terminal or refusal state.
- Evidence: [World runtime loader tests](../../tests/world-runtime-loader.test.cjs).

## Non-goals

- Using profile breadth as proof of compiler generality.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.

