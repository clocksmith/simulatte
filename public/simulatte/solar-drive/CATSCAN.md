# CATSCAN: Solar Drive

Parent: [World](../CATSCAN.md)

## Target

Ride an identified route, inspect the solar vehicle and compare exposure changes.

## Authority

- Owns vehicle presets, controls, assembly, route adaptation and recorded interventions.
- The [longitudinal solver](../../shared/core/simulation/solar-drive.js) owns dynamics.
- [WorldSpec](../../shared/contracts/world-spec.js) owns authoring and identity.
- Does not own schema policy, hardware certification or catalog activation.

## Scope

`public/simulatte/solar-drive/`.

## Contracts

- Input: [route](../../data/solar-drive/union-square-route-v1.json) and [published rides](../../data/solar-drive/published-ride-reference-v1.json).
- Input: [route builder](../../../tools/simulatte/build-solar-route.mjs), [reference builder](../../../tools/simulatte/build-solar-reference.py).
- Output: [program](program.js), [panel-plane adapter](route.js).
- Output: [entrypoint](index.html), [assembly](scene.js), [route scene](route-scene.js), [renderer](renderer.js).

## Invariants

- Runs consume validated WorldSpecs; edits preserve authorship.
- Fixed steps govern time. Cameras and rendering never change physics.
- Selection preserves camera; Focus fits geometry. Restart preserves playback preference.
- Replay executes recorded actions; Verify replay checks reproduction.
- Ride opens assembled without the experimental flywheel. Ride/Inspect preserves execution, selection and comparisons.
- Panel interventions fork prior state and retain logical steps for replay.
- Panel-plane rays use the shared Sun Walker geometry, not pedestrian shade percentages.
- Street/building/DEM inputs identify geometry. Weather, stop timing and efficiencies remain assumptions.
- Published touring sizes and measurements provide approximate context, not calibrated accuracy or certified CAD.
- Solar input, initial reserves, gravity, losses and braking remain separately accounted.
- Fields and slowed rotors illustrate components, not solved electromagnetics.
- GPU readiness requires device and pipeline creation; no hidden fallback.
- Numerical, GPU, empirical and human evidence remain separate.

## Acceptance

- Evidence: [energy/replay tests](../../../tests/solar-drive.test.cjs) and [desktop/mobile audit](../../../tools/simulatte/audit-solar-drive.mjs) verify edit, comparison, replay and export/reimport identity.

## Non-goals

Hardware certification, battery electrochemistry, weather prediction or perpetual operation.

## Freedom

Any implementation is permitted within these contracts.
