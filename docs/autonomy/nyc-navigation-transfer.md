# NYC navigation transfer: Simulatte concepts to governed autonomy

How the Simulatte pipeline doctrine maps onto the NYC walking, cycling, and
driving simulator, what `villages-williamsburg-delivery-bike-v1` realizes,
and which doctrine pieces remain open.
Companion to [README.md](./README.md) (product goal, decision loop, receipt
chain) and [data-ingestion.md](./data-ingestion.md).

## The transfer thesis

Simulatte's transferable core is not its renderer. It is the pipeline shape:

```text
natural language -> measurable obligations -> candidate proposals
  -> constrained assembly -> execute -> verify against evidence -> revise
```

with fail-closed phase contracts and honest receipts. Autonomy is the same
machine over a different substrate: street graphs instead of part graphs,
journey traces instead of (only) pixels, settlements instead of visual
obligations.

## Concept map

| Simulatte concept | Autonomy realization |
| --- | --- |
| Prompt to obligation extraction | Mission contract (`mission.schema.json`): mode, origin, destination, and constraints typed before execution |
| Construction-card index + retrieval/rerank | 12,991 compiled feature cards plus a bounded inverted index through `feature-retrieval.js` |
| Lexical control lane before model lanes | `method: deterministic_lexical_inverted_scan_v1`; no embedding lane exists, so no model score is fabricated |
| Typed spatial constraints | Directed segment graph, bike-facility typing, signals; safety gate as the hard-constraint compiler |
| Anchor grounding, fail closed | Geo-grounded nodes/segments with SHA-256-pinned world; missing grounding is a gate failure, not a fallback |
| No fixed composition layouts | Actors carry `provenance.source: "scenario authoring"`; simulated traffic stays separate from map facts |
| Models propose, evidence disposes | `bet-proposer` to `safety-gate` to `bet-selector` to settlement; predictions settle against observed state with recorded error |
| Pluggable occurrence programs | `occurrence-engine.js` registers typed time and event plugins, resolves effects deterministically, and receipts every activation |
| Receipts and claim gating | `journey-receipt.schema.json` chain; a generated route is not autonomy proof |
| Pixel-obligation verifier | Trace-level settlement today; browser visual audit is the pixel half |

## What the current world realizes

`villages-williamsburg-delivery-bike-v1` is SHA-256 pinned in
`autonomy-manifest.json`. It covers West Village, Washington Square, Union
Square, East Village, Tompkins Square, the Williamsburg Bridge corridor,
Williamsburg waterfront, North Williamsburg, McCarren Park, and Greenpoint.
The compiled artifact contains 2,422 bike nodes, 3,654 directed bike edges,
6,589 OSM street ways, and a deterministic 8,500-footprint rendering LOD
from 26,990 source buildings. Per-source receipts retain authority, license,
query, snapshot date, and raw SHA-256.

The occurrence catalog drives one assumed signal, one tick-window pedestrian,
and one node-event pedestrian. These are scenario assumptions, not observed
traffic. The public diagnostic set freezes 20 by-construction missions with
gold endpoints, constraints, obligations, and route controls. It is exposed
regression evidence, not a contamination-secure promotion holdout.

The checked-in reranker receipt compares the declared weights against lexical
ranking on 40 mission/query judgments. MRR moves from 0.900 to 0.925 while
Recall@5 remains 1.000. The receipt supports retaining those weights only on
that public diagnostic population.

## Doctrine gaps and roadmap

1. **External sealed promotion set.** The 20 checked-in missions cannot become
   sealed by wording. Promotion evidence needs an unmounted population,
   candidate commitment, one authorized opening, and a terminal receipt.
2. **Historical occurrence sources.** Compile dated TLC, Citi Bike, DOT,
   weather, 311, and map-history snapshots into the same occurrence contract.
   Every replay pattern must name the dataset, snapshot, spatial join, time
   transform, and missing-data rule.
3. **Embedding lane, control-armed.** When an embedding/rerank model lane is
   added, it competes against the existing lexical lane on the same missions
   under the same receipt schema. The lexical lane is permanent as the
   control arm, not scaffolding to delete.
4. **Behavior-realism benchmark gate.** No realism claim (traffic, actor
   density, signal timing) until simulated flows compare against real counts
   (DOT ATR, TLC records) on the same corridor. Until then the manifest's
   authored-scenario labeling is the claim boundary.
5. **Signals and disruptions coverage.** One signal and zero disruptions make
   those mechanics symbolic. Real signal locations enter through the
   provenance gate; timing defaults stay labeled assumptions in receipts.
6. **Scale boundary stays honest.** Browser scope is tile + corridor with
   thousands of agents at most. Agent updates are compute-shader shaped when
   that ceiling is reached; parity against the reference dynamics
   (`reference-dynamics.js`) gates any GPU port.

## Data expansion order (all NYC open data, gate-first)

LION centerline + DOT bike routes (graph), planimetric sidewalks/crosswalks
(pedestrian mode), signal locations (DOT), 1-ft DEM (grade), Citi Bike GBFS +
TLC trip records (demand priors for authored actors), Vision Zero crashes
(risk layer). Every source lands as provenance-carrying cards with per-entry
validation, mirroring the existing `provenance.sources` shape.

## Mode expansion order

Delivery bike (current) to pedestrian (sidewalk/crosswalk graph, social-force
actors) to driving (lane-level graph, turn restrictions, signal phases).
Each mode is a new constraint vocabulary over the same mission, bet, gate,
and settlement loop, not a new pipeline.
