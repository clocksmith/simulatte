# CATSCAN: Application profiles

Component: `simulatte.data.profiles`
Parent: [Governed browser data](../CATSCAN.md)
Target: Bind each activated experience to exact world, plugin, control, seed, presentation, and evidence requirements.

## Authority

- Owns profile identities, activation parameters, and claim inventory membership.
- Does not own plugin implementation or evidence capture.

## Scope

- Applies to application profile manifests and claim inventory.

## Inputs

- [tier application manifest](../simulatte/tier-application-manifest.json)

## Outputs

- [profile claim inventory](profile-claim-inventory-v1.json)

## Invariants

- Connected profiles have complete contracts and unique identities.
- A source-only or proposed profile cannot enter the public inventory.

## Acceptance

- Profiles, plugins, experience docs, and claims resolve one-to-one.
- Evidence: [folder contract tests](../../../tests/folder-contracts.test.cjs).

## Non-goals

- Treating profile presence as browser or scientific proof.

## Freedom

Any mechanism is permitted if it preserves these boundaries and passes the
acceptance evidence.

