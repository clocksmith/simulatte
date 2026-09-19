# INTENT: Simulatte

Parent: none

## Need

Creators and engineers need to compose, simulate, and edit interactive browser worlds from data and natural language without opaque cloud generators, locked formats, or speculative physical claims.

## Target

Deliver an inspectable browser simulation platform and prompt-to-pixels compiler where people prepare an editable `WorldSpec`, execute deterministic simulations, inspect evidence, and export replayable worlds.

## Invariants

- The hexagon chooser homepage remains the product entrypoint; data tools extend it without displacing it.
- Prompt compilation follows the strict eight-phase pipeline; each phase consumes only its declared predecessor artifact.
- Authoring retains user edits over recompilation inferences through an append-only authoring graph.
- Free local execution is a complete product outcome requiring no account, network dependency, or model download for supported workflows.
- Unsupported requirements fail closed with explicit receipts; scene rendering never fabricates dynamic truth.

## Evidence

- Passing CATSCAN charter verification via `npm run catscan:check`.
- Passing folder-contract closure via `npm run folder-contracts:check`.
- Deterministic simulation and unit test suites via `npm run check:fast`.

## Non-goals

- General-purpose 3D asset creation software or cinematic video rendering.
- Unconstrained cloud generative chatbots or unverified scientific solvers.

## Truth

Execution receipts, deterministic replay, and pixel-obligation settlement govern claims. Documentation and passing syntax checks do not substitute for browser runtime evidence.

---

Links:
- Root strategy: [GOALS.md](GOALS.md)
- Technical charter: [CATSCAN.md](CATSCAN.md)
