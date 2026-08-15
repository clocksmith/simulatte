# CATSCAN: World application

Component: `simulatte.world.app`
Parent: [World](../CATSCAN.md)
Target: Resolve routes, mount the selected profile, expose controls, render progress, and support replay.

## Authority

- Owns World page coordination, profile selection, controls, cameras, and visible lifecycle.
- Does not own plugin semantics, platform contracts, or evidence interpretation.

## Scope

- Applies to browser application code under `public/simulatte/app/`.

## Inputs

- [World platform charter](../platform/CATSCAN.md)
- [runtime script manifest](world-runtime-script-manifest.js)

## Outputs

- [World controller](main.js)
- [run controller](tier-run-controller.js)

## Invariants

- URL identity and resolved profile identity must match.
- UI completion follows settled runtime state.

## Acceptance

- The runtime loader mounts declared scripts in deterministic order.
- Evidence: [World runtime loader tests](../../../tests/world-runtime-loader.test.cjs).

## Non-goals

- Implementing plugin physics or bypassing safety gates.

## Freedom

Any mechanism is permitted if it preserves these boundaries and passes the
acceptance evidence.

