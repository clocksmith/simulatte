# CATSCAN: Motorcycle Noise

Parent: [World](../CATSCAN.md)

## Target
Observe autonomous city traffic and viewpoint-linked noise; compare distribution, redirection, and cancellation on NYC geometry.

## Authority
- Owns scenario traffic, acoustic calculations, measurements, graphics, and replay.
- Does not own WorldSpec identity, hardware, or enforcement.

## Scope
Motorcycle Noise only. Babylon renders; Simulatte owns simulation time and mathematics.

## Contracts
- Input: sourced [NYC geometry](nyc-map.json) and [scenario parameters](reflection-model.js).
- Output: [traffic trajectories](traffic-motion.js), [building paths](city-paths.js), [acoustic fields](acoustic-field.js), and [comparisons](reflection-worker.js).
- Output: [measurements](live-noise-worker.js), [inspection](explore-ui.js), [graphics](babylon-city.js), and [replay](reflection-app.js).

- Output: [traffic preparation](population-worker.js) and [sound estimates](city-sound.js).

## Invariants
- Keep direct, reflected, and powered contributions distinguishable.
- Calculate finite travel time against moving source trajectories.
- Do not steer passive returns toward a source's future position.
- Separate source accounting, panel interception, and powered input.
- Do not equate a panel ledger with complete canyon energy conservation.
- Never prescribe cancellation success or infer identity from a spectral peak.
- Distinguish sourced geometry, synthetic demand, approximate propagation, and measured evidence.
- Cameras cannot change traffic state. Comparisons retain traffic, time, and observer position.
- Population counts represent simulated individuals.
- Missing building heights remain explicit; illustrative vegetation cannot become an acoustic barrier.
- Picking and physics share entity identity. Measurements bind scenario, time, observer, and configuration.

## Acceptance
- Evidence: [Earlier analytical cases](../../../tests/motorcycle-noise.test.cjs) cover the older solver only.
- Evidence: [City reference cases](../../../tests/city-acoustic-reference.test.cjs) check paths, convergence, waveform agreement, and learned control.
- Evidence: [Measurement identity tests](../../../tests/measurement-contract.test.cjs) reject stale scenario, observer, and configuration responses.
- Evidence: [Local browser probes](../../../tools/simulatte/audit-runtime-motorcycle-start.mjs), [recovery injection](../../../tools/simulatte/audit-runtime-motorcycle-failures.mjs), and [snapshot replay](../../../tools/simulatte/audit-runtime-motorcycle-analysis.mjs) qualify browser behavior.
- Empirical calibration, uncertainty, and physical devices require separate qualification.

## Non-goals
Hardware actuation, incapacitation, vehicle interference, personal identification, or field-validation claims.

## Freedom
Any implementation is permitted while preserving these boundaries.
