# CATSCAN: World application

Parent: [World](../CATSCAN.md)
## Target

Mount the temporary Motorcycle-only landing page. Preserve the chooser, data workbench, and simulation lifecycle for restoration.

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
- Output: [World scene adapter](world-render-scene.js), [GPU drawing](webgpu-renderer.js), and [tier drawing adapter](tier-scene-renderer.js).

## Invariants

- URL identity and resolved profile identity must match.
- Scene preparation owns World-specific geometry, route, and presentation decisions. Rendering sessions consume prepared inputs and do not acquire tier data or manage HUD elements.
- UI completion follows settled runtime state.
- Profile replay compares deterministic execution identity and retains unproven proof classes.
- Data imports remain local unless the user explicitly requests a URL. Once required mappings and units are declared, valid data prepares and plays automatically; unresolved semantics remain visible.
- Data execution uses a declared adapter and backend, never inferred physics or a hidden prompt/model lane.
- Temporary launch mode exposes only the Motorcycle Noise link on desktop and mobile; Create and other simulation navigation stay dormant.
- The `data-world-launch="motorcycle"` setting on the root HTML suspends data and profile boot, including old deep links. Removing it restores the chooser, #data, and selected profile routes without rebuilding their implementation.

## Acceptance

- The runtime loader mounts declared scripts in deterministic order.
- Evidence: [World runtime loader tests](../../../tests/world-runtime-loader.test.cjs).
- Evidence: [profile program tests](../../../tests/profile-program.test.cjs).

## Non-goals

- Implementing plugin physics or bypassing safety gates.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.
