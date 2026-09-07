# CATSCAN: Phase 3 Retrieval

Parent: [Create compiler pipeline](../CATSCAN.md)
## Target

Retrieve and rerank high-recall candidate knowledge with explicit provenance and rejection evidence.

## Authority

- Owns queries, candidate retrieval, reranking, and activation fusion.
- Does not own final semantic acceptance or visual layout.

## Scope

- Applies to Phase 3 retrieval and reranking code.

## Contracts

- Input: [Phase 2 language contract](../phase-02-language/CATSCAN.md)
- Output: [Phase 4 grounded intent contract](../phase-04-grounded-intent/CATSCAN.md)

## Invariants

- Raw retrieval and fused activation remain separate artifacts.
- Typed filters cannot silently remove a valid candidate.
- Every valid query-plan slot is retained. Embedding batch limits bound calls, not prompt coverage.
- Model proposals retain their slot identity and vector provenance. Lexical differences do not erase a bound semantic proposal; Phase 4 owns acceptance.

## Acceptance

- False-positive and false-negative probes retain deterministic ordering and provenance.
- Evidence: [pipeline model selection tests](../../../../tests/pipeline-model-selection.test.cjs).

## Non-goals

- Declaring candidate evidence to be semantic truth.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.
