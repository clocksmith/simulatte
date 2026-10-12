# CATSCAN: Motorcycle Noise

Parent: [World](../CATSCAN.md)

## Target
Observe traffic and viewpoint noise on NYC geometry.

## Authority
- Owns traffic, acoustics, measurements, graphics, and replay.
- Does not own WorldSpec identity, hardware, or enforcement.

## Scope
Babylon renders; Simulatte owns mathematics.

## Contracts
- Input: sourced [NYC geometry](nyc-map.json) and [scenario parameters](reflection-model.js).
- Output: [traffic trajectories](traffic-motion.js), [building paths](city-paths.js), [acoustic fields](acoustic-field.js), and [comparisons](reflection-worker.js).
- Output: [measurements](live-noise-worker.js), [inspection](explore-ui.js), [graphics](babylon-city.js), and [replay](reflection-app.js).

- Output: [traffic preparation](population-worker.js) and [sound estimates](city-sound.js).

## Invariants

- Restart preserves inputs, camera and pause; clears interventions. Replay schedules treatments; Verify replay checks seeded state.
- Keep direct, reflected, and powered contributions distinguishable.
- Calculate finite travel time for moving sources.
- Do not steer passive returns toward a source's future position.
- Separate source, panel, and powered accounting.
- Do not equate a panel ledger with complete canyon energy conservation.
- Never prescribe cancellation or infer identity spectrally.
- Distinguish geometry, synthetic demand, propagation, and measured evidence.
- Treatments validate atomically with undo; histories bind observer/configuration and simulation time.
- Fictional stalls are opt-in, excluded from acoustic comparisons. Placing a mister enables them; cancellation changes nothing.
- Fictional events bind traffic/RPM/sound; no water-physics claims.
- Actor shadows: nearest 64 within 120 m; simulation remains complete.
- Cameras preserve traffic; comparisons retain traffic/time/observer.
- Population counts represent simulated individuals.
- Missing heights stay explicit; illustrative vegetation cannot shield sound.
- Picking preserves identity; measurements bind scenario, time, observer and configuration.

## Acceptance
- Evidence: [Legacy solver cases](../../../tests/motorcycle-noise.test.cjs).
- Evidence: [City reference cases](../../../tests/city-acoustic-reference.test.cjs).
- Evidence: [Measurement identity tests](../../../tests/measurement-contract.test.cjs).
- Evidence: [Local browser probes](../../../tools/simulatte/audit-runtime-motorcycle-start.mjs), [recovery injection](../../../tools/simulatte/audit-runtime-motorcycle-failures.mjs), and [snapshot replay](../../../tools/simulatte/audit-runtime-motorcycle-analysis.mjs).
- Calibration requires qualification.

## Non-goals
Hardware actuation, incapacitation, real vehicle interference, personal identification, or field-validation claims.

## Freedom
Any implementation is permitted while preserving these boundaries.
