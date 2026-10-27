# Lucyd implementation and deployment

Owner: [deployment charter](../../public/simulatte/system-diagram/deployment/CATSCAN.md), [compiler](../../public/simulatte/system-diagram/deployment/compiler.js) and [inventory pilot](../../tools/lucyd-deploy/README.md).

## Product direction and current boundary

Lucyd keeps the same architecture identities as a design becomes more concrete. These are authoring layers, not additional compiler phases:

| Layer | Job | Initial support |
|---|---|---|
| 0 Intent | Requirements, constraints and acceptance criteria | Core authoring owns this |
| 1 Conceptual architecture | Responsibilities and external contracts | Core authoring owns this |
| 2 Simulation | Executable nodes, queues, traffic and synthetic faults | Existing Lucyd validator and engine |
| 3 Implementation contracts | Bind exact component types to real code and APIs | Optional inventory registry and HTTP implementation |
| 4 Deployment | Bind images, secrets, persistence and resources | Optional GKE-compatible Kubernetes export |
| 5 Operation | Observe deployed behavior against the design | Local traffic observations; cloud feedback UI remains absent |

A conceptual responsibility is not an executable service. The deployment compiler asks the owning document API for its executable projection when available. Unrefined concepts refuse. Canonical study collections remain `simulatte.lucydProblems.v2`: select a problem, solution and stage, then consume its strict `simulatte.systemDiagram.v4` diagram. No deployment fields enter the simulator document. Optional v5 authoring documents must resolve to v4 before binding.

## Read-only compilation contract

`Deployment` loads its panel only on demand. The user inspects the graph, explicitly selects an implementation for each lowered node and supplies a separate `simulatte.lucydDeploymentConfig.v1` configuration. Compilation performs document validation, subsystem lowering, binding validation and deterministic Kubernetes object generation. Unknown nodes, unsupported routes, changed source pins, ambiguous bindings, mutable image tags and secret values refuse. CLI writes only to a new output directory, after all checks succeed.

The registry pins Lucyd source contracts and local application sources by SHA-256. Browser export checks the deployed public source hashes. CLI additionally verifies the pilot source hashes. Pin regeneration is an explicit acceptance step after reviewing the changed contract, not permission to treat new kernels as supported. Exported bundles include source, registry, configuration and object hashes, source identities, bindings and unconverted assumptions. Kubernetes annotations and traffic observations retain the source hash.

The extension neither creates provider clients nor contacts cloud APIs. The compiler emits a Namespace, ServiceAccount, API and worker Deployments, Services, a single PostgreSQL StatefulSet and PVC, traffic ConfigMap and Job, and ingress isolation NetworkPolicy. A receipt-sink Deployment is emitted only when the graph has that supported route. No ingress, TLS certificate, managed database, public endpoint or cloud identity is inferred.

Public export requires an explicit download. Private designs refuse plaintext deployment inspection/export until an encrypted deployment export workflow exists. Closing or locking disposes configuration and export state. No browser storage persists deployment inputs. Passwords, keys and database connection strings must never be pasted into deployment configuration; it accepts Kubernetes Secret names and keys only.

## Versioned inventory contract

The first supported graph is `examples/amazon-flash-sale.json`, including its nested checkout authority. Registry eligibility is explicit:

| Binding | Kernel and built-in class | Real counterpart |
|---|---|---|
| `inventory-postgres@1` | `inventoryReservations`, `inventory-reservations` | HTTP API, PostgreSQL authority and expiry worker |
| `inventory-traffic@1` | `operationSource`, `operation-client` | Bounded real HTTP workload |
| `inventory-events@1` | `service`, `worker` | Durable receipt sink for inventory updates |

Only `operationSource.out → inventoryReservations.in` and `inventoryReservations.updates → service.in` are implemented. Each source must call the inventory authority directly. The pilot supports exactly one authority, one SKU, at most one receipt sink and unit quantities. It is not a payment processor.

Business parameters `stock`, `ttlSec` and `maxRecords` explicitly become initial stock, reservation TTL and retained reservation capacity. Actor identities, source operations and duplicate scheduling retain their declared workload meanings. Timing, service concurrency, modeled queues, network latency, bandwidth, zone/region/resource groups and synthetic fault schedules remain recorded assumptions. None yields CPU, memory, replica count, cloud location or PVC size. Resource values in the configuration template are editable example inputs, not calibrated recommendations.

HTTP requires a bearer token of at least 24 characters. Mutations require a bounded `Idempotency-Key`. Reserve accepts a customer identity and creates at most one reservation per customer/SKU. Pay accepts its reservation ID and marks it paid once; this records fulfillment intent without charging anyone. The native simulation's `reserved` state maps to the API's `held` state. Inventory reads expose available, held and sold counts. The invariant is `initial_stock = available + held + sold`; paid rows also sum to sold.

All inventory mutations lock the inventory row inside a PostgreSQL transaction. Durable idempotency rows bind operation, key and canonical request hash to the committed response. Reusing a key for different input returns 409. Repeating a reservation identity returns the original reservation; expired identities remain expired, matching the bounded kernel. The reservation capacity applies across retained statuses.

Expiry uses a database-clock lease and status-checked row locks. Worker death permits another owner after lease expiry. Paying after TTL expires atomically releases stock once and rejects payment. Successful payments and expirations append transactional outbox events. Receivers deduplicate by event identity and payload hash. Delivery is retryable and at least once; it is not a general exactly-once network guarantee.

PostgreSQL row locks and transactions provide the implemented serialization boundary. See [PostgreSQL locking](https://www.postgresql.org/docs/17/explicit-locking.html) and [row selection with SKIP LOCKED](https://www.postgresql.org/docs/current/sql-update.html). Kubernetes output uses [standard workload objects](https://kubernetes.io/docs/concepts/workloads/) and [configuration/secret references](https://kubernetes.io/docs/concepts/configuration/).

## Provider boundary

The first target is `gke-kubernetes`. It creates portable Kubernetes objects suitable for review against a GKE cluster, with explicit storage class and image digests. It does not provision GKE or configure Google IAM. Workload Identity bindings would be separate provider inputs, following [GKE Workload Identity Federation](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/workload-identity). AWS remains an unimplemented adapter boundary, not a selectable target.

The application image must be built from this pilot and published by an authorized operator. The PostgreSQL image contract expects PostgreSQL 17 Alpine, UID/GID 70. A digest string alone proves neither image existence nor behavior. Operator-created Secrets must supply a matching PostgreSQL password, a `DATABASE_URL` pointing at the emitted service, and the API token. Readiness waits for the database; liveness does not depend on database availability. One PostgreSQL replica with a PVC supplies no database high availability or backup/recovery guarantee.

## Evidence gates

| Gate | Evidence | Meaning |
|---|---|---|
| Compilation | Focused compiler tests, source pins, deterministic hashes | Supported graph exports explicit objects; not deployed |
| Local application | Real PostgreSQL integration and local container build | Reservation, idempotency, expiry and receipt contracts execute locally |
| Cluster acceptance | Operator-selected context and server-side dry-run | Admission and installed APIs accept the exact bundle |
| Cloud execution | Actual release receipt, image digests, events and traffic output | That particular deployment ran |
| Failure qualification | Pod kill, database restart/failover, network loss and recovery receipts | Only injected failure modes are established |
| Calibration | Bound workload and matched measured observations | Simulation assumptions can be compared with a specific system |

Local tests exercise concurrent reservations/payments, response loss after commit, duplicate/conflicting requests, two expiry owners, expired leases, receipt redelivery, HTTP server restart and PostgreSQL restart. A separate nonroot, read-only container test kills the actual API and both expiry owners, verifies recovery and restarts PostgreSQL. These are neither GKE failure qualification nor production capacity measurements. The sequential traffic generator follows operation identities and timing where possible; sequential execution may fall behind the source schedule. Its latency measurements cannot establish production throughput.

Before cloud acceptance, run image startup checks under the generated security context, server-side dry-run, a real deployment, controlled pod and database failures, recovery, and storage/secret/network policy checks. Capture exact image and source digests, node architecture, cluster/provider version, storage class, workload identities, faults, timestamps, request outcomes, retries, conservation queries and recovery duration.

Calibration compares equivalent seeded workloads with explicit arrival schedules, request semantics, durations and observation windows. Record measured p50/p95 latency, throughput, rejection/timeout rates, queue depth, recovery time and conservation results separately from simulation predictions. A reviewed observation can propose timing/service-parameter edits linked to the same node identities; no code automatically overwrites the design or equates simulation concurrency with actual CPU. The observation import/comparison UI and automatic calibration are remaining work.
