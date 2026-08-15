# CATSCAN: Governed browser data

Parent: [Browser surface](../CATSCAN.md)
## Target

Supply versioned, validated, provenance-bound data and manifests to browser runtimes.

## Authority

- Owns public manifests, schemas, indexes, governed datasets, and activation references.
- Does not own source acquisition policy or runtime semantic decisions.

## Scope

- Applies to canonical deployable data under `public/data/`.

## Contracts

- Input: [data ingestion contract](../../docs/simulatte/data-ingestion.md)
- Output: [World autonomy manifest](simulatte/autonomy-manifest.json)
- Output: [profile charter](application-profiles/CATSCAN.md)

## Invariants

- Generated data comes from declared generators.
- Missing hashes, provenance, or schema identity remain explicit.

## Acceptance

- Model and domain data pass shape, reference, and integrity checks.
- Evidence: [model data shape tests](../../tests/js-shape-model-data.test.cjs).

## Non-goals

- Fetching mutable external state from browser runtime paths.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.

