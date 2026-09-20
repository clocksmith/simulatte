# CATSCAN: Motorcycle Noise

Parent: [World](../CATSCAN.md)

## Target
Compare motorcycle-group sound and non-disabling mitigation through inspectable
pressure propagation, receiver measurements and uncertain synthetic sensing.

## Authority
- Owns the domain WorldSpec adapter, acoustic solver, sensor experiment and page.
- Uses shared WorldSpec hashing/authorship.
- Does not own generic contracts, Create compilation or deployment authority.
- Owns prescribed trajectories, not a validated traffic model.

## Scope
This directory and its static entrypoint.

## Contracts
- Input: [declared scenario](scenario.json).
- Output: [simulation](simulation.js), [measurements](signal.js), [page](index.html).
- Output: signed simulated event records with parameters, units and model identity.

## Invariants
- Propagation uses three-dimensional distance and finite travel time.
- Active control sums signed pressures through secondary acoustic paths.
- Causal control sees microphone observations only; ideal control is labeled separately.
- Metrics bind location, interval, weighting and solver assumptions.
- Source truth belongs to evaluation, never localization or recognition.
- Playback starts muted and shares one bounded gain across comparisons.
- Engine disabling and claims of violation proof are excluded.
- Frame rate cannot change physical time; imports are bounded and validated.

## Acceptance
- Analytical propagation, energy, interference and causality checks pass.
- Ambiguous sensing abstains; replay and signed-record tampering are tested.
- Evidence: [domain tests](../../../tests/motorcycle-noise.test.cjs) and desktop/mobile browser captures.

## Non-goals
Calibrated real-world prediction, city-scale wave solving, identity enforcement,
or signatures as proof of physical truth.

## Freedom
Any implementation is permitted if it preserves declared numerical assumptions,
authority boundaries and acceptance evidence.
