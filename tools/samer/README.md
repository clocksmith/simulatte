# Simulatte SAME-R executor

Gamma owns the SAME-R outer method. Simulatte owns this domain executor, the
construction approaches, the prompt gold rows, and the visual evidence.

The first contract recompiles the exact same Phase 5 artifact under three
Phase 6 construction policies:

| Lane | Construction policy |
|---|---|
| Anchor | Category-level catalog grammar |
| Targeted | Prompt-obligation coverage |
| Construction control | Seeded selection from the same candidate set |

Run the contract check and deterministic mechanics trial:

```bash
npm run samer:construction:check
npm run samer:construction
```

The public gold set binds each prompt to entity counts, spatial relations,
poses, and blocking visual rules. Structural evaluation cannot settle the
visual rules. Promotion also requires matched live screenshots, human
adjudication, and a sealed prompt set. Each human receipt binds the gold row,
exact prompt and hash, page build, canonical full Phase 6 packet hash, and the
SHA-256 of the exact canvas crop the reviewer opened. It also preserves the
reviewer, allowed blocking rules, and review note. The generated report states
missing proof instead of treating internal receipts as pixel proof.

Verify an existing capture and its adjudication without recapturing an animated
frame:

```bash
npm run check:gold:adjudication
```

Owner files:

- `simulatte-construction-contract.json`: frozen lanes, budget, evaluator, and
  promotion boundary.
- `simulatte-public-gold-v1.json`: public diagnostic prompts and expectations.
- `run-construction-trial.mjs`: materialization, execution, and receipt writer.
- `gold-visual-evaluator.mjs`: packet, pixel, Scene Proof, and hash-bound human
  adjudication gate.
- `verify-gold-adjudication.mjs`: immutable canvas-byte and adjudication check.
- `simulatte-gold-adjudication.schema.json`: human screenshot receipt contract.
- Gamma `projects/samer/domains/simulatte/README.md`: outer-method profile.

## Smallest-sufficient model selection

Model selection is split by job. Classification, embedding retrieval, and
reranking use different sealed populations and different quality metrics.
Structured-intent extraction is a fourth, separate contract; a classification
score cannot promote an extractor.

Classification contains six independently gated heads:

- scene/domain;
- span/entity role;
- relation;
- material;
- pose;
- obligation support or refusal.

The fixed taxonomies, abstention rules, and per-head floors live in
`classification-jobs-v1.json`. A mean score cannot hide a failed head.

The candidate registry contains executable controls and pinned neural
candidates:

```bash
npm run check:model-candidates
npm run check:model-populations
```

Candidates execute under one CPU/f32 Transformers screening protocol. The
candidate process receives prompt text, candidate text, taxonomy labels, and
thresholds. It never receives expected labels, relevance grades, winners, hard
negatives, or must-refuse flags. `run-model-selection-trial.mjs` owns the hidden
population, calculates every metric, records artifact bytes, peak memory, cold
load, and warm p95, then applies the quality-first Pareto rule.

Running a sealed task is a one-time opening operation:

```bash
npm run evaluate:model-task -- \
  --task classification \
  --out artifacts/model-selection/classification
```

The command clears a candidate-specific artifact cache before each cold load,
excludes three warmups, binds every prediction to the same workload and
environment hash, writes the opening receipt, and marks the commitment opened.
Do not run it while candidate code is still changing. Mint a new population
after any opened evaluation needs to be repeated.

`model-selection-frontier.mjs` selects the smallest candidate only after every
task-specific quality floor passes. Source-model screening is not deployment
proof. A neural winner remains non-promotable until its exact browser artifact
passes Doppler parity under the same sealed gates.

Conditional reranking is also calibration-gated. The default remains
always-rerank. `evaluate-rerank-skip-frontier.mjs` can promote a skip rule only
when a sealed population shows that lexical margin, embedding margin, entropy,
and candidate disagreement preserve winner accuracy. Each skipped call records
the rule, signals, candidate count, and explicit model-not-executed reason.

Structured intent uses `evaluate-structured-intent.mjs` and
`structured-intent-evaluation-policy.json`. Its independent gate measures
entity and relation preservation, unsupported-concept recall, schema validity,
and downstream Phase 8 obligation coverage.
