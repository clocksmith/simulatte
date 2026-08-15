# CATSCAN: World platform runtime

Component: `simulatte.world.platform.runtime`
Parent: [World platform](../CATSCAN.md)
Target: Provide deterministic clock, timeline, and provenance services to governed runs.

## Authority

- Owns simulation clock, timeline ordering, and provenance registration.
- Does not own profile policy, plugin computation, or visual composition.

## Scope

- Applies to runtime services under `public/simulatte/platform/runtime/`.

## Inputs

- [platform contract charter](../contracts/CATSCAN.md)

## Outputs

- [simulation clock](simulation-clock.js)
- [provenance registry](provenance-registry.js)

## Invariants

- Simulation time derives from declared run state.
- Provenance records cannot be rewritten into stronger claims.

## Acceptance

- Lifecycle and replay fixtures preserve event order and identity.
- Evidence: [plugin playback tests](../../../../tests/plugin-playback.test.cjs).

## Non-goals

- Using wall-clock time as deterministic simulation authority.

## Freedom

Any mechanism is permitted if it preserves these boundaries and passes the
acceptance evidence.

