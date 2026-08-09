---
catscan: 1
path: docs
owner: simulatte
contractNode: simulatte.docs
status: active
---

# Simulatte documentation

Documentation records product intent, architecture, experience contracts, evidence meaning, deployment procedures, and known gaps.
Runtime manifests and receipts remain authoritative for implementation and execution claims.

## API Surface

- product and operating instructions
- per-experience actor, job, controls, result, and non-claim contracts
- deployment, evidence, and bug-zapping guides
- generated folder-contract and judge-policy references

## Internal Dependencies

- `public/data/application-profiles/`
- `public/shared/plugins/`
- `tools/simulatte/`
- `tests/`

## External Dependencies

- None. External references must be explicitly cited and cannot replace local evidence.

## Validation

- `npm run catscan:check`
- `node --test tests/folder-contracts.test.cjs`
- `npm run folder-contracts:ci`

## Non-Claims

Prose is not a substitute for execution, browser, deployment, receipt, or human-review evidence.
