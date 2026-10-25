# Executable system-design examples

Owner: [System Diagram charter](../../public/simulatte/system-diagram/CATSCAN.md).
Entry point: `/system-diagram`. Canonical teaching copy is
[learning-journeys.json](../../public/data/system-diagram/learning-journeys.json),
not an independent execution specification.

## User journey

Choose a system question and expand a subsystem to inspect its real components.
The same components execute when the group is folded. Follow the numbered
operations and inspect named connections. Drag new components, reconnect ports, derive a reusable
class, or edit an instance. Only basic settings appear initially; Advanced retains
all other parameters and inheritance sources. Run explicitly accepts the current
diagram. Pending edits never masquerade as results from that accepted run.

The walkthrough has three views: follow the request, inspect stored data, and watch
execution. Record tables come from detached kernel observations and are paginated;
selection filters the tables. Request inspection below retains attempts, effects,
queues, timeouts and causal history. A task status is an observable event, not
private model reasoning. All timing and resource figures are simulated. Message `kb` is decimal kB
(1,000 bytes), matching the network transport. Explicit KiB fields convert by
1.024 at that boundary; memory is MiB (1,048,576 bytes).

## Six compositions

| Example | Executable behavior | Failure and outcome |
| --- | --- | --- |
| Chat application | Separate identity authority, message store, stream sessions, model routing/replicas, prompt writes and reconnect reads | Lost acknowledgements retry stable message identities; prompt, partial output and final committed reply remain distinct |
| Video distribution | Segment identities, aggregate viewer cohorts, CDN misses/coalescing, origin fetches and bounded optional peer uploads | Peer loss or exhausted upload budget falls back to CDN; delivered bytes, origin bytes, startup and rebuffering remain measurable |
| Agent trajectories | Named task dependencies, parallel branches, join, idempotent tool effect, status events and durable dashboard journal | Worker crash and lost replies reconcile existing effects; missing dependencies terminate under bounded retry/wait budgets |
| Spark-style job | External dataset, map CPUs, independent shuffle stores, reduce CPUs, skew/spill service and output counts | Executor loss invalidates its local blocks and triggers lineage recomputation; missing shuffle routes prevent fabricated output |
| Social feed | Separate user/follow graph, posts, queued fanout, deduplicated recipient/post timelines and feed reads | Delayed consumers expose stale feeds; push/pull/hybrid change materialization cost without inventing follow relationships |
| Workspace access | Two command replicas, authoritative workspace/task records, cached policy versions and separate leased mutation journal | Membership revocation rejects stale grants under authoritative validation; explicitly unsafe cached mode illustrates the stale-access window |

These are bounded, editable teaching models. Video assistance is not a real
WebRTC/ICE/TURN implementation. The data job is not Apache Spark. Social and
workspace policies are not claims about Twitter or Asana internals. Chat does not
call a real model or provide production authentication. Neither stored chunks nor
history recovery claim to restart interrupted neural inference.

## Composition and folding

Templates group independently executable components by responsibility. Folded
boxes preserve all real endpoint identities and expose crossing ports. Every
member can be expanded, configured, rewired or faulted; folding itself never
changes the simulation, checkpoint or replay. Group status counts queued component
jobs and unhealthy components, not summed end-to-end requests.

Protocol routing validates every possible terminal through gateways, load
balancers, rate limiters, retries, breakers and fallbacks. The forwarding path must
preserve the acknowledged reply, operation and semantic envelope. A queue's enqueue
acknowledgement is not an RPC result. Queues are used for explicitly asynchronous
work, including workspace mutation journals and social fanout, with separate
observable commit/application state. Generic byte caches bypass structured
application records; they cannot invent cached authorization, history or writes.

Old compact examples remain independent regression fixtures. The expanded public
examples exercise their additional components and failure paths; larger node
counts alone are not evidence of a realistic system. Model parameters remain
synthetic and must not be read as measurements of a production service.

## Implementation ownership

- `kernels-applications.js` and `classes/applications.json`: chat and workspace
  records, access policies, scripted bounded clients and progressive generation.
- `kernels-distribution.js` and `classes/distribution.json`: video cohorts,
  caches/peers/origin and Spark-style driver/executors.
- `kernels-collaboration.js`, `kernels-social-graph.js` and their class packs:
  task DAG/status journal, separate user/follow authority and follower/feed
  composition. Connected graph failures never fall back to bundled graph data.
- `protocol-routing.js`: checked reply-preserving paths through compatible relays.
- Existing engine and coordinator: requests, retries, graph transport, contention,
  event ordering, controls, checkpointing and replay.
- `learning.js`: stable, accessible presentation of configured walkthroughs and
  actual records; no source of simulation outcomes.

## Acceptance and evidence limits

Focused tests include `tests/system-diagram-decomposed-templates.test.cjs`,
`system-diagram-group-folding.test.cjs`, `system-diagram-protocol-routing.test.cjs`,
`system-diagram-social-graph.test.cjs`, `tests/system-diagram-applications.test.cjs`,
`system-diagram-distribution.test.cjs`, `system-diagram-collaboration.test.cjs`,
`system-diagram-learning.test.cjs`, `system-diagram-learning-contracts.test.cjs`
and `system-diagram-editor-clarity.test.cjs`, alongside the existing component
regressions. They exercise independent expected outputs, graph rewiring,
failures, retries, record ownership, bounds and JSON/coordinator replay.

Source and Node checks are not browser qualification. In this dot environment,
the browser harness failed before page load because Chromium could not create its
required socket. No security relaxation was used. Desktop/touch authoring of these
six new examples, unfamiliar-user comprehension and live deployment remain
unverified. The older six-family campaign is separate and cannot be counted as
coverage of these new questions.
