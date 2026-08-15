# CATSCAN: Improvement evidence

Parent: [Improvement control plane](../CATSCAN.md)
## Target

Retain immutable, replayable candidate evaluations without converting diagnostic leaders into promotions.

## Authority

- Owns stored trial, prediction, frontier, and opening-receipt artifacts.
- Does not own candidate execution, production activation, or human acceptance.

## Scope

- Applies to retained evidence under `tools/samer/evidence/`.

## Contracts

- Input: [model evidence contract](model-selection/README.md)
- Output: [classification frontier](model-selection/classification-v1/frontier.json)

## Invariants

- Evidence binds population, candidate, control, policy, and source identity.
- Failed candidates remain inspectable.

## Acceptance

- Evidence registries verify hashes, completeness, and promotion status.
- Evidence: [model selection calibration tests](../../../tests/model-selection-calibration.test.cjs).

## Non-goals

- Rewriting historical evidence to match a current candidate.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.

