const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ephemeris = require('../public/shared/plugins/orbital-transfer-planner/ephemeris.js');
const lambert = require('../public/shared/plugins/orbital-transfer-planner/lambert.js');
const launchWindow = require('../public/shared/plugins/orbital-transfer-planner/launch-window.js');
const hohmann = require('../public/shared/plugins/orbital-transfer-planner/hohmann.js');
const verifier = require('../public/shared/plugins/orbital-transfer-planner/n-body-verifier.js');
const plugin = require('../public/shared/plugins/orbital-transfer-planner/index.js');
const v4Contracts = require('../public/simulatte/platform/contracts/plugin-v4-contracts.js');

const root = path.resolve(__dirname, '..');
const pluginDirectory = path.join(root, 'public/shared/plugins/orbital-transfer-planner');
const manifest = json(path.join(pluginDirectory, 'plugin.json'));
const config = json(path.join(pluginDirectory, 'default-config.json'));
const profile = json(path.join(root, 'public/data/application-profiles/orbital-transfer-planner-v1.json'));
const ephemerisData = json(path.join(root, 'public/data/orbital-transfer-planner/jpl-horizons-heliocentric-vectors-v1.json'));
const gmData = json(path.join(root, 'public/data/orbital-transfer-planner/gm-constants-de440-v1.json'));

test('Lambert solutions record branch, revolutions, iterations, tolerance, residual, and bracket', () => {
  const solution = lambert.solveLambert(
    [1, 0, 0],
    [0, 1, 0],
    91.3125,
    gmData.bodies.sun.gmAuD2,
    { prograde: true, maxIterations: 96, toleranceDays: 1e-8 },
  );
  assert.equal(solution.schema, 'simulatte.lambertSolution.v2');
  assert.equal(solution.branch, 'prograde');
  assert.equal(solution.revolutionCount, 0);
  assert.ok(solution.iterations > 0 && solution.iterations <= solution.maxIterations);
  assert.equal(solution.toleranceDays, 1e-8);
  assert.ok(Math.abs(solution.residualDays) <= solution.toleranceDays);
  assert.ok(solution.bracketZ.low < solution.bracketZ.high);
});

test('independent RK4 propagation reproduces a deterministic circular two-body benchmark', () => {
  const mu = gmData.bodies.sun.gmAuD2;
  const periodDays = 2 * Math.PI / Math.sqrt(mu);
  const input = {
    initialPositionAu: [1, 0, 0],
    initialVelocityAuD: [0, Math.sqrt(mu), 0],
    startDay: 0,
    durationDays: periodDays / 4,
    stepDays: 0.05,
    ephemerisDataset: ephemerisData,
    gmData,
    perturbingBodyIds: [],
  };
  const first = verifier.propagate(input);
  const second = verifier.propagate(input);
  assert.deepEqual(first, second);
  assert.ok(Math.hypot(
    first.positionAu[0],
    first.positionAu[1] - 1,
    first.positionAu[2],
  ) < 1e-8);
  assert.ok(Math.hypot(
    first.velocityAuD[0] + Math.sqrt(mu),
    first.velocityAuD[1],
    first.velocityAuD[2],
  ) < 1e-9);
});

test('bounded searches retain rejected candidates and exact grid identities', () => {
  const singular = {
    epochStart: '2030-01-01T00:00:00Z',
    bodies: {
      earth: {
        vectors: [
          { day: 0, positionAu: [1, 0, 0], velocityAuD: [0, 0.01, 0] },
          { day: 2, positionAu: [1, 0, 0], velocityAuD: [0, 0.01, 0] },
        ],
      },
      mars: {
        vectors: [
          { day: 0, positionAu: [1, 0, 0], velocityAuD: [0, 0.01, 0] },
          { day: 2, positionAu: [1, 0, 0], velocityAuD: [0, 0.01, 0] },
        ],
      },
    },
  };
  const search = launchWindow.scanLaunchWindow({
    ephemerisDataset: singular,
    departureBodyId: 'earth',
    arrivalBodyId: 'mars',
    gmSunAuD2: gmData.bodies.sun.gmAuD2,
    departureStartDay: 0,
    departureEndDay: 0,
    departureStepDays: 1,
    tofMinDays: 1,
    tofMaxDays: 2,
    tofStepDays: 1,
  });
  assert.equal(search.selected, null);
  assert.equal(search.search.attempted, 2);
  assert.equal(search.search.failed, 2);
  assert.equal(search.search.rejectionCounts.lambert_geometry_singular, 2);
  assert.equal(search.rejectedCandidates.length, 2);
  assert.deepEqual(
    search.rejectedCandidates.map((row) => row.tofDays),
    [1, 2],
  );
});

test('Hohmann fallback is explicitly a circular coplanar screening baseline with a reason', () => {
  const fallback = hohmann.createScreeningBaseline({
    r1Au: 1,
    r2Au: 1.523679,
    gmSunAuD2: gmData.bodies.sun.gmAuD2,
    trajectory: [[1, 0, 0], [1.523679, 0, 0]],
    fallbackReason: {
      code: 'no_converged_lambert_candidate',
      attempted: 12,
      rejectionCounts: { lambert_no_root: 12 },
    },
  });
  assert.equal(fallback.baselineType, 'circular_coplanar_screening_only');
  assert.equal(fallback.reason.code, 'no_converged_lambert_candidate');
  assert.match(fallback.claimBoundary, /not an epoch-valid trajectory/i);
  assert.ok(fallback.assumptions.includes('two-body solar gravity'));
});

test('every public scenario emits deterministic solver hashes, verification errors, receipts, and claim gates', async () => {
  for (const scenario of profile.seeds) {
    const firstHost = fixture();
    const first = await plugin.activate({
      sdk: firstHost.sdk,
      config,
      profile,
      scenario,
    });
    const result = first.capabilities['simulation.orbital-transfer.v1']();
    assert.equal(result.solverReceipt.inputHashes.ephemeris, manifest.datasets[0].reference.sha256);
    assert.equal(result.solverReceipt.inputHashes.gravitationalParameters, manifest.datasets[1].reference.sha256);
    assert.equal(result.solverReceipt.ephemeris.frame, 'ICRF');
    assert.equal(result.solverReceipt.ephemeris.center, '500@10');
    assert.equal(result.solverReceipt.ephemeris.timeScale, 'TDB');
    assert.equal(result.solverReceipt.branch, 'prograde');
    assert.equal(result.solverReceipt.revolutionCount, 0);
    assert.ok(result.solverReceipt.iterations > 0);
    assert.ok(Math.abs(result.solverReceipt.residualDays) <= result.solverReceipt.toleranceDays);
    assert.ok(Number.isFinite(result.verification.endpoint.positionErrorKm));
    assert.ok(Number.isFinite(result.verification.endpoint.velocityErrorKmS));
    assert.equal(result.verification.accepted, true, scenario.id);
    assert.equal(result.claimGate.status, 'verified_screening_approximation');
    assert.ok(result.claimGate.blocked.includes('validated flight path'));

    first.handleAction('plan.transfer');
    const receipt = firstHost.receipts.find((row) => row.schema === 'simulatte.plugin.orbitalTransferReceipt.v2');
    assert.deepEqual(receipt.solver, result.solverReceipt);
    assert.deepEqual(receipt.verification, result.verification);
    assert.equal(first.settle().obligationResults.find((row) => row.obligationId.endsWith(':independent-verification')).status, 'settled');
    const deltaVSettlement = first.settle().obligationResults.find((row) => row.obligationId.endsWith(':dv-envelope'));
    assert.equal(deltaVSettlement.status, 'settled');
    assert.equal(
      deltaVSettlement.evidence.withinScreeningEnvelope,
      result.metrics.totalDeltaVKmS <= deltaVSettlement.evidence.maximumKmS,
    );
    if (scenario.id === 'earth-jupiter-window') {
      assert.ok(result.metrics.totalDeltaVKmS > deltaVSettlement.evidence.maximumKmS);
      assert.equal(deltaVSettlement.evidence.withinScreeningEnvelope, false);
    }
    const contribution = first.contributeV4();
    v4Contracts.validateContribution(contribution);
    const transferLayer = contribution.presentation.layers.find((row) => row.id === 'transfer-trajectory');
    assert.ok(transferLayer.quantity.domain[1] >= result.metrics.totalDeltaVKmS);
    assert.ok(contribution.inspections[0].fields.some((row) => row.id === 'claim-gate'));

    const secondHost = fixture();
    const second = await plugin.activate({
      sdk: secondHost.sdk,
      config,
      profile,
      scenario,
    });
    assert.deepEqual(second.capabilities['simulation.orbital-transfer.v1'](), result);
  }
});

function fixture() {
  const values = new Map(manifest.datasets.map((row) => [
    row.id,
    json(path.resolve(pluginDirectory, row.reference.path)),
  ]));
  let reducer = null;
  let state = null;
  const receipts = [];
  return {
    receipts,
    sdk: {
      datasets: {
        require: (id) => values.get(id),
        optional: (id) => values.get(id) || null,
        receipt(id) {
          const declaration = manifest.datasets.find((row) => row.id === id);
          return declaration ? { id, sha256: declaration.reference.sha256 } : null;
        },
      },
      state: {
        register(nextReducer, initialState) {
          reducer = nextReducer;
          state = initialState;
        },
        read: () => state,
      },
      events: {
        propose(event) {
          state = reducer(state, event);
          return event;
        },
      },
      receipts: {
        append(receipt) {
          assert.ok(manifest.receiptSchemas.includes(receipt.schema), receipt.schema);
          receipts.push(receipt);
          return receipt;
        },
      },
    },
  };
}

function json(filename) {
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}
