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

All six rows have passing independent model assertions, serialized continuation and replay coverage. The integrated model/contract lane passes 162 tests, and the analytical engine/runner lane passes 13 tests. The source-bound browser reports in `artifacts/system-diagram-journeys/` and `artifacts/system-diagram-editor/` qualify the actual desktop/touch authoring controls separately. Browser assertions exercise the same palette, ports, property fields, faults and run controls as the user. Tests of a preset alone do not establish blank-canvas authoring.

## Model boundaries

- Streaming means finite synthetic chunks and required-consumer acknowledgements. Codec quality, real media playback, adaptive bitrate control and measured CDN performance are not inferred.
- Replication uses replica slots within one database component and a single simulated authoritative leader. It does not implement consensus, split-brain resolution, transaction isolation or physical durability.
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
