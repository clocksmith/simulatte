# CATSCAN: World build and evidence tools

Parent: [Repository tools](../CATSCAN.md)
## Target

Promote source snapshots, compile governed World data, and capture browser evidence through reproducible commands.

## Authority

- Owns World data builders, data checks, browser harnesses, and profile evidence capture.
- Does not own external source truth, product policy, or live deployment status.

## Scope

- Applies to World-specific tools under `tools/simulatte/`.

## Contracts

- Input: [data ingestion contract](../../docs/simulatte/data-ingestion.md)
- Input: [governed data charter](../../public/data/CATSCAN.md)
- Output: [NYC world builder](build-nyc-autonomy-world.mjs)
- Output: [profile evidence contract](profile-evidence-contract.mjs)

## Invariants

- Promoted data retains immutable source receipts.
- Browser claims bind source, build, route, device, and screenshot identity.

## Acceptance

- Data immutability and evidence contract fixtures pass.
- Evidence: [autonomy artifact immutability tests](../../tests/autonomy-artifact-immutability.test.cjs).

## Non-goals

- Treating a fetched snapshot as activated data or a local screenshot as deployment proof.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.

