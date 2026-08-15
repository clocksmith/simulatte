# CATSCAN: Autonomy surface

Parent: [World](../CATSCAN.md)
## Target

Expose the governed city autonomy experience through the World runtime contracts.

## Authority

- Owns the compatibility entrypoint for city autonomy.
- Does not own general World profile architecture or source data promotion.

## Scope

- Applies to the autonomy entrypoint under `public/simulatte/autonomy/`.

## Contracts

- Input: [autonomy manifest](../../data/simulatte/autonomy-manifest.json)
- Output: [autonomy page](index.html)

## Invariants

- The entrypoint uses governed World state and does not fork policy.
- Unavailable required data blocks execution.

## Acceptance

- Autonomy fixtures preserve routing, safety, lifecycle, and receipt behavior.
- Evidence: [autonomy tests](../../../tests/autonomy.test.cjs).

## Non-goals

- Creating a separate product or hidden compatibility implementation.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.

