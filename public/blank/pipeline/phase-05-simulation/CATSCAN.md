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

- Solver support does not masquerade as prompt-visible intent.
- Render-addressable rows retain source evidence.
- Directed motion binds subject and target state channels using bounded planar steering, without cognition or collision physics.
- Solver receipts name executed operators and reject missing or non-finite state.
- Create owns WorldSpec determinism, dependency, and safety defaults; shared validators cannot invent them.
- Authored requests validate sources and program identity, requalify runtime, and recompile accepted edits. Synchronous compatibility projects sources without stale bindings.
- WorldSpec projections preserve authoring, channels, visuals, and Phase 6 bindings; contradictions reject. Render snapshots bind WorldSpec and exact Phase 6.
- Simulation reproducibility uses two fresh states, declared fixed-step policy, and a typed state comparison receipt.
- Every applied interaction command retains its program identity and recomputable before/after state; a no-op cannot prove a transition.
- Declared safety rules execute at every fixed-step checkpoint in two fresh runs; missing, blocking, or divergent decisions fail closed.

## Acceptance

- Compiled simulations satisfy solver and state-transition fixtures.
- Evidence: [simulation compiler tests](../../../../tests/physical-compiler-simulation-visual.test.cjs).
- Evidence: [WorldSpec replay tests](../../../../tests/world-spec.test.cjs).
- Evidence: [WorldSpec projection tests](../../../../tests/world-spec-phase-projection.test.cjs).

## Non-goals

- Choosing camera composition or claiming physical validity beyond declared models.

## Freedom

Any implementation is permitted within these contracts and acceptance evidence.
