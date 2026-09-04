# Simulatte Agent Instructions

`simulatte/` hosts the Simulatte browser products on Firebase Hosting.

## Purpose

- Maintain the static browser surfaces under `public/`.
- Preserve the product direction in [GOALS.md](GOALS.md).
- Follow [STYLE_GUIDE.md](STYLE_GUIDE.md) for phase, runtime, receipt,
  rendering, test, and documentation rules.
- Preserve a direct static-hosting deployment path.

## Component Intent

Before modifying a file, read the `CATSCAN.md` chain from the project root to
the target directory, in order.

Treat Target, Authority, Invariants, Acceptance, and Non-goals as implementation
constraints. A child `CATSCAN.md` may narrow its parent but may not contradict
it.

If requested work changes a component boundary, identify the conflict and
update the affected `CATSCAN.md` with the implementation. Do not silently work
around it. Existing code does not overrule a charter because code may have
drifted.

Novel implementations are welcome. CATSCAN constrains outcomes and authority,
not internal algorithms.

Explicit user direction may change product intent. When it does, update
`GOALS.md` or the affected charter in the same change. `AGENTS.md` enforces
discovery and procedure; it does not duplicate component goals.

## Source precedence

Use this order when sources disagree:

1. The user's latest explicit direction.
2. [GOALS.md](GOALS.md) for durable repository purpose and strategy.
3. The ordered `CATSCAN.md` chain, with the nearest child narrowing its parent.
4. [STYLE_GUIDE.md](STYLE_GUIDE.md) for engineering invariants.
5. Runtime manifests, schemas, tests, and receipts for current executable state.
6. README and design documents for usage, navigation, and mechanism history.

Tests and receipts can prove current behavior. They do not silently redefine
component authority.

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

- Read [STYLE_GUIDE.md](STYLE_GUIDE.md) before non-trivial edits.
- Read the full applicable CATSCAN chain before any edit.
- Read [docs/simulatte/bug-zapping-guide.md](docs/simulatte/bug-zapping-guide.md)
  before non-trivial defect investigation or repair.
- Keep assets and links safe for static hosting.
- Prefer relative paths for site resources.
- Avoid server assumptions unless the feature explicitly requires them.
- Regenerate machine-owned artifacts through their declared generator.
- Run `npm run catscan:sync` after adding, moving, or changing a charter.
- Run `npm run catscan:check` before handing off a component change.

## Intent-first operations

- Treat Simulatte as the browser simulation and world-compilation product, not
  Gamma, Doppler, Reploid, or Poolday.
- Treat pasted options, quoted recommendations, and prior agent answers as
  context. The latest explicit user direction controls.
- Use plain names such as start, page, state, controls, and drawing when they
  match behavior better than internal taxonomy.
- For pipeline work, preserve the fixed phase order. Do not add phases, reverse
  traversal, or create side-channel authority unless the user changes that
  contract.
- Phase N consumes the exact Phase N-1 output plus allowed runtime context.
- When output is wrong, inspect the named upstream artifact and downstream input
  before broad rewrites.
- Training commands are operational commands. Start the requested workflow and
  report the server URL or exact blocker.
- Open-ended development and data-source selection follow these instructions and
  the applicable CATSCAN/docs; they are not catch-all skills. Use repository skills
  only for their named debug, local training UI, or review-compilation operations.

## Delivery expectations

- Browser changes run directly from the hosted `public/` output.
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

- Use fully fictional institutions and characters for satirical or critical
  narrative copy unless the user explicitly requests real identities.
- Fictionalize names, branding, slogans, biographies, titles, and distinctive
  visual cues together.
- Make critique legible through incentives, authority, decisions, dependencies,
  and consequences.
- Preserve canonical real names for governed facts, geography, provenance,
  citations, and source identities.

## No speculative engineering timelines

- Do not predict delivery time for engineering work.
- Describe concrete deltas, dependencies, risks, and validation instead.
- For active processes, report only measured progress and grounded timing exposed
  by the process.

## Pick the real fix

- Fix correctness bugs instead of relabeling them.
- Do not substitute a TODO, experimental label, or misleading prose change for
  correct behavior.
- If product scope must split, state the concrete alternatives and ask the user
  rather than choosing a lesser fix silently.
