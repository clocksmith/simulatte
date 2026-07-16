# Model-selection evidence

These are one-time sealed evaluation receipts. Candidate processes received
sanitized workloads without expected labels, relevance grades, winner IDs,
hard-negative IDs, or must-refuse flags. The opening receipts bind the exact
candidate registry, runtime, workload, predictions, device, dtype, and cache
protocol.

No candidate was promoted.
Performance values below are CPU/f32 screening results, not WebGPU deployment
claims.

## Classification v1

Five candidates ran over 276 rows and six independently gated heads. None
cleared every per-head macro-F1, coverage, selective-risk, and calibration
floor. The universal abstention thresholds were not calibrated to the score
scale of any candidate: the deterministic, linear, and MiniLM lanes abstained
on every row; DeBERTa-small and Qwen answered subsets but still failed multiple
heads. The sealed labels must not be used to tune those thresholds.

## Embedding retrieval v1

This opening is diagnostic-only. It evaluated recall@10 over five-candidate
rows, which saturated recall and invalidated that metric. No false promotion
occurred because every candidate still failed another gate. The corrected,
predeclared contract uses recall@2.

Rescoring the immutable rankings at K=2 for diagnosis—not promotion—produced:

| Candidate | recall@2 | Hard-negative accuracy | Must-refuse accuracy |
|---|---:|---:|---:|
| Deterministic lexical | 0.64 | 0.66 | 1.00 |
| all-MiniLM-L6-v2 | 0.99 | 0.99 | 0.30 |
| Qwen3 Embedding 0.6B | 1.00 | 1.00 | 0.367 |

The neural embedders retrieved relevant evidence but did not provide a safe
refusal boundary. A new unopened population and independently calibrated
refusal rule are required before another promotion trial.

## Reranking v1

Four candidates ran over 100 rows at nDCG@4. Qwen was strongest but missed both
predeclared floors:

| Candidate | nDCG@4 | Winner accuracy | Download bytes | Warm p95 |
|---|---:|---:|---:|---:|
| Deterministic typed score | 0.806 | 0.52 | 0 | 0.244 ms |
| MS MARCO MiniLM-L6-v2 | 0.761 | 0.59 | 91,815,758 | 6.451 ms |
| DeBERTa-v3 BCE | 0.494 | 0.22 | 746,056,798 | 61.388 ms |
| Qwen3 Reranker 0.6B | 0.906 | 0.76 | 1,207,471,291 | 635.458 ms |

The floors are nDCG@4 ≥ 0.92 and winner accuracy ≥ 0.90. Conditional reranking
therefore remains disabled: there is no qualified always-rerank model against
which a skip rule can be calibrated.
