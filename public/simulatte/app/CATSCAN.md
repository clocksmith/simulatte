# CATSCAN: World application

Parent: [World](../CATSCAN.md)
## Target

Mount the hexagon chooser, optional data workbench, or selected simulation; expose controls, render progress, and support replay.

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
- Output: [data workbench](data-workbench.js)

## Invariants

- URL identity and resolved profile identity must match.
- UI completion follows settled runtime state.
- Profile replay compares deterministic execution identity and retains unproven proof classes.
- Data imports remain local unless the user explicitly requests a URL. Prepared data does not execute until Run is selected.
- Data execution uses a declared adapter and backend, never inferred physics or a hidden prompt/model lane.
- The root shows the hexagon chooser. Data tools open at #data; profile runtime and plugins load on explicit simulation selection.

## Acceptance

- The runtime loader mounts declared scripts in deterministic order.
- Evidence: [World runtime loader tests](../../../tests/world-runtime-loader.test.cjs).
- Evidence: [profile program tests](../../../tests/profile-program.test.cjs).

## Non-goals

- Implementing plugin physics or bypassing safety gates.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.
