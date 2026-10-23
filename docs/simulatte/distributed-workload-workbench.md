# Distributed workload workbench

Owner: [World experiment charter](../../public/simulatte/distributed-repair/CATSCAN.md).
Legacy repair logical-time authority: [multirate coordinator](../../public/shared/core/simulation/multirate-coordinator.js).

The current product is the [canvas-first system diagram editor](system-diagram-editor.md).
The implementation record below describes its earlier bounded repair slice, whose
model remains compatibility code. It does not define the primary editor interface
or imply that all future pack semantics execute.

## Historical bounded implementation

System Diagram Simulator is a distinct, experimental World catalog card at
`/system-diagram`, now backed by `public/data/system-diagram/profile.json`.
The bounded implementation described below remains separately available at
`/simulatte/distributed-repair/repair.html`; the canonical editor uses its own document and class contracts.
The old `/simulatte/distributed-repair/index.html` deep link redirects to it. It is
not featured and does not replace GPU Cluster or Create. Use
`node tools/serve-local.mjs` for local review. Nothing in this milestone deploys
services, injects real outages, scrapes websites or uses production records.

The accepted executable input is a versioned typed task DAG, not drawing geometry.
The runner finalizes and validates a public WorldSpec binding architecture, seed,
policy, configuration and model identity; its hash binds coordinator checkpoints.
Export/reimport validates that WorldSpec against the supplied replay inputs. This
is declared architecture execution, not evidence of Create compiler generality.
The declared standalone profile binds the catalog identity, model, configuration,
default seed/policy and supported claims. It uses the existing standalone World
entry mechanism; it does not claim plugin-host profile proof. The catalog is the
only homepage navigation authority.

The current adapter supports one source and one result store, any bounded acyclic
sequence of CPU/GPU stages, and parallel paths chosen by deterministic active
resource load. Supported edges are source-to-compute, compute-to-compute and
compute-to-store. Each hop serializes declared MiB with fair bandwidth sharing,
then adds propagation latency. CPU and GPU service integrate remaining work under
contention. GPU nodes optionally share a cluster compute budget. These clusters
are resource groups, not modeled availability zones, replicas or implied networks.
The bounded limits are 32 nodes, 128 links, 16 groups and 128 enumerated paths.

Add/remove nodes or links, connect, group GPU members, edit CPU/GPU/group capacity
and link capacity/latency, then explicitly accept and restart. Validation rejects
unsupported links, cycles, dangling identities, disconnected nodes, duplicate links,
invalid units/ranges and unsupported source/store capacity edits. Pending changes
leave the running revision untouched. Export writes the accepted architecture,
configuration, seed, policy, repair interventions and observation horizon. Import
validates as pending; accepting it explicitly replaces and reproduces the run.

[Model configuration](../../public/data/distributed-repair/config.json) owns the
synthetic workload, policy and fault values. The default first request completes
GPU compute at 3.02 s; the store fails at 3.05 s, before commit acknowledgement.
After the eight-second delivery lease expires, baseline redelivery repeats work.
The store repairs at 18 s. A separate deterministic loss of the first successful
commit reply demonstrates a duplicate delivery after a committed effect; the
bounded policy's idempotent commit suppresses that repeated effect. User repair
actions are timestamped and included in replay. Graph edits can change completion
timing; the fault remains scheduled at the same declared time in both policies.

The baseline admits at most 128 outstanding requests and allows 12 attempts per
request; it has no dependency-aware backpressure. The bounded policy admits four,
limits active attempts to two, allows three attempts per request, defers dispatch
while the store is unavailable and commits once per logical request. Rejections
remain visible and are not counted as successful throughput. Neither policy
promises the deadline: admitted work can still miss it during an outage.

Requests, attempts, committed effects, ownership, resource allocations and causal
records are distinct. Completion estimates carry generations and are recomputed
when shared-resource membership or capacity changes. Lost leases fence stale
commits while stale computation can continue wasting resources. Memory is modeled
allocation accounting in MiB, not browser heap or real device VRAM. The inspector
reads model blockers and histories directly; it does not infer causes from colors.

Discrete events govern arrivals, transitions, commits, acknowledgements, lease
expiry, retries, faults and repair. Continuous work integrates between event
boundaries. The coordinator owns earliest cadence/event/delivery/control wakeups,
canonical same-time rounds, cancellation, JSON-safe checkpoints and replay.
The domain checkpoint includes remaining work, pending completion generations,
leases/ownership, retries, queued transitions, effects and RNG state. Rendering
and elapsed browser time only request logical progress.

## Reusable workload packs, proposed next contract

Packs are composable model inputs and adapters, not independent canned demos or
new product shells. A pack declares version/hash, required node/port/resource
capabilities, typed input/output ports with units and delivery semantics, workload
trace/schema, policy references, synthetic/deidentified provenance, scenario/fault
schedule, parameter coverage and acceptance obligations. Instantiation remaps
stable local IDs into explicit instance IDs. Composition validates typed edges,
units, clock/delivery semantics, ownership and resource/failure-domain boundaries.
A composed run binds every pack identity and one root seed; independent named RNG
streams prevent one pack's draws from shifting another's workload.

The current task-DAG API accepts stage chains and parallel routes without a fixed
inference topology. It does not yet load arbitrary packs, multiple external sources
or protocols. Those capabilities must be implemented and qualified explicitly;
adding metadata does not establish executability. The first pack is this bounded
compute-and-result workload. Later trace adapters and pack compilers must preserve
all connections and declared unsupported obligations rather than replacing an
unrecognized graph with this example.

| Representative pack | Challenging composed scenario | Shared primitives needed | Not established by this slice |
| --- | --- | --- | --- |
| Netflix-like streaming | Ingest bursts → transcode GPU/CPU jobs → object origin → CDN caches; regional outage, cache-miss storm, playback deadlines and repair | Byte-stream rates, compute queues, cache/eviction, origin fetch sharing, fan-out and deadlines | Codec correctness, real CDN topology, adaptive bitrate/client buffer dynamics, proprietary internals |
| Multi-agent collection | Agents spawn tasks while collecting synthetic sites; shared per-origin limits, duplicate discoveries, stalled workers and API outages | Dynamic tasks, per-origin token/concurrency budgets, leases, dedup keys, provenance, circuit breakers | Live scraping, robots/access policy enforcement, arbitrary agent reasoning or autonomous external actions |
| Healthcare event workflows | Synthetic ingestion → identity matching → ordered patient events → human approval queue; source outage and late correction | Entity identity, ordering windows, provenance, approval state, audit history | Clinical correctness, identity accuracy, privacy/regulatory compliance or clinical decisions |
| Finance event pipelines | Synthetic transaction events → idempotent effects → reconciliation; duplicate/out-of-order delivery, replay and partition recovery | Durable event identity, transactional boundaries, reconciliation invariants, ordering, fencing | Actual transactions, ledger protocol correctness, financial/regulatory assurance |
| Palantir-like operational data | Multi-source entity graphs with conflicting updates, dependency failures and stale operational views | Typed graph joins, lineage, schema mapping, ownership, update propagation and uncertainty | Proprietary architecture, ontology correctness or real operational decisions |
| Databricks-like lakehouse | Streaming ingest → skewed shuffle → spill → checkpoint → sink; late data, schema evolution, restart and backlog drain | Partitioned operators, shared storage/IOPS, memory/spill, watermarks, checkpoint/recovery, lineage | Spark/Delta protocol equivalence, exactly-once transactions, real storage performance or proprietary internals |

Cross-pack examples include collection → operational graph → recommendation jobs
→ streaming delivery, or synthetic healthcare/finance ingestion → lakehouse
aggregation → approval/reconciliation sinks. Each shares actual typed ports and
resource policies. It must not be a visual connector between unrelated demos.

## Staged acceptance

1. Current bounded milestone: exact event trace replay; JSON checkpoint restoration
   equal to uninterrupted execution; request, memory and GPU-work reconciliation;
   visible rejected/unfinished/dead-letter work; request causal inspection;
   executable add/remove/connect/group, pending/accepted revisions and round-trip
   replay. Desktop/mobile keyboard/touch/browser evidence is separate from model
   tests and unaided human comprehension.
2. Pack contract and trace layer: compose two instances with remapped identities,
   unit/delivery validation and shared resources; prove seeded order independence,
   trace time/size/schema validation, deterministic dynamic task limits, and
   lossless export/reimport. Reject unavailable adapters explicitly.
3. Queue/network/recovery primitives: bounded task/byte queues, per-origin budgets,
   jittered retry/circuit policies, latency/bandwidth/loss/partition models,
   correlation by host/rack/zone/dependency, warmup and repair competition. Prove
   conservation and backpressure across pack boundaries, not just within a pack.
4. Streaming/data semantics: cache/storage/IOPS, memory/GC/spill approximations,
   watermarks and late events, transactional/replication/consistency models only
   within separately qualified protocol coverage. Evaluate skew, correlated
   outages, recovery/checkpoint cost and dependency cascades in composed workloads.
5. Calibration and decision evidence: immutable workload/benchmark inputs, separate
   calibration and held-out evaluation, repeat seeded ensembles and sensitivity
   analysis. Compare goodput, p95/p99 latency with unfinished-request censoring,
   SLO/error-budget consumption, resource efficiency and declared price/version
   costs. Report model uncertainty and missing coverage beside the outcome.

Every stage names the baseline and changed architecture/policy, shows bottlenecks
and causal history, measures recovery and retains rejected/unfinished work. A pack
is accepted only for the semantics its checks cover. Production proof requires
separate measured load/failure experiments on actual authorized infrastructure.
Synthetic simulation, reproducible hashes and screenshots do not supply that proof.

## Evidence commands and limits

- `node --test tests/distributed-repair.test.cjs tests/multirate-coordinator.test.cjs tests/multiscale-contracts.test.cjs`
- `node tools/simulatte/audit-distributed-repair.mjs` exercises actual page controls,
  desktop/touch-emulated mobile, keyboard selection, pending invalid edits,
  node/link/group acceptance, export/reimport, replay, repair and checkpoints.
- Existing GPU, Subsea, Interstellar, comparison, residency and shared UI regressions
  verify affected reuse boundaries; they do not qualify all future packs.

No claim of real GPU batching/VRAM, OOM/GC/thrashing, transport protocol fidelity,
replicated consistency, clinical/financial correctness, production cost, empirical
calibration or human usability qualification follows from this milestone.
