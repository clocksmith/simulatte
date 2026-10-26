# CATSCAN: World System Diagram Simulator

Parent: [World](../CATSCAN.md)

## Target

Edit architectures, nest versioned subsystems, execute deterministic synthetic workloads, inject faults and replay at `/system-diagram`.

## Authority

- Owns documents, lowering, classes, kernels, editing and observations.
- Shared coordinator owns rounds, checkpoints and replay; World UI owns controls.
- Owns encrypted notes and practice diagrams; 256one retains career source records.
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
- Typed external ports and bounded nesting required; recursion, invalid bindings and overrides refuse.
- Publishing preserves version pins. Explicit upgrades remain pending until acceptance; accepted runs never mutate.
- Portable dependencies persist; folding changes presentation only.
- Separate requests, attempts and effects; keep rejected, timed-out and dead-lettered work visible.
- Diagram, seed and controls reproduce execution; previews equal coordinator state.
- Synthetic assumptions cannot establish production capacity, provider behaviour or physical validity.
- Deploy authenticated ciphertext only. Never publish keys/passwords. Encrypt saves, backups and exports; locking clears plaintext and editor history.
- Starters certify neither interviews nor production designs.

## Acceptance

- Evidence: [document tests](../../../tests/system-diagram-document.test.cjs), [session tests](../../../tests/system-diagram-session.test.cjs), [engine tests](../../../tests/system-diagram-engine.test.cjs), [kernel tests](../../../tests/system-diagram-kernels.test.cjs) and [browser journey](../../../tools/simulatte/audit-system-diagram-editor.mjs).
- Desktop/mobile journeys cover authoring, persistence, nesting, upgrades and execution; human comprehension stays separate.
- Nested chat tests verify topology-dependent outcomes and replay.

## Non-goals

Real outages, live scraping, real model inference, consensus protocol proofs, deployment or a universal simulation engine.

## Freedom

Any implementation is permitted within these contracts.
