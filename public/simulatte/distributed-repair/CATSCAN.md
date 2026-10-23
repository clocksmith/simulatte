# CATSCAN: World System Diagram Simulator

Parent: [World](../CATSCAN.md)

## Target

Make `/system-diagram` a canvas-first architecture creator with executable typed
connections, reusable node classes, instance overrides and inspectable simulation.

## Authority

- Owns editing, payload compatibility, bounded workload execution and causation.
- The v2 graph runtime owns discrete-event scheduling and checkpoints; the legacy repair runner retains shared coordinator ownership.
- World UI owns control and inspector design.
- Does not own Create compilation, live infrastructure or empirical qualification.

## Scope

`public/simulatte/distributed-repair/`.

## Contracts

- Input: [goals](../../../GOALS.md), [catalog](../../simulation-routes.js), [profile](../../data/distributed-repair/system-diagram-profile-v1.json) and [v2 document schema](../../data/distributed-repair/system-diagram.schema.json).
- Output: [document](graph-document.js), [runtime](graph-runtime.js), [canvas](graph-canvas.js), [page](index.html) and [editor contract](../../../docs/simulatte/system-diagram-editor.md).
- Compatibility: [legacy architecture](architecture.js), [repair model](model.js), [runner](runner.js) and [coordinator](../../shared/core/simulation/multirate-coordinator.js).

## Invariants

- Catalog owns navigation; canonical/legacy paths resolve the declared profile.
- Classes own defaults; instance overrides remain explicit. Typed links determine execution.
- Pending edits never mutate accepted execution; validation precedes explicit restart.
- Stable identities survive edits, undo/redo and save/load.
- Requests, attempts, committed effects and causal histories remain distinct.
- Checkpoints retain pending events, ordering, retries, resource ownership and RNG state.
- Rejected, unfinished and failed work stays visible. Inspectors read model records.
- Synthetic transformations, replica deliveries and timing do not prove AI accuracy, consensus, durability or production capacity.

## Acceptance

- Evidence: [graph model tests](../../../tests/system-diagram-model.test.cjs), [legacy repair tests](../../../tests/distributed-repair.test.cjs) and [navigation tests](../../../tests/simulation-catalog.test.cjs).
- Verify model replay/checkpoints, desktop/touch interactions and invalid-edit feedback separately from empirical calibration or unfamiliar-user comprehension.

## Non-goals

Universal protocols, real outages, scraping, paid AI calls, clinical decisions,
financial transactions or deployment.

## Freedom

Any implementation is permitted within these contracts.
