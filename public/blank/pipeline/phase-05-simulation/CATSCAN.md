# CATSCAN: Phase 5 Simulation

Component: `simulatte.create.phase5-simulation`
Parent: [Create compiler pipeline](../CATSCAN.md)
Target: Lower grounded intent into executable physics, solver, state, control, and render-addressable artifacts.

## Authority

- Owns PhysicsIR, solver graph, renderIR, channels, controls, and readouts.
- Does not own visual composition or GPU drawing.

## Scope

- Applies to Phase 5 simulation compilation and solver code.

## Inputs

- [Phase 4 grounded intent contract](../phase-04-grounded-intent/CATSCAN.md)

## Outputs

- [Phase 6 visual contract](../phase-06-visual/CATSCAN.md)

## Invariants

- Solver support does not masquerade as prompt-visible intent.
- Render-addressable rows retain source evidence.

## Acceptance

- Compiled simulations satisfy solver and state-transition fixtures.
- Evidence: [simulation compiler tests](../../../../tests/physical-compiler-simulation-visual.test.cjs).

## Non-goals

- Choosing camera composition or claiming physical validity beyond declared models.

## Freedom

Any mechanism is permitted if it preserves these boundaries and passes the
acceptance evidence.

