# Simulatte navigation

Simulatte is a governed, local-first navigation simulator. It compiles a
natural-language mission into typed obligations, executes an embodied agent
through repeated autonomous decisions, settles the predictions made at every
tick, and emits a hash-linked journey receipt.

The target cooperative-city architecture is specified in
[Cooperative city architecture](cooperative-city-architecture.md). It covers
incidental peer delivery, marginal-detour matching, relays, custody, dynamic
shade routing, and the WebGPU compute boundary. Governed natural-language
item requests, direct matching, exact bounded relay allocation, simulated
consent/custody, CPU-reference shade routing, and parity-proven numeric WebGPU
scoring are executable. Live peers, physical consent/custody, GPU shade fields,
and live renderer adoption of atomic tile residency remain outside the claim.

It is not a directions wrapper and it is not a physical-autonomy claim. Its
distinct product is matched simulation evidence for questions such as:

- What happens if this street closes?
- What changes when reported crash history enters route cost?
- Can this declared wheelchair journey be supported by the loaded evidence?
- Did the route stay near listed bicycle parking?
- What did the simulator predict, what occurred, and how large was the error?

## Governing loop

```text
mission text
  -> deterministic grammar or governed local place embedding
  -> typed obligations and eligible embodiment
  -> route candidates and free-flow forecast
  -> observe -> propose bets -> gate -> select -> execute -> settle
  -> terminal verifier -> journey receipt -> local calibration ledger
```

A route alone is not proof. A passing simulated journey requires contract-valid
inputs, mode-eligible topology, hard-gate compliance, ordered-stop completion,
required obligations, deterministic state transitions, terminal settlement,
and a verified receipt chain.

## Current executable surface

The active world is `nyc-core-autonomy-v1`, frozen on 2026-07-13.

| Surface | Executable behavior |
| --- | --- |
| Pedestrian | Point-to-point walking and running; declared park circuits; wheelchair requests with evidence-gated refusal |
| Bicycle | Point-to-point and parcel delivery; ordered stops; return trips; protected-lane preference; street avoidance; bicycle-rack proximity |
| Scooter | Point-to-point and parcel delivery on mode-eligible compiled topology |
| Car | Point-to-point and parcel delivery on mode-eligible compiled topology |
| Termination | Arrival, exact distance, integer lap count, or elapsed simulated time |
| Time obligations | Departure time, same-day arrival deadline, daylight-only window |
| Economics | Declared gross delivery compensation and simulated gross hourly settlement, with exclusions named |
| Counterfactuals | Street closure, historical-crash weighting, and dated-world request |
| Rehearsal | Export, verify, import, and replay a journey mission locally |
| Curriculum | Browser-local progress over a pinned eight-mission curriculum |

Pedestrian, bicycle, scooter, and car all use the same mission compiler,
route-planner interface, observation builder, bet proposer, safety gate,
selector, reference dynamics, settlement, verifier, receipt chain, renderer,
camera, and counterfactual runner. An embodiment file changes dimensions,
dynamics, speed, render profile, and allowed graph mode. It does not fork the
controller.

Declared park circuits are derived from pinned NYC Parks property boundaries.
They are useful simulation circuits, not surveyed sidewalk centerlines, access
proof, or legal bicycle routes. Circuit execution therefore remains
pedestrian-only until a source-backed, mode-eligible perimeter graph is added.

## World evidence

The active composition contains:

- 11,286 multimodal nodes;
- 28,638 directed segments;
- 6,587 rendered OSM street ways;
- 8,500 retained NYC building footprints;
- 13,185 provenance-carrying feature cards;
- 20 mode-specific grounded place nodes;
- 4 declared park circuits and 9 rendered property-boundary members;
- 3 independently hashed region packs joined by 98 exact seams;
- 13 deterministic ambient actors across pedestrian, bicycle, scooter, and car render kinds.

The region packs cover Manhattan Villages, the East River crossing, and North
Brooklyn. Pack boundaries own loading and provenance. They do not block a route
that crosses declared seams.

Additional pinned indexes bind the world to:

- 9,359 NYC DOT bicycle-parking rows;
- 11,603 NYC DOT pedestrian-ramp rows;
- 5,131 NYPD reported crashes from 2025-07-01 through 2026-07-01.

Those rows have deliberately narrow authority. Bicycle parking proves frozen
geometric proximity, not capacity or security. Ramp measurements are evaluated
against a simulator policy and are not ADA determinations. Crash history has no
traffic, trip, population, or distance exposure denominator. It can support an
observed-history route-cost experiment, but cannot prove causality, current
risk, or the safest route.

## Mission language

The deterministic grammar supports:

- `Walk from Union Square to Washington Square.`
- `Drive from Union Square to North Williamsburg.`
- `Deliver the parcel by bike from Union Square to East Village, then Tompkins Square, then return to Union Square for $25.`
- `Run 5 laps around Union Square Park perimeter.`
- `Run around McCarren Park perimeter for 2 miles.`
- `Walk from Tompkins Square to Washington Square starting at 4 pm and arrive by 5 pm, only in daylight.`
- `Bike from Union Square to Washington Square and keep me within 200 meters of a bike rack.`
- `Avoid Kent Avenue`, `prefer protected lanes`, and `yield to pedestrians` as route obligations.

Distance and duration units are converted inside the mission receipt. A 5,000
foot circuit mission settles at exactly 1,524 meters. Place, circuit, and
perimeter typos use bounded matching and cannot create new geography. Ambiguous
and out-of-world places refuse.

Current hard boundaries include arbitrary street addresses, businesses, live
traffic, live weather, calories, elevation-aware routing, accessibility claims
beyond loaded ramp and topology evidence, and cross-city travel. Those are
missing governed artifacts, not prompts the model is invited to guess.

## Model boundary

Simulatte has one optional navigation model lane:

| Stage | Method | Model execution |
| --- | --- | --- |
| Exact place matching | Governed label lookup | None |
| Bounded typo matching | Deterministic edit-distance policy | None |
| Optional place semantics | Qwen 3 Embedding 0.6B, local Doppler runtime | Embedding only |
| Feature-card retrieval | Lexical inverted scan | None |
| Feature-card reranking | Typed deterministic evidence weights | None |
| Route planning | A* with declared cost terms and deterministic tie-break | None |
| Tick action choice | Propose, safety gate, evidence-scored select | None |
| Settlement and verification | Deterministic reference execution | None |

The Qwen lane embeds the origin or destination phrase and compares it with a
precompiled, hash-pinned place-vector artifact. Candidates are filtered to the
active embodiment graph before thresholding. The model cannot add a node,
choose a route, issue a control action, or bypass a gate. The UI names the
download size and the receipt reports whether model execution occurred.

The corrected public diagnostic improves from 21/37 for the legacy lexical
control to 27/37 for the shipped deterministic extended-typo lane with zero
wrong-place and must-refuse violations. The Qwen candidate also scores 27/37,
so its measured incremental gain is zero. It remains available for explicit
experiments and is not a sealed promotion result.

The Qwen 3 Reranker 0.6B in the shared model lock is used by Blank. Simulatte
does not claim that reranker executed. Its navigation reranker remains the
checked-in deterministic control.

## Counterfactual and settlement contracts

`counterfactual-runner.js` executes baseline and challenger through the same
controller. The comparison receipt binds world, mission, embodiment, policy,
evidence-index identities, both journey hashes, outcome deltas, route overlap,
and the intervention. Only one intervention changes per comparison.

Supported interventions are:

1. `close_street`: add one grounded routed street to the mission exclusion.
2. `historical_crash_weighting`: change one route-cost weight over the pinned crash index.
3. `world_snapshot`: execute only when that exact dated world is loaded.

A 2019 request currently returns `snapshot_not_loaded` while retaining the
current-world baseline. A current map plus old crash reports is not a 2019
street network. A future plan is not built infrastructure. This negative
receipt is the required behavior until separately pinned world packs exist.

The local settlement ledger stores compact payloads in `localStorage`, hashes
each entry into a chain, and verifies the chain before reading. It records
simulated ETA error, completion, verification, mode, economics, accessibility,
amenities, and the full journey receipt hash. Imported receipts are verified
before their mission text can be replayed. Nothing in this ledger is a
physical-world result.

## Policy arena

`tools/samer/autonomy/` runs matched action-selection lanes over a public
diagnostic scenario set. The current report selects a diagnostic leader while
blocking promotion. Runtime source hashes, scenario hashes, budgets, lane
order, seeds, guardrails, and saturation are part of the receipt.

The challenger slot is an evaluation surface, not automatic recursive
improvement. A promotion claim still requires an unmounted population,
candidate commitment, one authorized evaluation opening, contamination audit,
and a terminal receipt.

## Owners

| Path | Authority |
| --- | --- |
| `public/mission/` | Grammar, grounding, capability selection, typed obligations |
| `public/world/` | World model, A*, route alternatives, accessibility audit |
| `public/runtime/` | Retrieval, occurrences, bets, gates, dynamics, settlement, ledgers, counterfactuals |
| `public/verifier/` | Required-obligation and journey checks |
| `public/contracts/` | Runtime and data validators plus JSON Schemas |
| `public/data/autonomy/` | Active identities, worlds, indexes, policies, evidence |
| `tools/autonomy/` | Data planning, fetching, promotion, compilation, evaluation |
| `tools/samer/autonomy/` | Matched public policy trials |
| `skills/autonomy-data/` | Governed data refresh and backfill procedure |

## Gates

```bash
npm run build:autonomy:data
npm run check:autonomy
node --test tests/autonomy.test.cjs
npm run audit:autonomy:browser
npm run check:deploy
```

`build:autonomy:data` regenerates derived artifacts from immutable promoted
sources. `check:autonomy` revalidates source receipts, every manifest hash,
world/index contracts, region composition, diagnostics, and deterministic
policy evidence. The browser audit executes the deployed journey and inspects
the WebGPU surface. A generated file is not active evidence until its manifest
identity and hash pass the same gates.

See [data ingestion](data-ingestion.md) for refresh and city-extension rules
and [NYC navigation transfer](nyc-navigation-transfer.md) for the product and
claim map.
