# CATSCAN: World application

Parent: [World](../CATSCAN.md)
## Target

Resolve routes, mount the selected profile, expose controls, render progress, and support replay.

## Authority

- Owns World page coordination, profile selection, controls, cameras, and visible lifecycle.
- Does not own plugin semantics, platform contracts, or evidence interpretation.

## Scope

- Applies to browser application code under `public/simulatte/app/`.

## Contracts

- Input: [World platform charter](../platform/CATSCAN.md)
- Input: [runtime script manifest](world-runtime-script-manifest.js)
- Output: [World controller](main.js)
- Output: [run controller](tier-run-controller.js)
- Output: [profile program](profile-program.js)

## Invariants

- URL identity and resolved profile identity must match.
- UI completion follows settled runtime state.
- Profile replay compares deterministic execution identity and retains unproven proof classes.

## Acceptance

- The runtime loader mounts declared scripts in deterministic order.
- Evidence: [World runtime loader tests](../../../tests/world-runtime-loader.test.cjs).
- Evidence: [profile program tests](../../../tests/profile-program.test.cjs).

## Non-goals

- Implementing plugin physics or bypassing safety gates.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.
