# Priority solution conversion

Owner: [priority authoring entrypoint](../../tools/simulatte/study-content-priority.cjs).
Contract: [composable study](composable-study-contract.md).
Evidence: [generated audit](../../artifacts/composable-study/audit.json).

| Problem | Approaches | Stages |
| --- | --- | --- |
| L004 Chat | Persistent push; per-user inbox sync | 9 + 9 |
| L003 Pagination | Indexed immutable keyset; point-in-time result session | 9 + 9 |
| L009 Comments/voting | Write-time aggregation; read-time cached snapshots | 10 + 8 |
| L011 Social timeline | Hybrid fan-out on write; fan-out on read | 9 + 9 |
| L013 Flash-sale inventory | Transactional reservations; per-SKU command actor | 10 + 9 |

## Preserved content and explicit refinements

The generator preserves ordered stages, teaching notes, explanations, follow-up IDs, type guides, pseudocode and approach selection/tradeoffs. Typed contracts and given/when/then cases are authored separately; no unknown label or stage receives a guessed contract. Expanded parents survive, including nested API boundaries. Reused source names become distinct child identities. Client modules and post-partition stores are placed in their correct containment scopes before merging. Merge lineage retains consumed instance IDs and owned state.

V2 makes revised exposed-port mappings explicit with `rebind`. Each mapping is immutable; later merges cannot rewrite earlier stages. The exact stage graph is obtained by replaying the recorded operations. `replace` may update its instance label while preserving identity.

## Engineering corrections

- Chat: transactional operation receipts and sequence allocation, durable publication recovery, explicit conversation-to-shard routing, authorization and history-expiry reset. Exactly-once rendering does not mean exactly-once transport.
- Pagination: immutable indexed ordering, query/owner/expiry-bound cursors, fixed PIT order with current-row hydration, generation-aware request cleanup and explicit session restart semantics. Keyset seeking does not make arbitrary predicates constant-cost.
- Comments: segment-aware bounded paths, conditional vote operations, durable event deduplication/checkpoint/count transactions, zero-vote ranking and versioned snapshot overlays. A client version test does not prove fenced server ownership.
- Timeline: durable publication recovery, current authorized hydration, graph-scoped cache identity, consistent payload names and explicit stream-retention resets.
- Inventory: authenticated payload-bound receipts, transactional buyer limits/stock/holds, multi-bucket allocation in one transaction, verified monotonic payment outcomes, reconciliation and durable compensation. An actor must be fenced; a 202 command receipt is not a held reservation.

The SQL-like and service snippets are design pseudocode. The bounded JavaScript reference models remain separate under `tools/simulatte/study-reference/`. A named reference test establishes only its exercised mechanism. New authorization, durable checkpoint, fencing, compensation and load targets remain authored acceptance requirements until an implementation actually passes them. Latency targets are not benchmark results.

The first failure-baseline stages deliberately demonstrate offset shifts or overselling. Their expected observations are failures that motivate the next architecture, not claims that the baseline satisfies the final requirements.

## Integration boundary

The interface consumes the generated manifest and v2 documents, preserving their operations and metadata inside its workspace envelope. This conversion adds no drawing gestures, autosave UI or editing controller. The running simulation catalogue and deployed site are unchanged.
