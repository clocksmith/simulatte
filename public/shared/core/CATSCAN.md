# CATSCAN: Shared simulation core

Parent: [Shared browser runtime](../CATSCAN.md)
## Target

Provide deterministic simulation primitives and pipeline lifecycle.

## Authority

- Owns small cross-profile simulation algorithms with explicit inputs and outputs.
- Point-motion and data-run paths are generated from the Blank library.
- Does not own profile policy, rendering, or plugin scheduling.

## Scope

- Applies to shared simulation code under `public/shared/core/`.

## Contracts

- Input: [shared contract charter](../contracts/CATSCAN.md)
- Output: [civil time primitive](simulation/civil-time.js)
- Output: [N-body primitive](simulation/n-body-propagation.js)
- Output: [pipeline adapter](pipeline-runner.js), [point motion](simulation/point-motion.js), and [data execution](simulation/data-run.js)

## Invariants

- Randomness and time derive from declared inputs.
- A reusable primitive does not authorize a domain claim.
- Stages consume exact predecessor output; cancelled or superseded work cannot publish.
- Point motion is constant velocity in 2D, not general physics; receipts do not imply scientific validation.

## Acceptance

- Reference fixtures remain deterministic and bounded.
- Evidence: [physics world compile tests](../../../tests/physics-world-compile.test.cjs).

## Non-goals

- Product policy, complete experiences, or hidden domain assumptions.

## Deterministic co-simulation authority

- `simulation/multirate-coordinator.js` owns logical time, stable ordering, typed-port exchange, checkpoints, branches, cancellation, and replay.
- `simulation/simulation-residency-manager.js` owns scope residency, causal suspension guards, checkpoints, and qualified fidelity branches.
- `simulation/worker-task-pool.js` owns task dispatch, stale-reply rejection, cancellation, crashes, and worker lifecycle, not commit authority.
- Modules retain numerical methods and private state behind declared lifecycle and port contracts.
- Rendering, workers, GPU dispatch, cameras, and Promise order cannot alter logical commit order.

## Freedom

Any implementation is permitted within these contracts.
