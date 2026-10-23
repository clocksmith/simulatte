# CATSCAN: World distributed repair experiment

Parent: [World](../CATSCAN.md)

## Target

Author an executable bounded task architecture, then inspect and reproduce result-store failure, lease redelivery, duplicate computation and repair under paired delivery policies.

## Authority

- Owns this World experiment's architecture editor, task/resource model, request causal records and session orchestration.
- Uses the shared multirate coordinator for logical scheduling, checkpointing and replay.
- Uses shared World UI for controls and inspection; does not own control styling.
- Does not own Create compilation, broader workload-pack qualification or live infrastructure.

## Scope

`public/simulatte/distributed-repair/`.

## Contracts

- Input: [goals](../../../GOALS.md), including the explicitly authorized bounded milestone.
- Input: [architecture schema](../../data/distributed-repair/architecture.schema.json) and [model configuration](../../data/distributed-repair/config.json).
- Input: [WorldSpec](../../shared/contracts/world-spec.js) binds accepted architecture, policy, seed and configuration.
- Input: [coordinator](../../shared/core/simulation/multirate-coordinator.js).
- Output: [World page](index.html), [model](model.js) and [runner](runner.js).
- Output: [design and pack roadmap](../../../docs/simulatte/distributed-workload-workbench.md).

## Invariants

- Pending architecture edits cannot mutate an accepted running revision.
- Graph connections and resource groups change execution, not just drawing.
- Logical requests, delivery attempts, resource ownership and committed effects are separate records.
- Remaining work is integrated before capacity or contention changes; stale completion generations cannot finish new work.
- Checkpoints retain pending deliveries/events, RNG, leases, retry counts and resource state.
- Rejected, unfinished and dead-letter requests remain inspectable; inspectors derive blockers and causation from model state.
- Synthetic results never establish production throughput, empirical hardware capacity or proprietary platform behavior.

## Acceptance

- Evidence: [model and authoring tests](../../../tests/distributed-repair.test.cjs).
- Evidence: [coordinator tests](../../../tests/multirate-coordinator.test.cjs).
- Evidence: [desktop/mobile browser journey](../../../tools/simulatte/audit-distributed-repair.mjs).
- Exact replay, checkpoint equivalence, task/memory/GPU-work conservation, invalid edits and request causation are checked separately from human comprehension.

## Non-goals

General replication/consensus, real mesh outages, scraping, clinical decisions, financial transactions, deployment, or a universal simulator.

## Freedom

Any implementation is permitted within these contracts.
