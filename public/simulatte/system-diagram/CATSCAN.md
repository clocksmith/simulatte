# CATSCAN: World System Diagram Simulator

Parent: [World](../CATSCAN.md)

## Target

Make `/system-diagram` an architecture editor: connect components, save and nest versioned subsystems, execute deterministic synthetic workloads, inject faults and replay.

## Authority

- Owns documents, subsystem lowering, classes, kernels, editor, controls and observations.
- Shared coordinator owns rounds, checkpoints and replay; World UI owns controls.
- Does not own Create compilation or live infrastructure.

## Scope

`public/simulatte/system-diagram/` and `public/data/system-diagram/`.

## Contracts

- Input: [goals](../../../GOALS.md), [catalog](../../simulation-routes.js), [class library](../../data/system-diagram/class-library.json), [configuration](../../data/system-diagram/config.json) and [coordinator](../../shared/core/simulation/multirate-coordinator.js).
- Output: [contracts](../../../docs/simulatte/system-diagram.md), [document validator](diagram.js) and [library validator](class-library.js).

## Invariants

- Validated documents alone determine execution; layout never changes results.
- Parameters resolve kernel, built-in class, user classes, then instance; unknown or invalid values refuse.
- Primitive kernels require registered behaviour. Subsystems lower version-pinned internal graphs, never placeholder kernels.
- Definitions expose typed external ports and bounded nesting. Recursive dependencies, invalid bindings and invalid overrides refuse.
- Publishing preserves version pins. Explicit upgrades remain pending until acceptance; accepted runs never mutate.
- Portable documents retain dependencies. Folding remains presentation, not executable composition.
- Requests, attempts and effects remain separate; rejected, timed-out and dead-lettered work stays visible.
- Diagram, seed and controls reproduce execution; previews equal coordinator state.
- Synthetic assumptions cannot establish production capacity, provider behaviour or physical validity.

## Acceptance

- Evidence: [document tests](../../../tests/system-diagram-document.test.cjs), [session tests](../../../tests/system-diagram-session.test.cjs), [engine tests](../../../tests/system-diagram-engine.test.cjs), [kernel tests](../../../tests/system-diagram-kernels.test.cjs) and [browser journey](../../../tools/simulatte/audit-system-diagram-editor.mjs).
- Desktop and narrow-viewport journeys cover drawing, saving, reuse, nesting, upgrades, running, faulting and replay; human comprehension remains separate.
- Nested chat-backend tests demonstrate topology-dependent outcomes and deterministic replay.

## Non-goals

Real outages, live scraping, real model inference, consensus protocol proofs, deployment or a universal simulation engine.

## Freedom

Any implementation is permitted within these contracts.
