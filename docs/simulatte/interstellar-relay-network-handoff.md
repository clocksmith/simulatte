# Interstellar Relay Network Handoff

Owner contract: `public/shared/plugins/interstellar-relay-network/index.js`.

## Completed plugin surface

| Surface | Contract |
|---|---|
| Governed observations | Gaia DR3 exact source rows with retrieval query, license, coverage, hashes, and catalog errors |
| Scenario data | Explicit hypothetical terminals, packet sizes, paths, baselines, and truth boundaries |
| Model data | Four equation, citation, assumption, uncertainty, and validation receipts |
| Simulation | Moving-target light time, optical photon budget, deterministic store-forward scheduler |
| Timeline | Chronological causal events with parent IDs, affected entities, before and after state, and evidence |
| Progressive state | Ready, running, and settled packet state advanced one event per core step |
| Presentation | Semantic star, link, and packet layers plus a temporary v3 adapter |
| Controls | Epoch, propagation epoch, processing delay, packet bytes, and terminal |
| Comparison | Common-seed, synchronized-clock direct baseline against selected intervention |
| Settlement | Delivery, causal-order, and rendered-evidence obligations |

## Focused evidence

```text
node --test tests/interstellar-relay-network-v4.test.cjs
9 tests passed
```

The suite proves all four public seeds compile finite links, source hashes match,
events advance progressively, causal parents precede children, settlement
receipts exist, semantic objects retain evidence, v3 output validates, and
comparison reports latency, rate, energy, and reliability.

## Integration requirements

The generated registry at
`public/simulatte/platform/plugin-host/generated-plugin-registry.js` still
contains the v1 Interstellar manifest, datasets, resources, config, and hashes.
Strict file ownership prohibited regenerating it in this lane. Browser loading
will therefore reject or omit the v2 lane until the integration owner runs the
canonical plugin-registry generator.

The shared runtime script inventory now loads `v4-contribution.js`, but still names
the removed legacy `astrometry.js`, `network.js`, and `propagation.js` modules.
Remove those three entries before browser proof.

The legacy shared test
`tests/multi-tier-plugin-completion.test.cjs` calls `scheduleRelay` without the
now-required `packetBits` and `linkBudgets`. The scheduler intentionally fails
closed with `relay_link_budget_count_invalid`. Update the shared fixture to
provide a governed budget and packet size.

Core should consume `contributeV4()` directly as
`simulatte.pluginContribution.v4`. The following richer domain accessors remain
available only where the final shared contract needs an extension:

- `simulatte.semanticPresentation.v4-draft`;
- `simulatte.viewIntent.v1`;
- `simulatte.comparisonDefinition.v1`;
- `simulatte.dataReceipt.v1`;
- `simulatte.modelReceipt.v1`;
- `simulatte.simulationEvent.v4`.

Core should replace `createV3CompatibilityPresentation` once the semantic
compositor is active. It should also replace the single-dispatch action adapter
after every profile runs through the shared stepped simulation clock.

## Known data and model limits

- Gaia covariance matrices are not loaded.
- Wolf 359 and Epsilon Eridani lack radial velocity in the selected Gaia rows.
  Propagation uses zero radial velocity and surfaces that loss.
- Terminal hardware is scenario data, not observed infrastructure.
- Contacts remain continuously available.
- Acquisition outages, complete detector noise, plasma, maintenance, retries,
  and infrastructure feasibility are not modeled.
- The reliability quantity is an idealized independent-hop model result.
- The current tier renderer is a planar projection of 3D coordinates. The
  semantic contract retains 3D coordinates for a future true 3D compositor.

## Browser evidence status

No browser result is claimed for this lane. The stale generated registry is a
confirmed integration blocker, and ownership rules prohibit modifying it here.
Run desktop and 390x844 tier audits after registry regeneration and v4
normalization.
