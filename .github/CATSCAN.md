# CATSCAN: Release automation

Parent: [Simulatte](../CATSCAN.md)

## Target

Run declared release and audit gates without turning CI status into runtime proof.

## Authority

- Owns workflow triggers, gate ordering, and published CI status.
- Does not own runtime correctness, browser pixels, or deployment credentials.

## Scope

- Applies to workflows and repository automation under `.github/`.

## Contracts

- Input: [deployment contract](../docs/deployment.md).
- Output: [release audit workflow](workflows/release-audit.yml).

## Invariants

- A skipped required gate is not a passing gate.
- Local checks and deployment evidence remain separate.

## Acceptance

- Workflow references resolve to declared package commands.
- Evidence: [hosting surface tests](../tests/hosting-surfaces.test.cjs).

## Non-goals

- Defining product intent or silently weakening release criteria.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.
