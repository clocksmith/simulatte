const test = require('node:test');
const assert = require('node:assert/strict');

const ephemeris = require('../public/shared/plugins/orbital-transfer-planner/ephemeris.js');
const lambert = require('../public/shared/plugins/orbital-transfer-planner/lambert.js');
const patched = require('../public/shared/plugins/orbital-transfer-planner/patched-conic.js');
const queue = require('../public/shared/plugins/maritime-trade-global/queue-engine.js');
const ledger = require('../public/shared/plugins/maritime-trade-global/container-ledger.js');
const randomApi = require('../public/simulatte/platform/plugin-host/plugin-random.js');
const schedulerApi = require('../public/simulatte/platform/plugin-host/plugin-scheduler.js');
const stellar = require('../public/shared/plugins/interstellar-relay-network/stellar-state.js');
const contact = require('../public/shared/plugins/interstellar-relay-network/contact-scheduler.js');
const integrity = require('../public/shared/plugins/interstellar-relay-network/integrity.js');
const receipts = require('../public/simulatte/runtime/canonical-receipts.js');
const contracts = require('../public/simulatte/platform/contracts/plugin-contracts.js');
const stateHostApi = require('../public/simulatte/platform/plugin-host/plugin-state-host.js');
const tierPresentation = require('../public/simulatte/app/tier-plugin-presentation.js');
const fs = require('node:fs');
const path = require('node:path');

test('ephemeris linearly interpolates a pinned state without mutating samples', () => {
  const dataset = { epochStart: '2030-01-01T00:00:00Z', bodies: { earth: { vectors: [
    { day: 0, positionAu: [1, 0, 0], velocityAuD: [0, 1, 0] },
    { day: 2, positionAu: [3, 2, 0], velocityAuD: [2, 3, 0] },
  ] } } };
  const state = ephemeris.getBodyState(dataset, 'earth', 1);
  assert.deepEqual(state.positionAu, [2, 1, 0]);
  assert.deepEqual(state.velocityAuD, [1, 2, 0]);
  assert.equal(state.interpolation, 'linear_state_vector_v1');
});

test('universal-variable Lambert solver converges and patched-conic metrics remain finite', () => {
  const solution = lambert.solveLambert([1, 0, 0], [0, 1, 0], 91.3125, 0.0002959122082855911);
  assert.equal(solution.converged, true);
  assert.ok(Math.abs(solution.residualDays) < 1e-6);
  const endpoint = patched.evaluatePatchedConic({
    departureState: { velocityAuD: [0, 0.0172021, 0] },
    arrivalState: { velocityAuD: [-0.0172021, 0, 0] },
    lambert: solution,
  });
  assert.ok(Number.isFinite(endpoint.totalDeltaVKmS));
  assert.ok(endpoint.totalDeltaVKmS >= 0);
});

test('named random streams make maritime queues reproducible and independent', () => {
  const port = randomApi.createRandomPort({ rootSeed: 'queue-seed', scenarioId: 'test' });
  const first = queue.simulatePortQueue({ portId: 'port-a', arrivalCount: 20, serverCount: 3, random: port.forPlugin('maritime').stream('queue', 'port-a') });
  const second = queue.simulatePortQueue({ portId: 'port-a', arrivalCount: 20, serverCount: 3, random: port.forPlugin('maritime').stream('queue', 'port-a') });
  assert.deepEqual(first.rows, second.rows);
  assert.ok(first.p95WaitHours >= first.averageWaitHours);
});

test('container ledger conserves count and records ordered lineage', () => {
  let state = ledger.createContainerLedger({ scenarioId: 'fixture', containerCount: 4, originPort: 'A', destinationPort: 'B' });
  state = ledger.applyEvent(state, { kind: 'loaded', location: 'A', time: 0 });
  state = ledger.applyEvent(state, { kind: 'discharged', location: 'B', time: 10 });
  state = ledger.applyEvent(state, { kind: 'delivered', location: 'B', time: 12 });
  assert.equal(state.totalContainers, 4);
  assert.ok(state.containers.every((row) => row.status === 'delivered' && row.lineage.length === 4));
});

test('stellar propagation does not multiply radial velocity by seconds twice', () => {
  const state = stellar.convertEquatorialToCartesianPc({ sourceId: 'star-a', name: 'A', raDeg: 0, decDeg: 0, parallaxMas: 100, pmRaMasYr: 0, pmDecMasYr: 0, radialVelocityKmS: 10 }, 2017);
  assert.ok(state.velocityPcYr[0] > 1e-6 && state.velocityPcYr[0] < 2e-5);
  assert.ok(state.positionPc[0] > 10 && state.positionPc[0] < 10.001);
});

test('contact scheduler orders every relay event and reproduces finite light time', () => {
  const states = new Map([
    ['sol', { positionPc: [0, 0, 0] }],
    ['target', { positionPc: [1, 0, 0] }],
  ]);
  const schedule = contact.scheduleRelay({ relayPath: ['sol', 'target'], statesById: states, scheduler: schedulerApi.createSchedulerPort({}).forPlugin('relay') });
  assert.equal(schedule.hops.length, 1);
  assert.ok(Math.abs(schedule.totalLatencyYears - 3.26156) < 0.001);
  assert.equal(schedule.schedulerReceipt.processedCount, schedule.trace.length);
});

test('interstellar packet integrity uses host SHA-256 and detects payload changes', async () => {
  const packet = { packetId: 'p1', sequence: 0, payload: 'hello', sourceId: 'sol', destinationId: 'target', relayPath: ['sol', 'target'], createdAt: '2026-07-21T00:00:00Z' };
  const identity = await integrity.createPacketIdentity(receipts, packet);
  assert.match(identity.packetHash, /^[a-f0-9]{64}$/);
  assert.equal((await integrity.verifyPacketIdentity(receipts, packet, identity)).pass, true);
  assert.equal((await integrity.verifyPacketIdentity(receipts, { ...packet, payload: 'changed' }, identity)).pass, false);
});

test('v3 profiles and coordinate-native presentations validate', () => {
  const profile = {
    schema: 'simulatte.applicationProfile.v3', id: 'fixture-tier-v1', tier: 'world', worldModelId: 'earth-v1',
    interaction: { mode: 'simulation', simulationOwnerPluginId: 'fixture-plugin', missionRequired: false, startLabel: 'Run', shuffleLabel: 'Shuffle' },
    defaultSeedId: 'baseline', seeds: [{ id: 'baseline', label: 'Baseline', description: 'Fixture', seed: 'seed-1', scenarioId: 'scenario-1' }],
    plugins: [{ id: 'fixture-plugin', configId: 'fixture-config' }], routeObjective: {},
  };
  assert.equal(contracts.validateProfile(profile), profile);
  const presentation = { schema: 'simulatte.pluginPresentation.v3', coordinateSystem: 'wgs84', epoch: '2026-07-21T00:00:00Z', markers: [{ id: 'port', position: [4.1, 51.9, 0], label: 'Port', tone: 'cyan', radius: 2 }], paths: [], actors: [], areas: [], cameraTargets: [{ id: 'global', center: [0, 0, 0], label: 'Global', distance: 200 }] };
  assert.equal(contracts.validatePresentationContribution('fixture-plugin', presentation), presentation);
});


test('settlement, capability, and reducer boundaries fail closed', () => {
  const valid = {
    obligationResults: [{ obligationId: 'fixture:complete', status: 'settled', evidence: { count: 1 } }],
    stateIdentity: 'fixture-state',
    losses: [],
  };
  assert.equal(contracts.validateSettlementContribution('fixture', valid), valid);
  assert.throws(() => contracts.validateSettlementContribution('fixture', {
    ...valid,
    obligationResults: [{ obligationId: 'fixture:complete', status: 'unknown' }],
  }), /plugin_settlement_status_invalid/);
  assert.throws(() => contracts.validatePluginInstance('fixture', { id: 'fixture', capabilities: {} }, {
    sdkVersion: 2,
    provides: ['simulation.fixture.v1'],
  }), /plugin_capability_implementation_missing/);

  const host = stateHostApi.createPluginStateHost(['fixture']);
  host.register('fixture', () => null, {});
  assert.throws(() => host.propose('fixture', { pluginId: 'fixture', kind: 'fixture.invalid-state' }), /plugin_reducer_state_invalid/);
});

test('tier presentation compiler namespaces coordinate-native output', () => {
  const rows = tierPresentation.compileContributions([{ pluginId: 'fixture', presentation: {
    schema: 'simulatte.pluginPresentation.v3',
    coordinateSystem: 'icrs-cartesian-pc',
    epoch: 'J2026.5',
    markers: [{ id: 'star', position: [1, 2, 3], label: 'Star', tone: 'cyan', radius: 0.1 }],
    paths: [], actors: [], areas: [],
    cameraTargets: [{ id: 'focus', center: [1, 2, 3], label: 'Focus', distance: 4 }],
  } }]);
  assert.equal(rows[0].markers[0].id, 'plugin:fixture:star');
  assert.equal(rows[0].cameraTargets[0].id, 'plugin:fixture:focus');
  assert.deepEqual(rows[0].markers[0].position, [1, 2, 3]);
});

test('new plugin manifests declare every emitted completion receipt family', () => {
  const root = path.resolve(__dirname, '..');
  const expected = {
    'orbital-transfer-planner': [
      'simulatte.plugin.ephemerisIdentityReceipt.v1',
      'simulatte.plugin.orbitalTransferReceipt.v1',
      'simulatte.plugin.orbitalCounterfactualReceipt.v1',
    ],
    'maritime-trade-global': [
      'simulatte.plugin.maritimeScenarioReceipt.v1',
      'simulatte.plugin.maritimeVoyageReceipt.v1',
      'simulatte.plugin.maritimeQueueReceipt.v1',
      'simulatte.plugin.containerLineageReceipt.v1',
      'simulatte.plugin.maritimeEmissionsReceipt.v1',
      'simulatte.plugin.maritimeCounterfactualReceipt.v1',
    ],
    'interstellar-relay-network': [
      'simulatte.plugin.interstellarScenarioReceipt.v1',
      'simulatte.interstellarPacketReceipt.v1',
      'simulatte.plugin.interstellarContactScheduleReceipt.v1',
      'simulatte.plugin.opticalLinkBudgetReceipt.v1',
      'simulatte.plugin.interstellarIntegrityReceipt.v1',
      'simulatte.plugin.interstellarCounterfactualReceipt.v1',
    ],
  };
  for (const [pluginId, schemas] of Object.entries(expected)) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/shared/plugins', pluginId, 'plugin.json'), 'utf8'));
    schemas.forEach((schema) => assert.ok(manifest.receiptSchemas.includes(schema), `${pluginId} missing ${schema}`));
  }
});

test('Food Recall exposes the generic scenario.run action for governed country boot', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../public/shared/plugins/food-recall-us/index.js'), 'utf8');
  assert.match(source, /actionId === 'scenario\.run'/);
  assert.match(source, /food-recall-us\.scenario-run|\$\{PLUGIN_ID\}\.scenario-run/);
});
