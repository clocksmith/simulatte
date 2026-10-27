# CATSCAN: Lucyd deployment pilot tools

Parent: [Repository tools](../CATSCAN.md)

## Target

Exercise explicit inventory implementations and source-bound deployment exports.

## Authority

- Owns CLI, inventory HTTP service, PostgreSQL transactions, expiry leases and traffic tests.
- Does not own browser compilation; it belongs to the [deployment extension](../../public/simulatte/system-diagram/deployment/CATSCAN.md).

## Scope

This directory.

## Contracts

- Input: [Lucyd documents](../../public/simulatte/system-diagram/diagram.js), [registry](../../public/simulatte/system-diagram/deployment/registry.json) and explicit configuration.
- Output: [CLI](cli.cjs) exports inspectable resources and [traffic](app/traffic.cjs) records independent observations.

## Invariants

Keep diagrams immutable. Never translate modeled timing into Kubernetes resources.
No credentials in artifacts. No cloud provisioning from compilation.
Stock conservation, payment idempotency and expiry must survive concurrent callers.
Generated manifests do not establish a working cloud system or simulation calibration.

## Acceptance

- Evidence: [compiler tests](tests/compiler.test.cjs), [PostgreSQL tests](tests/postgres.integration.cjs) and [restricted-container failures](tests/container.integration.cjs).
- Report unavailable runtime layers.

## Non-goals

Automatic adoption, arbitrary design deployment or cloud-provider qualification.

## Freedom

Any implementation is permitted within these boundaries.
