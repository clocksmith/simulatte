# Simulatte navigation

Owner contracts:

- `public/data/autonomy/autonomy-manifest.json`
- `public/contracts/*.schema.json`
- `public/data/autonomy/policies/bet-selector-v1.json`
- `public/data/autonomy/patterns/nyc-replay-patterns-v1.json`
- `public/data/autonomy/evidence/feature-reranker-public-diagnostic-v1.json`
- `tools/samer/autonomy/autonomy-policy-contract.json`

## Product goal

Simulatte runs governed bicycle-delivery and pedestrian-loop agents
in a browser simulation. The simulator is the execution and evaluation
substrate. The product behavior is the repeated decision loop:

```text
mission -> observe -> propose action bets -> predict -> safety gate
        -> select -> execute -> settle -> update memory -> observe
```

A generated route is not autonomy proof. A qualifying journey needs repeated
closed-loop decisions, validated state transitions, hard-gate compliance,
settled predictions, task-specific terminal evidence, and a verified receipt
chain.

## Repository boundary

The autonomy system is a sibling of the prompt-to-pixels pipeline.

| Path | Authority |
| --- | --- |
| `public/blank/pipeline/` | Existing eight-phase natural-language-to-pixels compiler served at `/blank/` |
| `public/mission/capability-matrix.js` | Executable embodiment x mission-family x governed-artifact support matrix |
| `public/app/`, `public/runtime/`, `public/world/` | Online mission, observation, action-bet, safety, execution, settlement, and verification runtime served at `/` |
| `public/data/autonomy/` | Governed world, embodiment, policy, occurrences, feature cards, evidence, and asset hashes |
| `tools/autonomy/` | Source acquisition, world compilation, mission construction, evaluation, and data validation |
| `skills/autonomy-data/` | Repeatable plan, fetch, backfill, verify, promote, compile, and activation workflow |
| `tools/samer/autonomy/` | Matched policy experiments across journeys |
| `tests/autonomy.test.cjs` | Autonomy contract, runtime, replay, browser, and data tests |

Autonomy does not add a ninth compiler phase. Code may become shared only when
both subsystems consume the same contract without importing each other's
internal state.

## Governed embodiments

The manifest loads `delivery-bike-v1` and `pedestrian-v1`. Each owns its
dimensions, collision radius, acceleration, deceleration, integration step,
maximum speed, task eligibility, network mode, and render profile. The mission
compiler selects the embodiment by task and kind. Every accepted mission also
contains a capability receipt naming the exact matrix row, termination kind,
and graph or circuit artifacts that made it executable. The browser does not
infer or share dynamics values across modes.

Observation, action proposals, reference dynamics integration, safety gates,
selection, settlement, receipt chaining, renderer, camera, and SAME-R
evaluation are one shared engine. Pedestrian, bicycle, future scooter, and
future car agents vary through embodiment data, task grammar, allowed graph
modes, and legal constraints. The pedestrian control currently supports a
runner/walker on one closed circuit, not a general sidewalk graph. Scooter,
car-delivery, and robotaxi artifacts remain unimplemented; neither current
journey speaks for them.

## Mission compiler

`mission/mission-compiler.js` implements a deterministic grounded control
lane. Delivery missions require an explicit delivery term, an embodiment mode,
`from` node, and `to` node. Closed-circuit missions require a mode, loop
relation, declared circuit, and one termination: distance, integer lap count,
or elapsed time. Distance and time units convert inside the mission receipt;
lap targets derive exact distance from the pinned circuit length. A bounded
edit-distance matcher corrects misspelled declared places, circuits, and
`perimeter`; it cannot create a new place. A named-street avoidance grounds to
the routed DOT graph when possible and otherwise to governed OSM display
geometry. Receipts distinguish active edge exclusion from a street already
absent from the routable graph.

`mission/capability-matrix.js` evaluates pedestrian, bicycle, scooter, and car
against delivery, point-to-point, and closed-circuit families independently.
Current support is bicycle delivery and pedestrian closed circuits. General
pedestrian point-to-point navigation is blocked on a routable sidewalk and
crosswalk artifact. Bicycle park loops are blocked on a registered bike-legal
circuit. Scooter and car rows are blocked on both embodiment and road-graph
artifacts. These are executable refusals with evidence, not parser omissions.

The parser is a control lane, not a general natural-language model claim. A
model parser must beat it on a frozen intent population while preserving the
same mission schema and failure behavior.

## Continuous action bets

Every tick produces candidate action bets for emergency stop, wait, yield,
proceed, accelerate, and route revision when applicable. Each bet binds:

| Field | Meaning |
| --- | --- |
| `action` | Maneuver, acceleration, and target segment |
| `prediction` | Position, speed, progress, clearance, node arrival, and mission arrival |
| `confidence` | Settled-history calibration for that maneuver |
| `scoreStake` | Nonfinancial score exposed to settlement |
| `evidence` | Observation tick, route revision, and rollout identity |

The reference dynamics run again during execution. Settlement compares the
recorded prediction with the observed transition under frozen tolerances. Only
executed bets update maneuver calibration. Unexecuted candidates remain in the
trace and do not receive counterfactual credit.

## Safety authority

Safety gates run before utility scoring. A utility score cannot override a
failed gate.

| Gate | Blocking condition |
| --- | --- |
| Network containment | Transition has neither a valid node nor segment |
| Mode eligibility | Agent enters a segment that excludes its embodiment mode |
| Segment closure | Candidate enters an active blocked segment |
| Signal compliance | Candidate enters a controlled segment on red |
| Speed | Predicted speed exceeds segment, mission, or embodiment limit |
| Pedestrian clearance | Reference lookahead falls below the policy clearance |
| Route adherence | Candidate enters a segment outside the active route |

If every candidate fails, the agent emits a failure receipt and stops. It does
not select the least unsafe action.

## World and renderer

`nyc-core-autonomy-v1` is the governed browser world. It
covers named nodes from West Village and Union Square through East Village,
the Williamsburg Bridge corridor, North Williamsburg, McCarren Park, and
Greenpoint. Its manifest pins the compiled world by SHA-256. The world retains
frozen source receipts for NYC bike routes, NYC building footprints, NYC
borough geometry, OpenStreetMap streets, and NYC Parks property geometry for
McCarren, Tompkins Square, Union Square, and Washington Square.

The artifact contains 2,491 multimodal nodes, 3,723 directed segments, 6,589
OSM street ways, nine rendered exterior boundary members from four official
park properties, one 69-segment pedestrian circuit, and 8,500 retained
building footprints from 26,990 source footprints. The executable circuit
follows the largest exterior member of Union Square property `M089`; the full
source geometry and selected ring are separately hashed. The other park rows
are display context only. A property boundary is not a surveyed sidewalk
centerline or an access/obstacle claim. The building LOD receipt says that it
is not full coverage.

The browser renderer requires WebGPU and fails closed when the adapter,
device, shader, or render geometry is unavailable. It draws source-bound
streets, bike facilities, park fill and perimeter, building footprints and
heights, the selected route, the traveled trace, actors, signals, prediction
geometry, and task-specific pedestrian, bicycle, scooter, or car meshes. The
shared procedural mesh contract uses articulated riders, wheels and frames,
vehicle proportions, smooth normals, and per-vertex metallic/roughness lanes;
it does not substitute mode-specific controllers. Follow, bird, and top
camera changes interpolate; bird/top pan, orbit where applicable, and mouse
wheel zoom work, including near and far Follow distance. Starting a mission
selects Follow and opens a north-up WebGPU top-view minimap centered on the
controlled agent. The reference dynamics remain on CPU. A browser receipt
records the adapter, backend, frame count, vertex counts, world identity,
park/circuit counts, visible feature counts, Follow distance, and minimap
projection. A deterministic ambient compiler animates four
pedestrians, three bicycles, two scooters, and four cars from frozen park,
bike-facility, and street render geometry. All four kinds share the same actor
mesh and distance-parameterized animation path. They enter observations and
receipts as `visible_ambient`, but do not become safety-blocking until their
paths pass the corresponding mode-legal topology gates. Authored scenario
pedestrians remain hard clearance obstacles. Rendered pixels aid inspection
but do not prove physical safety or observed traffic realism.

`nyc-training-corridor-v1` remains a small synthetic test fixture. It does not
back the hosted default mission.

## Occurrence pipeline

`runtime/occurrence-engine.js` owns the pluggable occurrence registry. The
default catalog uses three plugins:

| Plugin | Trigger |
| --- | --- |
| `time.periodic-phase.v1` | Repeating ordered tick phases |
| `time.window.v1` | Inclusive deterministic tick interval |
| `event.window.v1` | Window opened by a typed simulation event |

Effects can set a signal state, activate an actor, block a segment, or attach
an annotation. The controller evaluates occurrences before route planning and
observation for the same tick. Conflicts resolve by descending priority and
then pattern ID, with winner and rejected pattern IDs in the receipt. Unknown
plugins and unknown world targets fail closed.

The checked-in signal and pedestrian patterns are authored scenario facts.
Their provenance says `isObservedHistory: false`. Historical data must enter
through a separate compiler that records source artifact, snapshot, spatial
join, time transform, and missing-data behavior before it can set that field
to true.

## Receipt chain

Every tick payload is canonicalized by sorted object keys with array order
preserved. SHA-256 binds payload hash, previous entry hash, and sequence. The
journey verifier checks the full chain before its verdict can pass.

The journey verifier settles:

- destination arrival;
- payload delivery;
- exact loop-distance conversion and terminal distance;
- closed-circuit segment order;
- one boundary-bound receipt per completed lap;
- full-lap and final-partial distance accounting;
- signal compliance;
- pedestrian clearance;
- protected-lane preference when required;
- continuous tick order;
- one settlement for every selected bet;
- absence of runtime safety violations.

## Two improvement loops

| Loop | Job |
| --- | --- |
| Within journey | Settled action bets update maneuver confidence before the next observation |
| Across journeys | SAME-R compares selection approaches under a frozen causal contract |

The public SAME-R contract compares progress-only, evidence-scored, and seeded
eligible selection. It freezes the proposer, route planner, dynamics, safety
gate, scenarios, evaluation order, and execution budget. Its scenario set is
public diagnostic evidence. The report hashes each runtime source file and
records the execution environment and invocation. The runner blocks promotion
because no sealed population or physical-world evidence is supplied.

The separate 20-mission public diagnostic set covers named endpoints,
constraints, obligations, and route controls for the expanded world. It is
checked into the repository and therefore cannot authorize promotion. The
typed reranker receipt records MRR 0.725 to 0.750 with Recall@5 unchanged at
1.000 on 40 exposed mission/query judgments after adding the pedestrian
catalog. This population remains saturated at Recall@5 and supports retention
only on the exposed diagnostic rows.

## Commands

```bash
npm run serve
npm run serve:static
npm run check:autonomy
npm run autonomy:data:plan -- --group pedestrian-topology --snapshot-date YYYY-MM-DD
npm run autonomy:data:plan -- --group mobility-history --from YYYY-MM-01 --to YYYY-MM-01 --snapshot-date YYYY-MM-DD
npm run autonomy:data:verify -- --receipt PATH/fetch-receipt.json
npm run build:autonomy:data
npm run eval:autonomy:reranker
npm run audit:autonomy:browser
node tools/autonomy/run-browser-smoke.mjs --viewport 390x844 --check
node tools/autonomy/run-browser-smoke.mjs --url https://simulatte.world/ --check
npm run samer:autonomy:check
npm run samer:autonomy
npm test
```

Open `http://localhost:4173/` when using `npm run serve:static`. The compiler
remains available at `http://localhost:4173/blank/`; `/autonomy/` redirects to
the root Simulatte runtime.

## Claim boundary

The implemented evidence supports deterministic delivery-bike behavior and a
pedestrian closed-circuit control over the pinned Villages and North Brooklyn
map artifact in the named browser runtime. Distance, lap-count, and elapsed-
time termination have separate exact settlement evidence. Delivery place
correction and named-street avoidance retain source spans and graph evidence.
For the exact 5,000-foot Union Square mission, the receipt binds the 0.3048
conversion, source boundary, ordered segments, full laps, partial lap, and
exact 1,524-meter settlement. The ambient four-kind traffic layer is animated,
observation-visible
simulation context; its paths are explicitly nonblocking until compiled from
mode-legal topology. Frozen geometry provenance does not make authored traffic
live or historical, and a park property boundary is not a surveyed sidewalk.
The evidence does
not establish physical bicycle or pedestrian control, robotaxi safety,
public-road readiness, realistic traffic, or policy promotion.
