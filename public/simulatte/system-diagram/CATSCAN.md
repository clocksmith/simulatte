# CATSCAN: World System Diagram Simulator

Parent: [World](../CATSCAN.md)

## Target

Expose `/system-diagram` as a system diagram editor whose drawn architecture runs as a deterministic distributed-compute simulation: drag configurable node classes, connect ports, run, inject faults and replay.

## Authority

- Owns the diagram document, class library packs, kernel behaviour, editor, run controls, overlays and metrics for this route.
- Shared coordinator owns logical rounds, checkpoints and ledger replay; World UI owns control geometry, menus, sheets, inspectors and metric presentation.
- Does not own Create compilation, live infrastructure or production capacity claims.

## Scope

`public/simulatte/system-diagram/` and `public/data/system-diagram/`.

## Contracts

- Input: [goals](../../../GOALS.md), [catalog](../../simulation-routes.js), [class library](../../data/system-diagram/class-library.json), [configuration](../../data/system-diagram/config.json) and [coordinator](../../shared/core/simulation/multirate-coordinator.js).
- Output: [contracts](../../../docs/simulatte/system-diagram.md), [document validator](diagram.js) and [library validator](class-library.js).

## Invariants

- The validated diagram document is the only simulation input; layout never changes results.
- Parameter values resolve kernel default, built-in class, user classes, instance; unknown or out-of-range values are rejected.
- Every class names a kernel with registered behaviour; unregistered kernels fail closed.
- Requests, attempts and effects remain separate records; rejected, timed-out and dead-lettered work stays visible.
- Diagram, seed and recorded controls reproduce the run exactly; display previews equal the authoritative coordinator state.
- Synthetic assumptions cannot establish production capacity, provider behaviour or physical validity.

## Acceptance

- Evidence: [document tests](../../../tests/system-diagram-document.test.cjs).
- Browser journeys cover drawing, connecting, configuring, running, faulting and replay on desktop and a narrow viewport, separately from human comprehension.

## Non-goals

Real outages, live scraping, real model inference, consensus protocol proofs, deployment or a universal simulation engine.

## Freedom

Any implementation is permitted within these contracts.
