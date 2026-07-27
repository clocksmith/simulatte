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

test('objective controls rerun the launch-window search and become receipt-backed state', async () => {
  const host = fixture();
  const instance = await plugin.activate({ sdk: host.sdk, config, profile, scenario: profile.seeds[0] });
  const before = instance.capabilities['simulation.orbital-transfer.v1']();
  let action = instance.handleAction('scenario.run', {
    values: { phase: 'start', deltaVWeight: 2, timeWeight: 0.2 },
  });
  const after = instance.capabilities['simulation.orbital-transfer.v1']();
  assert.equal(action.status, 'running');
  assert.notEqual(after.selected.objective, before.selected.objective);
  while (action.status === 'running') {
    action = instance.handleAction('scenario.run', { values: { phase: 'step' } });
  }
  assert.equal(action.status, 'settled');
  const controls = Object.fromEntries(instance.contributeV4().controls.controls.map((row) => [row.id, row.value]));
  assert.deepEqual(controls, {
    deltaVWeight: 2,
    prograde: true,
    spacecraftArchetypeId: 'cargo-freighter-v1',
    timeWeight: 0.2,
    verificationStepDays: 0.5,
  });
  const receipt = host.receipts.findLast((row) => row.schema === 'simulatte.plugin.orbitalTransferReceipt.v2');
  assert.equal(receipt.selectedCandidateId, after.selected.id);
  assert.deepEqual(receipt.solver, after.solverReceipt);
});

test('spacecraft, solver branch, and verifier controls causally alter accepted results', async () => {
  const host = fixture();
  const instance = await plugin.activate({ sdk: host.sdk, config, profile, scenario: profile.seeds[0] });
  const cargo = instance.handleAction('scenario.run', {
    values: {
      phase: 'start',
      spacecraftArchetypeId: 'cargo-freighter-v1',
      prograde: true,
      verificationStepDays: 0.5,
    },
  });
  assert.equal(cargo.status, 'running');
  const cargoResult = instance.capabilities['simulation.orbital-transfer.v1']();

  const crew = instance.handleAction('scenario.run', {
    values: {
      phase: 'start',
      spacecraftArchetypeId: 'crew-ship-v1',
      prograde: false,
      verificationStepDays: 1,
    },
  });
  assert.equal(crew.status, 'running');
  const crewResult = instance.capabilities['simulation.orbital-transfer.v1']();
  assert.equal(crewResult.acceptedParameters.spacecraftArchetypeId, 'crew-ship-v1');
  assert.equal(crewResult.acceptedParameters.prograde, false);
  assert.equal(crewResult.acceptedParameters.verificationStepDays, 1);
  assert.equal(crewResult.solverReceipt.branch, 'retrograde');
  assert.equal(crewResult.verification.stepDays, 1);
  assert.ok(
    crewResult.metrics.radiationExposureUnits < cargoResult.metrics.radiationExposureUnits,
    'the more heavily shielded crew archetype must reduce the modeled radiation proxy'
  );
});

test('launch-window playback exposes a bounded family of inspectable candidate paths', async () => {
  const host = fixture();
  const instance = await plugin.activate({ sdk: host.sdk, config, profile, scenario: profile.seeds[0] });
  instance.handleAction('scenario.run', { values: { phase: 'start' } });
  instance.handleAction('scenario.run', { values: { phase: 'step' } });
  const contribution = instance.contributeV4();
  const candidates = contribution.presentation.layers.filter((row) => row.id.startsWith('transfer-candidate:'));
  assert.ok(candidates.length > 1);
  assert.ok(candidates.length <= 12);
  assert.ok(candidates.every((row) => row.geometry.coordinates.length === 24));
  assert.ok(candidates.every((row) => row.quantity.kind === 'candidate-objective'));
  assert.equal(contribution.presentation.layers.some((row) => row.id === 'transfer-trajectory'), false);
});

test('flight playback advances the ephemeris epoch and follows the moving spacecraft', async () => {
  const host = fixture();
  const instance = await plugin.activate({ sdk: host.sdk, config, profile, scenario: profile.seeds[0] });
  let action = instance.handleAction('scenario.run', {
    values: { phase: 'start', deltaVWeight: 1, timeWeight: 0.01 },
  });
  for (let cursor = 0; cursor < 5; cursor += 1) {
    action = instance.handleAction('scenario.run', { values: { phase: 'step' } });
  }
  assert.equal(action.currentStep, 5);
  const result = instance.capabilities['simulation.orbital-transfer.v1']();
  const contribution = instance.contributeV4();
  const expectedDay = result.selected.departureDay + result.selected.tofDays * 0.25;
  assert.equal(
    contribution.presentation.epoch,
    new Date(Date.parse(ephemerisData.epochStart) + expectedDay * 86400000).toISOString()
  );
  const actor = contribution.presentation.layers.find((row) => row.id === 'screening-spacecraft');
  assert.equal(actor.quantity.kind, 'actor.spacecraft.route-progress');
  assert.deepEqual(contribution.presentation.viewIntents[0].targetIds, [actor.id]);
  assert.equal(contribution.presentation.viewIntents[0].mode, 'follow');
  assert.notDeepEqual(
    contribution.presentation.layers.find((row) => row.id === 'body:earth').geometry.coordinates[0],
    ephemerisData.bodies.earth.vectors[0].positionAu
  );
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
