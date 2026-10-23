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

## Module ownership

All browser files live in `public/simulatte/system-diagram/` and are classic scripts
with CommonJS exports, matching the rest of World. No file exceeds 999 lines.

| File | Owner | Global | Role |
| --- | --- | --- | --- |
| `class-library.js` | contracts | `SimulatteSystemDiagramLibrary` | Load and validate the class library manifest and packs |
| `diagram.js` | contracts | `SimulatteSystemDiagramDocument` | Validate, resolve, derive and compile diagram documents |
| `kernel-registry.js` | contracts | `SimulatteSystemDiagramKernels` | Kernel behaviour registry |
| `engine-core.js` | engine | `SimulatteSystemDiagramEngineCore` | Event heap, RNG streams, network, stations, calls, faults, metrics, `ctx` |
| `engine.js` | engine | `SimulatteSystemDiagramEngine` | Pure `initialize/advance/applyControl/observe/metrics` |
| `runner.js` | engine | `SimulatteSystemDiagramRunner` | Coordinator binding, display state, controls, checkpoints, replay |
| `kernels-core.js` | engine | registers | `source`, `service`, `endpoint`, `queue`, `deadLetter`, `database` |
| `kernels-routing.js` | classes | registers | `loadBalancer`, `rateLimiter`, `circuitBreaker`, `retry`, `fallback` |
| `kernels-storage.js` | classes | registers | `replicatedDb`, `cache`, `objectStore` |
| `kernels-ai.js` | classes | registers | `batchWorker`, `llm`, `embedder`, `vectorIndex`, `retriever`, `reranker`, `chunker`, `structuredResponse` |
| `kernels-sources.js` | classes | registers | `cron`, `crawler` |
| `editor-model.js` | editor | `SimulatteSystemDiagramEditorModel` | Commands, selection, undo/redo over the document |
| `editor-canvas.js` | editor | `SimulatteSystemDiagramCanvas` | SVG canvas: render, pan, zoom, drag, connect, marquee |
| `glyphs.js` | editor | `SimulatteSystemDiagramGlyphs` | Line glyphs for classes |
| `palette.js` | editor | `SimulatteSystemDiagramPalette` | Class palette with search and drag-to-canvas |
| `file-io.js` | editor | `SimulatteSystemDiagramFiles` | Export, import, autosave |
| `editor.css` | editor | | Canvas and palette styling |
| `run-controls.js` | run UI | `SimulatteSystemDiagramRunControls` | Playback dock |
| `inspector.js` | run UI | `SimulatteSystemDiagramInspector` | Instance, class, edge, group and diagram inspection and editing; fault injection |
| `overlay.js` | run UI | `SimulatteSystemDiagramOverlay` | Flow animation, queue and health overlays on the canvas |
| `metrics-panel.js` | run UI | `SimulatteSystemDiagramMetrics` | Throughput, latency percentiles, errors, utilization |
| `run.css` | run UI | | Inspector, overlay and metrics styling |
| `index.html`, `page.js`, `style.css`, `profile.js` | integration | | Page layout, wiring, lifecycle, profile validation |

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
9. Ports come from the kernel; classes cannot change ports in v1.

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
  domains (`outage` fault); `boundary` is visual only.
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

Kernel files call `SimulatteSystemDiagramKernels.register({ id, station, ...hooks })`
and use only the `ctx` object; they never touch engine internals.

`station` is `null` or `{ concurrency: '<param>', queueCapacity: '<param>' }`
naming the kernel parameters that size its FCFS station.

| Hook | Called |
| --- | --- |
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
| `layout` | moveItems, setPositions, group geometry | No restart |
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

## Run UI API

- `SimulatteSystemDiagramRunControls.create({ host, config, onPlay, onPause, onStep,
  onRestart, onReplay, onVerify, onSpeed })` returns `{ update({ running, time,
  horizon, speed, done, busy }) }`.
- `SimulatteSystemDiagramOverlay.create({ canvas, library, config })` returns
  `{ render(view), clear() }`.
- `SimulatteSystemDiagramInspector.create({ host, model, library, config, onInject,
  getView })` returns `{ render(view) }`.
- `SimulatteSystemDiagramMetrics.create({ host, config })` returns `{ render(view) }`.

## Claims

Results are synthetic. Service times, latencies, failure rates, batching and token
costs are user assumptions; nothing here measures real systems, providers or
hardware, and replay hashes do not establish physical validity.
