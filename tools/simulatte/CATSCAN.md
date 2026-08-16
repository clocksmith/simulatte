# CATSCAN: World build and evidence tools

Parent: [Repository tools](../CATSCAN.md)
## Target

Promote source snapshots, compile governed World data, and capture browser evidence through reproducible commands.

## Authority

- Owns World data builders, data checks, browser harnesses, and profile evidence capture.
- Does not own external source truth, product policy, or live deployment status.

## Scope

- Applies to World-specific tools under `tools/simulatte/`.

## Contracts

- Input: [data ingestion contract](../../docs/simulatte/data-ingestion.md)
- Input: [governed data charter](../../public/data/CATSCAN.md)
- Output: [NYC world builder](build-nyc-autonomy-world.mjs)
- Output: [profile evidence contract](profile-evidence-contract.mjs)
- Output: [human visual review contract](profile-evidence-review-contract.mjs)
- Output: [World browser audit](run-browser-smoke.mjs)

## Invariants

- Promoted data retains immutable source receipts.
- Browser claims bind source, build, route, device, and screenshot identity.
- Every profile capture independently recompiles the governed inputs and binds that compiler receipt plus the executed WorldSpec to WorldProof; machine checks and human visual adjudication remain separate eligibility gates.
- Human verdicts are immutable reviewer actions bound to prompt, build, WorldSpec, scene packet, deployment, screenshots, and base WorldProof. Pending, failed, and conflicting reviews never promote platform claims.
- Memory budgets bind forced-GC retained heap at governed boundaries; ambient allocation peaks remain visible as separate evidence.
- The World browser audit exercises a governed scenario edit, execution, exact replay, and bound proof on desktop and mobile.

## Acceptance

- Data immutability and evidence contract fixtures pass.
- Evidence: [autonomy artifact immutability tests](../../tests/autonomy-artifact-immutability.test.cjs).
- Evidence: [profile evidence contract tests](../../tests/profile-evidence-runner.test.cjs).
- Evidence: [profile review contract tests](../../tests/profile-evidence-review.test.cjs).

## Non-goals

- Treating a fetched snapshot as activated data or a local screenshot as deployment proof.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.
