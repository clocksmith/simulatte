# Orbital Transfer Planner

Owner contract: `public/shared/plugins/orbital-transfer-planner/index.js`.

## Status

- Status: implemented
- Tier and world: Solar System, `solar-system-ephemeris-v2`
- Plugin ID: `orbital-transfer-planner`
- Profile ID: `orbital-transfer-planner-v1`
- Default scenario: `earth-mars-window`
- Contract version: plugin v4 contribution
- Last verified source: prior browser proof at commit `a5713c1c13ab`
- Evidence: current worktree browser proof not rerun; prior index contains 8/8 runs

## What is it?

Orbital Transfer Planner searches pinned launch windows for an approximate
heliocentric transfer from Earth to a selected target. It records solver inputs,
branches, convergence, residuals, delta-v, and independent propagation error.
The output is a deterministic screening calculation, not a navigation solution
or proof that a mission is feasible.

## What does it actually do?

1. Load pinned heliocentric state vectors, gravitational constants, spacecraft, and radiation inputs.
2. Select a target, departure grid, arrival grid, branch, and revolution count from the scenario.
3. Solve bounded universal-variable Lambert candidates.
4. Preserve converged and rejected candidates with residual and fallback reasons.
5. Rank candidates using user-controlled delta-v and flight-time weights.
6. Propagate the selected state with an independent RK4 n-body verifier.
7. Compare the selected transfer with a named circular coplanar Hohmann screen.

## What can the user control?

| Control | Default | Allowed values | Material effect |
|---|---:|---|---|
| Delta-v weight | 1 | 0 to 10 | Changes candidate ranking |
| Flight-time weight | 0.01 | 0 to 1 | Changes candidate ranking |
| Spacecraft | Heavy cargo freighter | Governed archetypes | Changes modeled shielding and radiation proxy |
| Transfer branch | Prograde | Prograde or retrograde | Changes Lambert candidates |
| Verification step | 0.5 days | 0.05 to 5 days | Changes independent propagation resolution |
| Mission preset | Earth to Mars | Moon, Mars, Venus, Jupiter presets | Changes target, epochs, bounds, spacecraft, and constraints |

## What does the user see?

- Initial view: Solar System bodies and pinned reference paths in heliocentric coordinates.
- During playback: A bounded family of candidate paths appears during search, the selected Lambert solution is verified, and a spacecraft follows the independently propagated trajectory to its endpoint residual.
- Selection and inspection: Epochs, flight time, delta-v, branch, revolutions, iterations, residual, hashes, frame, and center.
- Comparison view: Selected Lambert transfer and circular coplanar Hohmann screen remain explicitly distinct.
- Final settlement: Convergence, fallback, endpoint position and velocity error, verifier status, and claim gate.

## What is real, derived, modeled, or simulated?

| Item | Origin | Source | Time status | Uncertainty | Used for |
|---|---|---|---|---|---|
| Pinned state-vector rows | modeled | Governed JPL Horizons response | snapshot | Covariance omitted | Boundary conditions |
| Gravitational constants | observed or derived | Pinned DE440 constants | historical | Source precision retained | Force model |
| Spacecraft and depot inputs | scenario | Authored archetypes | forecast | Mission-specific uncertainty missing | Constraints |
| Lambert candidates | modeled | Universal-variable solver | forecast | Numerical convergence recorded | Search |
| Hohmann baseline | modeled | Circular coplanar equations | forecast | Screening assumptions explicit | Comparison |
| N-body trajectory | modeled | Independent RK4 propagation | forecast | Tolerance and step receipt | Verification |
| Endpoint errors | derived | Propagated state vs target vector | forecast | Ephemeris covariance missing | Claim gate |

## How does the simulation work?

- State: Scenario, solver grid, candidate receipts, selected or fallback trajectory, verification, metrics, and claim status.
- Governing algorithm: Bounded single-revolution Lambert search plus independent heliocentric RK4 propagation.
- Progression: The planner computes and settles one reproducible transfer record per scenario run.
- Randomness: None in solver search; identical state vectors, bounds, weights, and tolerances reproduce the result.
- Invariants: Every accepted claim binds convergence, residual, frame, epochs, endpoint errors, and benchmark tolerances.
- Settlement: A selected solution or named fallback reaches an explicit accepted, approximate, or rejected claim gate.

## How do comparison and playback work?

- Baseline branch: Circular coplanar Hohmann screening calculation.
- Intervention branch: Ranked bounded Lambert solution, if one converges.
- Shared inputs: Target, reference center, frame, constants, and scenario epochs.
- Clock and replay: Both calculations are deterministic and settle without hidden mutable state.
- Invalid comparison: Missing input hashes, frame mismatch, nonconvergence, failed endpoint verification, or absent metrics blocks strong deltas.

## What can and cannot be claimed?

Can claim:

- The receipt reproduces the declared solver inputs and numerical outcome.
- Rejected candidates and fallback reasons remain visible.
- Independent propagation reports endpoint errors.
- Hohmann remains a named screening baseline.

Cannot claim:

- A trajectory is navigation-ready.
- Convergence alone proves mission feasibility.
- Pinned vectors include navigation covariance.
- The approximation validates real spacecraft execution.

## What is verified?

- Unit tests: passing in `tests/orbital-transfer-verification.test.cjs`
- Deterministic replay: verified against snapshots
- Comparison execution: verified
- Desktop browser: not rerun for the current worktree
- Mobile browser: not rerun for the current worktree
- Known unresolved failures: navigation covariance and operational mission constraints are absent

## Where is it implemented?

- [Plugin entry](../../../public/shared/plugins/orbital-transfer-planner/index.js)
- [Configuration](../../../public/shared/plugins/orbital-transfer-planner/default-config.json)
- [Lambert solver](../../../public/shared/plugins/orbital-transfer-planner/lambert.js)
- [N-body verifier](../../../public/shared/plugins/orbital-transfer-planner/n-body-verifier.js)
- [v4 contribution](../../../public/shared/plugins/orbital-transfer-planner/v4-contribution.js)
- [Profile](../../../public/data/application-profiles/orbital-transfer-planner-v1.json)
- [Focused tests](../../../tests/orbital-transfer-verification.test.cjs)
- [Evidence index](../../../artifacts/profile-evidence/index.json)
