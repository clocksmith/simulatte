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
adjudication, and a sealed prompt set. The generated report states those
blockers instead of treating internal receipts as pixel proof.

Owner files:

- `simulatte-construction-contract.json`: frozen lanes, budget, evaluator, and
  promotion boundary.
- `simulatte-public-gold-v1.json`: public diagnostic prompts and expectations.
- `run-construction-trial.mjs`: materialization, execution, and receipt writer.
- `gold-visual-evaluator.mjs`: packet, pixel, Scene Proof, and hash-bound human
  adjudication gate.
- `simulatte-gold-adjudication.schema.json`: human screenshot receipt contract.
- Gamma `projects/samer/domains/simulatte/README.md`: outer-method profile.
