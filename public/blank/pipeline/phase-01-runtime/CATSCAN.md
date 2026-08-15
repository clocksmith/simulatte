# CATSCAN: Phase 1 Runtime

Parent: [Create compiler pipeline](../CATSCAN.md)
## Target

Prove required models, indexes, caches, schemas, and providers before compilation starts.

## Authority

- Owns runtime readiness and provider, model, index, and cache receipts.
- Does not own language extraction or final semantics.

## Scope

- Applies to Phase 1 runtime gate code.

## Contracts

- Input: [model runtime lock](../../../data/simulatte-embedder/model-runtime-lock.json)
- Output: [Phase 2 language contract](../phase-02-language/CATSCAN.md)

## Invariants

- Missing required ML evidence blocks readiness.
- Cache readiness never substitutes for provider readiness.

## Acceptance

- Declared model identities and runtime dependencies resolve fail closed.
- Evidence: [model provenance tests](../../../../tests/doppler-model-provenance.test.cjs).

## Non-goals

- Parsing prompts or selecting scene content.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.

