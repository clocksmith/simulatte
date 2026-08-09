---
catscan: 1
path: tests
owner: simulatte
contractNode: simulatte.tests
status: active
---

# Simulatte tests

Tests are the executable type system for phase boundaries, data contracts, plugin ownership, browser behavior, and evidence
integrity.

## API Surface

- unit and shape tests for compiler and runtime phases
- plugin and data contract tests
- browser and pixel evidence audits
- folder-contract coverage and import-boundary tests

## Internal Dependencies

- `public/` runtime and governed data
- `tools/` deterministic checkers and evidence helpers
- `docs/` declared experience and claim contracts

## External Dependencies

- Node.js test runner
- Chromium and WebGPU where a browser lane is declared

## Validation

- `node --test tests/folder-contracts.test.cjs`
- `npm test`
- The affected node's deterministic commands from the folder contract.

## Non-Claims

A passing source test does not prove deployed behavior, visual recognizability, or human adjudication.
