# CATSCAN: World System Diagram Simulator

Parent: [World](../CATSCAN.md)

## Target

Expose `/system-diagram` as a distinct catalog simulation for executable node, cluster and link authoring, with bounded failure, redelivery and repair experiments.

## Authority

- Owns architecture editing, task/resource semantics, request causation and orchestration.
- Shared coordinator owns logical scheduling, checkpoints and replay; World UI owns controls and inspection styling.
- Does not own Create compilation, broader pack qualification or live infrastructure.

## Scope

`public/simulatte/distributed-repair/`.

## Contracts

- Input: [goals](../../../GOALS.md), [catalog](../../simulation-routes.js), [profile](../../data/distributed-repair/system-diagram-profile-v1.json) and [validator](profile.js).
- Input: [architecture](../../data/distributed-repair/architecture.schema.json), [configuration](../../data/distributed-repair/config.json), [WorldSpec](../../shared/contracts/world-spec.js) and [coordinator](../../shared/core/simulation/multirate-coordinator.js).
- Output: [page](index.html), [model](model.js), [runner](runner.js) and [roadmap](../../../docs/simulatte/distributed-workload-workbench.md).

## Invariants

- Canonical/legacy URLs resolve one declared profile; catalog owns homepage navigation.
- Pending edits cannot mutate accepted execution. Connections and groups affect computation, not only drawing.
- Requests, attempts, ownership, resources and effects remain separate records.
- Integrate remaining work before capacity/contention changes; fence stale completions by generation.
- Checkpoints retain pending events/deliveries, RNG, leases, retries, ownership and resource state.
- Rejected, unfinished and dead-letter requests stay visible. Inspectors consume model blockers and causation.
- Synthetic results cannot establish production capacity or physical validity.

## Acceptance

- Evidence: [model/authoring tests](../../../tests/distributed-repair.test.cjs), [catalog/profile tests](../../../tests/simulation-catalog.test.cjs), [coordinator tests](../../../tests/multirate-coordinator.test.cjs), and [browser journey](../../../tools/simulatte/audit-distributed-repair.mjs).
- Verify replay, checkpoint equivalence, conservation and navigation separately from human comprehension.

## Non-goals

General consensus/replication, real outages, scraping, clinical decisions, financial transactions, deployment or universal simulation.

## Freedom

Any implementation is permitted within these contracts.
