---
catscan: 1
path: tools
owner: simulatte
contractNode: simulatte.tools
status: active
---

# Simulatte tools

Tools compile governed data, serve local browser surfaces, run deterministic audits, collect receipts, and validate release
boundaries. They do not become hidden runtime authorities.

## API Surface

- data and manifest builders
- browser smoke and profile-evidence runners
- folder-contract checker, synchronizer, and judge bundle runner
- release, deployment, and artifact checks

## Internal Dependencies

- `public/data/` manifests and source indexes
- `tests/` contracts and focused regression lanes
- `docs/simulatte/folder-contract.json`

## External Dependencies

- Node.js 22
- Chromium for browser evidence
- Firebase CLI for deployment commands

## Validation

- `npm run catscan:check`
- `npm run folder-contracts:ci`
- `npm test`

## Non-Claims

Tool output is evidence only when its receipt binds source, build, inputs, and execution identity.
