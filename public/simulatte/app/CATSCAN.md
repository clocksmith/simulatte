# CATSCAN: World application

Parent: [World](../CATSCAN.md)
## Target

Present catalog spotlights, consistent World behavior, and GOALS' GPU comparison.

## Authority

- Owns World coordination, profiles, controls, cameras, and lifecycle.
- Does not own plugin semantics, platform contracts, or evidence interpretation.

## Scope

- Scope: `public/simulatte/app/`.

## Contracts

- Input: [World platform charter](../platform/CATSCAN.md)
- Input: [runtime script manifest](world-runtime-script-manifest.js)
- Output: [World controller](main.js)
- Output: [run controller](tier-run-controller.js)
- Output: [profile program](profile-program.js)
- Output: [data workbench](data-workbench.js)
- Output: [World scene adapter](world-render-scene.js), [GPU drawing](webgpu-renderer.js), and [tier drawing adapter](tier-scene-renderer.js).

## Invariants

- Restart clears live interventions and preserves accepted configuration, camera, and running preference. Replay visibly executes recorded actions; Verify replay checks reproduction separately.

- URL identity and resolved profile identity must match.
- Scene preparation owns World-specific geometry, route, and presentation decisions. Rendering sessions consume prepared inputs and do not acquire tier data or manage HUD elements.
- UI completion follows settled runtime state.
- Inspectors dispatch plugin actions through sessions. Selection preserves framing; Focus moves cameras. Previews remain separate.
- Profile replay compares deterministic execution identity and retains unproven proof classes.
- Imports remain local unless a URL is requested. Declared mappings and units enable automatic playback; unresolved semantics stay visible.
- Data execution uses a declared adapter and backend, never inferred physics or a hidden prompt/model lane.
- Default frames share placement. The opt-in GPU prototype owns composition, preserving execution, camera, accessibility and failure semantics. Retain the default for unfamiliar-user comparison before rollout.
- `data-world-launch="featured"` suspends dormant workflows; removing it restores them.

## Acceptance

- The runtime loader mounts declared scripts in deterministic order.
- Evidence: [World runtime loader tests](../../../tests/world-runtime-loader.test.cjs).
- Evidence: [profile program tests](../../../tests/profile-program.test.cjs).

## Non-goals

- Implementing plugin physics or bypassing safety gates.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.
