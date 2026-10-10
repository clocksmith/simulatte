# CATSCAN: Field experiments

Parent: [World](../CATSCAN.md)

## Target

Run Living Tissue, River Formation, and Crystal Foundry as inspectable standalone WorldSpec experiments with matched perturbation comparisons.

## Authority

- Owns configuration loading, selected-object actions, drawing, fixed-step playback, replay, export and verified reimport.
- Does not own numerical state evolution; declared models do.

## Scope

`public/simulatte/field-experiments/`.

## Contracts

- Input: [WorldSpec](../../shared/contracts/world-spec.js), [governed configurations](../../data/field-experiments/).
- Output: [program](program.js), [application](app.js), [drawing](drawing.js).

## Invariants

- Each experiment binds model, seed, fixed step, parameters and timestamped actions in WorldSpec.
- Both branches start identically; baseline receives no perturbations.
- Drawing and selection cannot alter numerical state or logical time.
- Reimport verifies identity and rejects unsupported contracts before execution.
- Conservation, numerical convergence, empirical calibration and human understanding remain separate qualifications.
- Tissue is a bounded center-based growth model, not a medical prediction or a complete Morpheus reproduction.
- River erosion uses accelerated morphological time, separately declared from water time.
- Crystal uses continuum phase-field solidification, not atomic motion or calibrated material prediction.

## Acceptance

- Evidence: [numerical and replay tests](../../../tests/field-experiments.test.cjs), [desktop/mobile journeys](../../../tools/simulatte/audit-field-experiments.mjs).

## Non-goals

A universal simulation engine, Create compiler changes, medical prediction or calibrated landscape/material forecasts.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the acceptance evidence.
