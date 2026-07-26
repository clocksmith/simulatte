# Food Recall

Owner contract: `public/shared/plugins/food-recall-us/index.js`.

## Status

- Status: verified
- Tier and world: Country, `us-food-network-v1`
- Plugin ID: `food-recall-us`
- Profile ID: `food-recall-us-v1`
- Default scenario: `leafy-green-baseline`
- Contract version: plugin v4 contribution
- Last verified source: commit `a5713c1c13ab`, bound worktree receipt
- Evidence: 8/8 runs in `artifacts/profile-evidence/index.json`

## What is it?

Food Recall is a synthetic traceback and intervention experiment. It simulates
lots moving through a national food network, temperature-dependent hazard
behavior, reporting, detection, and recall actions. Users compare a recall with
no recall. The page is not a live alert and does not represent current
facilities, shipments, illnesses, or product risk.

## What does it actually do?

1. Load a synthetic facility, lot, shipment, commodity, and consumer-zone scenario.
2. Resolve governed weather, refrigeration, and logistics inputs or deterministic modeled defaults.
3. Advance lots through shipment, storage, contamination, growth or survival, exposure, and reporting events.
4. Detect a signal and rank possible source lots from the visible evidence.
5. Apply the selected recall day and retail or consumer depth.
6. Execute an otherwise identical no-recall branch.
7. Settle illnesses, observed reports, detection, traceback, recall reach, and cases averted.

## What can the user control?

| Control | Default | Allowed values | Material effect |
|---|---:|---|---|
| Recall day | Scenario-specific | Day 0 through scenario duration | Changes exposure removed and modeled illnesses |
| Recall depth | Consumer or retail | Retail, consumer | Changes which downstream inventory and exposures are removed |
| Scenario preset | Leafy green traceback | Four hazard and commodity scenarios | Changes lots, kinetics, reporting, duration, and intervention |

## What does the user see?

- Initial view: Synthetic facilities, consumer zones, and only the freight corridors used by the active run.
- During playback: Lot creation, shipment, storage, contamination, detection, recall, and illness events advance causally.
- Selection and inspection: Applied temperature, delay, availability, refrigeration failures, source evidence, and claim boundaries.
- Comparison view: Recall and no-recall branches expose aligned outcomes under identical exogenous inputs.
- Final settlement: Estimated illnesses, simulated reports, detection day, source rank, recall reach, and cases averted.

## What is real, derived, modeled, or simulated?

| Item | Origin | Source | Time status | Uncertainty | Used for |
|---|---|---|---|---|---|
| Historical recall references | observed | Governed public rows | historical | Coverage-specific | Context only |
| Environmental field | observed or modeled | Pinned snapshot or fallback receipt | historical or forecast | Units and interpolation retained | Hazard kinetics |
| Freight corridor identity | modeled | Governed corridor dataset | forecast | Not current service | Shipment path |
| Facilities, lots, and shipments | scenario | Authored scenario pack | forecast | Synthetic | Network state |
| Refrigeration state | scenario or simulated | Scenario and seeded failures | forecast | Declared failure model | Product temperature |
| Hazard growth or survival | modeled | Commodity-specific equations | forecast | Parameter limits | Contamination level |
| Illness and reports | simulated | Exposure and detection models | forecast | Ensemble and model uncertainty | Outcome comparison |

## How does the simulation work?

- State: Facilities, lots, shipments, contamination, temperatures, refrigeration, exposures, reports, and recall status.
- Governing algorithm: Commodity-specific growth or survival equations plus deterministic logistics and detection transitions.
- Progression: Causal events link departure, transit, storage, arrival, exposure, reporting, detection, recall, and settlement.
- Randomness: Explicit scenario seeds drive contamination, failures, exposure, and reporting.
- Invariants: Lot lineage is conserved; inputs retain timestamps, units, interpolation, provider, and source-row identity.
- Settlement: Both branches terminate with compatible outcome metrics and closed event and provenance references.

## How do comparison and playback work?

- Baseline branch: No recall intervention.
- Intervention branch: Recall at the configured day and depth.
- Shared inputs: Lots, contamination, environment, logistics, refrigeration, detection, seed, and clock.
- Clock and replay: Identical inputs reproduce the same event sequence, including after reload.
- Invalid comparison: Different source data, seed, scenario, metric schema, or an unsettled branch blocks deltas.

## What can and cannot be claimed?

Can claim:

- Weather, refrigeration, and logistics inputs causally affect supported scenario equations.
- Identical inputs replay deterministically.
- Recall timing and depth can change modeled outcomes.
- Lot and input lineage remains inspectable.

Cannot claim:

- The page identifies a current outbreak or unsafe product.
- Synthetic facilities, lots, shipments, or illnesses are observed.
- Modeled defaults are measured weather or logistics.
- Cases averted predict a real recall outcome.

## What is verified?

- Unit tests: passing in `tests/food-recall-causal-inputs.test.cjs`
- Deterministic replay: verified with paired input changes
- Comparison execution: verified
- Desktop browser: verified
- Mobile browser: verified
- Known unresolved failures: none in the bound evidence matrix

## Where is it implemented?

- [Plugin entry](../../../public/shared/plugins/food-recall-us/index.js)
- [Configuration](../../../public/shared/plugins/food-recall-us/default-config.json)
- [Food engine](../../../public/shared/plugins/food-recall-us/food-engine.js)
- [Input context](../../../public/shared/plugins/food-recall-us/input-context.js)
- [v4 contribution](../../../public/shared/plugins/food-recall-us/v4-contribution.js)
- [Profile](../../../public/data/application-profiles/food-recall-us-v1.json)
- [Focused tests](../../../tests/food-recall-causal-inputs.test.cjs)
- [Evidence index](../../../artifacts/profile-evidence/index.json)
