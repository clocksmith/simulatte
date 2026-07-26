# Exoplanet Survey End-to-End Implementation

Status: proposed and unimplemented.

Owner contract: `public/shared/plugins/exoplanet-survey/index.js`.

Profile: `exoplanet-survey-v1`.

Tier: `star-chart`, presented publicly as Universe.

## Product boundary

Exoplanet Survey is a blinded injection-and-recovery experiment. A policy
allocates finite observing and follow-up resources using observable target and
light-curve evidence. Hidden synthetic planets and false-positive labels are
available only to the simulation and final evaluator.

It does not discover a real planet, validate an instrument, estimate a
universal occurrence rate, or establish astrophysical confirmation.

The first public claim is:

> Under the declared target catalog, injected population, observing window,
> noise model, search pipeline, and follow-up budget, this survey policy
> recovered a measured fraction of the hidden simulated population.

## Files

```text
public/shared/plugins/exoplanet-survey/
  plugin.json
  config.schema.json
  default-config.json
  index.js
  target-catalog.js
  population-generator.js
  observing-window.js
  transit-model.js
  noise-model.js
  light-curve-generator.js
  detrending.js
  period-search.js
  candidate-ranker.js
  follow-up-engine.js
  evaluation.js
  metrics.js
  presentation.js
  v5-contribution.js

public/data/exoplanet-survey/
  gaia-dr3-survey-targets-v1.json
  nasa-exoplanet-archive-kepler-stellar-v1.json
  nasa-exoplanet-archive-dr25-tce-v1.json
  survey-instrument-archetypes-v1.json
  observing-window-scenarios-v1.json
  injection-population-models-v1.json
  noise-models-v1.json
  follow-up-models-v1.json
  benchmark-cases-v1.json
  model-governance-v1.json
  provenance-registry-v1.json
  dataset-manifest.json

public/data/application-profiles/
  exoplanet-survey-v1.json

public/data/simulatte/worlds/
  gaia-kepler-survey-field-v1.json

tools/exoplanet-survey/
  fetch-gaia-targets.mjs
  fetch-exoplanet-archive-calibration.mjs
  build-survey-data.mjs
  update-survey-manifest.mjs
  run-injection-recovery-audit.mjs

tests/
  exoplanet-survey.test.cjs
  exoplanet-survey-policy-blindness.test.cjs
  exoplanet-survey-browser.test.cjs
```

The plugin requires `simulatte.pluginPresentation.v5` scientific evidence
surfaces from the shared implementation program.

## Governed data

| Dataset | Acquisition | Use |
| --- | --- | --- |
| Gaia target rows | Pinned Gaia TAP query with release, source ID, selected astrometry and photometry, query text, retrieval date, and row hash | Observed stellar identities and catalog quantities |
| Kepler stellar rows | NASA Exoplanet Archive TAP table `keplerstellar` | Calibration target properties |
| DR25 TCE rows | NASA Exoplanet Archive TAP table `q1_q17_dr25_tce` | Held-out search and false-positive benchmarks |
| Instrument archetypes | Authored aperture, cadence, duty cycle, bandpass, read noise, saturation, and systematic parameters | Modeled instrument |
| Observing windows | Authored cadence and gap schedules | Scenario |
| Injection population | Authored distributions and correlations | Modeled hidden truth |
| Noise models | Authored white, correlated, stellar, and contamination terms | Modeled |

Official acquisition contracts:

- `https://gea.esac.esa.int/archive/`
- `https://exoplanetarchive.ipac.caltech.edu/TAP`
- `https://exoplanetarchive.ipac.caltech.edu/docs/TAP/usingTAP.html`

The acquisition tools pin the full ADQL query and response schema. They reject
missing source IDs, duplicate target IDs, unit drift, release drift, unlicensed
promotion, nonfinite required values, or response columns not declared by the
schema.

Published catalog planet fields may calibrate distributions or benchmarks.
They are never copied into a scenario and then treated as hidden discoveries.

## Profile and seeds

| Seed ID | Survey challenge | Comparison |
| --- | --- | --- |
| `short-cadence-small-planets` | Small radii, short periods, limited baseline | Uniform versus expected-yield target allocation |
| `window-aliases` | Periods near observing-window aliases | Fixed cadence versus jittered cadence |
| `active-stars` | Correlated stellar variability | Polynomial versus robust basis detrending |
| `blend-contamination` | Background eclipsing-binary blends | Detection score versus reliability-aware ranker |
| `follow-up-scarcity` | More candidates than follow-up slots | Highest score versus information-gain policy |

The profile selects `gaia-kepler-survey-field-v1` and
`exoplanet-survey-config-v1`.

## Configuration

```js
{
  id,
  targetCatalogId,
  instrumentId,
  populationModelId,
  noiseModelId,
  observingWindowId,
  targetPolicyId,
  cadencePolicyId,
  detrendingPolicyId,
  detectionPolicyId,
  rankingPolicyId,
  followUpPolicyId,
  observationBudgetHours,
  followUpBudgetHours,
  detectionThreshold,
  periodGrid: {
    minimumDays,
    maximumDays,
    oversamplingFactor
  },
  transitDurationGridHours,
  ensembleSeeds,
  startInstant
}
```

The scenario identity binds all configuration fields, source catalog hashes,
model hashes, seed, and hidden-truth hash.

## Hidden truth

```js
{
  schema: "simulatte.exoplanetHiddenPopulation.v1",
  id,
  seed,
  systems: [{
    targetId,
    planets: [{
      id,
      periodDays,
      epochDays,
      radiusEarth,
      radiusRatio,
      impactParameter,
      eccentricity,
      argumentOfPeriastronRad,
      inclinationRad
    }],
    falsePositiveSources: []
  }]
}
```

The hidden truth is passed to simulation factories by
`comparison-execution.js`. It is not present in observable input, policy
context, progressive policy observations, semantic layers, DOM attributes,
logs, storage keys, or pre-settlement receipts.

Policy-blindness tests walk every object reachable from `policy.decide` and
reject hidden target labels, injected planet IDs, true periods, true radii,
true dispositions, and oracle outcomes.

## Population generation

For each target and declared population cell:

1. Draw planet count from the declared multiplicity distribution.
2. Draw period and radius from the governed joint cell distribution.
3. Draw eccentricity and orientation from declared distributions.
4. Compute semi-major axis from stellar mass and period.
5. Determine transit geometry from inclination and scaled stellar radius.
6. Retain nontransiting planets in hidden truth for denominator accounting.
7. Generate declared eclipsing-binary and blend contaminants separately.

All draws use named deterministic streams derived from
`hash(scenarioIdentity, targetId, componentId)`. Changing target order does not
change a target's hidden system.

## Observation model

### Transit flux

Use a quadratic limb-darkened transit model with:

```text
I(mu) / I(1) = 1 - u1 * (1 - mu) - u2 * (1 - mu)^2
```

Numerically integrate occulted stellar intensity over exposure time using a
declared radial quadrature and sub-exposure count. The model receipt records
limb-darkening source, integration resolution, maximum flux error against
benchmark cases, and any small-planet approximation.

### Noise

Flux contains independently receipted components:

```text
observed_flux =
  transit_or_false_positive_signal
  + photon_noise
  + read_noise
  + correlated_instrument_noise
  + stellar_variability
  + contamination
```

White terms use deterministic normal draws. Correlated terms use a declared
ARMA or Gaussian-process approximation with kernel parameters and matrix
factorization receipt. Data gaps and quality flags are events, not zero-valued
flux rows.

### Cadence

The observing-window engine emits timestamped exposures, gaps, target changes,
and discarded exposures. It conserves the total observation budget. Cadence
policies receive only visibility, prior observations, target catalog fields,
and remaining budget.

## Analysis pipeline

### Detrending

Two initial policies:

- `robust-basis-v1`: iterative Huber-weighted basis regression.
- `windowed-polynomial-v1`: masked local polynomial fit.

The receipt records mask policy, basis order, iterations, clipping threshold,
effective degrees of freedom, attenuation measured on injected benchmark
signals, and rejected cadences.

### Period search

Implement a deterministic box least squares search:

1. Derive the frequency step from total baseline and oversampling factor.
2. Fold valid observations for each frequency.
3. Evaluate the declared duration grid and phase bins.
4. Retain the best depth, epoch, duration, score, and sample count.
5. Reject periods with insufficient in-transit samples.
6. Identify harmonic and window aliases.
7. Return the top bounded peaks with stable period tie-breaking.

The result receipt records the full grid identity, evaluated count, rejected
count, score definition, best peaks, noise floor, and work duration.

### Candidate ranking

Rankers receive candidate features only:

- search score;
- period and duration estimate;
- event count;
- odd-even depth difference;
- secondary-event score;
- centroid or blend proxy;
- stellar catalog fields;
- detrending diagnostics;
- remaining follow-up budget.

Rankers never receive injection truth. Each ranking decision records the input
feature hash, policy version, score components, rank, and reason.

### Follow-up

Follow-up consumes time and returns a modeled measurement or failure:

```text
scheduled -> observed -> reduced -> supports-planet
                               -> supports-false-positive
                               -> inconclusive
                               -> failed
```

Outcomes depend on the hidden system and declared follow-up model. Policies
observe only completed outcomes.

## Causal events

```text
survey.initialized
target.selected
exposure.started
exposure.completed
exposure.discarded
light-curve.updated
detrending.completed
period-search.completed
candidate.created
candidate.rejected
candidate.ranked
follow-up.scheduled
follow-up.completed
survey.budget-exhausted
survey.terminal
truth.revealed
```

`truth.revealed` occurs only after both branches are terminal. Evaluation and
settlement causally depend on it.

## Comparison

Both branches share:

- target catalog;
- hidden population;
- noise draws;
- visibility and data gaps;
- instrument;
- observation and follow-up budgets;
- starting epoch;
- metric schema.

Only the selected policy differs. Lockstep comparison advances the same
exposure index when cadence is identical. Event-time comparison advances the
earliest branch event when policies schedule different targets or follow-up
times.

Settlement requires:

- both budgets reconciled;
- all candidates terminal;
- truth revealed after policy completion;
- identical hidden-truth identity;
- zero policy-leak violations;
- compatible evaluation cells;
- complete evidence closure.

## Metrics

| Metric | Definition |
| --- | --- |
| Completeness | Recovered injected transiting planets divided by detectable injected transiting planets in a declared radius-period cell |
| Reliability | True recovered planets divided by all promoted candidates |
| False-positive rate | False promoted candidates divided by promoted candidates |
| Yield | True recovered planets |
| Resource use | Observation and follow-up hours consumed |
| Missed opportunities | Detectable injected planets not promoted |
| Calibration error | Difference between candidate score bins and empirical reliability |

Every denominator is receipted. A cell with insufficient members is unknown,
not zero.

## Controls

| ID | Kind |
| --- | --- |
| `target-policy` | select |
| `cadence-policy` | select |
| `observation-budget` | range |
| `detrending-policy` | select |
| `detection-threshold` | range |
| `ranking-policy` | select |
| `follow-up-policy` | select |
| `follow-up-budget` | range |
| `population-cell` | multiselect |
| `ensemble-size` | select |

Controls regenerate configuration hashes and both branch definitions.

## Evidence surfaces

`pluginPresentation.v5` provides:

| Surface | Layers |
| --- | --- |
| Target field | Governed targets, selected targets, observing state |
| Light curve | Raw flux, detrended flux, quality gaps, candidate events |
| Folded transit | Phase-folded samples, binned flux, best-fit box or transit |
| Periodogram | Search power, aliases, selected peak, threshold |
| Candidate funnel | Detected, ranked, followed, promoted, rejected counts |
| Completeness | Radius-period cells with sample counts and uncertainty |
| Reliability | Score bins with empirical outcome and interval |

Core owns axes, decimation, colors, density, labels, and comparison alignment.
Selection binds every visible row back to exposure IDs, source target rows,
transformations, candidate events, and model receipts.

## Receipts

```text
simulatte.plugin.exoplanetScenarioReceipt.v1
simulatte.plugin.exoplanetPopulationReceipt.v1
simulatte.plugin.exoplanetObservationReceipt.v1
simulatte.plugin.exoplanetLightCurveReceipt.v1
simulatte.plugin.exoplanetDetrendingReceipt.v1
simulatte.plugin.exoplanetPeriodSearchReceipt.v1
simulatte.plugin.exoplanetCandidateReceipt.v1
simulatte.plugin.exoplanetFollowUpReceipt.v1
simulatte.plugin.exoplanetEvaluationReceipt.v1
simulatte.plugin.exoplanetSettlementReceipt.v1
simulatte.comparisonExecutionReceipt.v4
```

## Tests

Unit and benchmark tests prove:

- deterministic hidden populations independent of target ordering;
- policy context contains no hidden labels;
- transit flux matches pinned analytic or high-resolution benchmarks;
- exposure integration converges within declared error;
- noise streams reproduce exactly;
- data gaps remain missing;
- period search recovers benchmark periods and identifies declared aliases;
- detrending attenuation is measured and bounded;
- changing only cadence, noise, threshold, or follow-up policy changes causal
  outcomes;
- completeness and reliability denominators are correct;
- insufficient cells are unknown;
- replay, seek, and settlement reproduce byte-identical receipts.

Browser tests cover:

1. Select a governed survey seed.
2. Start both branches.
3. Step through exposures and target changes.
4. Inspect raw and detrended points.
5. Inspect periodogram peak and alias evidence.
6. Pause and reload before truth reveal.
7. Restore both branches without exposing truth.
8. Complete follow-up and reveal truth.
9. Settle completeness and reliability.
10. Audit all evidence surfaces on desktop and `390x844`.

## Release gate

Registration is blocked until:

- the scientific surface compositor is active without compatibility fallback;
- policy-blindness mutation tests fail on every injected leak;
- injection-and-recovery benchmarks pass;
- source target rows and model outputs remain separately classified;
- no UI or documentation implies discovery, instrument certification, or
  universal occurrence;
- both browser viewports provide settled screenshot, pixel, console,
  performance, reload, and claim evidence.
