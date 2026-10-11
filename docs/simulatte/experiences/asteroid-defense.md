# Asteroid Defense

Owner contract: `public/shared/plugins/asteroid-defense/index.js`.

## Status

- Status: implemented
- Tier and world: Solar System, `solar-system-ephemeris-v2`
- Plugin ID: `asteroid-defense`
- Profile ID: `asteroid-defense-v1`
- Default scenario: `short-arc-follow-up`
- Contract version: plugin v4 contribution
- Source identity: hashes in `artifacts/next-experiences/browser.json`
- Evidence: observation acquisition, decision commitment, and hidden-truth reveal in the source-bound browser receipt

## What is it?

Asteroid Defense is a synthetic observation, uncertainty, and intervention
experiment. Users first fit a modeled orbit from noisy measurements, then
compare observation and intervention policies over the same hidden orbit
clones. It does not assess a real object, reproduce Sentry, estimate public
danger, or recommend observation, launch, or civil-defense action.

## What does it actually do?

1. Load a synthetic observation campaign, observer stations, force model, policies, and intervention archetypes.
2. Fit an orbit from the user-limited observation set and record residuals and convergence.
3. Generate deterministic covariance clones while keeping hidden truth unavailable to policies.
4. Propagate clones to a modeled Earth encounter and compute encounter-plane screening quantities.
5. Apply follow-up and decision policies using observable fields only.
6. Sample intervention execution outcomes for the selected archetype.
7. Compare no intervention with the selected policy on identical hidden truth and seeds.

## What can the user control?

| Control | Default | Allowed values | Material effect |
|---|---:|---|---|
| Synthetic campaign | Short-arc follow-up | Five declared campaigns | Changes observations, hidden truth, and scenario |
| Follow-up policy | Information gain | Fixed cadence, information gain | Changes which observations are admitted |
| Decision policy | Observe then decide | Threshold, observe then decide | Changes intervention timing |
| Intervention | Kinetic impactor | Governed archetype list | Changes modeled execution and orbit perturbation |
| Observation budget | 8 | 4 to campaign maximum | Changes fit evidence and uncertainty |
| Orbit clones | 24 | 4 to 64 | Changes encounter distribution resolution |
| Screening threshold | 0.1 | 0 to 1 | Changes policy decision boundary |

## What does the user see?

- Initial view: A bounded 120-object projection from the governed JPL small-body context catalog, with the hypothetical threat visually and semantically separate.
- During playback: Angular observation sightlines, fitted clone paths, policy decisions, intervention travel/effects, encounter screening, and settlement events.
- Selection and inspection: Campaign identity, observation count, residuals, clone state, encounter quantities, and truth boundary.
- Opening measures: Acquired observations, decision time remaining from the last acquired measurement, and spread of fitted closest approaches. Playback alone does not acquire evidence.
- Visual meaning: Gold angular observations, blue alternative fits, amber screened fits, and a green Earth reference. Station selection highlights related evidence without moving the camera; Focus moves it explicitly. Station markers share the modeled Earth position, rather than invented station offsets.
- Comparison view: No-intervention and selected-policy branches share hidden truth while displaying separate outcomes.
- Final settlement: Baseline and intervention screening fractions, execution status, uncertainty, omissions, and policy result.

## What is real, derived, modeled, or simulated?

| Item | Origin | Source | Time status | Uncertainty | Used for |
|---|---|---|---|---|---|
| JPL API identity and benchmark row | observed | Pinned JPL reference snapshot | historical | Benchmark-only coverage | Terminology and regression |
| JPL NEO context catalog | observed | Bounded pinned SBDB Query API extract | snapshot | Published orbital-element fields | Background context only |
| Observer stations | scenario | Authored station registry | forecast | Synthetic campaign geometry | Measurements |
| Observations and hidden orbit | scenario | Synthetic campaign pack | forecast | Declared measurement errors | Fit and evaluation |
| Orbit fit and covariance | modeled | Least-squares fit | forecast | Residuals and clone covariance | State estimate |
| Encounter distribution | simulated | Propagated clone ensemble | forecast | Finite ensemble | Screening |
| Intervention execution | simulated | Seeded reliability model | forecast | Declared independent draws | Policy outcome |
| Screening fractions | derived | Clone encounter classification | forecast | Model-bound, not probability | Comparison |

## How does the simulation work?

- State: Observations, fitted state, residuals, clone ensemble, policy information, intervention, encounter, and settlement.
- Governing algorithm: Deterministic orbit fit, covariance sampling, two-body screening propagation, and seeded execution models.
- Progression: Causal events move from observation through encounter evaluation and policy settlement.
- Randomness: Governed seeds create identical hidden truth and execution draws across branches.
- Invariants: Policy code cannot read hidden truth, future failures, or intervention outcomes before their events.
- Settlement: Both branches complete compatible observation, encounter, execution, and evidence obligations.

## How do comparison and playback work?

- Baseline branch: No intervention.
- Intervention branch: Follow-up, decision, and selected intervention policy.
- Shared inputs: Campaign, hidden truth, observations, force model, clone seeds, and clock.
- Clock and replay: Both branches step, pause, replay, and reload from deterministic receipts.
- Invalid comparison: Hidden-truth leakage, different clones, incompatible metrics, failed fit, or unsettled execution blocks deltas.

## What can and cannot be claimed?

Can claim:

- Policies are evaluated on the same hidden synthetic orbit.
- Observation budget can change fit residuals and clone dispersion.
- Execution uncertainty is separate from observation uncertainty.
- Results remain bounded to the declared simulation.

Cannot claim:

- A displayed fraction is a real impact probability.
- The experience assesses current asteroid danger.
- It reproduces an operational JPL solution.
- It recommends launch or public-safety action.

## What is verified?

- Unit tests: passing in `tests/asteroid-defense.test.cjs`
- Deterministic replay: verified
- Comparison execution: verified with policy blindness
- Desktop and emulated mobile browser: see route results and source-freeze verdict in `artifacts/next-experiences/browser.json`
- Unfamiliar-user and physical-phone observation: pending
- Known unresolved failures: public risk assessment and operational calibration are excluded

## Where is it implemented?

- [Plugin entry](../../../public/shared/plugins/asteroid-defense/index.js)
- [Orbit determination](../../../public/shared/plugins/asteroid-defense/orbit-determination.js)
- [Encounter model](../../../public/shared/plugins/asteroid-defense/encounter-model.js)
- [JPL catalog renderer](../../../public/shared/plugins/asteroid-defense/asteroid-catalog.js)
- [JPL catalog build pipeline](../../../tools/asteroid-defense/build-jpl-neo-context.mjs)
- [v4 contribution](../../../public/shared/plugins/asteroid-defense/v4-contribution.js)
- [Profile](../../../public/data/application-profiles/asteroid-defense-v1.json)
- [Focused tests](../../../tests/asteroid-defense.test.cjs)
