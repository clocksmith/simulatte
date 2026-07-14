---
name: simulatte-development
description: Implement Simulatte browser, prompt-to-pixels, autonomy, retrieval, simulation, visual compiler, renderer, governed-data, evaluation, or Firebase-hosting changes. Use for work under public/, firebase configuration, or the exact eight-phase pipeline.
---

# Simulatte Development

Preserve user intent from language to visible pixels through eight explicit phase
contracts. Keep the static browser runtime direct and inspectable.

## Establish The Product Path

1. Read `STYLE_GUIDE.md`, the nearest instructions, and the relevant contract/tests.
2. Route Autonomy `/` work to `public/app`, `public/runtime`, and `public/world`.
3. Route `/blank/` compiler work to `public/blank/app` and
   `public/blank/pipeline`; shared governed assets belong in `public/data`.
4. Record the prompt obligations, target phase, exact upstream object, expected
   downstream object, render receipt, and visible proof.
5. Inspect `git status --short`; this repository may contain concurrent user work.

## Preserve The Eight Phases

1. Runtime and model identity.
2. Language and obligation extraction.
3. Retrieval, reranking, and fusion.
4. Grounded intent.
5. Simulation compilation.
6. Visual compilation.
7. Rendering.
8. Settlement against receipts and pixels.

Phase N consumes the exact Phase N-1 output plus declared runtime context. Do not add
side-channel inputs, compatibility fallbacks, or audit-only reconstruction that makes
a broken boundary appear complete.

## Implement

1. Preserve entities, counts, attributes, part bindings, materials, relations, poses,
   environments, actions, and negation in the obligation ledger.
2. Key caches by every behavior-changing model, data, dtype, query, ranking, and
   construction identity. Reuse compatible model/tokenizer handles.
3. Keep semantic decisions in inspectable JavaScript. Use Doppler-backed numerics only
   behind CPU-reference parity and receipt-visible configuration.
4. Bound retrieval, graph search, construction attempts, GPU work, and main-thread work
   without pruning valid prompt evidence.
5. Treat fields and receipts as intermediate evidence. A visible obligation passes only
   when Phase 8 and the rendered pixels support it.
6. Add a contract test at the changed boundary and a browser visual check when pixels,
   interaction, or resource lifecycle changed.

## Validate

```bash
npm test
npm run audit:pipeline
npm run audit:visual
npm run check:model-lock
npm run check:deploy
npm run validate:universe
npm run validate:visual-cards
npm run scan:determinism
```

Run scripts that exist and match the change. Inspect desktop and mobile browser output
for UI work. Finish with `git diff --check`, then report phase-contract proof and pixel
proof separately.
