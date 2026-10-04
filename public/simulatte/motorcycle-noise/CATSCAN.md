# CATSCAN: Motorcycle Noise

Parent: [World](../CATSCAN.md)

## Target
Observe autonomous traffic and viewpoint noise on NYC geometry.

## Authority
- Owns scenario traffic, acoustic calculations, measurements, graphics, and replay.
- Does not own WorldSpec identity, hardware, or enforcement.

## Scope
Babylon renders; Simulatte owns mathematics.

## Contracts
- Input: sourced [NYC geometry](nyc-map.json) and [scenario parameters](reflection-model.js).
- Output: [traffic trajectories](traffic-motion.js), [building paths](city-paths.js), [acoustic fields](acoustic-field.js), and [comparisons](reflection-worker.js).
- Output: [measurements](live-noise-worker.js), [inspection](explore-ui.js), [graphics](babylon-city.js), and [replay](reflection-app.js).

- Output: [traffic preparation](population-worker.js) and [sound estimates](city-sound.js).

## Invariants
- Keep direct, reflected, and powered contributions distinguishable.
- Calculate finite travel time for moving sources.
- Do not steer passive returns toward a source's future position.
- Separate source, panel, and powered accounting.
- Do not equate a panel ledger with complete canyon energy conservation.
- Never prescribe cancellation success or infer identity from a spectral peak.
- Distinguish geometry, synthetic demand, propagation, and measured evidence.
- Session treatment edits validate atomically and support undo. Histories bind observer/configuration identity and simulation time.
- Fictional stalls are opt-in and excluded from acoustic comparisons.
- Fictional events bind traffic, RPM, and sound without water-physics claims.
- Cameras cannot change traffic state. Comparisons retain traffic, time, and observer position.
- Population counts represent simulated individuals.
- Missing heights stay explicit; illustrative vegetation cannot shield sound.
- Picking preserves identity. Measurements bind scenario, time, observer, and configuration.

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
