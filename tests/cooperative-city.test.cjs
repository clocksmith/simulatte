const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const contracts = require('../public/contracts/cooperative-contracts.js');
const engineApi = require('../public/runtime/cooperative-engine.js');
const relayApi = require('../public/runtime/cooperative-relay-planner.js');
const languageApi = require('../public/mission/cooperative-language-compiler.js');
const cooperativeGpu = require('../public/app/cooperative-gpu-compute.js');
const receipts = require('../public/runtime/canonical-receipts.js');
const sunApi = require('../public/world/sun-exposure.js');
const timeCostApi = require('../public/world/time-dependent-edge-cost.js');
const worldApi = require('../public/world/world-model.js');
const missionApi = require('../public/mission/mission-compiler.js');

const scenario = require('../public/data/autonomy/cooperation/battery-office-v1.json');
const world = require('../public/data/autonomy/worlds/nyc-core-autonomy-v1.json');
const policy = require('../public/data/autonomy/policies/bet-selector-v1.json');
const pedestrian = require('../public/data/autonomy/embodiments/pedestrian-v1.json');
const BATTERY_FIXTURE_REQUEST = 'I need two AA batteries delivered to my East Village office.';

test('cooperative artifacts use restrictive top-level schemas and validate the governed scenario', () => {
  const schemaFiles = [
    'journey-intent.schema.json',
    'consent.schema.json',
    'custody-state.schema.json',
    'relay-plan.schema.json',
    'cooperative-allocation.schema.json',
    'multi-request-allocation.schema.json',
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
    totalOffers: 6,
    itemCompatible: 3,
    quantityCompatible: 2,
    consentEligible: 2,
    temporallyEligible: 2,
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
  assert.equal(snapshot.discoveryEnvelope.privacy.pass, true);
  assert.equal(snapshot.discoveryEnvelope.privacy.exposureScore, 2);
  assert.equal(snapshot.plan.routes.cooperative.pickupNodeId, scenario.offers.find((row) => row.id === snapshot.plan.offerId).availableNodeId);
  assert.equal(snapshot.plan.routes.cooperative.dropoffNodeId, snapshot.request.need.destinationNodeId);
  assert.equal(snapshot.plan.routes.cooperative.timeDependentCost.fifo, false);
  assert.ok(snapshot.plan.marginalBurden.temporalSlackSeconds > 0);
  assert.ok(snapshot.plan.marginalBurden.failureProbability > 0);
  assert.equal(snapshot.plan.marginalBurden.directSunSeconds, null);
  assert.equal(snapshot.plan.marginalBurden.directSunRealized, false);
});

test('arbitrary governed items compile from natural language and unknown meaning asks for clarification', async () => {
  const umbrella = languageApi.compileCooperativeLanguage({
    sourceText: 'I need an umbrella delivered to my East Village office.',
    taxonomy: scenario.itemTaxonomy,
    destinations: scenario.destinationLexicon,
    world,
    defaults: { mode: 'delivery_bike', anchorInstant: scenario.need.earliestAt },
  });
  assert.equal(umbrella.executable, true);
  assert.equal(umbrella.languageGraph.schema, 'simulatte.promptParse.v1');
  assert.equal(umbrella.obligations.itemId, 'umbrella-compact');
  assert.equal(umbrella.obligations.quantity, 1);
  assert.equal(umbrella.obligations.destinationNodeId, scenario.need.destinationNodeId);
  const offerJourney = languageApi.compileCooperativeLanguage({
    sourceText: 'I have 3 umbrellas and I am biking to my office; I can add 5 minutes.',
    taxonomy: scenario.itemTaxonomy,
    destinations: scenario.destinationLexicon,
    world,
  });
  assert.equal(offerJourney.executable, true);
  assert.deepEqual(offerJourney.intentKinds, ['offer', 'journey']);
  assert.equal(offerJourney.obligations.quantity, 3);
  assert.equal(offerJourney.obligations.mode, 'delivery_bike');
  assert.equal(offerJourney.obligations.maximumDetourSeconds, 300);
  const session = await engineApi.createCooperativeSession({
    world,
    routingPolicy: policy,
    scenario,
    sourceText: 'I need an umbrella delivered to my East Village office.',
  });
  assert.equal(session.snapshot().plan.offerId, 'offer-alex-umbrella-v1');
  assert.equal(session.snapshot().request.need.itemId, 'umbrella-compact');
  await assert.rejects(
    () => engineApi.createCooperativeSession({
      world,
      routingPolicy: policy,
      scenario,
      sourceText: 'I need two sandwiches at my office.',
    }),
    (error) => error.code === 'cooperative_clarification_required'
      && error.evidence.unresolved.some((row) => row.field === 'item')
  );
  await assert.rejects(
    () => engineApi.createCooperativeSession({ world, routingPolicy: policy, scenario }),
    (error) => error.code === 'cooperative_clarification_required'
      && error.evidence.sourceText === ''
      && error.evidence.unresolved.some((row) => row.field === 'intent-kind'),
    'the runtime must not invent a fixture-specific request when language is absent'
  );
});

test('shared Phase 2 clauses support cooperative paraphrases without treating clock time as quantity', () => {
  const paraphrase = engineApi.compileCooperativeRequest(
    'Could a neighbor bring one umbrella to my office?', scenario, world
  );
  assert.equal(paraphrase.executable, true);
  assert.equal(paraphrase.primaryKind, 'need');
  assert.equal(paraphrase.obligations.itemId, 'umbrella-compact');
  assert.equal(paraphrase.obligations.quantity, 1);
  assert.ok(paraphrase.evidence.some((row) => row.method === 'shared_phase2_clause'));

  const clock = engineApi.compileCooperativeRequest(
    'I need a USB C charger at my office by 4:30 pm.', scenario, world
  );
  assert.equal(clock.executable, true, 'the article supplies the singular item quantity');
  assert.equal(clock.obligations.quantity, 1);
  assert.equal(clock.evidence.some((row) => row.field === 'quantity' && row.groundedValue === 4), false);
});

test('space-time matching excludes expired offers before route evaluation', async () => {
  const expired = structuredClone(scenario);
  expired.offers.filter((row) => row.itemId === 'battery-aa-alkaline' && row.quantity >= 2)
    .forEach((row) => { row.expiresAt = '2026-07-14T15:00:00-04:00'; });
  await assert.rejects(
    () => engineApi.createCooperativeSession({
      world,
      routingPolicy: policy,
      scenario: expired,
      sourceText: 'I need two AA batteries delivered to my East Village office.',
    }),
    (error) => error.code === 'no_cooperative_plan'
      && error.evidence.counts.temporallyEligible === 0
  );
});

test('bounded relay planning allocates shared leg capacity at minimum declared cost', () => {
  const request = {
    id: 'request-relay-reference',
    itemId: 'umbrella-compact',
    sourceNodeId: 'a',
    destinationNodeId: 'c',
    earliestAt: '2026-07-14T16:00:00Z',
    latestAt: '2026-07-14T17:00:00Z',
    quantity: 2,
  };
  const legs = [
    { id: 'direct-expensive', carrierId: 'one', itemId: 'umbrella-compact', fromNodeId: 'a', toNodeId: 'c', departureAt: '2026-07-14T16:05:00Z', arrivalAt: '2026-07-14T16:30:00Z', capacity: 2, unitCost: 10 },
    { id: 'direct-cheap-one', carrierId: 'two', itemId: 'umbrella-compact', fromNodeId: 'a', toNodeId: 'c', departureAt: '2026-07-14T16:07:00Z', arrivalAt: '2026-07-14T16:32:00Z', capacity: 1, unitCost: 4 },
    { id: 'relay-a-b', carrierId: 'three', itemId: 'umbrella-compact', fromNodeId: 'a', toNodeId: 'b', departureAt: '2026-07-14T16:10:00Z', arrivalAt: '2026-07-14T16:20:00Z', capacity: 2, unitCost: 2 },
    { id: 'relay-b-c', carrierId: 'four', itemId: 'umbrella-compact', fromNodeId: 'b', toNodeId: 'c', departureAt: '2026-07-14T16:24:00Z', arrivalAt: '2026-07-14T16:40:00Z', capacity: 2, unitCost: 3 },
  ];
  const result = relayApi.planRelay({ request, legs, maximumCarrierLegs: 2, legSetComplete: true });
  assert.equal(result.plan.allocatedQuantity, 2);
  assert.equal(result.plan.totalCost, 9);
  assert.equal(result.plan.searchComplete, true);
  assert.equal(result.plan.optimalityProven, true);
  assert.deepEqual(result.plan.allocations.map((row) => [row.legId, row.quantity]), [
    ['direct-cheap-one', 1],
    ['relay-a-b', 1],
    ['relay-b-c', 1],
  ]);
  const provisional = relayApi.planRelay({ request, legs, maximumCarrierLegs: 2, legSetComplete: false });
  assert.equal(provisional.plan.optimalityProven, false);
});

test('competing requests use deterministic minimum-cost flow with shared carrier capacity', () => {
  const result = relayApi.allocateCompetingRequests({
    requests: [{ id: 'request-a', quantity: 1 }, { id: 'request-b', quantity: 1 }],
    carriers: [{ id: 'carrier-one', capacity: 1 }, { id: 'carrier-two', capacity: 1 }],
    candidates: [
      { id: 'one-a', carrierId: 'carrier-one', requestId: 'request-a', capacity: 1, unitCost: 1 },
      { id: 'one-b', carrierId: 'carrier-one', requestId: 'request-b', capacity: 1, unitCost: 2 },
      { id: 'two-a', carrierId: 'carrier-two', requestId: 'request-a', capacity: 1, unitCost: 3 },
      { id: 'two-b', carrierId: 'carrier-two', requestId: 'request-b', capacity: 1, unitCost: 100 },
    ],
    candidateSetComplete: true,
  });
  assert.equal(result.allocatedQuantity, 2);
  assert.equal(result.totalCost, 5);
  assert.equal(result.optimalityProven, true);
  assert.deepEqual(result.allocations.map((row) => row.candidateId), ['two-a', 'one-b']);
  assert.deepEqual(result.fulfilledByRequest, { 'request-a': 1, 'request-b': 1 });
});

test('available-along-journey inventory routes through its exact pickup node before dropoff', async () => {
  const changed = structuredClone(scenario);
  const baselineSession = await engineApi.createCooperativeSession({
    world, routingPolicy: policy, scenario, sourceText: BATTERY_FIXTURE_REQUEST,
  });
  const firstSegment = world.segments.find((row) => row.id === baselineSession.snapshot().plan.routes.baseline.segmentIds[0]);
  const offer = changed.offers.find((row) => row.id === 'offer-alex-two-aa-v1');
  offer.kind = 'available_along_journey';
  offer.availableNodeId = firstSegment.toNodeId;
  offer.pickupServiceSeconds = 30;
  changed.offers.find((row) => row.id === 'offer-jules-two-aa-v1').consentState = 'revoked';
  const session = await engineApi.createCooperativeSession({
    world, routingPolicy: policy, scenario: changed, sourceText: BATTERY_FIXTURE_REQUEST,
  });
  const plan = session.snapshot().plan;
  assert.equal(plan.offerId, offer.id);
  assert.equal(plan.routes.cooperative.pickupNodeId, offer.availableNodeId);
  assert.equal(plan.routes.cooperative.viaNodeIds[0], offer.availableNodeId);
  assert.equal(plan.marginalBurden.pickupServiceSeconds, 30);
  assert.equal(plan.routes.cooperative.segmentIds[0], baselineSession.snapshot().plan.routes.baseline.segmentIds[0]);
});

test('cooperative candidate scoring keeps small jobs on the inspectable CPU reference', async () => {
  const features = [
    [120, 45, 0.05, 1, 0, 0.1, 200, 20],
    [30, 18, 0.01, 0.5, 0, 0.02, 100, 5],
  ];
  const cpu = cooperativeGpu.scoreCandidatesCpu(features);
  assert.equal(cpu.length, 2);
  assert.ok(cpu.every(Number.isFinite));
  const execution = await cooperativeGpu.scoreCandidates({ device: null, featureRows: features });
  assert.equal(execution.receipt.backend, 'cpu_reference');
  assert.equal(execution.receipt.dispatchCount, 0);
  assert.deepEqual([...execution.scores], [...cpu]);
  assert.match(cooperativeGpu.SHADER, /@compute @workgroup_size\(64\)/);
});

test('rolling authorization, frozen-prefix execution, custody, accounting, and settled learning form one verified chain', async () => {
  const session = await engineApi.createCooperativeSession({
    world, routingPolicy: policy, scenario, sourceText: BATTERY_FIXTURE_REQUEST,
  });
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
  assert.equal(snapshot.custody.state, 'settled');
  assert.equal(snapshot.custody.priorEventHash, snapshot.custodyEvents.at(-1).eventHash);
  assert.equal(snapshot.authorizationReceipts.length, snapshot.plan.participantIds.length);
  snapshot.authorizationReceipts.forEach((row) => contracts.validateConsent(row));
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
  const session = await engineApi.createCooperativeSession({
    world, routingPolicy: policy, scenario, sourceText: BATTERY_FIXTURE_REQUEST,
  });
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
    () => engineApi.createCooperativeSession({
      world, routingPolicy: policy, scenario: changed, sourceText: BATTERY_FIXTURE_REQUEST,
    }),
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

test('solar position and civil-time resolution pass fixed oracle and DST boundaries', () => {
  const nrelSpaReference = sunApi.solarPosition('2003-10-17T19:30:30Z', 39.742476, -105.1786);
  assert.ok(Math.abs(nrelSpaReference.azimuthDegrees - 194.34024) < 0.25);
  assert.ok(Math.abs(nrelSpaReference.elevationDegrees - 39.88838) < 0.25);
  const summer = sunApi.zonedCivilTimeToUtc({
    civilTime: '2026-07-14T12:00:00', timeZone: 'America/New_York',
  });
  assert.equal(summer.utcInstant, '2026-07-14T16:00:00.000Z');
  assert.equal(summer.offsetMinutes, -240);
  assert.throws(
    () => sunApi.zonedCivilTimeToUtc({ civilTime: '2026-03-08T02:30:00', timeZone: 'America/New_York' }),
    (error) => error.code === 'civil_time_nonexistent'
  );
  assert.throws(
    () => sunApi.zonedCivilTimeToUtc({ civilTime: '2026-11-01T01:30:00', timeZone: 'America/New_York' }),
    (error) => error.code === 'civil_time_ambiguous'
  );
  assert.equal(sunApi.zonedCivilTimeToUtc({
    civilTime: '2026-11-01T01:30:00', timeZone: 'America/New_York', disambiguation: 'earlier',
  }).utcInstant, '2026-11-01T05:30:00.000Z');
  assert.equal(sunApi.zonedCivilTimeToUtc({
    civilTime: '2026-11-01T01:30:00', timeZone: 'America/New_York', disambiguation: 'later',
  }).utcInstant, '2026-11-01T06:30:00.000Z');
});

test('shadow geometry preserves courtyards, overlap, low-sun bounds, and night', () => {
  const outer = [{ x: 10, y: -4 }, { x: 20, y: -4 }, { x: 20, y: 4 }, { x: 10, y: 4 }, { x: 10, y: -4 }];
  const courtyard = [{ x: 10, y: -1 }, { x: 20, y: -1 }, { x: 20, y: 1 }, { x: 10, y: 1 }, { x: 10, y: -1 }];
  const second = [{ x: 4, y: 7 }, { x: 8, y: 7 }, { x: 8, y: 11 }, { x: 4, y: 11 }, { x: 4, y: 7 }];
  const scene = sunApi.buildBuildingScene([
    { id: 'courtyard', footprint: outer, interiorRings: [courtyard], heightM: 30, heightState: 'known' },
    { id: 'overlap', footprint: second, interiorRings: [], heightM: 12, heightState: 'known' },
  ], 5);
  const daylight = { azimuthDegrees: 90, elevationDegrees: 45 };
  assert.equal(sunApi.pointSunState({ x: 0, y: 0 }, scene, daylight), 'direct', 'ray stays inside the open courtyard');
  assert.equal(sunApi.pointSunState({ x: 0, y: 3 }, scene, daylight), 'shade', 'solid outer shell occludes');
  assert.equal(sunApi.pointSunState({ x: 0, y: 9 }, scene, daylight), 'shade', 'a second overlapping candidate can occlude');
  assert.equal(sunApi.pointSunState({ x: 0, y: 0 }, scene, { azimuthDegrees: 90, elevationDegrees: 1.5 }), 'unknown');
  assert.equal(sunApi.pointSunState({ x: 0, y: 0 }, scene, { azimuthDegrees: 90, elevationDegrees: -2 }), 'night');
});

test('time-dependent edge costs expose FIFO traversal separately from semantic utility', () => {
  const model = timeCostApi.defineCostModel({
    id: 'fixed-traversal-changing-preference',
    fifo: true,
    claimBoundary: 'Synthetic test model.',
    evaluate({ enteredAt }) {
      return {
        traversalSeconds: 10,
        generalizedCost: new Date(enteredAt).getUTCMinutes() + 10,
        components: { travelSeconds: 10 },
      };
    },
  });
  const segment = { id: 'edge-1' };
  const receipt = timeCostApi.verifyFifo({
    model,
    segment,
    departureInstants: ['2026-07-14T16:00:00Z', '2026-07-14T16:01:00Z'],
  });
  assert.equal(receipt.pass, true);
  assert.equal(receipt.declaredFifo, true);
  assert.equal(receipt.observedFifo, true);
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
  assert.equal(selection.traversalCostModel.fifo, true);
  assert.ok(selection.comparison.addedTravelSeconds <= selection.detourPolicy.effectiveMaximumAddedTimeSeconds);
  assert.ok(selection.comparison.selectedModeledBuildingShadePercent >= 0);
  assert.ok(selection.comparison.fastestModeledBuildingShadePercent >= 0);
  assert.deepEqual(selection.comparison.assumptions, [
    'clear_sky_direct_sun', 'retained_building_lod', 'no_tree_canopy', 'segment_sampled_exposure',
  ]);
  assert.ok(selection.field.counts.candidateBuildingChecks < selection.field.counts.sampleCount * selection.field.counts.buildingCount);
});
