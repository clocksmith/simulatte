# NYC navigation transfer

Simulatte transfers Blank's governing discipline to autonomous routing. The
shared idea is not a graphics stack. It is an evidence loop:

```text
language -> measurable obligations -> candidates -> constrained decision
         -> execution -> verification -> settlement -> revision
```

Blank settles whether prompt obligations reached a moving render. Simulatte
settles whether route and control obligations survived a moving journey.

## Why this is not another maps UI

A directions product primarily answers "how do I get there?" Simulatte is
built to answer "what would happen if?" under declared assumptions, then show
the exact data, decisions, traces, errors, and refusals behind the answer.

| Product territory | Current realization | Claim boundary |
| --- | --- | --- |
| Settled ETA | Every route receives a free-flow prediction; completed simulations record ETA error in a local hash-chained ledger | Calibration is against deterministic simulated execution, not observed street arrivals |
| Accessibility proof | Wheelchair missions audit every route node against pinned ramp measurements and topology evidence | Failing or missing evidence blocks execution; measurements are not ADA determinations |
| Gig wage truth | Delivery text may declare gross pay; settlement reports simulated gross hourly value and excluded costs | Not net pay and not a real labor-time observation |
| Street what-if | Baseline and one grounded closure run through the same controller | A simulated effect is not causal policy evidence |
| Road not taken | Planning exports up to three route candidates and their forecasts; journey receipts can be imported and replayed | Alternatives share the same frozen assumptions and are not observations of routes actually traveled |
| Time-travel streets | Snapshot registry distinguishes executable and unavailable dates; unavailable comparisons retain the baseline and refuse | No historical world is inferred from current geometry plus historical crashes |
| Trip rehearsal | Four embodied modes run turn by turn with Follow, bird, top, and minimap views | Browser simulation is not proof of physical autonomy |
| Competence curriculum | Eight exact missions settle into browser-local progress | Demonstrates simulator tasks only, not human or robot certification |
| Public policy arena | SAME-R compares matched action selectors and names a public diagnostic leader | Promotion remains blocked without sealed evaluation |
| Obligation routing | Typed language covers stops, return trips, distance, time, daylight, street avoidance, rack proximity, and more | Unknown places and unsupported constraints refuse rather than becoming soft preferences |
| Privacy-absolute planning | Mission text, model execution, receipts, and ledgers stay in the browser | Model weights may download from their pinned origin; user missions are not uploaded by the app |

## Concept map

| Blank discipline | Simulatte realization |
| --- | --- |
| Prompt spans become typed obligations | Mission evidence retains source intervals, canonical values, unit conversions, and required obligations |
| Construction catalog | 13,185 feature cards compiled from world geometry, behavior, and scenario identities |
| Lexical control before neural challengers | Exact and typo place control remains available with no download; Qwen competes as an explicit local option |
| Ground or fail closed | Every place resolves to a mode-eligible governed node or the mission refuses |
| Typed spatial constraints | Directed segments, allowed modes, closures, signals, named streets, amenity bounds, and route cost terms |
| Models propose, evidence disposes | Qwen may suggest one eligible place; A*, hard gates, reference dynamics, and settlement retain authority |
| No fabricated realization | An unavailable snapshot, graph, accessibility proof, or amenity path emits a named refusal |
| Pixel and state proof | WebGPU shows the route and agents while the trace verifies topology, transitions, obligations, and hashes |
| SAME-R propose and dispose | Matched policy lanes run under one budget, one scenario set, and blocking guardrails |

## Current world

`nyc-core-autonomy-v1` covers the West Village, Washington Square, Union
Square, East Village, Tompkins Square, the Williamsburg Bridge corridor,
Williamsburg, North Williamsburg, McCarren Park, Greenpoint, and nearby
streets. It is reconstructed from three independently pinned region packs.

The compiled world carries 11,286 nodes, 28,638 directed segments, 6,587 OSM
street ways, 8,500 retained building footprints, 13,185 feature cards, 20
mode-specific place nodes, 4 circuits, and 98 exact seam nodes. NYC DOT bike
facilities and OSM highways supply the active route topology. Park properties,
buildings, ramps, bicycle racks, and crash history keep separate provenance and
authority.

Ambient pedestrians, bicycles, scooters, and cars are deterministic scenario
assumptions. They make the environment legible and interactive but do not
become observed traffic. Signal and occurrence coverage remains sparse. No
"realistic NYC traffic" claim is made.

## Language and model separation

The mission compiler first uses exact labels and bounded typo matching. If the
user explicitly chooses the Qwen lane, only unresolved origin or destination
phrases are embedded through Qwen 3 Embedding 0.6B. The precompiled place
vectors are tied to the world hash, model manifest, and eligible nodes.

After grounding, no model is involved in route or control selection:

1. A* constructs legal candidate routes.
2. Lexical feature retrieval finds relevant cards.
3. Typed deterministic reranking orders evidence.
4. The proposer emits control bets.
5. Hard safety gates reject illegal bets.
6. The selector applies the checked-in policy.
7. Reference dynamics execute the selected action.
8. Settlement compares prediction and observed simulator state.

This is why Simulatte does not need autoregressive generation for today's
runtime. A future learned classifier, reranker, route policy, or dynamics model
must enter as its own lane with model identity, population, guardrails, and
matched control. It cannot hide inside the existing deterministic receipt.

## Counterfactual contract

Every comparison changes one declared variable. The receipt contains both
journey hashes and reports completion, verification, duration, distance,
assumed risk, historical observation totals, and route overlap.

Current interventions:

- close one grounded routed street;
- apply a positive weight to one frozen year of spatially joined NYPD crash reports;
- request an exact dated world.

Negative results are product evidence. Closing an unknown street, running
without the required history index, or requesting 2019 without a 2019 world
pack returns a refused challenger rather than silently tuning, substituting,
or discarding the baseline.

## Expansion rules

NYC regions are mergeable only when they derive from the same canonical world,
projection origin, identity policy, source revisions, and seam contract. Extend
the canonical world first, then derive all region packs again. Do not append an
independently projected graph to the active registry.

A second city receives a separate world, coordinate origin, source manifest,
feature catalog, region registry, place-vector artifact, and evidence indexes.
It can reuse the mission, planner, controller, renderer, counterfactual, ledger,
and receipt code. It cannot claim cross-city routing without an explicit
transport connection contract.

The next evidence additions are:

1. source-backed sidewalk and crosswalk connectivity with access rules;
2. lane-level turns, restrictions, signal phases, and curb regulations;
3. grade and surface data for mobility-specific cost and accessibility;
4. dated street and facility snapshots for executable historical comparisons;
5. matched DOT, Citi Bike, TLC, weather, and disruption observations for realism evaluation;
6. a contamination-secure promotion population for place and policy challengers.

Each addition follows plan, fetch, verify, promote, compile, validate, activate,
and deploy. Source availability alone never turns on a runtime claim.
