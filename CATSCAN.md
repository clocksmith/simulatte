---
catscan: 1
path: .
owner: simulatte
contractNode: simulatte.root
status: active
---

# Simulatte

Simulatte turns declared human intent into deterministic simulation state, browser-rendered pixels, and bounded evidence. The
folder contract at `docs/simulatte/folder-contract.json` is the executable ownership and validation authority; this file is the
concise architecture map supplied to humans and local judges.

## API Surface

- `public/` World and Blank browser products
- `tools/` deterministic builders, audits, servers, and contract runners
- `tests/` phase, browser, data, and architecture checks
- `docs/` product, experience, evidence, and deployment contracts
- `npm run check:fast` source and folder-contract gate

## Internal Dependencies

- `public/` depends on declared `public/data`, `public/shared`, and platform contracts.
- `tools/` produces or verifies generated data, receipts, and browser evidence.
- `tests/` verifies source boundaries and declared runtime behavior.
- `docs/` defines intent and evidence boundaries but never proves runtime behavior alone.

## External Dependencies

- Firebase Hosting for deployment.
- Browser WebGPU and the pinned Doppler development lane where a profile requires model execution.

## Validation

- `npm run catscan:check`
- `npm run folder-contracts:ci`
- `npm run check:fast`
- `git diff --check`

## Non-Claims

Source, documentation, screenshots, or a local judge receipt do not by themselves prove deployment, scientific truth, or human visual
acceptance.
