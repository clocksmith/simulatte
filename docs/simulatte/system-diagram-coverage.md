# System Diagram Simulator journey coverage

Owner: [canonical System Diagram charter](../../public/simulatte/system-diagram/CATSCAN.md).
This matrix tracks executable technical behavior and independent expectations, not node counts or production claims. Current continuation starts from canonical `fdbb1807` and preserves the prior editor/engine convergence.

| User journey | Existing executable foundation | Gap found and owned correction | Acceptance evidence |
| --- | --- | --- | --- |
| Streaming and video bursts | Finite chunk arrivals, GPU batches, keyed CDN cache, fan-out calls, held acknowledgement slots, bounded queues | Compose editable streaming classes and slow-subscriber repair; verify visible rejection/backlog/deadlines, cache reuse and fixed demand | `system-diagram-streaming-replication.test.cjs`, streaming-burst document |
| Replication and consistency | Async/sync/quorum acknowledgements, follower reads, sampled lag, election, client-link partitions and catch-up | Offline followers could be treated as fully replicated during pruning; cancel pending offline applications and retain missing-write evidence | `system-diagram-streaming-replication.test.cjs`, existing C1 tests, replica-recovery document |
| RPC and task queues | Retry budgets, lease expiry/redelivery, dead letters, idempotent commits, separate requests/attempts/effects | Expose locally committed effects with unknown caller acknowledgement; retain causal evidence through repair comparison | Observability tests and lost-ack journey; no exactly-once delivery claim |
| Compute and network resources | CPU slots, shared GPU batch slots, bounded allocation ledger, remaining service work and slowdown invalidation | Authored GC/pressure/OOM policy, live shared-link contention and invalidated transfer completion estimates | Resource-journey tests with analytical timing, conservation, checkpoint and replay |
| Crawlers, agents and RAG | Per-origin politeness, finite frontiers, typed synthetic model stages, tools and bounded retries | Required dependencies could silently skip; stale index visibility and malformed output handling need explicit failures; throttle redrives need budgets | Agent-journey tests and agent-recovery document |
| Healthcare, finance and data platforms | Composable services/queues/stores and typed payload channels | Add reusable event records, schema validation/quarantine, approval, reconciliation, lineage, event-time windows and bounded spill; compose three technical examples | Pipeline-journey tests and editable healthcare/finance/lakehouse documents |
| Diagram authoring and repair exploration | Blank canvas, drag/drop, named-port connect/reconnect, reusable classes, overrides, clusters, undo/redo, persistence, run/step/replay/checkpoint | Contextual scheduled faults and a qualified baseline/repair comparison with actual demand equality; expose tail/resource/retry/unknown-effect records | Actual desktop and touch authoring journeys, source-bound screenshots and reports |

## Evidence status

At commit `11a03203`, all six rows have independent model assertions, serialized continuation and replay coverage. The integrated model/contract lane passes 162 tests, and the analytical engine/runner lane passes 13 tests. These are model checks, not completed browser journeys for all six families.

The browser reports at that commit build two architectures from blank: a client/queue/CPU/GPU/database failure-and-repair graph and a source/validator/ledger graph. They load the six named examples separately and check startup and causal records at 0 to 0.25 simulated seconds. They do not build those six examples from blank or observe their complete failure/recovery outcomes. The continuation acceptance requires actual palette/port/property authoring, a bounded failure/recovery observation, independent outcome assertions, identical-demand repair comparison and interrupted checkpoint/save/load/replay for each family on desktop and touch. Pending evidence must not count as passing acceptance.

## Continuation acceptance status

The new authoring plans in `tests/fixtures/system-diagram-blank-journeys.json`
and `system-diagram-rich-journeys.json` have independently derived numerical
expectations. The browser audit consumes them as palette, port, property and fault
inputs, never as a document injected into the editor. The following table is
model-qualified; its new desktop/touch browser execution is **pending** because
automatic approval review denied the browser/server audit before execution.

| Family | Architecture and failure/repair | Independently expected completed/failed baseline → repair | New desktop/touch browser status |
| --- | --- | --- | --- |
| Streaming | GPU batch → bounded fan-out → slow consumer and CDN/origin; cache outage; increase queue budget and enable declared origin bypass | 1/3 → 4/0; batch of four, cache flush/fill/hit and origin-call counts asserted | Pending / pending |
| Replication | Client → designated leader → separately authored follower link; link partition and leader crash/recovery; increase finite replication attempts | 1/2 → 2/1; first partitioned write repaired, request during leader outage still fails, post-recovery request succeeds | Pending / pending |
| Agents/RAG/collection | Crawler → chunker → shared embedding/index; natural-language requests → RAG → structured output → agent/tool; dependency outage; bounded tool retry | 2/1 → 3/0; separate malformed-output and stale-publication probes assert bounded invalid/unavailable failures | Pending / pending |
| Healthcare ingestion | Event source → version validator → approval gate → identity ledger → store; quarantine unsupported version; admit declared version 2 | 2/2 → 4/0; schema/quarantine/approval/commit counts asserted | Pending / pending |
| Finance reconciliation | Paired synthetic events → reconciliation ledger → store/quarantine; scalar mismatch; change explicit acceptance tolerance | 3/1 → 4/0; reconciled pairs 1 → 2 and retained pending pair 1 → 0; tolerance is policy, not financial correctness | Pending / pending |
| Lakehouse | Event source → event-time window → shuffle/spill → store/quarantine; late events; increase lateness allowance | 2/2 → 4/0; accepted sum 200 → 400, spill and logical checkpoint counts asserted | Pending / pending |

Each planned browser journey authors its graph from blank, configures fault or
invalid-workload inputs, takes a fractional interrupted checkpoint, executes to
its declared horizon, inspects a failed/retained causal request, restores and
save/loads accepted execution, compares identical demand/faults, and executes
the repair. These are audit assertions awaiting execution, not completed evidence.

The continuation adds individually authored replica nodes using the existing
network and event engine. A stateless topology hook rejects unsupported replica
wiring before execution; fixed roles cannot mutate inside an accepted run.
Focused protocol tests cover distinct-node quorum acknowledgements, lost replies,
idempotency conflicts, retained outbox memory, crash/recovery, exact continuation,
and stale-version fencing. No automatic election or consensus is implemented.

## Model boundaries

- Streaming means finite synthetic chunks and required-consumer acknowledgements. Codec quality, real media playback, adaptive bitrate control and measured CDN performance are not inferred.
- The existing database component models internal replica slots. The explicit replica-node model adds authored leader/follower network links and local or distinct-node acknowledgement counts, with a fixed designated leader and bounded outbox retries. Neither model implements consensus, split-brain resolution, transaction isolation or physical durability.
- Technical event workflows use synthetic/deidentified records. Approval is an authored technical gate, reconciliation checks declared identifiers/amounts/sequences, and schema checks use explicit versions/flags. No clinical judgement, financial transaction or regulatory certification occurs.
- CPU/GPU/network/memory values are authored model assumptions. Virtual GC, pressure, spill and OOM are simulated policies, not measurements of an operating system or device.
- Crawler/model/tool calls are synthetic. No live scraping, paid calls, semantic model quality, real embeddings or proprietary system internals are claimed.
- Exact seeded replay establishes reproducibility inside the declared model. It does not validate numerical predictions against production.

## Remaining unsupported semantics

These concrete journeys are qualified inside the declared model. They do not imply
coverage of arbitrary distributed protocols or every possible architecture.

- Replica slots do not implement split brain, consensus messages or arbitrary transaction isolation.
- Memory pressure/GC/VRAM and network scheduling remain authored abstractions; no OS, device, TCP or disk calibration is available.
- Event schemas enforce declared record fields and version ranges. Arbitrary schema transformations, real parsing and semantic language validation are not modeled.
- Crawler URL deduplication is sampled; provenance identifies synthetic origins/fetches. No actual URL collection or complete real-world lineage is implied.
- Logical shuffle checkpoints retain offsets and modeled partition state. They are not durable filesystem or storage-protocol proofs.
- Repair comparisons require equality of complete realized inputs. Response-coupled sources can refuse comparison when repairs change demand.
- One seed proves reproduction, not a confidence interval. No automatic production-trace calibration or uncertainty fitting is claimed.
- Physical-device touch and independent human usability review remain separate from Chrome touch-emulation evidence.
