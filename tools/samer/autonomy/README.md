# Simulatte autonomy SAME-R executor

Gamma owns the SAME-R outer method. Simulatte owns this autonomy domain
executor, action-selection approaches, synthetic scenarios, trace verifier, and
browser receipts.

The contract changes one intervention: selection among safety-eligible action
bets. Every lane uses the same mission parser, world, route planner, candidate
proposer, reference dynamics, safety gates, scenarios, and execution budget.

| Lane | Selection approach |
| --- | --- |
| Anchor | Progress-only eligible action |
| Targeted | Evidence-scored eligible action |
| Control | Seeded eligible action |

Run the contract and deterministic repetitions:

```bash
npm run samer:autonomy:check
npm run samer:autonomy
```

`autonomy-policy-contract.json` owns the intervention, capability, population,
hypothesis, metric, guardrails, matched operations, budget, saturation rule,
metric authority, and promotion boundary. `run-policy-trial.mjs` owns execution
and report generation. `public-navigation-scenarios-v1.json` is public
diagnostic evidence and cannot promote a policy.

The report may name a diagnostic leader. Promotion remains blocked until a
sealed scenario population, its custody contract, and the required evidence are
available. Physical-world autonomy remains outside this executor's claim.
