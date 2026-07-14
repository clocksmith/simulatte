const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const contracts = require('../public/contracts/cooperative-contracts.js');
const engineApi = require('../public/runtime/cooperative-engine.js');
const receipts = require('../public/runtime/canonical-receipts.js');
const sunApi = require('../public/world/sun-exposure.js');
const worldApi = require('../public/world/world-model.js');
const missionApi = require('../public/mission/mission-compiler.js');

const scenario = require('../public/data/autonomy/cooperation/battery-office-v1.json');
const world = require('../public/data/autonomy/worlds/nyc-core-autonomy-v1.json');
const policy = require('../public/data/autonomy/policies/bet-selector-v1.json');
const pedestrian = require('../public/data/autonomy/embodiments/pedestrian-v1.json');

test('cooperative artifacts use restrictive top-level schemas and validate the governed scenario', () => {
  const schemaFiles = [
    'participant-intent.schema.json',
    'fulfillment-need.schema.json',
    'resource-offer.schema.json',
    'cooperative-plan.schema.json',
    'handoff-event.schema.json',
    'environment-field.schema.json',
    'cooperative-settlement.schema.json',
  ];
  schemaFiles.forEach((name) => {
    const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/contracts', name), 'utf8'));
    assert.equal(schema.additionalProperties, false, name);
    assert.ok(schema.required.length >= 4, name);
  });
  assert.equal(contracts.validateScenario(scenario), scenario);
  const invalid = structuredClone(scenario);
  invalid.offers[0].quantity = 0;
  assert.throws(() => contracts.validateScenario(invalid), /quantity/);
});

test('the two-AA request uses indexed compatibility and corridor matching without exact peer disclosure', async () => {
  const session = await engineApi.createCooperativeSession({
    world,
    routingPolicy: policy,
    scenario,
    sourceText: 'I need 2 AA batteries delivered to my East Village office. Match someone already passing nearby.',
  });
  const snapshot = session.snapshot();
  assert.deepEqual(snapshot.matching.counts, {
    totalOffers: 4,
    itemCompatible: 3,
    quantityCompatible: 2,
    consentEligible: 2,
    corridorEligible: 2,
    routedCandidates: 2,
    feasibleCandidates: 2,
  });
  assert.match(snapshot.matching.complexity, /no all-pairs/);
  assert.equal(snapshot.plan.offerId, 'offer-alex-two-aa-v1');
  assert.equal(snapshot.plan.baselineCommitmentSha256, scenario.intents[0].baselineJourney.commitmentSha256);
  assert.ok(snapshot.plan.marginalBurden.addedDistanceM < 0, 'signed marginal distance remains honest');
  assert.ok(snapshot.plan.marginalBurden.addedDurationSeconds > 0, 'building handoff adds time');
  assert.equal(snapshot.discoveryEnvelope.exactRouteDisclosed, false);
  assert.equal(snapshot.discoveryEnvelope.exactIdentityDisclosed, false);
  assert.ok(snapshot.discoveryEnvelope.corridorCells.length > 1);
  assert.equal(JSON.stringify(snapshot.discoveryEnvelope).includes('carrier-alex'), false);
});

test('rolling authorization, frozen-prefix execution, custody, accounting, and settled learning form one verified chain', async () => {
  const session = await engineApi.createCooperativeSession({ world, routingPolicy: policy, scenario });
  await session.reserve();
  for (const participantId of session.snapshot().plan.participantIds) await session.authorize(participantId);
  assert.equal(session.snapshot().plan.state, 'mutually_authorized');
  await session.startExecution();
  const update = await session.update('route_delay_changed', { delaySeconds: 60 });
  assert.equal(update.decision, 'preserve_prefix_recompute_suffix_only');
  assert.equal(update.frozenSegmentIds.length, 1);
  await session.settle({ actualDelaySeconds: 45, handoffWaitSeconds: 135 });
  const snapshot = session.snapshot();
  assert.equal(snapshot.plan.state, 'settled');
  assert.equal(snapshot.custodyState, 'settled');
  assert.deepEqual(snapshot.custodyEvents.map((row) => row.resultingState), [
    'in_custody', 'handoff_pending', 'delivered', 'settled',
  ]);
  assert.equal(snapshot.settlement.dedicatedTripAvoided, true);
  assert.equal(snapshot.settlement.accounting.platformPriceHidden, false);
  assert.ok(snapshot.settlement.accounting.requesterSurplusCents >= 0);
  assert.equal(snapshot.trainingRows.length, 1);
  assert.equal(snapshot.trainingRows[0].labelAuthority, 'deterministic_simulation_settlement');
  assert.equal(snapshot.liquidity.dedicatedTripsAvoided, 1);
  const chain = {
    schema: 'simulatte.autonomyReceiptChain.v1',
    algorithm: snapshot.integrity.algorithm,
    terminalHash: snapshot.integrity.terminalHash,
    entries: session.trace(),
  };
  assert.deepEqual(await receipts.verifyReceiptChain(chain), {
    pass: true,
    reason: 'verified',
    entryCount: chain.entries.length,
    terminalHash: chain.terminalHash,
  });
});

test('delay beyond the safe reassignment point selects the eligible backup before freezing a prefix', async () => {
  const session = await engineApi.createCooperativeSession({ world, routingPolicy: policy, scenario });
  const primary = session.snapshot().plan;
  await session.recoverFromDelay();
  const recovered = session.snapshot();
  assert.equal(recovered.recovery.action, 'reassign_before_frozen_prefix');
  assert.notEqual(recovered.plan.id, primary.id);
  assert.equal(recovered.plan.offerId, 'offer-jules-two-aa-v1');
  assert.equal(recovered.plan.state, 'candidate');
  assert.equal(recovered.plan.authorizationParticipantIds.length, 0);
  await session.reserve();
  for (const participantId of session.snapshot().plan.participantIds) await session.authorize(participantId);
  await session.startExecution();
  await session.settle();
  assert.equal(session.snapshot().settlement.outcome, 'fulfilled');
});

test('baseline commitment tampering blocks matching before a candidate is selected', async () => {
  const changed = structuredClone(scenario);
  changed.intents[0].baselineJourney.destinationNodeId = 'bike-node-ffea919f743c';
  await assert.rejects(
    () => engineApi.createCooperativeSession({ world, routingPolicy: policy, scenario: changed }),
    (error) => error.code === 'baseline_commitment_mismatch'
  );
});

test('sun reference geometry distinguishes occlusion, direct sun, and unknown height', () => {
  const sun = { azimuthDegrees: 90, elevationDegrees: 45 };
  const footprint = [{ x: 10, y: -2 }, { x: 14, y: -2 }, { x: 14, y: 2 }, { x: 10, y: 2 }, { x: 10, y: -2 }];
  const bounds = { minX: 10, minY: -2, maxX: 14, maxY: 2 };
  assert.equal(sunApi.pointSunState({ x: 0, y: 0 }, [{ footprint, bounds, heightM: 20, heightState: 'known' }], sun), 'shade');
  assert.equal(sunApi.pointSunState({ x: 0, y: 8 }, [{ footprint, bounds, heightM: 20, heightState: 'known' }], sun), 'direct');
  assert.equal(sunApi.pointSunState({ x: 0, y: 0 }, [{ footprint, bounds, heightM: null, heightState: 'unknown' }], sun), 'unknown');
});

test('shade-aware walking compares governed alternatives at their simulated arrival time', () => {
  const mission = missionApi.compileMission('Walk from Union Square to Washington Square.', world, [pedestrian]);
  const selection = sunApi.selectShadeAwareRoute({
    world,
    worldModel: worldApi.createWorldModel(world),
    originNodeId: mission.originNodeId,
    destinationNodeId: mission.destinationNodeId,
    mode: pedestrian.mode,
    mission,
    policy,
    utcInstant: '2026-07-14T16:00:00Z',
    maximumAlternatives: 3,
    directSunWeight: 1.5,
    unknownWeight: 3,
  });
  contracts.validateEnvironmentField(selection.field);
  assert.equal(selection.modelExecution, false);
  assert.equal(selection.candidates.length, 3);
  assert.ok(selection.candidates.every((row) => row.exposure.directSunSeconds > 0));
  assert.ok(selection.selected.objective <= selection.candidates[1].objective);
  assert.equal(selection.field.counts.buildingCount, world.renderGeometry.buildings.length);
  assert.equal(selection.field.timeSampling.method, 'segment_midpoint_simulated_arrival_v1');
  assert.ok(selection.field.timeSampling.sampledInstantCount > 1);
  assert.ok(new Set(selection.field.segmentRows.map((row) => row.midpointUtcInstant)).size > 1);
  assert.ok(selection.field.segmentRows.every((row) => row.arrivalOffsetSeconds >= 0));
  assert.match(selection.claimBoundary, /tree canopy/);
});
