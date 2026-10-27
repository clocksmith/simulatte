# CATSCAN: Lucyd deployment extension

Parent: [Lucyd](../CATSCAN.md)

## Target

Compile explicitly bound Lucyd architectures into inspectable deployment bundles.

## Authority

- Owns optional deployment bindings, source-bound export and implementation contracts.
- Does not own document validation, kernels or synthetic execution; the simulator retains them.

## Scope

This directory and the [inventory pilot](../../../../tools/lucyd-deploy/README.md).

## Contracts

- Input: [validated diagram v4](../diagram.js), [implementation registry](registry.json) and [deployment inputs](configuration.template.json).
- Output: [compiler](compiler.js) emits Kubernetes objects, bindings, assumptions and source hashes.

## Invariants

Read diagrams without mutation. Refuse unsupported components, routes and bindings.
Never derive resources or cloud regions from simulation timing or resource groups.
Images require digests; secrets remain references. Export requires explicit action.
Locking clears private configuration and export state. No automatic provisioning.

## Acceptance

- Evidence: [compiler tests](../../../../tools/lucyd-deploy/tests/compiler.test.cjs), [transaction tests](../../../../tools/lucyd-deploy/tests/postgres.integration.cjs) and [browser audit](../../../../tools/lucyd-deploy/tests/browser.mjs).
- Cloud qualification additionally needs actual deployment, failure and calibration evidence.

## Non-goals

Arbitrary kernel implementation, automatic cloud creation, real-world performance claims.

## Freedom

Any implementation is permitted within these boundaries and independent evidence requirements.
