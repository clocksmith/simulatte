# CATSCAN: Improvement evidence

Component: `simulatte.tools.samer.evidence`
Parent: [Improvement control plane](../CATSCAN.md)
Target: Retain immutable, replayable candidate evaluations without converting diagnostic leaders into promotions.

## Authority

- Owns stored trial, prediction, frontier, and opening-receipt artifacts.
- Does not own candidate execution, production activation, or human acceptance.

## Scope

- Applies to retained evidence under `tools/samer/evidence/`.

## Inputs

- [model evidence contract](model-selection/README.md)

## Outputs

- [classification frontier](model-selection/classification-v1/frontier.json)

## Invariants

- Evidence binds population, candidate, control, policy, and source identity.
- Failed candidates remain inspectable.

## Acceptance

- Evidence registries verify hashes, completeness, and promotion status.
- Evidence: [model selection calibration tests](../../../tests/model-selection-calibration.test.cjs).

## Non-goals

- Rewriting historical evidence to match a current candidate.

## Freedom

Any mechanism is permitted if it preserves these boundaries and passes the
acceptance evidence.

