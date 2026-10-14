# Simulatte Agent Instructions

`simulatte/` hosts the Simulatte browser products on Firebase Hosting.

## Git workflow: direct to main

- Commit on the owning repo's `main` and push to `origin/main`. No feature
  branches, branch-backed worktrees, or PRs unless the user asks for them.
- On another branch, preserve its work and move the task to `main` safely;
  never discard changes to switch. Never force-push `main`.
- Stage only task-related changes; integrate remote updates without
  overwriting unrelated work.
- Report the pushed commit or the concrete blocker. A local commit is not a push.

## Development verification

- During development, choose checks for the changed behavior: syntax/type checks,
  existing focused tests, or a local visual check. A command list is not a requirement
  to run every suite before each commit, push, or ordinary application deployment.
- Do not automatically run full repository suites, broad browser/device matrices,
  GPU/model campaigns, benchmarks, or full release qualification. Run them when
  explicitly requested or when a named correctness question cannot be answered by
  focused checks; state that reason before starting.
- Config-contract, mirror, drift, and freshness checks run only when the change
  edits what they check. Don't add tests that just restate another file or pin
  config literals. Time-box long processes.
- Once relevant checks pass, continue. Repeat or broaden verification only after
  another relevant change, a failure, or a concrete unresolved concern.
- For documentation-only edits, inspect the diff and changed links. Do not run
  application, GPU, browser, or benchmark suites for prose changes.
- For ordinary deployments, build the changed artifact where needed and check the
  affected route after deployment. Deployment alone does not require a new release
  qualification campaign.
- Keep existing acceptance thresholds and release-qualification requirements.
  Report exactly what was checked; focused development checks do not establish
  numerical qualification, performance, multi-device support, or full acceptance.

## Purpose

- Maintain the static browser surfaces under `public/` and a direct
  static-hosting deployment path; browser changes run from the hosted output.
- Read [STYLE_GUIDE.md](STYLE_GUIDE.md) before non-trivial edits; it owns phase,
  runtime, receipt, rendering, test, and documentation rules.

## Component Intent

Before modifying a file, read the `CATSCAN.md` chain from the project root to
the target directory, in order. Target, Authority, Invariants, Acceptance, and
Non-goals are implementation constraints; a child charter may narrow its parent
but not contradict it. CATSCAN constrains outcomes and authority, not internal
algorithms, so novel implementations are welcome.

If requested work changes a component boundary, name the conflict and update the
affected `CATSCAN.md` with the implementation instead of silently working around
it. Existing code does not overrule a charter; code may have drifted. When
explicit user direction changes product intent, update `GOALS.md` or the
affected charter in the same change. `AGENTS.md` enforces discovery and
procedure; it does not duplicate component goals.

## Source precedence

When sources disagree:

1. The user's latest explicit direction.
2. [GOALS.md](GOALS.md) for durable repository purpose and strategy.
3. The ordered `CATSCAN.md` chain, with the nearest child narrowing its parent.
4. [STYLE_GUIDE.md](STYLE_GUIDE.md) for engineering invariants.
5. Runtime manifests, schemas, tests, and receipts for current executable state.
6. README and design documents for usage, navigation, and mechanism history.

## Routing rules

- `public/simulatte/` owns the World simulator at `/`.
- `public/blank/` owns Create at `/blank/`.
- `public/shared/` owns shared contracts and governed plugin source.
- `public/data/` owns deployable governed data and manifests.
- `tools/` owns builders, validators, audits, and evidence capture.
- `tests/` owns executable regression evidence.
- Hosting configuration lives in `firebase.json` and `.firebaserc`.
- The nearest nested `AGENTS.md`, if introduced, takes precedence for its tree.

## Guardrails

- Read [docs/simulatte/bug-zapping-guide.md](docs/simulatte/bug-zapping-guide.md)
  before non-trivial defect investigation or repair.
- Keep assets and links safe for static hosting: prefer relative paths and avoid
  server assumptions unless the feature explicitly requires them.
- Regenerate machine-owned artifacts through their declared generator.
- After adding, moving, or changing a `CATSCAN.md` charter, run
  `npm run catscan:sync`, then `npm run catscan:check`. Other edits need neither.

## Intent-first operations

- Simulatte is the browser simulation and world-compilation product, not Gamma,
  Doppler, Reploid, or Poolday.
- Technical reviews, failure reports, and pasted recommendations about
  authorized work continue that work; fix demonstrated gaps within its scope
  without asking for re-authorization.
- The latest explicit user direction controls product intent; pasted
  alternatives don't replace it. Ask only when an unresolved choice materially
  changes scope, conflicts with that direction, or needs unavailable
  information; keep doing independent work meanwhile.
- Prefer plain names (start, page, state, controls, drawing) when they match
  behavior better than internal taxonomy.
- Pipeline work keeps the fixed phase order: no added phases, reverse traversal,
  or side-channel authority unless the user changes that contract. Phase N
  consumes the exact Phase N-1 output plus allowed runtime context.
- When output is wrong, inspect the named upstream artifact and downstream input
  before broad rewrites.
- Training commands are operational: start the requested workflow and report the
  server URL or exact blocker.
- Open-ended development and data-source selection follow these instructions and
  applicable CATSCAN/docs, not catch-all skills. Repository skills are only for
  their named debug, local training UI, or review-compilation operations.

## Delivery expectations

- Visible changes remain functional on desktop and mobile.
- Runtime, browser, GPU, deployment, and human-review claims name the evidence
  layer that actually ran.

## Handoff contract

Every change handoff states:

```text
Component: <component identifier>
Intent: preserved | deliberately changed
Acceptance evidence: <commands and artifacts>
Boundary effects: <none or named components>
```

## Fictional satire and copy

- Satirical or critical narrative copy uses fully fictional institutions and
  characters unless the user explicitly requests real identities; fictionalize
  names, branding, slogans, biographies, titles, and distinctive visual cues
  together.
- Make critique legible through incentives, authority, decisions, dependencies,
  and consequences.
- Keep canonical real names for governed facts, geography, provenance,
  citations, and source identities.

## No speculative engineering timelines

- Never predict how long engineering work will take ("1-2 weeks", "a quick
  fix"). Describe concrete deltas, dependencies, risks, and validation instead.
- For an already-running process, report measured elapsed time, progress, or a
  grounded ETA only when the process exposes one; otherwise report its phase,
  latest output, and whether it is still progressing.

## Pick the real fix

- Fix correctness bugs; don't relabel them. Effort or scope framing
  ("non-trivial", "worth its own thread", "later") is no reason for a lesser fix.
- "Mark experimental", "add a TODO", or "reword the misleading comment" does not
  substitute for fixing wrong behavior.
- If scope must be split, list the concrete deltas and ask the user which path
  to take; don't pre-decide a smaller version.
