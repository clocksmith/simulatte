# CATSCAN: World distributed repair compatibility experiment

Parent: [World](../CATSCAN.md)

## Target

Preserve the original bounded lease, redelivery and repair experiment at `repair.html`.
The [System Diagram Simulator](../system-diagram/CATSCAN.md) owns `/system-diagram`.

## Authority

- Owns the legacy task architecture, failure experiment and causal records.
- Shared coordinator owns logical scheduling, checkpoints and replay.
- Does not own the canonical diagram document, editor, class library or new kernels.

## Scope

`public/simulatte/distributed-repair/`.

## Contracts

- Input: [configuration](../../data/distributed-repair/config.json), [architecture](architecture.js) and [coordinator](../../shared/core/simulation/multirate-coordinator.js).
- Output: [compatibility page](repair.html), [model](model.js) and [runner](runner.js).

## Invariants

- Pending changes never mutate accepted execution.
- Requests, attempts, ownership and committed effects remain distinct.
- Resource work and stale completions retain their original causal fences.
- Checkpoints preserve pending events, retries, RNG and ownership.
- Rejected and unfinished requests remain inspectable.
- Synthetic estimates are not production measurements.

## Acceptance

- Evidence: [repair tests](../../../tests/distributed-repair.test.cjs) and [coordinator tests](../../../tests/multirate-coordinator.test.cjs).

## Non-goals

Canonical system diagram ownership, live infrastructure or universal simulation.

## Freedom

Any implementation is permitted within these boundaries.
