# CATSCAN: Shared simulation core

Parent: [Shared browser runtime](../CATSCAN.md)
## Target

Provide deterministic simulation primitives reused by governed experiences.

## Authority

- Owns small cross-profile simulation algorithms with explicit inputs and outputs.
- Does not own profile policy, rendering, or plugin scheduling.

## Scope

- Applies to shared simulation code under `public/shared/core/`.

## Contracts

- Input: [shared contract charter](../contracts/CATSCAN.md)
- Output: [civil time primitive](simulation/civil-time.js)
- Output: [N-body primitive](simulation/n-body-propagation.js)

## Invariants

- Randomness and time derive from declared inputs.
- A reusable primitive does not authorize a domain claim.

## Acceptance

- Reference fixtures remain deterministic and bounded.
- Evidence: [physics world compile tests](../../../tests/physics-world-compile.test.cjs).

## Non-goals

- Coordinating complete experiences or hiding domain assumptions.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.

