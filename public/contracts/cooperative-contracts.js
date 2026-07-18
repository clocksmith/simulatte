(function attachCooperativeContracts(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteCooperativeContracts = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCooperativeContracts() {
  const HASH = /^[a-f0-9]{64}$/;
  const CONSENT_STATES = Object.freeze(['available', 'revoked']);
  const OFFER_KINDS = Object.freeze(['already_carried', 'available_along_journey']);
  const PLAN_STATES = Object.freeze([
    'candidate', 'soft_hold', 'mutually_authorized', 'frozen_prefix', 'executing',
    'settled', 'expired', 'revoked', 'refused', 'missed', 'failed',
  ]);
  const CUSTODY_STATES = Object.freeze([
    'requested', 'proposed', 'authorized', 'pickup_pending', 'in_custody',
    'handoff_pending', 'delivered', 'settled', 'expired', 'revoked',
    'refused', 'missed', 'failed',
  ]);
  const AUTHORIZATION_STATES = Object.freeze(['authorized', 'revoked', 'expired']);

  class CooperativeContractError extends Error {
    constructor(contract, path, expected, received) {
      super(`${contract} contract at ${path} expected ${expected}, received ${describe(received)}`);
      this.name = 'CooperativeContractError';
      this.contract = contract;
      this.path = path;
      this.expected = expected;
      this.received = received;
    }
  }

  function describe(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return `array(${value.length})`;
    if (typeof value === 'string') return JSON.stringify(value);
    return typeof value;
  }

  function validator(contract) {
    const fail = (path, expected, received) => { throw new CooperativeContractError(contract, path, expected, received); };
    const object = (value, path) => value && typeof value === 'object' && !Array.isArray(value) ? value : fail(path, 'object', value);
    const array = (value, path, minimum = 0) => Array.isArray(value) && value.length >= minimum ? value : fail(path, `array with at least ${minimum} row(s)`, value);
    const string = (value, path) => typeof value === 'string' && value.length ? value : fail(path, 'non-empty string', value);
    const finite = (value, path, minimum = -Infinity) => Number.isFinite(value) && value >= minimum ? value : fail(path, `finite number >= ${minimum}`, value);
    const integer = (value, path, minimum = 0) => Number.isInteger(value) && value >= minimum ? value : fail(path, `integer >= ${minimum}`, value);
    const boolean = (value, path) => typeof value === 'boolean' ? value : fail(path, 'boolean', value);
    const oneOf = (value, rows, path) => rows.includes(value) ? value : fail(path, rows.join(' | '), value);
    const sha = (value, path) => HASH.test(value || '') ? value : fail(path, '64-character lowercase SHA-256', value);
    const schema = (value) => {
      object(value, '$');
      if (value.schema !== contract) fail('$.schema', contract, value.schema);
    };
    return { array, boolean, fail, finite, integer, object, oneOf, schema, sha, string };
  }

  function uniqueIds(rows, path, v) {
    const ids = new Set();
    rows.forEach((row, index) => {
      const id = v.string(row?.id, `${path}[${index}].id`);
      if (ids.has(id)) v.fail(`${path}[${index}].id`, 'unique ID', id);
      ids.add(id);
    });
    return ids;
  }

  function validateParticipantIntent(intent) {
    const contract = 'simulatte.participantIntent.v1';
    const v = validator(contract);
    v.schema(intent);
    ['id', 'revisionId', 'participantId', 'mode', 'expiresAt'].forEach((key) => v.string(intent[key], `$.${key}`));
    validateJourneyIntent(intent.baselineJourney);
    const slack = v.object(intent.slack, '$.slack');
    ['fixedRoutePrefixSegmentIds', 'flexibleRouteSuffixSegmentIds', 'acceptableHandoffTypes']
      .forEach((key) => v.array(slack[key], `$.slack.${key}`));
    ['earliestDepartureAt', 'latestDepartureAt'].forEach((key) => v.string(slack[key], `$.slack.${key}`));
    ['maximumAddedTimeSeconds', 'maximumAddedDistanceM', 'maximumHandoffWaitSeconds', 'carryingCapacityGrams', 'carryingCapacityCm3', 'interactionBurdenLimit']
      .forEach((key) => v.finite(slack[key], `$.slack.${key}`, 0));
    const reliability = v.object(intent.reliability, '$.reliability');
    ['onTimeProbability', 'cancellationProbability'].forEach((key) => {
      v.finite(reliability[key], `$.reliability.${key}`, 0);
      if (reliability[key] > 1) v.fail(`$.reliability.${key}`, 'number between 0 and 1', reliability[key]);
    });
    v.finite(reliability.arrivalIntervalSeconds, '$.reliability.arrivalIntervalSeconds', 0);
    v.oneOf(intent.consentState, CONSENT_STATES, '$.consentState');
    return intent;
  }

  function validateJourneyIntent(journey) {
    const contract = 'simulatte.journeyIntent.v1';
    const v = validator(contract);
    v.schema(journey);
    ['originNodeId', 'destinationNodeId', 'departureAt'].forEach((key) => v.string(journey[key], `$.${key}`));
    v.sha(journey.commitmentSha256, '$.commitmentSha256');
    return journey;
  }

  function validateConsent(consent) {
    const contract = 'simulatte.cooperativeConsent.v1';
    const v = validator(contract);
    v.schema(consent);
    ['id', 'participantId', 'planId', 'issuedAt', 'expiresAt'].forEach((key) => v.string(consent[key], `$.${key}`));
    v.oneOf(consent.state, AUTHORIZATION_STATES, '$.state');
    v.oneOf(consent.scope, ['exact_plan_and_handoff'], '$.scope');
    v.sha(consent.planIdentitySha256, '$.planIdentitySha256');
    return consent;
  }

  function validateCustodyState(custody) {
    const contract = 'simulatte.custodyState.v1';
    const v = validator(contract);
    v.schema(custody);
    ['planId', 'needId', 'itemId', 'priorEventHash'].forEach((key) => v.string(custody[key], `$.${key}`));
    v.integer(custody.quantity, '$.quantity', 1);
    v.oneOf(custody.state, CUSTODY_STATES, '$.state');
    if (custody.custodianId !== null) v.string(custody.custodianId, '$.custodianId');
    v.sha(custody.priorEventHash, '$.priorEventHash');
    return custody;
  }

  function validateNeed(need) {
    const contract = 'simulatte.fulfillmentNeed.v1';
    const v = validator(contract);
    v.schema(need);
    ['id', 'requesterId', 'itemId', 'destinationNodeId', 'buildingHandoffGraphId', 'earliestAt', 'latestAt', 'riskTier', 'expiresAt']
      .forEach((key) => v.string(need[key], `$.${key}`));
    v.integer(need.quantity, '$.quantity', 1);
    ['acceptableSubstitutionGroupIds', 'handlingConstraints', 'requiredCustodyAcknowledgements']
      .forEach((key) => v.array(need[key], `$.${key}`));
    ['maximumCompensationCents', 'dropoffServiceSeconds', 'maximumCarrierDetourSeconds', 'maximumCarrierDetourM']
      .forEach((key) => v.finite(need[key], `$.${key}`, 0));
    v.oneOf(need.consentState, CONSENT_STATES, '$.consentState');
    return need;
  }

  function validateOffer(offer) {
    const contract = 'simulatte.resourceOffer.v1';
    const v = validator(contract);
    v.schema(offer);
    ['id', 'participantId', 'intentId', 'itemId', 'availableNodeId', 'riskTier', 'expiresAt']
      .forEach((key) => v.string(offer[key], `$.${key}`));
    v.integer(offer.quantity, '$.quantity', 1);
    v.oneOf(offer.kind, OFFER_KINDS, '$.kind');
    v.finite(offer.pickupServiceSeconds, '$.pickupServiceSeconds', 0);
    v.finite(offer.minimumCompensationCents, '$.minimumCompensationCents', 0);
    v.oneOf(offer.consentState, CONSENT_STATES, '$.consentState');
    return offer;
  }

  function validatePlan(plan) {
    const contract = 'simulatte.cooperativePlan.v1';
    const v = validator(contract);
    v.schema(plan);
    ['id', 'scenarioId', 'worldId', 'policyId', 'needId', 'offerId', 'intentRevisionId', 'baselineCommitmentSha256', 'selectedBy']
      .forEach((key) => v.string(plan[key], `$.${key}`));
    v.oneOf(plan.state, PLAN_STATES, '$.state');
    v.array(plan.participantIds, '$.participantIds', 2);
    const routes = v.object(plan.routes, '$.routes');
    ['baseline', 'cooperative'].forEach((key) => {
      const route = v.object(routes[key], `$.routes.${key}`);
      v.array(route.segmentIds, `$.routes.${key}.segmentIds`, 1);
      v.finite(route.distanceM, `$.routes.${key}.distanceM`, 0);
      v.finite(route.durationSeconds, `$.routes.${key}.durationSeconds`, 0);
    });
    const burden = v.object(plan.marginalBurden, '$.marginalBurden');
    ['addedDistanceM', 'addedDurationSeconds', 'latenessSlackSeconds']
      .forEach((key) => v.finite(burden[key], `$.marginalBurden.${key}`, -Infinity));
    ['pickupServiceSeconds', 'dropoffServiceSeconds', 'handoffWaitSeconds', 'temporalSlackSeconds', 'temporalSlackPenaltySeconds', 'carryingLoadGrams', 'carryingLoadCm3', 'custodyRisk', 'interactionBurden', 'failureProbability', 'privacyExposureScore', 'compensationCents']
      .forEach((key) => v.finite(burden[key], `$.marginalBurden.${key}`, 0));
    ['directSunRealized', 'accessibilityRealized'].forEach((key) => v.boolean(burden[key], `$.marginalBurden.${key}`));
    if (burden.directSunRealized) v.finite(burden.directSunSeconds, '$.marginalBurden.directSunSeconds', 0);
    else if (burden.directSunSeconds !== null) v.fail('$.marginalBurden.directSunSeconds', 'null when unrealized', burden.directSunSeconds);
    if (burden.accessibilityRealized) v.finite(burden.accessibilityLoss, '$.marginalBurden.accessibilityLoss', 0);
    else if (burden.accessibilityLoss !== null) v.fail('$.marginalBurden.accessibilityLoss', 'null when unrealized', burden.accessibilityLoss);
    const reliability = v.object(plan.reliability, '$.reliability');
    ['onTimeProbability', 'cancellationProbability'].forEach((key) => v.finite(reliability[key], `$.reliability.${key}`, 0));
    v.array(plan.hardGates, '$.hardGates', 1).forEach((row, index) => {
      v.string(row?.id, `$.hardGates[${index}].id`);
      v.boolean(row?.pass, `$.hardGates[${index}].pass`);
    });
    v.array(plan.authorizationParticipantIds, '$.authorizationParticipantIds');
    v.boolean(plan.searchComplete, '$.searchComplete');
    return plan;
  }

  function validateHandoff(event) {
    const contract = 'simulatte.handoffEvent.v1';
    const v = validator(contract);
    v.schema(event);
    ['id', 'planId', 'needId', 'itemId', 'actorId', 'locationNodeId', 'occurredAt', 'authorizationId', 'priorEventHash', 'eventHash']
      .forEach((key) => v.string(event[key], `$.${key}`));
    v.oneOf(event.priorState, CUSTODY_STATES, '$.priorState');
    v.oneOf(event.resultingState, CUSTODY_STATES, '$.resultingState');
    v.integer(event.quantity, '$.quantity', 1);
    return event;
  }

  function validateEnvironmentField(field) {
    const contract = 'simulatte.environmentField.v1';
    const v = validator(contract);
    v.schema(field);
    ['id', 'worldId', 'civilTime', 'utcInstant', 'sunModel', 'buildingDatasetId', 'computeImplementation']
      .forEach((key) => v.string(field[key], `$.${key}`));
    ['azimuthDegrees', 'elevationDegrees', 'gridResolutionM'].forEach((key) => v.finite(field[key], `$.${key}`, key === 'elevationDegrees' ? -90 : 0));
    const counts = v.object(field.counts, '$.counts');
    ['buildingCount', 'segmentCount', 'uniqueSegmentCount', 'sampleCount', 'unknownHeightCount', 'unknownSampleCount', 'nightSampleCount', 'candidateBuildingChecks']
      .forEach((key) => v.integer(counts[key], `$.counts.${key}`));
    v.array(field.segmentRows, '$.segmentRows').forEach((row, index) => {
      v.string(row?.segmentId, `$.segmentRows[${index}].segmentId`);
      ['travelSeconds', 'directSunSeconds', 'shadeSeconds', 'unknownSeconds', 'nightSeconds']
        .forEach((key) => v.finite(row[key], `$.segmentRows[${index}].${key}`, 0));
    });
    if (field.timeSampling) {
      const sampling = v.object(field.timeSampling, '$.timeSampling');
      v.string(sampling.method, '$.timeSampling.method');
      v.integer(sampling.routeCandidateCount, '$.timeSampling.routeCandidateCount', 1);
      v.integer(sampling.sampledInstantCount, '$.timeSampling.sampledInstantCount', 1);
      v.string(sampling.edgeCostModelId, '$.timeSampling.edgeCostModelId');
      v.string(sampling.edgeCostModelVersion, '$.timeSampling.edgeCostModelVersion');
      v.boolean(sampling.fifo, '$.timeSampling.fifo');
    }
    const quality = v.object(field.quality, '$.quality');
    ['knownHeightBuildingCount', 'missingHeightBuildingCount', 'buildingInteriorRingCount', 'groundElevationAvailableCount']
      .forEach((key) => v.integer(quality[key], `$.quality.${key}`));
    ['groundElevationApplied', 'treeCanopyApplied'].forEach((key) => v.boolean(quality[key], `$.quality.${key}`));
    v.string(quality.atmosphere, '$.quality.atmosphere');
    const performance = v.object(field.performance, '$.performance');
    v.string(performance.spatialIndex, '$.performance.spatialIndex');
    v.finite(performance.spatialIndexCellSizeM, '$.performance.spatialIndexCellSizeM', 0);
    v.integer(performance.indexedCellCount, '$.performance.indexedCellCount');
    v.finite(performance.maximumSceneQueryM, '$.performance.maximumSceneQueryM', 0);
    v.string(field.claimBoundary, '$.claimBoundary');
    return field;
  }

  function validateSettlement(settlement) {
    const contract = 'simulatte.cooperativeSettlement.v1';
    const v = validator(contract);
    v.schema(settlement);
    ['id', 'planId', 'scenarioId', 'outcome', 'settledAt', 'receiptChainParentHash'].forEach((key) => v.string(settlement[key], `$.${key}`));
    v.array(settlement.custodyEventIds, '$.custodyEventIds', 1);
    const predicted = v.object(settlement.predicted, '$.predicted');
    const actual = v.object(settlement.actual, '$.actual');
    ['addedDistanceM', 'addedDurationSeconds', 'handoffWaitSeconds', 'interactionBurden', 'compensationCents']
      .forEach((key) => {
        const minimum = ['addedDistanceM', 'addedDurationSeconds'].includes(key) ? -Infinity : 0;
        v.finite(predicted[key], `$.predicted.${key}`, minimum);
        v.finite(actual[key], `$.actual.${key}`, minimum);
      });
    v.boolean(settlement.dedicatedTripAvoided, '$.dedicatedTripAvoided');
    return settlement;
  }

  function validateScenario(scenario) {
    const contract = 'simulatte.cooperativeScenario.v1';
    const v = validator(contract);
    v.schema(scenario);
    ['id', 'contentVersion', 'worldId', 'carrierMissionText', 'claimBoundary'].forEach((key) => v.string(scenario[key], `$.${key}`));
    const taxonomy = v.object(scenario.itemTaxonomy, '$.itemTaxonomy');
    v.string(taxonomy.id, '$.itemTaxonomy.id');
    const items = v.array(taxonomy.items, '$.itemTaxonomy.items', 1);
    const itemIds = uniqueIds(items, '$.itemTaxonomy.items', v);
    items.forEach((item, index) => {
      ['label', 'unit', 'substitutionGroupId', 'riskTier'].forEach((key) => v.string(item[key], `$.itemTaxonomy.items[${index}].${key}`));
      ['massGrams', 'volumeCm3', 'maximumValueCents'].forEach((key) => v.finite(item[key], `$.itemTaxonomy.items[${index}].${key}`, 0));
      v.array(item.requiredAcknowledgements, `$.itemTaxonomy.items[${index}].requiredAcknowledgements`);
      if (item.aliases !== undefined) v.array(item.aliases, `$.itemTaxonomy.items[${index}].aliases`).forEach((alias, aliasIndex) => v.string(alias, `$.itemTaxonomy.items[${index}].aliases[${aliasIndex}]`));
    });
    const participants = v.array(scenario.participants, '$.participants', 3);
    const participantIds = uniqueIds(participants, '$.participants', v);
    participants.forEach((row, index) => {
      v.string(row.assuranceTier, `$.participants[${index}].assuranceTier`);
      v.string(row.disclosurePolicy, `$.participants[${index}].disclosurePolicy`);
    });
    const intents = v.array(scenario.intents, '$.intents', 2);
    const intentIds = uniqueIds(intents, '$.intents', v);
    intents.forEach((intent, index) => {
      validateParticipantIntent(intent);
      if (!participantIds.has(intent.participantId)) v.fail(`$.intents[${index}].participantId`, 'known participant ID', intent.participantId);
    });
    validateNeed(scenario.need);
    if (!participantIds.has(scenario.need.requesterId)) v.fail('$.need.requesterId', 'known participant ID', scenario.need.requesterId);
    if (!itemIds.has(scenario.need.itemId)) v.fail('$.need.itemId', 'known item ID', scenario.need.itemId);
    const offers = v.array(scenario.offers, '$.offers', 3);
    uniqueIds(offers, '$.offers', v);
    offers.forEach((offer, index) => {
      validateOffer(offer);
      if (!participantIds.has(offer.participantId)) v.fail(`$.offers[${index}].participantId`, 'known participant ID', offer.participantId);
      if (!intentIds.has(offer.intentId)) v.fail(`$.offers[${index}].intentId`, 'known intent ID', offer.intentId);
      if (!itemIds.has(offer.itemId)) v.fail(`$.offers[${index}].itemId`, 'known item ID', offer.itemId);
    });
    const graphs = v.array(scenario.buildingHandoffGraphs, '$.buildingHandoffGraphs', 1);
    const graphIds = uniqueIds(graphs, '$.buildingHandoffGraphs', v);
    if (!graphIds.has(scenario.need.buildingHandoffGraphId)) v.fail('$.need.buildingHandoffGraphId', 'known building handoff graph ID', scenario.need.buildingHandoffGraphId);
    graphs.forEach((graph, graphIndex) => validateBuildingGraph(graph, graphIndex, v));
    if (scenario.destinationLexicon !== undefined) {
      v.array(scenario.destinationLexicon, '$.destinationLexicon', 1).forEach((destination, index) => {
        ['id', 'label', 'nodeId', 'buildingHandoffGraphId'].forEach((key) => v.string(destination[key], `$.destinationLexicon[${index}].${key}`));
        v.array(destination.aliases, `$.destinationLexicon[${index}].aliases`).forEach((alias, aliasIndex) => v.string(alias, `$.destinationLexicon[${index}].aliases[${aliasIndex}]`));
        if (!graphIds.has(destination.buildingHandoffGraphId)) v.fail(`$.destinationLexicon[${index}].buildingHandoffGraphId`, 'known building handoff graph ID', destination.buildingHandoffGraphId);
      });
    }
    const policy = v.object(scenario.policy, '$.policy');
    ['cellSizeM', 'timeBucketSeconds', 'maximumCandidates', 'softHoldSeconds', 'maximumRelayHops', 'minimumOnTimeProbability', 'minimumTemporalSlackSeconds']
      .forEach((key) => v.finite(policy[key], `$.policy.${key}`, 0));
    v.array(policy.compensationKinds, '$.policy.compensationKinds', 1);
    const privacy = v.object(policy.privacyLeakageBudget, '$.policy.privacyLeakageBudget');
    v.string(privacy.scope, '$.policy.privacyLeakageBudget.scope');
    ['maximumExposureScore', 'coarseCorridorDisclosureScore', 'coarseTimeWindowDisclosureScore', 'exactRouteDisclosureScore', 'exactIdentityDisclosureScore']
      .forEach((key) => v.finite(privacy[key], `$.policy.privacyLeakageBudget.${key}`, 0));
    v.boolean(privacy.exactDisclosureRequiresAuthorization, '$.policy.privacyLeakageBudget.exactDisclosureRequiresAuthorization');
    v.string(scenario.failureInjection?.participantId, '$.failureInjection.participantId');
    v.finite(scenario.failureInjection?.delaySeconds, '$.failureInjection.delaySeconds', 0);
    return scenario;
  }

  function validateBuildingGraph(graph, graphIndex, v) {
    const path = `$.buildingHandoffGraphs[${graphIndex}]`;
    v.string(graph.sourceKind, `${path}.sourceKind`);
    v.string(graph.claimBoundary, `${path}.claimBoundary`);
    const nodes = v.array(graph.nodes, `${path}.nodes`, 2);
    const nodeIds = uniqueIds(nodes, `${path}.nodes`, v);
    nodes.forEach((node, index) => {
      ['kind', 'label', 'access', 'disclosurePolicy'].forEach((key) => v.string(node[key], `${path}.nodes[${index}].${key}`));
      v.integer(node.level, `${path}.nodes[${index}].level`);
    });
    v.array(graph.edges, `${path}.edges`, 1).forEach((edge, index) => {
      ['id', 'fromNodeId', 'toNodeId', 'mode'].forEach((key) => v.string(edge[key], `${path}.edges[${index}].${key}`));
      if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) v.fail(`${path}.edges[${index}]`, 'known endpoint IDs', edge);
      v.finite(edge.expectedTraversalSeconds, `${path}.edges[${index}].expectedTraversalSeconds`, 0);
    });
  }

  return {
    CooperativeContractError,
    CUSTODY_STATES,
    PLAN_STATES,
    validateEnvironmentField,
    validateConsent,
    validateCustodyState,
    validateHandoff,
    validateJourneyIntent,
    validateNeed,
    validateOffer,
    validateParticipantIntent,
    validatePlan,
    validateScenario,
    validateSettlement,
  };
});
