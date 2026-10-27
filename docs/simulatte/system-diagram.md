# System Diagram Simulator contracts

Owner: [System Diagram Simulator charter](../../public/simulatte/system-diagram/CATSCAN.md).
Canonical validators: [class library](../../public/simulatte/system-diagram/class-library.js) and
[diagram document](../../public/simulatte/system-diagram/diagram.js). This page describes them;
when prose and code disagree, the validators win and this page is corrected.

System Diagram Simulator is a system diagram editor first. People drag configurable node
classes onto a canvas, connect ports, and the drawn system runs as a deterministic,
seeded discrete-event simulation of its distributed compute: requests and messages
on edges, queueing, service time, concurrency, latency, bandwidth, failures,
retries, timeouts, replication and recovery.

The evolution stages and diagram detail levels are separate axes. Evolution
Stage 0 is sketch, Stage 1 simulation, Stage 2 specification, Stage 3 deployment,
Stage 4 operation and Stage 5 system. Detail Level 0 is Context, Level 1
Capabilities, Level 2 Architecture, Level 3 Internals and Level 4 Implementation.
A walkthrough's numbered steps are iterations within the current simulation
stage, not promotions along either axis. Expanding a reusable subsystem changes
inspection detail; it does not establish a deployable specification or operational
system. The public solution catalogue executes synthetic simulations. Later
evolution stages require their own implementation and evidence; a successful
simulation run does not prove them.

## Question-first system designs

The [six learning journeys](../../public/data/system-diagram/learning-journeys.json)
introduce chat, video, agent trajectories, Spark-style jobs, social feeds and
workspace access. Each opens an editable diagram, names the operations on links,
explains an outcome and failure experiment, and exposes actual observed records.
[Scenario contracts](system-design-scenarios.md) define their synthetic boundaries
and acceptance evidence. `learning.js` presents these records; kernels remain the
only execution authority. Custom diagrams retain data and activity inspection.

Document `simulatte.systemDiagram.v2` adds optional `edge.label`, bounded by
`maxLabelLength`. Version v3 adds optional `group.collapsed`. Both are presentation
state and do not change compiled execution. Legacy v1/v2 documents import without
rewriting their identities; authoring a new field promotes only the document that
uses it. Groups still have flat explicit node membership and folding remains
presentation-only. Version v4 adds a separate reusable subsystem definition model:
instances bind explicit definition versions, external ports bind internal ports,
and nested definitions lower into executable primitive graphs. See the subsystem
contract below; a folded group is not a saved definition.

A library/config update changes the accepted WorldSpec hash: checkpoints from older libraries refuse restoration
rather than silently resume under different semantics. Import the drawing and
start a newly accepted run, or use its original pinned runtime for old replay.

## Module ownership

All browser files live in `public/simulatte/system-diagram/` and are classic scripts
with CommonJS exports, matching the rest of World. No file exceeds 999 lines.

| File | Role |
| --- | --- |
| `class-library.js`, `diagram.js`, `subsystems.js` | Governed class packs, named ports, versioned composition, validation and deterministic lowering |
| `kernel-registry.js`, `kernels-*.js` | Explicit behavior registration and capability checks for declared synthetic kernels |
| `engine-core.js`, `engine.js`, `engine-network.js`, `engine-observability.js` | Ordered events, per-node RNG, calls, resources, faults, causal records and observation |
| `runner.js` | WorldSpec and shared coordinator binding, exact display state, controls, checkpoints and replay |
| `editor-model.js` | Atomic commands, selection, semantic identity and undo/redo |
| `editor-canvas.js`, `editor.css` | SVG authoring, named-port wiring, reconnect, pan/zoom and actual-state rendering |
| `page.js`, `index.html`, `style.css`, `profile.js` | Palette, contextual class/instance fields, accepted/pending lifecycle, save/load, controls, metrics and request inspection |

Data lives in `public/data/system-diagram/`: `class-library.json` (manifest),
`classes/*.json` (packs), `config.json` (engine bounds, playback, editor, examples)
and `examples/*.json` (diagram documents).

Page CSS never targets `button`, `select`, `summary`, `.wui-*` or `[data-wui]`;
World UI owns controls (`tools/check-world-ui-ownership.mjs`). Use `SimButton`,
`SimMenu`, `SimSheet`, `SimInspector`, `SimMetric`, `SimField` and `adoptTree`.

## Class library

The manifest declares payload types, categories, shared parameter sets, edge
parameters, fault types, error codes and the pack list. Each pack declares kernels
and classes.

- A **kernel** is executable behaviour: ports, typed parameters with defaults and
  the node faults it supports. A kernel without a registered implementation fails
  closed when a diagram using it is run.
- A **built-in class** names a kernel, a category, a glyph and parameter defaults.
  Many classes share a kernel (Web server, Worker and Bulkhead are `service`).
- A **user class** lives in the diagram document: `{ id: "user.<kebab>", label,
  extends, defaults, category?, glyph?, description? }`. `extends` names a built-in
  or another user class; the chain must reach a built-in within
  `config.bounds.maxClassDepth`. User classes inherit the kernel and ports.

Parameter specs: `{ type: number|integer|boolean|enum, label, default, group:
basic|advanced, unit?, min?, max?, options?, help? }`. Values outside the spec are
rejected, never clamped.

Port specs: `{ id, direction: in|out, label, multiple, required, accepts|emits }`.
`accepts` lists payload ids or `any`. `emits` lists payload ids, `inherit` (the
inbound payload passes through) or `param:<enum parameter>`. Payload mismatches are
warnings from `issues()`; they never block drawing.

### Instance override rules

1. Resolution order, later wins: kernel parameter default, built-in class defaults,
   each user class from root to leaf, instance `params`.
2. Instance `params` hold overrides only. Every key must be a kernel parameter and
   every value must satisfy its spec. Resetting an override deletes the key.
3. `resolveNodeParams()` returns `values` plus `sources`, where each source is
   `kernel`, a class id, or `instance`, so inspectors can show where a value came from.
4. Editing a user class changes every instance that does not override that key.
5. `deriveClass()` creates a user class extending the instance's class with the
   instance overrides as defaults, then clears the instance overrides. Resolved
   values are unchanged.
6. `changeClass()` keeps overrides that remain valid for the new kernel, reports the
   dropped keys, and removes edges and faults that no longer apply.
7. A user class that any node or other user class references cannot be deleted.
8. Edge parameters resolve from `library.edgeParams` defaults, then `edge.params`.
9. Primitive class ports come from their kernel. Subsystem definitions expose named
   bindings to internal ports; they do not replace primitive kernel behaviour.

## Reusable subsystem contract

Owner: [subsystem composition](../../public/simulatte/system-diagram/subsystems.js)
and [document validator](../../public/simulatte/system-diagram/diagram.js).

A reusable subsystem owns an internal architecture and a named external interface.
Its behaviour comes from executing that architecture through the existing kernels,
not from a synthetic success response on a new opaque node. Two instances share a
definition but have independent executable state. A definition can itself contain
instances of other versioned definitions.

| Operation | Contract |
| --- | --- |
| Save | Capture selected components and their internal connections; preserve crossing connections through external port bindings. |
| Reuse | Insert another version-pinned instance with independent runtime state. |
| Nest | Include a subsystem instance inside another definition, within validation bounds. |
| Publish | Add an explicit revision while preserving older definitions and pins. |
| Upgrade | Rebind selected instances explicitly and validate ports and overrides atomically. |
| Override | Change declared descendant primitive parameters for one instance, without changing its shared definition. |
| Run | Lower the accepted version-pinned graph deterministically into existing executable nodes and edges. |

Publishing is not live propagation. Existing instances remain on their selected
version until explicitly upgraded. Accepted runs retain the architecture they
accepted even after the pending document publishes, upgrades or changes overrides.
A failed edit must leave both the pending document and accepted execution intact.
Port bindings carry the mapped endpoint's direction and payload contract; invalid
references or recursive definition dependencies refuse rather than draw a plausible
placeholder. Graph message cycles remain distinct from recursive definitions.

Documents retain their definitions so exported architecture does not depend on a
mutable remote registry. This is portable local composition, not multi-user
synchronization, automatic cross-file updates or arbitrary user-supplied code.

### Version v4 shape and bounds

A v4 document adds optional `subsystems`. Each definition has
`{ id, version, label, nodes, edges, groups, notes, faults, ports }`. `version` is a
positive integer; the definition identity is the pair `(id, version)`. Its internal
graph uses the same node, edge, group, note and fault contracts as the root graph.
Nested definitions resolve from the enclosing document. Save and publish snapshot
resolved primitive parameters and built-in class references, so later user-class
edits cannot silently mutate pinned behaviour.

A subsystem node keeps ordinary `id`, `label`, `x`, `y` and optional `groupId`, with
`classId: "subsystem.chat-backend@1"`, empty `params` and optional `overrides`:

```json
{
  "generation-capacity/generation": { "chunkDelayMs": 3000 },
  "generation-capacity/generation-b": { "chunkDelayMs": 3000 }
}
```

Override paths use internal node IDs separated by `/` and end at a primitive.
Pinned primitive parameters resolve first, then nested-instance overrides, then
the containing instance's explicit descendant overrides. Unknown
paths, composite endpoints and values outside kernel parameter specs refuse.

Each external port is `{ id, label, direction, target: { nodeId, portId } }`.
The target is a direct internal node port, possibly another subsystem's external
port. Direction must agree; payload types, required status and cardinality derive
from the terminal primitive port. Duplicate aliases for one target refuse.
Capture exposes existing internal ports, including unused ports for later wiring;
editing a new definition revision can narrow or rename that interface.

Definitions are bounded to 100 entries and eight nested levels. Expanded instance
and primitive counts are also bounded. Existing
`config.bounds` apply both to each definition and the fully expanded graph, not
just the visible boxes. Expanded nodes receive deterministic collision-free IDs;
root primitive IDs remain unchanged. Port mappings rewire real endpoint edges
without inserting a transport hop or service delay. Group membership and scheduled
internal faults lower with their owning graph. Composite nodes permit visual
boundary membership only; resource and failure-domain groups belong inside their
definitions. Direct faults on a composite node
refuse; author faults on its internal primitives or supported failure domains.

Versions v1-v3 remain importable; composition authoring promotes its document to
v4. Folding a group still does not create a definition. The compiler returns the
existing primitive compiled-graph schema with a `composition` receipt containing
instance paths, pinned references, overrides and `{ id, path, kind }` mappings.
Kernels and replay keep one execution path. The portable library contains definitions and referenced user classes;
import conflicts refuse rather than replacing an existing version.

## Diagram document `simulatte.systemDiagram.v1`

```json
{
  "schema": "simulatte.systemDiagram.v1",
  "id": "web-service", "name": "Web service", "description": "optional",
  "seed": 42, "run": { "horizonSec": 120 },
  "classes": [{ "id": "user.fast-api", "label": "Fast API", "extends": "web-server", "defaults": { "serviceMs": 2 } }],
  "nodes": [{ "id": "api", "classId": "user.fast-api", "label": "API", "x": 240, "y": 80, "params": { "concurrency": 4 }, "groupId": "zone-a" }],
  "edges": [{ "id": "e1", "from": { "nodeId": "users", "portId": "out" }, "to": { "nodeId": "api", "portId": "in" }, "params": { "latencyMs": 20 } }],
  "groups": [{ "id": "zone-a", "label": "Zone A", "kind": "zone", "x": 0, "y": 0, "w": 400, "h": 240 }],
  "notes": [{ "id": "note-1", "text": "Cache warms in 10 s", "x": 0, "y": 300 }],
  "faults": [{ "id": "f1", "atSec": 30, "untilSec": 45, "target": { "kind": "node", "id": "cache" }, "type": "crash", "params": {} }],
  "view": { "x": 0, "y": 0, "zoom": 1 }
}
```

- Ids of nodes, edges, groups, notes and faults share one namespace:
  `[A-Za-z][A-Za-z0-9_-]{0,63}`. `newId(doc, prefix)` allocates `prefix-N`.
- Node `x, y` is the top-left corner in world units; node size is
  `config.editor.nodeWidth` by `nodeHeight`. Layout never affects simulation.
- `groupId` is explicit membership. Groups of kind `zone` or `region` are failure
  domains (`outage` fault); `boundary` is visual only. A `resource` group requires
  integer `capacity` in 1–64 and shares concurrent worker slots. It is not an outage target.
- Edges connect an `out` port to an `in` port of a different node. Ports with
  `multiple: false` take one edge. Duplicate edges between the same ports are
  rejected. Cycles are allowed; messages carry a hop count bounded by
  `config.engine.maxHops`.
- Faults are scheduled interventions. `untilSec: null` means permanent. Node faults
  must be listed by the node's kernel.
- Unknown fields anywhere are rejected. Bounds come from `config.bounds`.
- The validated document is the only authority; `compile()` produces the frozen
  executable graph `simulatte.systemDiagramCompiled.v1`:
  `{ diagramId, name, seed, horizonSec, libraryVersion, nodes: [{ id, label,
  classId, kernel, params, groupId, out: { portId: [edgeId] }, in: { portId:
  [edgeId] } }], edges: [{ id, from, fromPort, to, toPort, params }], groups: [{ id,
  kind, label, nodeIds }], faults }`. Out-port edge lists are sorted by edge
  `order`, then id; that order is the call order.

## Simulation semantics

Time is seconds of simulated logical time (doubles). Parameters in ms are converted
on use. All randomness comes from per-node xorshift streams seeded from the diagram
seed and the node id, so adding a node does not change other nodes' draws. Events
run in `(time, sequence)` order. Nothing reads wall-clock time.

- **Requests, attempts and effects stay distinct.** A source creates a logical
  request (`trace`). Every `ctx.call` try is an attempt with its own call id.
  Storage kernels commit effects keyed by idempotency key and count duplicates.
- **Messages**: `{ id, trace, attempt, delivery, ptype, kb, tokens, key, op, born,
  deadline, idem, hops, fields }`. `op` is `read` or `write`; `idem` is the
  idempotency key (`trace` when the source reuses keys, else `trace:attempt`);
  `delivery` counts queue deliveries; `fields` carries kernel extras such as
  `invalid`, `stale`, `degraded`, `candidates`.
- **Edges** model network transfer per direction: serialization at
  `bandwidthMbps` in FIFO order, then `latencyMs` plus uniform `jitterMs`, then
  loss at `lossRate`. Requests travel from `from` to `to`; replies travel back on
  the same edge. Edge `mode: async` means the caller does not wait for the reply.
  `probability` and `callsPerRequest` shape how often a caller uses the edge.
- **Stations**: kernels that queue work use FCFS queues with `concurrency` workers
  and `queueCapacity` waiting slots. A full station replies `rejected`. Service
  times sample `constant`, `exponential` or `lognormal` distributions. When
  capacity or a slowdown changes while work is in service, remaining work is
  rescaled and stale completions are fenced by generation.
- **Calls** carry a timeout. A timeout fails the attempt; a late reply is counted
  as wasted work and dropped. Retries back off by `backoffMs * multiplier^n`, with
  optional full jitter. The callee is not cancelled when its caller gives up.
- **Faults** (node): `crash` refuses arrivals with `down`, resets in-flight work and
  stops sources; `slow` multiplies service time; `errors` fails served work at a
  rate; `blackhole` swallows arrivals and replies; `dropReplies` processes work
  but loses replies (effects still commit). Edge: `partition` drops everything,
  `degrade` adds latency and loss. Group: `outage` crashes every member node.
  `repair` clears every fault on its target. Kernels may react through `onFault`
  (a cache flushes, a replicated database elects a new leader).
- **Error codes**: `rejected`, `down`, `timeout`, `error`, `unavailable`,
  `invalid`, `rate-limited`, `dropped`, `hop-limit`, `circuit-open`.
- **Bounds**: more than `config.engine.maxInFlight` simultaneous messages stops
  the run with a visible error rather than dropping work silently.

Metrics are deterministic functions of state. Latency percentiles come from a
fixed log-scale histogram (`config.engine.histogram`). Time series use
`seriesBucketSec` buckets over the last `seriesWindowSec` seconds.

## Engine API

`SimulatteSystemDiagramEngine` is pure apart from mutating the state it is given.
`deps = { library, config, kernels }`.

| Function | Contract |
| --- | --- |
| `initialize(compiled, deps)` | Returns JSON-safe state at `t = 0`, kernels initialized and started, scheduled faults queued |
| `advance(compiled, state, toTime, deps)` | Processes every event with time `<= toTime` in order, sets `state.t = toTime`, returns `state`. `advance(advance(s, a), b)` equals `advance(s, b)` for `a <= b` |
| `applyControl(compiled, state, control, deps)` | Applies a control at `state.t` after events at that time |
| `observe(compiled, state, deps)` | Returns the view below; never mutates state |
| `metrics(compiled, state, deps)` | Deterministic summary used for replay hashes |

Controls: `{ kind: 'fault', target: { kind, id }, type, params }`,
`{ kind: 'repair', target }`, `{ kind: 'redrive', target: { kind: 'node', id } }`,
`{ kind: 'setParams', target: { kind: 'node' | 'edge', id }, params }`. `setParams`
applies live parameter overrides held in state, so kernels read parameters through
`ctx.p` on every use and never cache them.

View returned by `observe`:

```text
{
  t, horizonSec, done, error,               // error: null or string when the run stopped on a bound
  global: { offered, completed, failed, failedBy: { code: n }, inFlight, attempts, retries,
            effects, duplicateEffects, wastedWork, cost,
            throughput, errorRate,                 // last 5 s window
            latency: { p50, p95, p99, mean },      // ms, cumulative completed requests
            latencyWindow: { p50, p95, p99 } },    // ms, last 10 s
  series: { bucketSec, startSec, offered: [], completed: [], failed: [], p95: [] },
  nodes: { [id]: { health: ok|busy|degraded|down|open|electing, faults: [type],
                   queue, queueCapacity, busy, capacity, utilization,
                   arrivals, served, errors, rejected, throughput, latency: { p50, p95 },
                   detail: { [label]: value } } },
  edges: { [id]: { rate, errorRate, inTransit, faults: [type] } },
  transit: [{ id, edgeId, kind: req|res, t0, t1, ptype, ok }],  // capped at config.engine.transitRenderLimit
  log: [{ seq, t, kind, nodeId?, edgeId?, message }]             // ring of notable events
}
```

## Kernel API

Kernel files call `SimulatteSystemDiagramKernels.register({ id, station, ...hooks })`.
Stateful hooks use only the `ctx` object; they never touch engine internals.
An optional stateless `validateTopology(node, compiled)` hook checks resolved
peer and link contracts before initialization or a live parameter mutation.
Rejected live edits leave the accepted state unchanged.

`station` is `null` or `{ concurrency: '<param>', queueCapacity: '<param>' }`
naming the kernel parameters that size its FCFS station.

| Hook | Called |
| --- | --- |
| `validateTopology(node, compiled)` | Before initialization and live parameter changes; validates the complete resolved topology without changing it |
| `init(ctx)` | Once; returns kernel state stored as `ctx.k` (JSON-safe) |
| `start(ctx)` | Once at `t = 0` after every node initialized; sources schedule first work |
| `onRequest(ctx, job)` | A request arrived at an up node. Default: `ctx.admit(job)` |
| `onServed(ctx, job)` | Station service finished; reply or call downstream |
| `onResult(ctx, job, slot, result)` | Final outcome of `ctx.call` after retries. `result = { ok, err, msg, latencyMs, attempts }` |
| `onWake(ctx, payload)` | Timer from `ctx.wake` |
| `onFault(ctx, fault, active)` | After generic fault effects are applied or cleared |
| `onControl(ctx, control)` | Kernel-specific control such as `redrive`; returns true if handled |
| `observe(ctx)` | Returns `{ health?, detail }` for the view |

`ctx` members:

| Member | Meaning |
| --- | --- |
| `t`, `nodeId`, `node`, `p`, `k` | Time, compiled node, resolved live parameters, kernel state |
| `fault` | `{ down, slowFactor, errorRate, blackhole, dropReplies }` effective for this node |
| `rand()`, `exp(mean)`, `lognormal(mean, cv)`, `poisson(mean)`, `zipf(n, s)` | Node RNG stream |
| `serviceMs(meanMs, dist, cv)` | Sampled service time including the slow fault |
| `admit(job, serviceMs?)` | Enqueue on the station; on completion calls `onServed`. Returns false after replying `rejected` |
| `release(job)` | Free the job's worker without replying (non-blocking downstream calls) |
| `reply(job, { ok, err?, kb?, ptype?, tokens?, fields? })` | Reply to the caller (if any), free the worker, finish the job |
| `call(job, edgeId, msgPatch, { timeoutMs, retries, backoffMs, multiplier, jitter, slot, async })` | Send a request on an out edge. Applies edge `op`, mode and loss. Delivers the final result to `onResult(ctx, job, slot, result)` unless `async` |
| `send(edgeId, msg)` | One-way message with no job and no reply |
| `edges(portId)` | Compiled out edges for the port in call order |
| `edgeUsable(edgeId)` | False while the edge is partitioned |
| `newJob(msg)` | Job with no caller, for sources and internal work |
| `message(fields)`, `derive(msg, patch)` | New logical request, or a child message on the same trace |
| `beginRequest(msg)`, `endRequest(msg, { ok, err })` | Sources only: logical request accounting and end-to-end latency |
| `effect(key, { idempotent, windowSec })` | Commit a write effect; returns `{ duplicate, suppressed }` |
| `wake(delaySec, payload)` | Schedule `onWake` |
| `count(key, n)`, `latency(key, ms)`, `log(kind, message)`, `cost(usd)` | Counters, histograms, notable events, synthetic cost |

## Runner API

`await SimulatteSystemDiagramRunner.create({ diagram, library, config, kernels, profileId })`

| Member | Contract |
| --- | --- |
| `compiled`, `seed`, `horizon` | Accepted inputs |
| `time()`, `advanceTo(t)` | Display state advances synchronously and exactly; `t` clamps to the horizon |
| `view()` | `observe()` of the display state |
| `inject(control)` | Applies at the current display time and records it; returns the recorded control with `atSec` |
| `controls()` | Recorded live controls |
| `sync()` | Brings the authoritative coordinator to display time and verifies equal state hashes |
| `pump(budgetMs)` | Background authoritative catch-up |
| `checkpoint()`, `restore(cp)` | Coordinator checkpoints with the display state |
| `verify()` | Coordinator ledger replay plus an independent rerun; `{ status: match|diverged, rounds, metricsHash }` |
| `program()` | Finalized WorldSpec binding diagram, seed, library and config hashes |
| `exportReplay()` | `{ schema: 'simulatte.systemDiagramReplay.v1', diagram, seed, controls, untilSec, metricsHash, worldSpecHash }` |
| `SimulatteSystemDiagramRunner.replay(doc, deps)` | Reruns a replay document and checks its metrics hash |
| `dispose()` | Releases the coordinator |

The shared [multirate coordinator](../../public/shared/core/simulation/multirate-coordinator.js)
owns logical rounds at `config.engine.authoritativeCadenceSec`, controls, checkpoints
and ledger replay. The display state is an exact preview of the same pure model, so
animation can run between rounds without changing results.

## Editor API

`SimulatteSystemDiagramEditorModel.create({ diagram, library, config })`:
`diagram`, `selection` (`{ nodes, edges, groups, notes }` id arrays), `apply(command)`
returning `{ ok, kind, id?, error? }`, `undo()`, `redo()`, `canUndo()`, `canRedo()`,
`select(selection, { additive })`, `replace(diagram)`, `issues()`,
`subscribe(listener)`. A rejected command leaves the document unchanged.

Change kinds tell the page what to do:

| Kind | Commands | Simulation |
| --- | --- | --- |
| `structure` | addNode, deleteItems, connect, setNodeClass, setNodeGroup, duplicate, addGroup/updateGroup (kind), deriveClass | Restart |
| `params` | setNodeParams, setEdgeParams | Restart, or live `setParams` while running |
| `classes` | addUserClass, updateUserClass, deleteUserClass | Restart |
| `faults` | addFault, updateFault, removeFault | Restart |
| `meta` | setMeta seed or horizon | Restart |
| `label` | setNodeLabel, setMeta name or description, notes | No restart |
| `layout` | moveItems, setPositions, group geometry, setGroupCollapsed | No restart |
| `view` | setView (no history) | No restart |
| `selection` | select (no history) | No restart |
| `load` | replace | Restart |

`SimulatteSystemDiagramCanvas.create({ host, model, library, config })` renders the
document in SVG with layers `groups`, `edges`, `nodes`, `overlay`, `interaction`.
It exposes `nodeBox(id)`, `portPosition(nodeId, portId)`, `edgeElement(id)` (an
SVG path in world units), `nodeElement(id)` with an empty `.sd-node-status` group
for run overlays, `fit()`, `zoomBy(f)`, `getView()`, `setView(v)`,
`screenToWorld(p)`, `layers`, `render()` and `dispose()`. Pointer drag moves nodes,
dragging from a port connects, empty-canvas drag pans, shift-drag selects,
Ctrl or pinch zooms; touch and keyboard paths exist for each.

Collapsed groups hide their real members and internal wires only in the drawing.
Crossing wires keep their actual node/port identities and attach to visible boundary
ports. Expanding exposes the same editable, executable components; no replacement
kernel runs when folded. Moving a group moves its members together. Fold state is
undoable and saved with the diagram; folded bounds determine fit-to-view. The
walkthrough expands a containing group before selecting one of its members.
A displayed member count is not an end-to-end request count: summing node
completions would count the same request at several hops.

## Page lifecycle and inspection

`page.js` composes shared World UI controls and the canonical command model. It keeps
an immutable accepted diagram and runner separate from the pending editor. Semantic
changes require explicit Accept & run; layout, labels and view changes do not change
the accepted numerical model. Save/load stores the pending diagram and separately
accepted checkpoint. Restore loaded replay validates the complete causal checkpoint
before replacing execution.

The runnable palette checks kernel registration; the class library validates
resolved parameter defaults. A registered class is not a guarantee that every
wiring is supported. Imports validate their document and the engine checks
kernel topology contracts before accepting a run.

`runner.inspect(requestId)` returns the logical request, attempts, effects, retained
jobs, blockers and causal history. This history is independent of the short notable
log ring. Request pagination keeps every retained model request reachable. A producer
may be acknowledged while its leased background jobs or dead letters retain memory;
the UI reports logical requests and jobs separately.

The canvas consumes actual `view()` records through `setState(view,{pending})`.
Pending semantic edits show no invented running state. Touch starts at a readable
view; Fit explicitly requests a full-graph overview. Keyboard and touch multi-select
remain available for cluster authoring.

## Claims

Results are synthetic. Service times, latencies, failure rates, batching and token
costs are user assumptions; nothing here measures real systems, providers or
hardware, and replay hashes do not establish physical validity.

## Executable capability status

The canonical class library declares reusable event-processing and replica
primitives. Declared executable kernels have registered synthetic implementations. The runtime
registry's `ids()` remains the executable-kernel inventory; metadata alone does
not establish support. User classes inherit their base kernel, ports, parameter
validation and model limitations. Registration and passing synthetic tests do not
establish production fidelity or human usability.

| Kernel family | Executable synthetic behavior | Explicit boundary |
| --- | --- | --- |
| Source, service, endpoint | Configured arrivals, FCFS concurrency, downstream calls, retry/timeout outcomes and bounded admission | No actual clients, RPC execution or measured service capacity |
| Queue, dead letter | Leases, redelivery, receive budget, retained failed work and redrive | No durable broker protocol proof |
| Routing/recovery | Load balancing/ejection, rate budgets, circuit breaking, retries and fallback/failback | Configured policies, not vendor implementation equivalence |
| `batchWorker`, `embedder` | Batch size/window, concurrent batch workers, remaining-time slowdown updates, synthetic vector dimensions and payload sizes | No device kernels, actual embedding vectors, transfer overlap or physical VRAM prediction |
| `llm` | Synthetic TTFT/prefill/decode work, processor sharing with recomputed completions, context/quota limits, token cost, typed output and tool-call rounds | No inference, semantic quality, KV-cache realism or provider pricing assurance |
| `vectorIndex`, `reranker`, `retriever` | Synthetic index growth/query time, candidate scoring time and explicit embed/search/rerank/generate calls | No actual ANN algorithm, embeddings, learned relevance, measured recall or retrieval quality |
| `chunker`, `structuredResponse` | Bounded token chunks/overlap, downstream fan-out, synthetic validity flags and finite repair calls | No real tokenizer, JSON parser, schema validator or semantic extraction |
| `database`, `replicatedDb` | Synthetic writes/effects, async/sync/quorum wait sets, replica lag, stale reads, leader/follower failure, election and lost unreplicated versions | Not a consensus implementation, real durability guarantee, transaction isolation model or proof for arbitrary quorum configurations |
| `cache` | Keyed TTL, sampled LRU, coalesced misses, write policies, cold restart and declared fail-open origin bypass | No real heap/GC, cache coherence or cache capacity calibration |
| `objectStore` | Base latency plus object size/per-request throughput, bounded station and write effects | No durable bytes, shared disk bandwidth/IOPS or storage consistency proof |
| Event processing | Explicit event identity/schema/version/time/lineage, validation/quarantine, approval, ordered/idempotent reconciliation, late-event windows and partitioned shuffle/spill | Synthetic flags and scalar records, not arbitrary schema transformation, clinical decisions, financial settlement or real disk checkpoints |
| `cron` | Interval scheduling, nominal starts, overlap handling, missed runs and retry budgets | No host cron daemon, calendar/time-zone scheduling or external jobs |
| `crawler` | Bounded synthetic per-domain frontier, duplicate sampling, fetch concurrency, politeness, throttle backoff and document emission | No live scraping, actual URLs, content semantics, access-policy evaluation or complete source provenance |

Resource groups share a declared count of executable worker/batch slots. Station
kernels and explicitly declared `batchWorker`/`embedder` slot owners acquire these slots; batch
completion or crash releases them and wakes waiting peers through a deferred
logical event. A resource group containing unsupported custom kernels such as
`llm`, `crawler` or `cron` must refuse execution instead of implying contention
that those kernels do not model. Boundary groups remain visual; zone/region groups
retain only their declared outage semantics. A group is not physical VRAM sharing,
network placement or arbitrary protocol realism.

The shipped example documents compose the same kernels:

- `web-service`: clients → CPU API → TTL cache → asynchronous replica store, plus
  leased queue → CPU worker → idempotent results and a dead-letter destination.
- `rag-assistant`: natural-language source → CPU API → GPU batch → RAG orchestration
  with actual registered synthetic embedding, vector-index, reranking and generation
  kernels. Document ingestion shares the embedder/index through a chunker. These
  stages execute timing, typed payload and count models; they do not process real
  vectors or language.
- `crawler-pipeline`: autonomous crawler → synthetic website fetch and document
  parsing; cron injects scheduled work into the same CPU parser, structured
  validator, database and asynchronous object archive.

The crawler is a source with no input port. Cron therefore shares its downstream
ingestion path instead of connecting to a nonexistent crawler input. Example
sources have explicit request/stop bounds and a declared observation horizon.

[Canonical routing/storage tests](../../tests/system-diagram-kernels-c1.test.cjs)
and [AI/source tests](../../tests/system-diagram-kernels-c2.test.cjs) exercise
synthetic policy behavior. [Composition tests](../../tests/system-diagram-kernels.test.cjs)
check the shipped diagrams, topology-dependent execution, deterministic replay and
serialized continuation. Engine checkpoints, resource ledgers and causal inspection
have separate assertions. Browser interaction and visual review remain additional
evidence layers; no kernel test proves a successful user journey or calibration.

## Authoring and qualified repair journeys

The [coverage matrix](system-diagram-coverage.md) names the six requested workload
journeys, concrete gaps and independent acceptance tests. Streaming, replica recovery,
agent recovery and healthcare/finance/lakehouse examples are editable compositions,
not separate engines. Every component remains available from a blank canvas.

Contextual fault authoring lists applicable node, link and failure-domain faults,
validated parameters and logical start/end times. Scheduled faults belong to pending
architecture; injected controls belong to the accepted run. Resource clusters do not
imply failure-domain semantics.

Advance accepts a positive fractional duration, separate from the one-second step.
It pauses the accepted execution at that logical observation time, so a checkpoint
can retain short-lived service, network, acknowledgement and retry states. It does
not accept pending diagram edits.

Capture baseline retains immutable authored demand, fault timing and controls. Compare
repair executes baseline and edited architecture sequentially, verifies both replays,
checks actual source IDs/times and complete input payload descriptors, then restores
the prior accepted checkpoint. Response-coupled demand that differs is refused as a
paired experiment. Exported evidence contains both executable replay documents.

Network transfers retain remaining serialization and propagation work. Authored FIFO
or fair bandwidth sharing and full or shared duplex links invalidate stale completion
estimates when contention, capacity or faults change. Node memory policies model
pressure slowdown, retained garbage, GC pauses and bounded admission or synthetic
OOM crash/recovery. The memory and transfer ledgers reconcile their modeled totals.
These are explicit discrete-event policies, not calibrated hardware predictions.

A locally committed effect with a failed or missing caller acknowledgement remains an
unknown caller outcome until an acknowledged idempotent retry confirms that exact
effect. The original failed attempt remains visible. Request, attempt, effect, retained payload and resource-cause
records remain inspectable. Reconciliation waits and quarantine retain modeled memory
and blockers after the initiating logical request finishes.

Request deadlines and background work deadlines are separate readouts. A queue can
acknowledge ingestion before a retained or executing task exceeds its deadline;
that work remains visible rather than inheriting the producer's completed status.

## Individually authored replica nodes

Owner: [System Diagram charter](../../public/simulatte/system-diagram/CATSCAN.md).
Executable authority: [linked replica kernel](../../public/simulatte/system-diagram/kernels-replication.js),
[replication classes](../../public/data/system-diagram/classes/replication.json) and
[protocol tests](../../tests/system-diagram-linked-replication.test.cjs).

`database-leader` and `database-replica` are separate nodes using the `linkedReplica`
kernel. Connect a client's `out` to the leader's `in`, then each leader `replicate`
port to a follower's `replica` port. These links carry real simulated request and
acknowledgement transfers through the shared network model. Link bandwidth,
latency, loss and partition faults affect replication and its receipts.

| Contract | Modeled behavior |
| --- | --- |
| Designated role | A fixed leader accepts client writes; followers accept replication and local reads. Roles cannot change during a run. |
| Acknowledgement | `writeQuorum` counts the leader plus distinct follower nodes with received acknowledgements. One permits local acknowledgement; a majority or all-copy count must be configured explicitly. |
| Retry budget | Each target gets at most `maxAttempts` calls, separated after failure by `retryIntervalMs`, with `timeoutMs` per call. No unbounded retry loop runs. |
| Retained ownership | The leader retains one payload plus declared base memory per unfinished outbox row. Exhausted, unacknowledged rows remain visible in causal inspection and memory totals. |
| Deduplication | A repeated leader idempotency key reuses its existing local write. Reusing that key with different key/type/size/token/op/serialized-field content rejects before another version or outbox is created. Followers apply a newer per-key version once and acknowledge duplicate or reordered versions without another application effect. |
| Recovery | Crash and failure-domain outage preserve modeled stored versions and outbox records. Repair waits `recoveryMs`, then the same designated role resumes remaining budget. Generation fences reject stale callbacks. |
| Bounded storage | `maxRecords` bounds retained leader idempotency summaries and follower key/version metadata. New records reject visibly at the bound. |

A leader's local application effect is distinct from follower copy applications;
the latter appear as `Applied copies`, not extra logical application effects.
A lost follower acknowledgement can cause a duplicate delivery without a second
copy application. Successful quorum acknowledgement confirms modeled receipts,
not production durability or a linearizability proof. Reads expose only the local
stored version; follower reads can be stale.

Topology validation rejects duplicate follower destinations, multiple designated
leaders for one follower, replication cycles, wrong roles/ports, asynchronous
replication edges and unreachable configured quorum counts. Invalid live edits
leave the accepted run unchanged. Exhausted outbox records resume when an accepted increase to `maxAttempts`
leaves unused attempts for a pending target. Attempt counts never reset. A live
quorum reduction immediately re-evaluates existing waiters. Changes to timeout
and retry interval govern future calls and wakes; they do not rewrite already
scheduled deadlines. There is no separate unbounded redrive action.

This protocol does not implement leader promotion, voting, Raft/Paxos, split-brain
safety, read quorums, transactions, full database contents, disk capacity/IO or
anti-entropy after log loss. Epoch/version fencing is a local receipt rule, not
an election protocol. The older `replicatedDb` kernel remains available as a
separate internally grouped replica-slot model; it does not replace authored
replication links.

## Company-inspired solution playback

Owner: [solution generator](../../tools/simulatte/build-interview-solutions.mjs),
[stage navigation](../../public/simulatte/system-diagram/interview-stepper.js),
and [playback](../../public/simulatte/system-diagram/playback.js).

The public catalog retains the eight sourced interview exercises and adds seven
company-inspired practice problems. Their links provide technical context, not
proof that those companies ask these questions. Each added problem references one
authored solution with three independently validated graph snapshots in
`public/data/system-diagram/solutions/`. Regenerate with
`node tools/simulatte/build-interview-solutions.mjs`; `--check` verifies the committed
output. The source generator composes existing kernels and versioned subsystems.

Choosing a problem still starts blank. **Play solution** explicitly opens the
first graph and its short explanation. Previous and Next retain edits to each
visited solution stage. **Back to my diagram** restores the user's prior work.
The last Next action becomes **Simulate**. The playback dock can also run any
edited or intermediate architecture, pause, advance one round, restart, change
speed, or verify replay. An architecture edit clears the accepted simulation and
requires explicit acceptance again. Layout, selection and labels do not change
execution. Pending asynchronous acceptance and stage loads cannot overwrite a
newer document.

Playback runs the existing deterministic engine and coordinator-backed runner.
The canvas overlay renders real observed transfers, queues and node health.
**Requests** opens recent request outcomes and per-request attempts on demand;
selecting a component reveals observed state and bounded record samples in the
properties drawer. Counters come from the run, not the walkthrough narrative.

| Added behavior | Synthetic contract |
| --- | --- |
| Comment tree | Parent-linked records, one vote per actor/comment, deterministic score ordering, and update deliveries. |
| Stories | Explicit bounded audiences, view identities, and timed metadata visibility expiration. The fixture uses six simulated seconds, not a real 24-hour media deletion campaign. |
| Reservations | One stock authority preserves available + held + sold stock, suppresses duplicate payments, and releases expired unpaid holds. No real payments or distributed consensus. |
| Presence | Renewable heartbeat leases, target-specific subscriptions, change deliveries, and bulk state snapshots in one synthetic tenant. |
| Video | Two advertised segment sizes; completed transfer time controls the next rendition. CDN keys distinguish renditions. No codec, DRM or encoding execution. |
| Timeline | Existing explicit follow graph, push/hybrid fanout, leased deliveries and deduplicated timeline writes. |
| Crawler | Existing bounded domain frontier, politeness delay and synthetic duplicate discovery, followed by processing and storage. No live scraping, robots parser or DNS resolution. |

Executable evidence is in `system-diagram-interview-solutions.test.cjs`,
`system-diagram-solution-navigation.test.cjs`, `system-diagram-playback.test.cjs`,
and `system-diagram-runtime-scripts.test.cjs`. Control adapters and browser-global
script evaluation establish source behavior, not desktop/mobile visual acceptance
or deployed availability. Private collection ciphertext and lock behavior remain
separate from public solution data.
