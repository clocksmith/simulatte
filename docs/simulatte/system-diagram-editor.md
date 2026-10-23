# System Diagram Simulator editor

Owner: [World diagram charter](../../public/simulatte/distributed-repair/CATSCAN.md).
Document authority: [graph-document.js](../../public/simulatte/distributed-repair/graph-document.js)
and [v2 schema](../../public/data/distributed-repair/system-diagram.schema.json).
Execution authority: [graph-runtime.js](../../public/simulatte/distributed-repair/graph-runtime.js).

## Product and revision boundary

`/system-diagram` is an architecture creator. The palette, canvas and contextual
properties are the main workflow. Examples supply editable starting architectures;
they do not replace authored topology. The old lease/redelivery model and shared
coordinator remain separate compatibility code. The v2 runtime is a bounded
synthetic discrete-event model, not a generic service orchestrator or a claim of
Create compiler generality.

A document owns stable class, node, link and cluster identities, positions,
workload inputs and assumptions. A class defines component type, typed ports and
resource/timing defaults. Instances reference a class and contain only explicit
overrides. Changing a class changes inheriting instances; an instance override
continues to win until removed. Defaults and overrides must remain distinguishable
in the inspector and exported document.

Editing changes a pending document. Undo/redo restores authored document state.
The accepted run retains its own validated inputs, queues and causal history until
the user explicitly accepts and restarts. Save/load preserves authoring identities
and class references. A saved diagram is not a checkpoint; a checkpoint also binds
execution state, pending events, RNG and the accepted document identity.

## Executable component vocabulary

| Component | Bounded synthetic operation | Important exclusion |
| --- | --- | --- |
| Client / scheduler | Generate seeded workload arrivals on the declared interval | No real clients or cron daemon |
| CPU / GPU worker | Consume configured service slots and memory for declared work | No hardware calibration, real kernels or device VRAM prediction |
| Task queue | Retain bounded admitted deliveries and expose backlog/rejection | No broker protocol or durable queue guarantee |
| RPC service | Apply service, failure window, retry budget and recovery timing | No live HTTP calls, TCP or arbitrary recovery protocol |
| Database | Record synthetic idempotent committed effects | No transaction isolation, storage durability or query planning proof |
| Replica | Receive explicit downstream replica deliveries | No quorum, leader election, consistency or failover guarantee |
| Crawler | Model bounded synthetic collection fan-out | No scraping, network access or agent reasoning |
| RAG / model | Transform payload type and consume configured service/memory | No retrieval-quality evaluation, model inference or paid API call |

Ports declare `natural-language`, `structured` and `unstructured` payload
compatibility. These are workload labels, not semantic validators for arbitrary
content. An explicit stage can transform its output type. Link validation rejects
incompatible output/input declarations, missing endpoints and unsupported routing.
Queue capacity includes active and waiting admitted deliveries. Target saturation retries delivery with a finite budget; it is not a durable upstream credit/backpressure protocol. Crawler child tasks share the originating logical request, so database effects deduplicate per request and node.

A typed wire determines event delivery and timing; it never supplies decorative
traffic or an unimplemented component capability.

## Timing, failures and evidence

Execution advances logical time through ordered discrete events. Service times,
concurrency, queue limits, memory allocation, retry delays and link transfer costs
are model inputs. Playback elapsed time only requests logical progress. Requests,
delivery attempts and committed effects remain separate. Request inspection reads
recorded blockers and causal history; colors and animation cannot invent causes.

The bounded graph runtime uses its own serializable event queue. Its checkpoints
must preserve queue ordering, retries, ownership, request/attempt/effect state and
RNG state. The legacy repair experiment still uses the multirate coordinator and
its existing checkpoint format; the formats must not be silently interchanged.
Exact trace replay and checkpoint equivalence test determinism within the declared
model. They do not prove production correctness, throughput or human usability.

The runtime intentionally bounds graph size, workload size, event count and
observation horizon. Invalid execution refuses visibly while pending documents can
remain incomplete for editing. Rejected, failed and unfinished requests remain
inspectable and remain in outcome denominators. Model assumptions and omissions
travel with exported inputs.

## Broader packs and acceptance

The [workload roadmap](distributed-workload-workbench.md) records representative
streaming/CDN, collection, healthcare, finance, operational-data and lakehouse
patterns. These remain incremental packs of shared typed components, not completed
proprietary-system replicas. New packs must declare additional unsupported semantics
before they claim new capability.

- [ ] Qualify editor interactions with desktop and touch drag, connect/reconnect,
  keyboard actions, class/instance edits, invalid-link feedback and save/load/undo.
- [ ] Qualify representative end-to-end compositions and topology changes with
  model records, exact replay, checkpoint restoration and resource reconciliation.
- [ ] Add trace-driven packs with typed composition, bounded dynamic tasks,
  provenance and causal failure/repair inspection.
- [ ] Add separately qualified storage, consistency, streaming, cache and transport
  semantics only when their independent reference cases and limitations are explicit.
- [ ] Calibrate against identified measured workloads with held-out evaluation,
  sensitivity analysis and uncertainty before production-planning claims.

Checkboxes record required evidence layers, not completion claims. The implementation
handoff and checked receipts identify which checks actually ran. No synthetic flow
performs clinical decisions, financial transactions or actions on live systems.
