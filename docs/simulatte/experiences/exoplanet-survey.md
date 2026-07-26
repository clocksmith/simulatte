# Exoplanet Survey

Owner contract: `docs/simulatte/experiences/exoplanet-survey.md`.

## Status

- Status: proposed
- Tier and world: Star Chart, world not registered
- Plugin ID: proposed `exoplanet-survey`
- Profile ID: not registered
- Default scenario: not implemented
- Contract version: proposed plugin v4 contribution
- Last verified source: none
- Evidence: none

## What is it?

Exoplanet Survey is a proposed blinded injection-and-recovery experiment. A
user would allocate observing and follow-up resources, search noisy synthetic
light curves, and compare survey policies against the same hidden planet
population. It would measure recovery and false positives within the declared
simulation, not discover planets or validate an instrument.

## What does it actually do?

1. Proposed: load governed stellar identities and declared instrument assumptions.
2. Proposed: inject a hidden synthetic planet and false-positive population.
3. Proposed: generate cadence, transits, noise, gaps, blends, binaries, and stellar variability.
4. Proposed: detrend observations and search periods without hidden labels.
5. Proposed: rank candidates and allocate finite follow-up resources.
6. Proposed: reveal hidden truth only during evaluation.
7. Proposed: compare completeness, reliability, false positives, resources, and missed candidates.

## What can the user control?

| Control | Default | Allowed values | Material effect |
|---|---:|---|---|
| Target selection | Not implemented | Governed target subsets | Would change the evaluated population |
| Observing duration and cadence | Not implemented | Declared survey schedules | Would change window function and sensitivity |
| Bandpass and instrument | Not implemented | Governed modeled archetypes | Would change flux and noise |
| Ranking policy | Not implemented | Declared blinded policies | Would change candidate order |
| Detection threshold | Not implemented | Bounded score range | Would trade completeness and reliability |
| Follow-up allocation | Not implemented | Finite resource budgets | Would change candidate confirmation |
| Noise and population seed | Not implemented | Governed seed set | Would bind common hidden truth |

## What does the user see?

- Initial view: Proposed target queue and observation-budget summary, not a decorative starfield.
- During playback: Proposed light curves, data gaps, preprocessing, period search, ranking, and follow-up decisions.
- Selection and inspection: Proposed source star, transformations, periodogram, aliases, score, follow-up, and hidden-truth reveal.
- Comparison view: Proposed policies would share identical hidden population, noise, cadence, and resource budget.
- Final settlement: Proposed completeness, reliability, false positives, resource use, attenuation, and missed-candidate explanations.

## What is real, derived, modeled, or simulated?

| Item | Origin | Source | Time status | Uncertainty | Used for |
|---|---|---|---|---|---|
| Stellar identities and properties | proposed observed | Gaia and NASA archives | historical | Catalog uncertainty required | Target catalog |
| Instrument assumptions | proposed modeled | Versioned archetypes | forecast | Parameter uncertainty required | Observation model |
| Hidden planets and binaries | proposed scenario | Seeded population generator | forecast | Declared distributions | Ground truth |
| Photon and correlated noise | proposed simulated | Observation model | forecast | Seeded distribution | Light curves |
| Detrended light curves | proposed derived | Preprocessing pipeline | forecast | Attenuation receipt required | Search |
| Candidates and ranks | proposed derived | Period search and policy | forecast | Calibration required | Follow-up |
| Recovery outcomes | proposed simulated | Hidden-truth evaluation | forecast | Ensemble distribution | Settlement |

## How does the simulation work?

- State: Proposed targets, hidden population, observing windows, flux samples, candidates, follow-up, and evaluation truth.
- Governing algorithm: Proposed transit generation, cadence integration, noise, detrending, period search, ranking, and injection recovery.
- Progression: Proposed observation, preprocessing, search, candidate, follow-up, reveal, and settlement events.
- Randomness: Proposed common seeds bind hidden population and noise across policies.
- Invariants: Policies must never access hidden labels, future observations, or evaluation outcomes.
- Settlement: Proposed branches close only when completeness, reliability, false positives, resources, and lineage are compatible.

## How do comparison and playback work?

- Baseline branch: Proposed reference cadence and ranking policy.
- Intervention branch: Proposed user-selected survey and follow-up policy.
- Shared inputs: Proposed targets, hidden population, noise, instrument, seed, and resource budget.
- Clock and replay: Proposed synchronized observation time with deterministic seek and reload.
- Invalid comparison: Hidden-truth leakage, different populations, incompatible preprocessing, metrics, or unsettled follow-up would block deltas.

## What can and cannot be claimed?

Can claim:

- Nothing about executable behavior until a profile and evidence exist.
- The proposal requires blinded policy inputs.
- The proposal requires injection-and-recovery evaluation.
- The proposal defines explicit truth and claim boundaries.

Cannot claim:

- The experience is implemented, verified, or deployed.
- A candidate is an actual discovery.
- Results validate an instrument or occurrence rate.
- Proposed archive inputs are already acquired and activated.

## What is verified?

- Unit tests: not implemented
- Deterministic replay: not tested
- Comparison execution: not implemented
- Desktop browser: not tested
- Mobile browser: not tested
- Known unresolved failures: complete plugin, data, profile, tests, and evidence are absent

## Where is it implemented?

- [Canonical proposal](exoplanet-survey.md)
- [Shared plugin v4 contract](../plugin-v4-contract.md)
- [Tier application manifest](../../../public/data/simulatte/tier-application-manifest.json)
- [Profile claim inventory](../../../public/data/application-profiles/profile-claim-inventory-v1.json)
- [Evidence index](../../../artifacts/profile-evidence/index.json)
