# CATSCAN: Shared simulation core

Parent: [Shared browser runtime](../CATSCAN.md)
## Target

Provide deterministic simulation primitives reused by governed experiences.

## Authority

- Owns small cross-profile simulation algorithms with explicit inputs and outputs.
- Does not own profile policy, rendering, or plugin scheduling.

## Scope

- Applies to shared simulation code under `public/shared/core/`.

## Contracts

- Input: [shared contract charter](../contracts/CATSCAN.md)
- Output: [civil time primitive](simulation/civil-time.js)
- Output: [N-body primitive](simulation/n-body-propagation.js)

## Invariants

- Randomness and time derive from declared inputs.
- A reusable primitive does not authorize a domain claim.

## Acceptance

- Reference fixtures remain deterministic and bounded.
- Evidence: [physics world compile tests](../../../tests/physics-world-compile.test.cjs).

## Non-goals

- Owning product policy, rendering complete experiences, or hiding domain assumptions behind shared utilities.

## Deterministic co-simulation authority

- `simulation/multirate-coordinator.js` owns serial logical time, stable module ordering, latched typed-port exchange, checkpoint restoration, branching, cancellation, and exchange-ledger replay.
- `simulation/simulation-residency-manager.js` owns simulation-scope residency transitions, causal suspension guards, exact scope checkpoint records, and qualified fidelity branches at settled coordinator boundaries.
- `simulation/worker-task-pool.js` owns serializable task dispatch, stale-reply rejection, cancellation, crash boundaries, and worker lifecycle without granting workers logical-time or commit authority.
- Modules retain their numerical methods and private state. The coordinator receives only declared lifecycle operations and phase-two simulation-port and coupling-plan contracts.
- Render loops, workers, WebGPU dispatch, camera state, and Promise completion order cannot advance logical time or alter canonical commit order.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.
