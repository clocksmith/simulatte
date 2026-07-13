# Simulatte autonomy

Owner contracts:

- `public/data/autonomy/autonomy-manifest.json`
- `public/autonomy/contracts/*.schema.json`
- `public/data/autonomy/policies/bet-selector-v1.json`
- `public/data/autonomy/patterns/nyc-replay-patterns-v1.json`
- `public/data/autonomy/evidence/feature-reranker-public-diagnostic-v1.json`
- `tools/samer/autonomy/autonomy-policy-contract.json`

## Product goal

Simulatte Autonomy runs one governed delivery-bike agent in a browser
simulation. The simulator is the execution and evaluation substrate. The
product behavior is the repeated decision loop:

```text
mission -> observe -> propose action bets -> predict -> safety gate
        -> select -> execute -> settle -> update memory -> observe
```

A generated route is not autonomy proof. A qualifying journey needs repeated
closed-loop decisions, validated state transitions, hard-gate compliance,
settled predictions, terminal delivery, and a verified receipt chain.

## Repository boundary

The autonomy system is a sibling of the prompt-to-pixels pipeline.

| Path | Authority |
| --- | --- |
| `public/pipeline/` | Existing eight-phase natural-language-to-pixels compiler |
| `public/autonomy/` | Online mission, observation, action-bet, safety, execution, settlement, and verification runtime |
| `public/data/autonomy/` | Governed world, embodiment, policy, occurrences, feature cards, evidence, and asset hashes |
| `tools/autonomy/` | Source acquisition, world compilation, mission construction, evaluation, and data validation |
| `tools/samer/autonomy/` | Matched policy experiments across journeys |
| `tests/autonomy.test.cjs` | Autonomy contract, runtime, replay, browser, and data tests |

Autonomy does not add a ninth compiler phase. Code may become shared only when
both subsystems consume the same contract without importing each other's
internal state.

## Governed embodiment

The current embodiment is `delivery-bike-v1`. Its manifest owns dimensions,
collision radius, acceleration, deceleration, integration step, and maximum
speed. The browser does not infer those values.

Walker, scooter, car-delivery, and robotaxi embodiments are unimplemented.
They require their own dynamics, legal constraints, action vocabulary,
scenario population, guardrails, and promotion receipts. The delivery-bike
journey does not speak for them.

## Mission compiler

`mission/mission-compiler.js` implements a deterministic known-label control
lane. It accepts an explicit delivery term, bike mode, `from` node, and `to`
node. It records source intervals for each accepted term. Unknown places,
missing modes, unsupported tasks, and equal origin/destination pairs fail
closed.

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
| Mode eligibility | Delivery bike enters a segment that excludes its mode |
| Segment closure | Candidate enters an active blocked segment |
| Signal compliance | Candidate enters a controlled segment on red |
| Speed | Predicted speed exceeds segment, mission, or embodiment limit |
| Pedestrian clearance | Reference lookahead falls below the policy clearance |
| Route adherence | Candidate enters a segment outside the active route |

If every candidate fails, the agent emits a failure receipt and stops. It does
not select the least unsafe action.

## World and renderer

`villages-williamsburg-delivery-bike-v1` is the governed browser world. It
covers named nodes from West Village and Union Square through East Village,
the Williamsburg Bridge corridor, North Williamsburg, McCarren Park, and
Greenpoint. Its manifest pins the compiled world by SHA-256. The world retains
frozen source receipts for NYC bike routes, NYC building footprints, NYC
borough geometry, and OpenStreetMap streets.

The artifact contains 2,422 bike nodes, 3,654 directed bike edges, 6,589 OSM
street ways, and 8,500 retained building footprints from 26,990 source
footprints. The building LOD receipt says that it is not full coverage.

The browser renderer requires WebGPU and fails closed when the adapter,
device, shader, or render geometry is unavailable. It draws source-bound
streets, bike facilities, building footprints and heights, the selected route,
the driven trace, actors, signals, prediction geometry, and the agent. The
reference dynamics remain on CPU. A browser receipt records the adapter,
backend, frame count, vertex counts, world identity, and visible feature
counts. Rendered pixels aid inspection but do not prove physical safety.

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
typed reranker receipt records MRR 0.900 to 0.925 with Recall@5 unchanged at
1.000 on 40 exposed mission/query judgments.

## Commands

```bash
npm run serve
npm run serve:static
npm run check:autonomy
npm run build:autonomy:data
npm run eval:autonomy:reranker
npm run audit:autonomy:browser
node tools/autonomy/run-browser-smoke.mjs --viewport 390x844 --check
node tools/autonomy/run-browser-smoke.mjs --url https://simulatte.world/autonomy/ --check
npm run samer:autonomy:check
npm run samer:autonomy
npm test
```

Open `http://localhost:4173/autonomy/` when using `npm run serve:static`.

## Claim boundary

The implemented evidence supports deterministic delivery-bike behavior over
the pinned Villages and North Brooklyn map artifact in the named browser
runtime. Frozen geometry provenance does not make authored traffic live or
historical. The evidence does not establish physical bicycle control,
robotaxi safety, public-road readiness, realistic traffic, or policy
promotion.
