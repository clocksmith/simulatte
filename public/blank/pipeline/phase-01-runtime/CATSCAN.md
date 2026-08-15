# CATSCAN: Phase 1 Runtime

Component: `simulatte.create.phase1-runtime`
Parent: [Create compiler pipeline](../CATSCAN.md)
Target: Prove required models, indexes, caches, schemas, and providers before compilation starts.

## Authority

- Owns runtime readiness and provider, model, index, and cache receipts.
- Does not own language extraction or final semantics.

## Scope

- Applies to Phase 1 runtime gate code.

## Inputs

- [model runtime lock](../../../data/simulatte-embedder/model-runtime-lock.json)

## Outputs

- [Phase 2 language contract](../phase-02-language/CATSCAN.md)

## Invariants

- Missing required ML evidence blocks readiness.
- Cache readiness never substitutes for provider readiness.

## Acceptance

- Declared model identities and runtime dependencies resolve fail closed.
- Evidence: [model provenance tests](../../../../tests/doppler-model-provenance.test.cjs).

## Non-goals

- Parsing prompts or selecting scene content.

## Freedom

Any mechanism is permitted if it preserves these boundaries and passes the
acceptance evidence.

