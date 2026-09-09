# CATSCAN: Solar drive instance

Parent: [World](../CATSCAN.md)

## Target

Let people inspect, edit, run, replay, and export a solar vehicle WorldSpec with
an interactive WebGPU component assembly and an explicit energy balance.

## Authority

- Owns the solar vehicle instance, engineering presets, scene assembly, and controls.
- The shared longitudinal solver owns state evolution; drawing consumes that state.
- Uses the public WorldSpec authoring, validation, identity, and edit contracts.
- Does not own shared schema policy, hardware certification, or the profile chooser.

## Scope

- `public/simulatte/solar-drive/`, served directly at `/simulatte/solar-drive/`.

## Contracts

- Input: [WorldSpec](../../shared/contracts/world-spec.js).
- Input: [longitudinal model](../../shared/core/simulation/solar-drive.js).
- Output: [instance entrypoint](index.html), [program adapter](program.js).
- Output: [scene assembly](scene.js), [WebGPU renderer](renderer.js).

## Invariants

- Parameters describe hypothetical designs, not measured hardware or certified CAD.
- Every run consumes a validated WorldSpec; accepted edits retain authorship.
- Logical time advances in fixed steps. Camera, selection, and frame rate do not change physics.
- Solar input, initial stored energy, gravity, conversion losses, and braking remain separately accounted.
- Magnetic fields and slowed rotor animation explain components, not electromagnetic field solutions.
- GPU readiness requires successful device and pipeline creation; no hidden rendering fallback.
- Model checks, completed GPU execution, and human visual review remain distinct evidence.

## Acceptance

- Evidence: [energy and replay tests](../../../tests/solar-drive.test.cjs).
- Evidence: [desktop/mobile WebGPU audit](../../../tools/simulatte/audit-solar-drive.mjs).
- Edit, replay, export, and reimport preserve declared program identity.

## Non-goals

- Rotor certification, electromagnetic finite element analysis, battery electrochemistry,
  measured weather prediction, or unconditional perpetual operation.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the acceptance evidence.
