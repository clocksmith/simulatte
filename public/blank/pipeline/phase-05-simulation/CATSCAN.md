# CATSCAN: Phase 5 Simulation

Parent: [Create compiler pipeline](../CATSCAN.md)
## Target

Lower grounded intent into executable physics, solver, state, control, and render-addressable artifacts.

## Authority

- Owns PhysicsIR, solver graph, renderIR, channels, controls, and readouts.
- Does not own visual composition or GPU drawing.

## Scope

- Compilation and solvers.

## Contracts

- Input: [Phase 4 grounded intent contract](../phase-04-grounded-intent/CATSCAN.md)
- Input: [WorldSpec runtime](simulatte-world-spec-runtime.js)
- Output: [Phase 6 visual contract](../phase-06-visual/CATSCAN.md)
- Output: [WorldProof simulation evidence](../../../shared/contracts/world-proof.js)
- Output: [fixed-step reproducibility execution](simulatte-simulation-reproducibility.js)
- Output: [typed interaction program and transition evidence](simulatte-interaction-ir.js)
- Output: [fixed-step safety-gate execution](simulatte-safety-proof.js)

## Invariants

- Activities remain separate from user InteractionIR. Version 2 executes bounded driven-body reactions and conservative depth-averaged liquid with transfer events. Active mutations reject; kinematics cannot qualify forces/liquids.
- Completed activities settle idle manipulation-only worlds; independent solvers and new forces continue execution.

- Solver support cannot invent intent.
- Render rows retain source evidence.
- Directed motion binds subject and target state channels using bounded planar steering, without cognition or collision physics.
- Solver receipts identify execution and reject missing/nonfinite state.
- Create owns WorldSpec determinism, dependency, and safety defaults; shared validators cannot invent them.
- Authored edits requalify runtime and recompile accepted sources; compatibility excludes stale bindings.
- WorldSpec preserves authoring, channels, visuals and Phase 6 bindings; contradictions reject. Snapshots bind exact WorldSpec/Phase 6.
- Reproducibility compares two fresh fixed-step runs with typed receipts.
- Commands retain program identity and recomputable transitions; no-ops prove nothing.
- Safety runs at every fixed-step checkpoint in two fresh executions; missing, blocking, or divergent decisions reject.

## Acceptance

- Evidence: [simulation compiler tests](../../../../tests/physical-compiler-simulation-visual.test.cjs).
- Evidence: [WorldSpec replay tests](../../../../tests/world-spec.test.cjs).
- Evidence: [WorldSpec projection tests](../../../../tests/world-spec-phase-projection.test.cjs).

## Non-goals

- Choosing camera composition or claiming physical validity beyond declared models.

## Freedom

Any implementation is permitted.
