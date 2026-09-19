# INTENT: Simulatte

Parent: none

## Need

Creators and engineers need focused browser simulation products that can share
reliable execution machinery without merging their interfaces, domain policy,
or evidence claims.

## Target

Deliver separate, inspectable browser products for governed simulation,
data-driven worlds, and prompt-to-pixels compilation. They share a small
browser-native core for explicit contracts, bounded execution, cancellation,
and replayable results.

## Invariants

- The hexagon chooser homepage remains the product entrypoint; data tools extend it without displacing it.
- Blank/Create and World remain separate products; shared code owns no page lifecycle or domain policy.
- Product dependencies point inward through documented core entrypoints and injected adapters.
- Prompt compilation follows the strict eight-phase pipeline; each phase consumes only its declared predecessor artifact.
- Authoring retains user edits over recompilation inferences through an append-only authoring graph.
- Free local execution is a complete product outcome requiring no account, network dependency, or model download for supported workflows.
- Unsupported requirements fail closed with explicit receipts; scene rendering never fabricates dynamic truth.

## Evidence

- Passing CATSCAN charter verification via `npm run catscan:check`.
- Passing folder-contract closure via `npm run folder-contracts:check`.
- Deterministic simulation and unit test suites via `npm run check:fast`.
- Installed shared-core consumption via `npm run check:blank-core`.

## Non-goals

- General-purpose 3D asset creation software or cinematic video rendering.
- Unconstrained cloud generative chatbots or unverified scientific solvers.
- A single application shell that makes every simulation product inherit Blank's workflow.

## Truth

Execution receipts, deterministic replay, and pixel-obligation settlement govern claims. Documentation and passing syntax checks do not substitute for browser runtime evidence.

---

Links:
- Root strategy: [GOALS.md](GOALS.md)
- Technical charter: [CATSCAN.md](CATSCAN.md)
