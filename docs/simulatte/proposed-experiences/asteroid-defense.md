# Asteroid Defense End-to-End Implementation

Status: proposed and unimplemented.

Owner contract: `public/shared/plugins/asteroid-defense/index.js`.

Profile: `asteroid-defense-v1`.

Tier: `solar-system`.

## Product boundary

Asteroid Defense is an uncertainty-reduction and intervention-policy
experiment. It begins with timestamped observations and an orbit fit. It does
not begin with a certain impact.

The public experience uses synthetic campaigns or clearly historical
benchmark cases. It does not issue a public danger assessment, reproduce an
operational Sentry solution, recommend a launch, provide civil-defense
guidance, or claim an unsupported impact probability.

The first public claim is:

> Inside this declared simulation, the observation and intervention policy
> changed the modeled encounter distribution under stated orbit, force, and
> execution assumptions.

## Prerequisites

Asteroid Defense cannot be registered until:

1. Orbital Transfer Planner's solver receipts, n-body verification, frame,
   time-scale, endpoint-error, and benchmark gates remain green.
2. The shared `propagation.n-body.v1` capability is extracted from plugin-local
   ownership.
3. `simulatte.pluginPresentation.v5` scientific evidence surfaces are active.
4. Comparison policy blindness and hidden-truth mutation tests pass.

## Files

```text
public/shared/plugins/asteroid-defense/
  plugin.json
  config.schema.json
  default-config.json
  index.js
  observation-model.js
  orbit-determination.js
  covariance.js
  ensemble-propagation.js
  encounter-analysis.js
  b-plane.js
  intervention-model.js
  decision-policy.js
  evaluation.js
  metrics.js
  presentation.js
  v5-contribution.js

public/data/asteroid-defense/
  synthetic-observation-campaigns-v1.json
  observer-stations-v1.json
  force-models-v1.json
  intervention-archetypes-v1.json
  execution-uncertainty-models-v1.json
  decision-policies-v1.json
  historical-benchmark-cases-v1.json
  jpl-reference-snapshots-v1.json
  model-governance-v1.json
  provenance-registry-v1.json
  dataset-manifest.json

public/data/application-profiles/
  asteroid-defense-v1.json

tools/asteroid-defense/
  fetch-jpl-benchmarks.mjs
  build-synthetic-campaigns.mjs
  build-asteroid-defense-data.mjs
  update-asteroid-manifest.mjs
  run-orbit-calibration-audit.mjs

tests/
  asteroid-defense.test.cjs
  asteroid-defense-policy-blindness.test.cjs
  asteroid-defense-browser.test.cjs
```

The profile may reuse `solar-system-ephemeris-v2` when its exact ephemeris,
frame, and time-scale identities satisfy the force model. Otherwise it selects
a new governed world through the profile-specific world manifest.

## Governed data

| Dataset | Use | Truth boundary |
| --- | --- | --- |
| Synthetic observation campaigns | Public scenarios with hidden Cartesian truth and noisy angular observations | Scenario observations and hidden truth |
| Observer stations | Station coordinates, reference frame, and availability | Observed identity or scenario station |
| Force models | Bodies, gravitational parameters, ephemeris identity, relativity and nongravitational options | Modeled |
| Intervention archetypes | Mass, launch window, delivery geometry, reliability, momentum enhancement | Modeled or scenario |
| Execution uncertainty | Launch, navigation, delivery, momentum, and covariance assumptions | Modeled |
| Historical benchmarks | Pinned published observations and expected fit or propagation checks | Observed benchmark only |
| JPL snapshots | SBDB, Horizons, or Sentry response retained for terminology and test identity | Observed agency output, not operational reproduction |

Official acquisition contracts:

- `https://ssd-api.jpl.nasa.gov/doc/index.php`
- `https://ssd-api.jpl.nasa.gov/doc/sbdb.html`
- `https://ssd-api.jpl.nasa.gov/doc/sentry.html`
- `https://ssd.jpl.nasa.gov/horizons/`

JPL API signatures and versions are stored and checked. Responses are pinned as
immutable benchmark artifacts. A live JPL response is never consumed by the
browser and never becomes a current-risk claim.

## Profile and seeds

| Seed ID | Campaign | Comparison |
| --- | --- | --- |
| `short-arc-follow-up` | Initial short arc with high covariance | Fixed cadence versus information-gain follow-up |
| `late-precision-observation` | One later high-precision observation | Act now versus observe then decide |
| `keyhole-sensitive-encounter` | Synthetic resonant-return sensitivity | Nominal deflection versus covariance-targeted deflection |
| `launch-reliability` | Same orbit distribution, uncertain launch and delivery | Kinetic impactor versus reconnaissance-first |
| `false-alarm-calibration` | Nonimpacting hidden orbit with concerning early fit | Threshold policy comparison |

Each public seed is labeled synthetic unless every observation and fit target is
explicitly historical.

## Configuration

```js
{
  id,
  observationCampaignId,
  forceModelId,
  orbitFitPolicyId,
  followUpPolicyId,
  decisionPolicyId,
  interventionPolicyId,
  interventionArchetypeId,
  ensembleSize,
  observationBudget,
  decisionThreshold,
  propagation: {
    relativeTolerance,
    absoluteTolerance,
    maximumStepSeconds,
    minimumStepSeconds,
    closeApproachRadiusKm
  },
  fit: {
    maximumIterations,
    correctionTolerance,
    residualTolerance,
    outlierPolicyId
  },
  startInstant,
  terminalInstant,
  seed
}
```

Configuration hash includes all solver, frame, time-scale, force, observation,
intervention, uncertainty, policy, and seed fields.

## Hidden truth

```js
{
  schema: "simulatte.asteroidHiddenTruth.v1",
  id,
  sha256,
  initialState: {
    epochTdb,
    referenceCenter,
    referenceFrame,
    positionKm,
    velocityKmPerSecond
  },
  observationNoiseDraws,
  futureObservationOutcomes,
  interventionExecutionDraws,
  encounterOutcomes
}
```

Policy observations contain only acquired measurements, fit receipts,
published covariance, available resources, and elapsed simulation time. They
exclude the true state, future measurements, future execution draws, and true
encounter outcomes.

## Observation model

Each optical observation records:

```js
{
  id,
  epochUtc,
  epochTdb,
  stationId,
  rightAscensionRad,
  declinationRad,
  covarianceRad2,
  referenceFrame,
  lightTimeCorrection,
  aberrationCorrection,
  provenance
}
```

For synthetic campaigns:

1. Propagate hidden Cartesian state to transmit time.
2. Iterate one-way light time to the observing station.
3. Transform into the declared inertial frame.
4. Compute topocentric right ascension and declination.
5. Add deterministic correlated angular noise.
6. Preserve true noiseless values only in hidden truth.

The model receipt reports all corrections and omissions.

## Orbit determination

Use weighted nonlinear least squares over a six-component Cartesian state at a
declared reference epoch.

Residual:

```text
r = wrap(observed_angles - predicted_angles)
```

Normal equations:

```text
(H^T W H + lambda I) delta = H^T W r
```

Implementation requirements:

1. Propagate the trial state to every observation epoch with the shared n-body
   capability.
2. Compute the observation Jacobian with validated central differences first.
   Automatic differentiation may replace it only after parity tests.
3. Use Cholesky for positive-definite normal matrices and SVD fallback for
   ill-conditioned cases.
4. Apply Levenberg-Marquardt damping with deterministic acceptance.
5. Record every iteration, residual RMS, weighted cost, condition number,
   damping value, correction norm, rejected update, and termination reason.
6. Distinguish converged, numerical nonconvergence, singular geometry,
   insufficient arc, and constraint rejection.

The covariance is:

```text
P = scale * inverse(H^T W H)
```

with degrees of freedom, scale policy, rank, and positive-semidefinite check
recorded. A non-positive-semidefinite covariance blocks probability output.

## Ensemble generation

Generate orbit clones from the fitted state and covariance using a
deterministic square-root transform:

```text
x_i = x_fit + L * z_i
```

where `L` is a validated Cholesky or eigen square root and `z_i` comes from a
declared low-discrepancy sequence with a deterministic scramble.

Record:

- covariance identity;
- square-root method;
- eigenvalues and clipped values;
- sample sequence;
- ensemble size;
- sample mean and covariance residual;
- rejected nonphysical samples.

Orbit uncertainty and intervention execution uncertainty use separate named
streams and separate receipts.

## Propagation

`propagation.n-body.v1` receives:

```js
{
  stateVector,
  referenceCenter,
  referenceFrame,
  timeScale,
  startEpoch,
  endEpoch,
  ephemerisIdentity,
  bodyGmIdentities,
  forceModel,
  tolerances
}
```

Use an adaptive embedded high-order Runge-Kutta implementation with dense
output and event detection. The implementation choice, Butcher tableau hash,
step acceptance history, minimum approach step, conservation diagnostics,
endpoint state, and failure reason are receipted.

Independent verification runs selected samples with a second integrator or
step policy and reports endpoint position and velocity disagreement. If the
declared tolerance is exceeded, the encounter result is not validated.

## Encounter and b-plane analysis

For each ensemble member:

1. Detect the closest Earth approach inside the declared interval.
2. Refine closest approach with dense-output root finding.
3. Transform relative state into the encounter b-plane basis.
4. Report `xi`, `zeta`, time of closest approach, miss distance, and relative
   velocity.
5. Test intersection with the declared Earth effective radius.
6. For resonant-return scenarios, map declared keyhole intervals and report
   sensitivity without implying an operational keyhole solution.

Modeled impact probability is:

```text
impacting validated ensemble members / validated ensemble members
```

The denominator and sampling error interval are mandatory. Failed propagation
members are reported separately and never counted as misses.

## Intervention model

The first intervention is a kinetic impactor:

```text
delta_v = beta * spacecraft_mass / asteroid_mass * relative_impact_velocity
```

applied along the declared impact direction at the modeled encounter epoch.

The receipt records spacecraft mass, asteroid mass model, impact velocity,
direction, `beta`, delivery epoch, launch outcome, navigation error, delivery
error, and covariance contribution.

Reconnaissance changes future observation covariance or asteroid-property
uncertainty. Gravity-tractor support remains unregistered until its continuous
force and station-keeping model passes independent verification.

Failed launch, missed delivery, and ineffective transfer are terminal causal
outcomes, not silently retried successes.

## Decision policy

Policies may:

- request a declared follow-up observation;
- wait;
- launch reconnaissance;
- launch the configured intervention;
- take no intervention.

The decision input contains current fit, covariance, modeled encounter
distribution, resource state, lead time, and prior public actions. It never
contains hidden truth.

Every decision records thresholds, observable feature hash, selected action,
rejected actions, resource effect, and reason. The UI calls these scenario
decisions, not recommendations.

## Causal events

```text
campaign.initialized
observation.available
observation.acquired
orbit-fit.started
orbit-fit.converged
orbit-fit.failed
ensemble.generated
encounter-distribution.updated
follow-up.requested
decision.threshold-crossed
intervention.authorized
launch.succeeded
launch.failed
delivery.succeeded
delivery.failed
momentum-transfer.applied
post-intervention-ensemble.propagated
campaign.terminal
truth.revealed
evaluation.completed
```

Fit, ensemble, decision, intervention, and evaluation events include exact
causation IDs.

## Comparison

Baseline and intervention branches share:

- observation campaign;
- hidden initial orbit;
- observation noise;
- future observation outcomes;
- force model and ephemerides;
- execution draws where an action is common;
- starting resources;
- metric schema.

Policy differences are explicit. A no-intervention baseline remains visible.
Event-time synchronization advances the earliest observation, decision,
launch, delivery, or close-approach event. The comparison receipt records
branch divergence and unmatched actions.

Settlement requires:

- terminal branch status;
- fit and propagation status for every displayed result;
- covariance validity;
- identical starting identity;
- no policy leakage;
- reconciled observation and mission resources;
- complete event and evidence closure;
- explicit handling of every failed ensemble member.

## Metrics

| Metric | Meaning |
| --- | --- |
| Residual RMS | Weighted angular fit residual |
| Covariance volume | Declared determinant or eigenvalue-derived measure |
| Encounter spread | Distribution of b-plane coordinates and miss distance |
| Modeled impact fraction | Validated impacting samples divided by validated samples |
| Decision lead time | Scenario time between action and nominal encounter |
| Observation cost | Acquisitions consumed |
| Intervention success fraction | Execution ensemble outcomes meeting declared displacement criterion |
| Calibration | Hidden truth containment and probability reliability over blinded campaign set |

No probability is shown without ensemble size, failed-member count, interval,
force model, fit status, and scenario label.

## Controls

| ID | Kind |
| --- | --- |
| `follow-up-policy` | select |
| `observation-budget` | range |
| `decision-threshold` | range |
| `intervention-policy` | select |
| `spacecraft-mass` | range |
| `momentum-enhancement` | range |
| `launch-reliability-model` | select |
| `ensemble-size` | select |
| `force-model` | select |

Controls change configuration and comparison identity. Camera controls do not
change physics.

## Evidence surfaces

| Surface | Visible evidence |
| --- | --- |
| Observation timeline | Acquired and available observations, uncertainties, decisions |
| Residual plot | Right ascension and declination residuals by epoch |
| Covariance evolution | Fit uncertainty after each observation |
| Solar-system trajectory | Nominal and bounded ensemble geometry |
| Earth encounter | Relative approach and uncertainty tube |
| B-plane | Ensemble points, Earth cross section, declared keyhole intervals |
| Comparison | Synchronized baseline and intervention distributions |
| Calibration | Predicted probability bins versus blinded outcomes |

Core controls axes, density, decimation, uncertainty style, labels, and camera.
The plugin supplies quantities, coordinates, event bindings, and provenance.

View intents:

- overview frames all relevant trajectories;
- follow targets the active nominal member;
- compare frames both branch encounter distributions;
- free preserves manual exploration;
- close-approach events may request an eased encounter view but never override
  manual navigation.

## Receipts

```text
simulatte.plugin.asteroidScenarioReceipt.v1
simulatte.plugin.asteroidObservationReceipt.v1
simulatte.plugin.orbitFitReceipt.v1
simulatte.plugin.orbitCovarianceReceipt.v1
simulatte.plugin.orbitEnsembleReceipt.v1
simulatte.plugin.encounterReceipt.v1
simulatte.plugin.bPlaneReceipt.v1
simulatte.plugin.interventionReceipt.v1
simulatte.plugin.asteroidDecisionReceipt.v1
simulatte.plugin.asteroidCalibrationReceipt.v1
simulatte.plugin.asteroidSettlementReceipt.v1
simulatte.comparisonExecutionReceipt.v4
```

## Tests

Unit and scientific tests prove:

- observation simulation reproduces noiseless geometry;
- light-time and frame transformations match pinned cases;
- orbit fitting converges on blinded synthetic campaigns;
- residual, Jacobian, covariance, and condition diagnostics are correct;
- nonconvergence, singular arcs, and invalid covariance fail closed;
- ensemble sample mean and covariance meet tolerance;
- n-body propagation matches pinned Horizons or independent benchmark states;
- b-plane coordinates match published or independently generated benchmarks;
- policies cannot read hidden state or future outcomes;
- observation-only changes contract the distribution causally;
- intervention-only changes shift the post-intervention distribution causally;
- failed launches and deliveries remain failures;
- replay and reload reproduce identical comparison receipts.

Calibration tests run many blinded synthetic campaigns and report:

- confidence-region coverage;
- impact-fraction reliability;
- false-alarm rate;
- missed-event rate;
- solver failure rate;
- policy resource use.

Browser tests:

1. Load a synthetic short-arc campaign.
2. Inspect observations before fitting.
3. Step through fit and ensemble generation.
4. Switch between trajectory, residual, covariance, encounter, and b-plane
   surfaces.
5. Compare observe-then-decide with act-now.
6. Pause and reload before intervention.
7. Restore both branches from receipts.
8. Complete propagation, truth reveal, evaluation, and settlement.
9. Verify manual camera override persists.
10. Audit desktop and `390x844` pixels, labels, controls, console, and
    performance.

## Release gate

Registration is blocked until:

- orbital numerical primitives pass independent benchmark gates;
- all probability outputs pass fit, covariance, propagation, denominator, and
  interval validation;
- policy-blindness mutation tests reject every hidden-truth leak;
- residual, covariance, encounter, and b-plane surfaces have pixel evidence;
- no claim implies current risk, operational Sentry reproduction, a launch
  recommendation, or civil-defense advice;
- profile evidence settles on desktop and mobile without compatibility
  adapters, stale artifacts, console warnings, or unresolved obligations.
