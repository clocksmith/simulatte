# CATSCAN: Lucyd

Parent: [World](../CATSCAN.md)

## Target

Start blank, edit architectures with a persistent component rail, practice sourced interview prompts, and execute deterministic synthetic workloads at `/system-diagram`.

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
- Kernels require registered behaviour; subsystems lower version-pinned graphs.
- Typed external ports and bounded nesting required; recursion, invalid bindings and overrides refuse.
- Publishing preserves pins; upgrades require acceptance; accepted runs never mutate.
- Portable dependencies persist; folding changes presentation only.
- Distinguish requests, attempts and effects; show rejections, timeouts and dead letters.
- Diagram, seed and controls reproduce execution; previews equal coordinator state.
- Synthetic assumptions cannot establish production capacity, provider behaviour or physical validity.
- Deploy authenticated ciphertext only. Never publish keys/passwords. Encrypt saves, backups and exports; locking clears plaintext and editor history.
- Distinguish published interviews, candidate reports and authored practice; examples never replace user work implicitly.
- Explicit solution steps preserve user work; playback shows accepted execution records.

## Acceptance

- Evidence: [document tests](../../../tests/system-diagram-document.test.cjs), [session tests](../../../tests/system-diagram-session.test.cjs), [engine tests](../../../tests/system-diagram-engine.test.cjs), [kernel tests](../../../tests/system-diagram-kernels.test.cjs) and [browser journey](../../../tools/simulatte/audit-system-diagram-editor.mjs).
- Desktop/mobile journeys cover authoring, persistence, nesting, upgrades and execution.
- Nested chat tests verify topology-dependent outcomes and replay.

## Non-goals

Real outages, scraping, inference, consensus proofs, deployment or universal simulation.

## Freedom

Any implementation is permitted within these contracts.
