# Cooperative city architecture

Status: partial executable implementation. This document distinguishes the
running local reference from the remaining network and GPU target.

Owner contracts: `public/contracts/`, `public/mission/`, `public/world/`,
`public/runtime/`, and `public/app/`.

## Product goal

Simulatte models cooperation between people who are already moving through a
city. A participant can publish a need, an available item, or a planned
journey. The system finds plans that satisfy a need without turning every need
into a dedicated trip.

The primary quantity is marginal burden, not total delivery cost:

```text
marginal burden = cooperative journey cost - original journey cost
```

Cost remains a vector until participant policy turns it into a utility value:

```text
{
  addedDistanceM,
  addedDurationSeconds,
  handoffWaitSeconds,
  latenessSlackSeconds,
  directSunSeconds,
  carryingLoad,
  custodyRisk,
  accessibilityLoss,
  compensationCents
}
```

A plan is eligible only when it passes hard constraints for every participant.
The optimizer may rank feasible plans. It may not trade away consent, item
compatibility, carrying capacity, custody rules, accessibility, deadlines, or
declared maximum detour.

Two initial acceptance cases define the product:

1. A person in an office needs two AA batteries. Another participant has two
   batteries and already plans to pass nearby. Simulatte proves the original
   route, cooperative route, added burden, handoff window, custody transitions,
   and settlement.
2. A pedestrian requests a route with less direct sun. Simulatte evaluates sun
   position, building geometry, changing shadows, travel time, and accumulated
   exposure over each legal route candidate.

## Current boundary

The browser now executes one deterministic cooperative scenario and one
shade-aware routing path. The cooperative scenario uses indexed item and
space-time corridor matching, immutable baseline commitments, rolling plan
states, backup reassignment, a vertical handoff graph, custody events,
accounting, liquidity metrics, and a hash-linked settlement. The shade path
uses governed building footprints and heights with a CPU visibility reference,
three legal route candidates, and explicit direct, shaded, and unknown time.

These are local reference capabilities. They do not establish a live peer
network, factual indoor building topology, real participant consent, payment,
physical custody, relay allocation, or GPU-compute parity. WebGPU renders the
city; sunlight and cooperative scoring currently execute in JavaScript.

| Current owner | Executable contract | Remaining change |
| --- | --- | --- |
| `public/mission/` | Place, mode, time, route, shade, and constraint grounding | General cooperative language beyond the governed battery request |
| `public/world/` | Directed multimodal graph, governed alternatives, building-height visibility reference | Segment-time GPU fields, richer surface data, and route caching |
| `public/runtime/` | Indexed one-hop opportunity generation, hard gates, rolling authorization, custody, settlement, and receipts | Multiple simultaneous requests, relays, capacity allocation, and live updates |
| `public/app/` | WebGPU city rendering plus inspectable cooperation and shade results | Shared compute buffers, interpolation, culling, and indirect drawing |
| `public/contracts/` | Restrictive participant, need, offer, plan, handoff, environment, settlement, and scenario validators | Peer message, relay, allocation, and live authorization contracts |
| `public/data/autonomy/` | SHA-pinned city sources and a governed synthetic battery/building scenario | Factual indoor graphs, item taxonomy expansion, compute policy, and field-quality receipts |

The present renderer rebuilds dynamic triangle data in JavaScript and uploads
it when state changes. It has no autonomy compute pipeline. The target keeps
static meshes on the GPU, updates actor state in structure-of-arrays buffers,
and draws from the same state that compute passes advance.

## System boundary

```text
human language or peer intent
             |
             v
     typed intent ledger             governed world snapshot
             |                                |
             +----------------+---------------+
                              v
                 compatibility and corridor indexes
                              |
                              v
                    feasible route legs
                              |
                 +------------+------------+
                 |                         |
                 v                         v
       WebGPU environment fields   WebGPU numeric scoring
                 |                         |
                 +------------+------------+
                              v
                  JS gates and plan allocator
                              |
                     participant confirmation
                              |
                              v
              fixed-tick simulation and handoffs
                              |
                              v
                 settlement and receipt chain
```

The architecture has five planes.

| Plane | Authority |
| --- | --- |
| Intent and control | Language meaning, hard constraints, legal routes, authorization, custody, allocation, and receipts |
| Compute | Sun visibility, exposure integration, bulk score components, actor integration, culling, and draw preparation |
| Evidence | World snapshots, item taxonomy, building heights, policies, hashes, CPU references, and parity reports |
| Presentation | Map, actors, routes, needs, offers, candidate handoffs, shadows, state transitions, and settled outcomes |
| Peer transport | Discovery envelopes, consent messages, revocation, and signed handoff events through a replaceable adapter |

JavaScript owns control decisions. WGSL receives resolved buffers and computes
settled numeric operations. A shader never interprets language, authorizes a
handoff, creates a route, or changes a participant policy.

## Canonical contracts

New contracts should use restrictive schemas and stable IDs.

### Participant intent

`simulatte.participantIntent.v1` binds:

- participant and ephemeral session identities;
- one or more planned journeys;
- transport mode and accessibility profile;
- carrying mass, volume, quantity, and handling limits;
- maximum added distance, duration, wait, and exposure;
- available time windows and handoff radius;
- compensation or reciprocal-credit policy;
- consent state, expiry, and revocation identity.

The system must retain the original planned journey as the baseline. A revised
baseline creates a new intent identity rather than rewriting marginal cost.

### Need and offer

`simulatte.fulfillmentNeed.v1` binds an item class, exact quantity, acceptable
substitutions, destination, time window, handling policy, and requester value.

`simulatte.resourceOffer.v1` binds an item class, quantity, availability
location, acquisition conditions, custody limits, and expiry. An offer can
represent something already carried or something available along a journey.
Those cases have different pickup costs and must remain distinct.

The item taxonomy owns units, substitution groups, incompatibilities,
regulated-item exclusions, mass, volume, and storage requirements. Language
models may propose a taxonomy row. Only a governed row may enter matching.

### Cooperative plan

`simulatte.cooperativePlan.v1` contains:

- immutable world, policy, environment, and participant-intent identities;
- each participant's baseline and cooperative route;
- pickup, handoff, wait, and drop events;
- item quantity and custody state at each event;
- the full marginal-burden vector per participant;
- hard-gate results and rejected alternatives;
- whether the search proved optimality or stopped at a declared bound;
- authorization identities for every affected participant.

### Environment field

`simulatte.environmentField.v1` binds location, civil time, UTC instant, sun
model, building dataset, height-quality mask, grid resolution, field extent,
compute implementation, and CPU/GPU parity receipt. Missing building heights
produce unknown exposure. They do not become invented shade.

### Handoff and settlement

Each item follows a state machine:

```text
requested -> proposed -> authorized -> pickup_pending -> in_custody
          -> handoff_pending -> delivered -> settled
```

`expired`, `revoked`, `refused`, `missed`, and `failed` are terminal or
replanning states with named causes. Every custody transition binds the prior
state, actor, item quantity, location window, simulated observation, required
authorization, and resulting state.

## Opportunity engine

The matching pipeline removes impossible work before expensive work.

1. Exact compatibility filters join needs and offers by governed item IDs,
   quantity, substitution policy, handling limits, and expiry.
2. A spatial and temporal corridor index joins requests with planned journeys.
   The index stores route cells and arrival-time buckets, not every pair.
3. A geometric lower bound rejects candidates whose minimum possible detour
   already exceeds participant limits.
4. The route planner computes only the missing legal legs for surviving pairs.
   A leg cache keys world, mode, origin, destination, departure bucket,
   constraints, closures, and cost policy.
5. WebGPU computes marginal numeric terms for the compact candidate array.
6. JavaScript applies hard gates and retains a deterministic Pareto frontier.
7. The allocator chooses a non-conflicting set of plans.
8. Participants authorize the exact plan before simulation changes custody.

The candidate receipt records counts before and after every filter. A zero-row
result names the first failing boundary.

### Indexes and complexity

| Work | Structure | Expected cost |
| --- | --- | --- |
| Item compatibility | Map from item or substitution-group ID to needs and offers | Linear build, output-sensitive join |
| Space and time overlap | Uniform city cell and time-bucket inverted index | Linear insertion, output-sensitive lookup |
| Route adjacency | CSR arrays plus ID maps | Constant edge-range lookup |
| A* frontier | Binary heap, best-cost map, deterministic tie break | `O((V + E) log V)` worst case |
| Candidate top-k | Segmented GPU reduction or bounded CPU heap | `O(C log K)` CPU control |
| Relay search | Time-expanded acyclic graph with a declared hop bound | `O(V + E)` per bounded request graph |
| Plan allocation | Min-cost flow where capacities fit the model; deterministic branch and bound for bounded non-fungible plan sets | Receipt names explored states and optimality status |

Repeated full catalog scans and all-pairs participant comparisons are invalid
at city scale.

## Route planning

The route planner keeps topology and hard legality in JavaScript.

1. Compile the directed graph to stable CSR arrays and retain the existing ID
   maps for receipts.
2. Add ALT landmark lower bounds to reduce A* expansions without changing the
   selected route.
3. Replace single-edge-deletion alternatives with a governed k-shortest
   loopless method. Each alternative carries its deviation cause and cost
   terms.
4. Use a time-dependent nonnegative edge cost for shade and other changing
   fields. The planner reads a GPU-produced segment-by-time exposure table.
5. For multiple objectives, retain non-dominated labels per node. A configured
   label bound is allowed only when the receipt reports `searchComplete: false`
   after pruning. The UI must not claim a global optimum in that state.

For a route `r` with segment arrival times `t_i`, direct-sun exposure is:

```text
exposureSeconds(r) = sum(directSunFraction(segment_i, t_i) * travelSeconds_i)
```

Unknown exposure is accumulated separately. A route with less measured sun and
more unknown geometry cannot be called shadier without a policy that explicitly
accepts that uncertainty.

Marginal route costs compare matched snapshots:

```text
delta(participant, plan) =
  cost(cooperative route, same world, same departure, same policy)
  - cost(baseline route, same world, same departure, same policy)
```

Changing traffic assumptions, world data, or departure time in only one lane
invalidates the comparison.

## Relay construction and allocation

A relay graph uses `(placeId, timeBucket, custodyState, participantId)` nodes.
Edges represent travel, wait, pickup, handoff, and delivery. An edge exists only
when time windows overlap, item handling remains valid, and both participants
can reach the handoff.

The initial relay solver should:

- bound hop count and candidate handoff places in policy;
- search the resulting directed acyclic time graph deterministically;
- keep the best feasible plans per request as a Pareto set;
- allocate shared participant capacity across requests;
- report whether the selected plan is globally proven or the best plan inside
  the declared bounds.

Fungible items and simple capacities can use min-cost flow. Non-fungible items,
exclusive time windows, and plan-level conflicts require bounded branch and
bound over complete candidate plans. A heuristic result must not be labeled
optimal.

## Sun and shade computation

The environment pipeline separates astronomical state from visibility.

1. JavaScript computes the sun azimuth and elevation from latitude, longitude,
   UTC instant, and a versioned ephemeris formula.
2. A GPU pass rasterizes governed building footprints and heights into a tiled
   height field with a parallel quality mask.
3. A sun-visibility pass projects occlusion along the sun vector for each field
   cell and time bucket.
4. A segment-exposure pass samples each walkable segment and reduces visible,
   shaded, and unknown fractions.
5. The CPU route planner interpolates the segment table at simulated arrival
   times and integrates exposure over the journey.

The field updates when the date, time bucket, building identity, field extent,
or resolution changes. Camera movement does not recompute sunlight. The visual
shadow map and routing exposure field share sun and building identities, but
they remain separate receipts because a pretty shadow is not routing proof.

A small CPU ray test is the reference implementation. Fixtures cover a single
building, street canyons, missing heights, low sun, a moving arrival time, and
boundary cells. GPU promotion requires tolerance-bounded parity on shaded,
visible, and unknown classifications plus integrated route exposure.

## WebGPU compute and render design

One device context owns all buffers, pipelines, bind groups, and submission.
No resource survives device loss or crosses to a different device identity.

### Stable buffers

| Buffer | Layout | Update rule |
| --- | --- | --- |
| World graph | CSR offsets, destinations, segment IDs, lengths, mode masks | World load only |
| Buildings | Footprint vertices, ranges, heights, quality flags | World load only |
| Actors | Position, velocity, route cursor, mode, state, capacity | Fixed simulation tick |
| Needs and offers | Typed IDs, quantities, cells, time windows, constraints | Intent changes |
| Journey corridors | Cell and time ranges plus participant IDs | Planned-journey changes |
| Candidates | Pair IDs and legal route-leg references | Match cycle |
| Environment | Height, quality, sun visibility, and segment exposure | Environment identity change |
| Draw instances | Mesh ID, transform, color, state, selection flags | Compute from actor and plan state |
| Indirect commands | Visible instance counts and draw ranges | Render frame culling |

All large collections use structure-of-arrays layouts. JavaScript reads back
only compact top-k candidate rows, selected plan components, violations, and
settlement summaries.

### Compute passes

```text
building-height-raster
sun-visibility
segment-exposure-reduce
candidate-score-components
segmented-top-k
actor-fixed-step
instance-transform
visibility-cull
indirect-draw-prepare
```

Each pass has a plain JavaScript reference over a small fixture. Parity tests
compare identities, numeric components, tie ordering, and boundary behavior.
The GPU path cannot omit work performed by the reference lane.

### Scheduling

| Trigger | Work |
| --- | --- |
| World load | Static buffers, route indexes, building field |
| Intent change | Corridor update, candidate generation, legal leg lookup, numeric scoring, allocation proposal |
| Simulated-time bucket change | Sun visibility and segment exposure |
| Fixed simulation tick | Agent dynamics, route cursors, handoff conditions, violations |
| Display frame | Interpolation, instance transforms, culling, indirect drawing |
| Settlement event | Small asynchronous readback and hash-linked receipt |

The simulation tick is independent of display frequency. Rendering interpolates
between two settled actor states. No animation-frame callback waits for GPU
mapping, model inference, route search, or network traffic.

## Peer transport, consent, and privacy

The cooperative engine depends on typed intents, not one network protocol.
Use a `PeerIntentAdapter` boundary with a deterministic local-scenario adapter
for tests and a separately governed live adapter.

Live discovery should use two disclosure stages:

1. Publish a coarse, expiring envelope with item class, quantity band, route
   corridor cells, time buckets, and policy bounds.
2. Reveal exact route, location, identity, and handoff terms only after mutual
   candidate consent.

Messages bind a content hash, sender key, expiry, sequence, and revocation ID.
Exact inventory and full journey traces remain local unless the participant
authorizes disclosure. Pickup, custody, handoff, and delivery events require
signed acknowledgements from the parties named by policy.

Peer transport does not make a safety or trust claim. Identity verification,
payment, dispute handling, prohibited items, insurance, and physical delivery
remain explicit unsupported boundaries until their own governed artifacts and
gates exist.

## Receipt chain

One cooperative run emits linked receipts for:

1. parsed language and unsupported spans;
2. participant, need, offer, and journey identities;
3. world, policy, item taxonomy, and environment identities;
4. compatibility and corridor filter counts;
5. route legs, alternatives, cache mode, and graph expansions;
6. GPU dispatches, candidate counts, score components, and readback bytes;
7. rejected hard gates and retained Pareto candidates;
8. selected plan, marginal burden, search bounds, and authorization;
9. every custody transition and simulated occurrence;
10. fulfillment, participant outcomes, violations, and final settlement.

The renderer may visualize these facts. It does not create them. A route line,
shadow, or handoff animation is not evidence unless its source receipt and
settlement identity agree.

## Performance and quality gates

Benchmarks must separate:

- world and static GPU initialization;
- cold and warm intent compilation;
- compatibility and corridor lookup;
- route-cache hit and miss;
- route search expansions;
- environment-field update;
- candidate GPU scoring and top-k readback;
- allocation;
- fixed-tick simulation;
- CPU frame preparation, GPU frame time, and dropped frames;
- settlement readback and receipt hashing.

Capacity profiles belong in a manifest and derive from measured device limits.
Each profile declares maximum actors, intents, candidates, route samples,
field cells, and GPU bytes. Exceeding a bound produces a visible refusal or a
lower declared profile. It must not silently truncate candidates.

Correctness gates require:

- no selected plan violates an exact quantity, capacity, time, accessibility,
  custody, or consent constraint;
- marginal cost recomputes from the same baseline identities;
- CPU and GPU numeric lanes agree inside declared tolerances;
- same inputs, seed, world, and policy produce the same selected plan;
- every GPU resource belongs to the active device;
- no synchronous readback occurs in the animation loop;
- visual state and receipt state name the same actors, item, route, and handoff;
- sealed scenarios beat the no-cooperation and shortest-route controls without
  weakening participant constraints.

## Implementation slices

### 1. Contract and local scenario: implemented

Need, offer, participant-intent, cooperative-plan, handoff, environment,
settlement, and scenario validators run in the browser and Node. The East
Village battery scenario includes compatible carriers, quantity and item
decoys, immutable route commitments, and an explicitly synthetic indoor graph.
The existing single-agent route remains the baseline control.

### 2. One-hop opportunity engine: implemented local reference

Item and space-time indexes, route-corridor matching, marginal leg planning,
hard gates, deterministic selection, rolling authorization, backup recovery,
custody, accounting, settled training rows, and liquidity metrics are tested.
Authorization is simulated by the local scenario and is not a live consent
claim.

### 3. Shade-aware routing: CPU reference implemented

Governed sun inputs, building-height quality, CPU ray/footprint visibility,
route exposure integration, and route selection are tested against synthetic
occlusion fixtures and the real checked-in world. GPU field passes and their
CPU/GPU parity receipt remain required before a GPU-compute claim.

### 4. Shared GPU city state

Replace per-update dynamic triangle construction with persistent actor and
instance buffers. Add fixed-step actor compute, interpolation, culling, and
indirect drawing. The visible city and opportunity engine consume the same
actor and plan identities.

### 5. Relays and allocation

Add bounded time-expanded handoff graphs, capacity conflicts, multi-request
allocation, custody transitions, and explicit optimality status.

### 6. Live peer adapter

Add coarse discovery, consent-gated detail exchange, expiry, revocation, and
signed handoff messages behind `PeerIntentAdapter`. Keep the deterministic
local adapter as the reference and replay lane.

The release gate for each slice is a complete intent-to-settlement receipt,
not the presence of a shader, route, or animated actor.
