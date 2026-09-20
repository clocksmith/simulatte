# CATSCAN: World

Parent: [Browser surface](../CATSCAN.md)
## Target

Execute governed profiles and domain simulations with deterministic controls, dynamics, replay, and bounded evidence.

## Authority

- Owns the root hexagon chooser, optional data workbench, and selected profile lifecycle.
- Owns chartered domain WorldSpec applications, including Motorcycle Noise.
- Owns cross-plugin WorldSpec compositions, including the Earth/Virginia datacenter reference world.
- Owns recursive spatial residency through content-addressed render payloads, atomic parent-child replacement, predictive prefetch, pinning, and eviction independent of simulation residency.
- Does not own Create compilation or plugin-private logic.

## Scope

- Applies to World runtime code under `public/simulatte/`.

## Contracts

- Input: [governed data charter](../data/CATSCAN.md)
- Input: [platform charter](platform/CATSCAN.md)
- Output: [World runtime manifest](app/world-runtime-script-manifest.js)
- Output: [journey verifier](verifier/CATSCAN.md)
- Output: [Motorcycle Noise](motorcycle-noise/CATSCAN.md)

## Invariants

- Profile runs bind profile, world, plugin, seed, and controls.
- Domain runs bind WorldSpec, model, seed, controls, and assumptions. Signed simulation records are not profile WorldProof or empirical validation.
- Every selected profile executes its exact public WorldSpec and exposes a bound WorldProof without converting pending human review into visual proof.
- Profile scenario edits recompile every governed scenario-bound field before the runtime accepts the program.
- Clean editors follow external scenarios; stale dirty edits never merge silently.
- Unsupported or unsafe execution refuses visibly.
- Camera interest may change spatial payload residency but cannot suspend or rewrite causally required simulation state.

## Acceptance

- World loads the selected governed profile and reaches a terminal or refusal state.
- Evidence: [World runtime loader tests](../../tests/world-runtime-loader.test.cjs).
- Evidence: [profile program contract tests](../../tests/profile-program.test.cjs) and [browser round-trip audit](../../tools/simulatte/run-browser-smoke.mjs).
- Evidence: [Motorcycle Noise analytical tests](../../tests/motorcycle-noise.test.cjs) and [browser audit](../../tools/simulatte/audit-motorcycle-noise.mjs).
- Evidence: [recursive spatial residency tests](../../tests/recursive-spatial-residency.test.cjs).

## Non-goals

- Using profile breadth as proof of compiler generality.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.
