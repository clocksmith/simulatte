# Executable system-design examples

Owner: [System Diagram charter](../../public/simulatte/system-diagram/CATSCAN.md).
Entry point: `/system-diagram`. Canonical teaching copy is
[learning-journeys.json](../../public/data/system-diagram/learning-journeys.json),
not an independent execution specification.

## User journey

Choose a system question, follow the numbered components, and inspect the named
operations on connections. Drag new components, reconnect ports, derive a reusable
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
| Chat application | Client commands, conversation access/history, prompt writes, progressive synthetic chunks, assistant writes and reconnect reads | Lost acknowledgements retry stable message identities; prompt, partial output and final committed reply remain distinct |
| Video distribution | Segment identities, aggregate viewer cohorts, CDN misses/coalescing, origin fetches and bounded optional peer uploads | Peer loss or exhausted upload budget falls back to CDN; delivered bytes, origin bytes, startup and rebuffering remain measurable |
| Agent trajectories | Named task dependencies, parallel branches, join, idempotent tool effect, status events and durable dashboard journal | Worker crash and lost replies reconcile existing effects; missing dependencies terminate under bounded retry/wait budgets |
| Spark-style job | Generated URL records, map partitions, executor-local keyed shuffle, reduce tasks, skew and spill costs, output counts | Executor loss invalidates its local blocks and triggers lineage recomputation; missing shuffle routes prevent fabricated output |
| Social feed | Users, explicit follows, posts, queued fanout, deduplicated recipient/post timelines and feed reads | Delayed consumers expose stale feeds; push/pull/hybrid change materialization cost without inventing follow relationships |
| Workspace access | Users, workspaces, memberships, projects, tasks, permission decisions and cached policy versions | Membership revocation rejects stale grants under authoritative validation; explicitly unsafe cached mode illustrates the stale-access window |

These are bounded, editable teaching models. Video assistance is not a real
WebRTC/ICE/TURN implementation. The data job is not Apache Spark. Social and
workspace policies are not claims about Twitter or Asana internals. Chat does not
call a real model or provide production authentication. Neither stored chunks nor
history recovery claim to restart interrupted neural inference.

## Implementation ownership

- `kernels-applications.js` and `classes/applications.json`: chat and workspace
  records, access policies, scripted bounded clients and progressive generation.
- `kernels-distribution.js` and `classes/distribution.json`: video cohorts,
  caches/peers/origin and Spark-style driver/executors.
- `kernels-collaboration.js` and `classes/collaboration.json`: task DAG/status
  journal and follower/feed composition.
- Existing engine and coordinator: requests, retries, graph transport, contention,
  event ordering, controls, checkpointing and replay.
- `learning.js`: stable, accessible presentation of configured walkthroughs and
  actual records; no source of simulation outcomes.

## Acceptance and evidence limits

Focused tests are `tests/system-diagram-applications.test.cjs`,
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
