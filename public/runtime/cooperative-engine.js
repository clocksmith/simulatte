(function attachCooperativeEngine(root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('../contracts/cooperative-contracts.js')
    : root.SimulatteCooperativeContracts;
  const worldApi = typeof module === 'object' && module.exports
    ? require('../world/world-model.js')
    : root.SimulatteAutonomyWorld;
  const routePlanner = typeof module === 'object' && module.exports
    ? require('../world/route-planner.js')
    : root.SimulatteAutonomyRoutePlanner;
  const receipts = typeof module === 'object' && module.exports
    ? require('./canonical-receipts.js')
    : root.SimulatteAutonomyReceipts;
  const language = typeof module === 'object' && module.exports
    ? require('../mission/cooperative-language-compiler.js')
    : root.SimulatteCooperativeLanguage;
  const api = factory(contracts, worldApi, routePlanner, receipts, language);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteCooperativeEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCooperativeEngineModule(contracts, worldApi, routePlanner, receipts, language) {
  const ZERO_HASH = '0'.repeat(64);
  const TRIGGERS = Object.freeze(['intent_changed', 'route_delay_changed', 'environment_field_changed', 'reservation_expired']);

  function recognizesCooperativeRequest(sourceText) {
    return language.recognizesCooperativeIntent(sourceText);
  }

  function compileCooperativeRequest(sourceText, scenario, world = null) {
    contracts.validateScenario(scenario);
    const compilation = language.compileCooperativeLanguage({
      sourceText,
      taxonomy: scenario.itemTaxonomy,
      destinations: scenario.destinationLexicon || [],
      world,
      defaults: {
        mode: scenario.intents[0]?.mode || null,
        anchorInstant: scenario.need.earliestAt,
        buildingHandoffGraphId: scenario.need.buildingHandoffGraphId,
      },
    });
    const need = language.needFromCompilation(compilation, scenario.need, scenario.itemTaxonomy);
    return {
      ...compilation,
      scenarioId: scenario.id,
      needId: need?.id || null,
      need,
    };
  }

  async function createCooperativeSession({ world, routingPolicy, scenario, sourceText = null }) {
    contracts.validateScenario(scenario);
    if (scenario.worldId !== world.id) throw cooperativeError('scenario_world_mismatch', `Scenario ${scenario.id} expected world ${scenario.worldId}, received ${world.id}`);
    const request = compileCooperativeRequest(sourceText, scenario, world);
    if (!request.executable || request.primaryKind !== 'need' || !request.need) {
      throw cooperativeError('cooperative_clarification_required', 'The cooperative request has unresolved typed obligations', request);
    }
    scenario = { ...scenario, need: request.need };
    contracts.validateNeed(scenario.need);
    await verifyBaselineCommitments(scenario);
    const worldModel = worldApi.createWorldModel(world);
    const receiptChain = receipts.createReceiptChain();
    const routeCache = new Map();
    const indexes = buildIndexes(scenario, worldModel, routingPolicy, routeCache);
    const matching = matchOpportunities({ scenario, worldModel, routingPolicy, routeCache, indexes });
    if (!matching.feasiblePlans.length) throw cooperativeError('no_cooperative_plan', 'No offer passed all cooperative gates', matching.receipt);
    let selectedIndex = 0;
    let plan = structuredClone(matching.feasiblePlans[selectedIndex]);
    let custodyState = 'requested';
    let custody = custodyRecord(plan, scenario, custodyState, null, ZERO_HASH);
    let custodyEvents = [];
    let settlement = null;
    let recovery = null;
    const authorizationIds = new Map();
    const authorizationReceipts = [];
    await receipts.appendReceiptEntry(receiptChain, request);
    await receipts.appendReceiptEntry(receiptChain, matching.receipt);
    await receipts.appendReceiptEntry(receiptChain, selectionReceipt(plan, matching.feasiblePlans));

    async function transition(nextState, reason, evidence = null) {
      const previousState = plan.state;
      assertPlanTransition(previousState, nextState);
      plan.state = nextState;
      const row = {
        schema: 'simulatte.cooperativePlanTransition.v1',
        planId: plan.id,
        previousState,
        nextState,
        reason,
        evidence,
      };
      await receipts.appendReceiptEntry(receiptChain, row);
      return snapshot();
    }

    async function reserve() {
      if (plan.state !== 'candidate') throw cooperativeError('reservation_state_invalid', `Soft hold expected candidate, received ${plan.state}`);
      return transition('soft_hold', 'rolling_horizon_soft_hold', {
        durationSeconds: scenario.policy.softHoldSeconds,
        frozenSegmentIds: [],
        mutableSuffixSegmentIds: [...plan.routes.cooperative.segmentIds],
      });
    }

    async function authorize(participantId) {
      if (plan.state !== 'soft_hold') throw cooperativeError('authorization_state_invalid', `Authorization expected soft_hold, received ${plan.state}`);
      if (!plan.participantIds.includes(participantId)) throw cooperativeError('authorization_participant_invalid', `Plan ${plan.id} does not name participant ${participantId}`);
      if (!authorizationIds.has(participantId)) {
        const authorizationId = `authorization-${participantId}-${plan.id}`;
        authorizationIds.set(participantId, authorizationId);
        plan.authorizationParticipantIds.push(participantId);
        plan.authorizationParticipantIds.sort();
        const authorization = {
          schema: 'simulatte.cooperativeConsent.v1',
          id: authorizationId,
          planId: plan.id,
          participantId,
          state: 'authorized',
          scope: 'exact_plan_and_handoff',
          issuedAt: eventTime(scenario, authorizationReceipts.length),
          expiresAt: scenario.need.expiresAt,
          planIdentitySha256: await receipts.sha256Hex(planIdentity(plan)),
        };
        contracts.validateConsent(authorization);
        authorizationReceipts.push(authorization);
        await receipts.appendReceiptEntry(receiptChain, authorization);
      }
      if (authorizationIds.size === plan.participantIds.length) await transition('mutually_authorized', 'all_affected_participants_authorized');
      return snapshot();
    }

    async function startExecution() {
      if (plan.state !== 'mutually_authorized') throw cooperativeError('execution_state_invalid', `Execution expected mutually_authorized, received ${plan.state}`);
      await transition('frozen_prefix', 'execution_boundary_reached', {
        frozenSegmentIds: plan.routes.cooperative.segmentIds.slice(0, 1),
        mutableSuffixSegmentIds: plan.routes.cooperative.segmentIds.slice(1),
      });
      await transition('executing', 'carrier_started');
      await recordCustody('in_custody', plan.carrierId, plan.routes.cooperative.pickupNodeId, 'carrier_possession_acknowledged');
      return snapshot();
    }

    async function recoverFromDelay(delaySeconds = scenario.failureInjection.delaySeconds) {
      if (!['candidate', 'soft_hold'].includes(plan.state)) throw cooperativeError('recovery_state_invalid', `Recovery before execution expected candidate or soft_hold, received ${plan.state}`);
      const prior = structuredClone(plan);
      if (delaySeconds <= scenario.failureInjection.latestSafeReassignmentSeconds) {
        recovery = {
          schema: 'simulatte.cooperativeRecovery.v1',
          priorPlanId: prior.id,
          selectedPlanId: prior.id,
          action: 'retain_with_updated_arrival_distribution',
          delaySeconds,
          latestSafeReassignmentSeconds: scenario.failureInjection.latestSafeReassignmentSeconds,
        };
      } else {
        const nextIndex = matching.feasiblePlans.findIndex((row, index) => index > selectedIndex && row.id !== prior.id);
        if (nextIndex < 0) throw cooperativeError('fallback_unavailable', 'Delay crossed reassignment policy and no backup candidate remained');
        selectedIndex = nextIndex;
        plan = structuredClone(matching.feasiblePlans[selectedIndex]);
        authorizationIds.clear();
        authorizationReceipts.length = 0;
        custodyState = 'requested';
        custody = custodyRecord(plan, scenario, custodyState, null, ZERO_HASH);
        recovery = {
          schema: 'simulatte.cooperativeRecovery.v1',
          priorPlanId: prior.id,
          selectedPlanId: plan.id,
          action: 'reassign_before_frozen_prefix',
          delaySeconds,
          latestSafeReassignmentSeconds: scenario.failureInjection.latestSafeReassignmentSeconds,
          preservedBaselineCommitmentSha256: prior.baselineCommitmentSha256,
          newBaselineCommitmentSha256: plan.baselineCommitmentSha256,
        };
      }
      await receipts.appendReceiptEntry(receiptChain, recovery);
      return snapshot();
    }

    async function update(trigger, evidence = {}) {
      if (!TRIGGERS.includes(trigger)) throw cooperativeError('rolling_trigger_invalid', `Expected ${TRIGGERS.join(', ')}, received ${trigger}`);
      const frozenCount = plan.state === 'executing' ? 1 : 0;
      const row = {
        schema: 'simulatte.rollingHorizonUpdate.v1',
        planId: plan.id,
        trigger,
        frozenSegmentIds: plan.routes.cooperative.segmentIds.slice(0, frozenCount),
        mutableSuffixSegmentIds: plan.routes.cooperative.segmentIds.slice(frozenCount),
        evidence,
        decision: frozenCount ? 'preserve_prefix_recompute_suffix_only' : 'recompute_unfrozen_plan',
      };
      await receipts.appendReceiptEntry(receiptChain, row);
      return row;
    }

    async function settle({ actualDelaySeconds = 0, handoffWaitSeconds = plan.marginalBurden.handoffWaitSeconds } = {}) {
      if (plan.state !== 'executing') throw cooperativeError('settlement_state_invalid', `Settlement expected executing, received ${plan.state}`);
      const buildingGraph = scenario.buildingHandoffGraphs.find((row) => row.id === scenario.need.buildingHandoffGraphId);
      await recordCustody('handoff_pending', plan.carrierId, 'office-security', 'security_desk_acknowledged');
      await recordCustody('delivered', scenario.need.requesterId, 'office-handoff-zone', 'requester_quantity_and_condition_acknowledged');
      await transition('settled', 'delivery_acknowledged');
      await recordCustody('settled', scenario.need.requesterId, 'office-handoff-zone', 'cooperative_accounting_closed');
      const actual = {
        addedDistanceM: plan.marginalBurden.addedDistanceM,
        addedDurationSeconds: round(plan.marginalBurden.addedDurationSeconds + actualDelaySeconds),
        handoffWaitSeconds: round(handoffWaitSeconds),
        interactionBurden: round(plan.marginalBurden.interactionBurden + actualDelaySeconds / 300),
        compensationCents: plan.marginalBurden.compensationCents,
      };
      const predicted = pickBurden(plan.marginalBurden);
      settlement = {
        schema: 'simulatte.cooperativeSettlement.v1',
        id: `settlement-${plan.id}`,
        planId: plan.id,
        scenarioId: scenario.id,
        outcome: 'fulfilled',
        settledAt: scenario.need.latestAt,
        receiptChainParentHash: receiptChain.terminalHash,
        custodyEventIds: custodyEvents.map((row) => row.id),
        predicted,
        actual,
        errors: Object.fromEntries(Object.keys(predicted).map((key) => [key, round(actual[key] - predicted[key])])),
        dedicatedTripAvoided: true,
        buildingHandoff: {
          graphId: buildingGraph.id,
          edgeIds: buildingGraph.edges.map((row) => row.id),
          expectedTraversalSeconds: buildingGraph.edges.reduce((sum, row) => sum + row.expectedTraversalSeconds, 0),
          sourceKind: buildingGraph.sourceKind,
        },
        accounting: cooperativeAccounting(plan, scenario),
      };
      contracts.validateSettlement(settlement);
      await receipts.appendReceiptEntry(receiptChain, settlement);
      return snapshot();
    }

    async function recordCustody(resultingState, actorId, locationNodeId, reason) {
      const priorEventHash = custodyEvents.at(-1)?.eventHash || ZERO_HASH;
      const base = {
        schema: 'simulatte.handoffEvent.v1',
        id: `custody-${String(custodyEvents.length + 1).padStart(2, '0')}-${plan.id}`,
        planId: plan.id,
        needId: scenario.need.id,
        itemId: scenario.need.itemId,
        actorId,
        locationNodeId,
        occurredAt: eventTime(scenario, custodyEvents.length),
        authorizationId: authorizationIds.get(actorId) || authorizationIds.get(scenario.need.requesterId) || 'scenario-authorization',
        priorState: custodyState,
        resultingState,
        quantity: scenario.need.quantity,
        priorEventHash,
        eventHash: '',
        reason,
      };
      const { eventHash: omittedEventHash, ...hashableEvent } = base;
      void omittedEventHash;
      base.eventHash = await receipts.sha256Hex(hashableEvent);
      contracts.validateHandoff(base);
      custodyEvents.push(base);
      custodyState = resultingState;
      custody = custodyRecord(plan, scenario, resultingState, actorId, base.eventHash);
      await receipts.appendReceiptEntry(receiptChain, base);
      return base;
    }

    function trainingRows() {
      if (!settlement) return [];
      return [{
        schema: 'simulatte.settledCooperationTrainingRow.v1',
        scenarioId: scenario.id,
        planId: plan.id,
        proposal: pickBurden(plan.marginalBurden),
        accepted: true,
        refusalReason: null,
        predicted: settlement.predicted,
        actual: settlement.actual,
        recovery: recovery ? structuredClone(recovery) : null,
        outcome: settlement.outcome,
        labelAuthority: 'deterministic_simulation_settlement',
        promotionEligible: false,
      }];
    }

    function discoveryEnvelope() {
      const intent = scenario.intents.find((row) => row.id === plan.intentId);
      const baselineRoute = plan.routes.baseline;
      const exposure = privacyExposure(scenario.policy, false, false);
      return {
        schema: 'simulatte.coarsePeerEnvelope.v1',
        envelopeId: `envelope-${intent.id}`,
        itemClassId: scenario.need.itemId,
        quantityBand: [scenario.need.quantity, scenario.need.quantity],
        corridorCells: routeCells(baselineRoute.segmentIds, worldModel, scenario.policy.cellSizeM),
        timeBuckets: timeBuckets(intent, baselineRoute.durationSeconds, scenario.policy.timeBucketSeconds),
        maximumAddedTimeSeconds: intent.slack.maximumAddedTimeSeconds,
        maximumAddedDistanceM: intent.slack.maximumAddedDistanceM,
        expiry: intent.expiresAt,
        exactRouteDisclosed: false,
        exactIdentityDisclosed: false,
        privacy: {
          schema: 'simulatte.cooperativePrivacyReceipt.v1',
          scope: scenario.policy.privacyLeakageBudget.scope,
          exposureScore: exposure.score,
          maximumExposureScore: scenario.policy.privacyLeakageBudget.maximumExposureScore,
          pass: exposure.score <= scenario.policy.privacyLeakageBudget.maximumExposureScore,
          disclosedCategories: exposure.disclosedCategories,
          exactDisclosureRequiresAuthorization: scenario.policy.privacyLeakageBudget.exactDisclosureRequiresAuthorization,
          claimBoundary: 'The score governs the network discovery envelope. The local simulator retains exact plan data and does not prove transport-layer privacy.',
        },
      };
    }

    function snapshot() {
      const integrity = {
        algorithm: receiptChain.algorithm,
        terminalHash: receiptChain.terminalHash,
        entryCount: receiptChain.entries.length,
      };
      return structuredClone({
        schema: 'simulatte.cooperativeSessionSnapshot.v1',
        request,
        plan,
        authorizationReceipts,
        custody,
        custodyState,
        custodyEvents,
        settlement,
        recovery,
        matching: matching.receipt,
        handoff: handoffSummary(),
        liquidity: liquidityMetrics(matching, plan, settlement),
        discoveryEnvelope: discoveryEnvelope(),
        trainingRows: trainingRows(),
        integrity,
      });
    }

    function handoffSummary() {
      const graph = scenario.buildingHandoffGraphs.find((row) => row.id === scenario.need.buildingHandoffGraphId);
      return {
        schema: 'simulatte.cooperativeHandoffSummary.v1',
        graphId: graph.id,
        sourceKind: graph.sourceKind,
        nodeLabels: graph.nodes.map((row) => row.label),
        edgeIds: graph.edges.map((row) => row.id),
        claimBoundary: graph.claimBoundary,
      };
    }

    function trace() {
      return structuredClone(receiptChain.entries);
    }

    return { authorize, discoveryEnvelope, recoverFromDelay, reserve, settle, snapshot, startExecution, trace, trainingRows, update };
  }

  function buildIndexes(scenario, worldModel, routingPolicy, routeCache) {
    const itemOffers = new Map();
    scenario.offers.forEach((offer) => {
      if (!itemOffers.has(offer.itemId)) itemOffers.set(offer.itemId, []);
      itemOffers.get(offer.itemId).push(offer);
    });
    itemOffers.forEach((rows) => rows.sort((left, right) => left.id.localeCompare(right.id)));
    const corridor = new Map();
    scenario.intents.forEach((intent) => {
      const route = planLeg(intent.baselineJourney.originNodeId, intent.baselineJourney.destinationNodeId, intent.mode, worldModel, routingPolicy, routeCache);
      const cells = routeCells(route.segmentIds, worldModel, scenario.policy.cellSizeM);
      const buckets = timeBuckets(intent, route.durationSeconds, scenario.policy.timeBucketSeconds);
      cells.forEach((cell) => buckets.forEach((bucket) => {
        const key = `${cell}|${bucket}`;
        if (!corridor.has(key)) corridor.set(key, []);
        corridor.get(key).push(intent.id);
      }));
    });
    return { itemOffers, corridor };
  }

  function matchOpportunities({ scenario, worldModel, routingPolicy, routeCache, indexes }) {
    const need = scenario.need;
    const item = scenario.itemTaxonomy.items.find((row) => row.id === need.itemId);
    const allOffers = [...scenario.offers];
    const itemCompatible = allOffers.filter((offer) => offer.itemId === need.itemId);
    const quantityCompatible = itemCompatible.filter((offer) => offer.quantity >= need.quantity);
    const consentEligible = quantityCompatible.filter((offer) => offer.consentState === 'available'
      && scenario.intents.find((intent) => intent.id === offer.intentId)?.consentState === 'available');
    const needStart = Date.parse(need.earliestAt);
    const needEnd = Date.parse(need.latestAt);
    const temporallyEligible = consentEligible.filter((offer) => {
      const intent = scenario.intents.find((row) => row.id === offer.intentId);
      return Date.parse(offer.expiresAt) >= needStart
        && Date.parse(intent.expiresAt) >= needStart
        && Date.parse(intent.slack.earliestDepartureAt) <= needEnd
        && Date.parse(intent.slack.latestDepartureAt) >= needStart;
    });
    const needCell = cellForPoint(worldModel.node(need.destinationNodeId).position, scenario.policy.cellSizeM);
    const nearbyCells = neighborCells(needCell);
    const needBuckets = timeBucketRange(need.earliestAt, need.latestAt, scenario.policy.timeBucketSeconds);
    const corridorIntentIds = new Set(nearbyCells.flatMap((cell) => needBuckets.flatMap((bucket) => indexes.corridor.get(`${cell}|${bucket}`) || [])));
    const corridorEligible = temporallyEligible.filter((offer) => corridorIntentIds.has(offer.intentId));
    const planned = corridorEligible.slice(0, scenario.policy.maximumCandidates).map((offer) => buildCandidatePlan({ offer, scenario, worldModel, routingPolicy, routeCache, item }));
    const feasiblePlans = planned.filter((row) => row.hardGates.every((gate) => gate.pass))
      .sort(comparePlans);
    const receipt = {
      schema: 'simulatte.cooperativeOpportunityReceipt.v1',
      scenarioId: scenario.id,
      method: 'item_map_then_space_time_corridor_then_route_v1',
      complexity: 'linear index build plus output-sensitive joins; no all-pairs participant scan',
      counts: {
        totalOffers: allOffers.length,
        itemCompatible: itemCompatible.length,
        quantityCompatible: quantityCompatible.length,
        consentEligible: consentEligible.length,
        temporallyEligible: temporallyEligible.length,
        corridorEligible: corridorEligible.length,
        routedCandidates: planned.length,
        feasibleCandidates: feasiblePlans.length,
      },
      filters: [
        filterRow('item_compatibility', allOffers, itemCompatible),
        filterRow('quantity', itemCompatible, quantityCompatible),
        filterRow('consent', quantityCompatible, consentEligible),
        filterRow('availability_window', consentEligible, temporallyEligible),
        filterRow('space_time_corridor', temporallyEligible, corridorEligible),
        filterRow('hard_gates', planned, feasiblePlans),
      ],
      rejectedPlans: planned.filter((row) => row.hardGates.some((gate) => !gate.pass)).map((row) => ({
        planId: row.id,
        failedGateIds: row.hardGates.filter((gate) => !gate.pass).map((gate) => gate.id),
      })),
      indexes: {
        itemKeys: indexes.itemOffers.size,
        corridorSpaceTimeKeys: indexes.corridor.size,
        queryCell: needCell,
        queriedNeighborCellCount: nearbyCells.length,
        queriedTimeBucketCount: needBuckets.length,
      },
      routeCache: { entries: routeCache.size },
    };
    return { feasiblePlans, receipt };
  }

  function buildCandidatePlan({ offer, scenario, worldModel, routingPolicy, routeCache, item }) {
    const need = scenario.need;
    const intent = scenario.intents.find((row) => row.id === offer.intentId);
    const baseline = planLeg(intent.baselineJourney.originNodeId, intent.baselineJourney.destinationNodeId, intent.mode, worldModel, routingPolicy, routeCache);
    const pickupNodeId = offer.availableNodeId;
    const toPickup = planLeg(intent.baselineJourney.originNodeId, pickupNodeId, intent.mode, worldModel, routingPolicy, routeCache);
    const toDrop = planLeg(pickupNodeId, need.destinationNodeId, intent.mode, worldModel, routingPolicy, routeCache);
    const onward = planLeg(need.destinationNodeId, intent.baselineJourney.destinationNodeId, intent.mode, worldModel, routingPolicy, routeCache);
    const buildingGraph = scenario.buildingHandoffGraphs.find((row) => row.id === need.buildingHandoffGraphId);
    const buildingSeconds = buildingGraph.edges.reduce((sum, row) => sum + row.expectedTraversalSeconds, 0);
    const cooperative = combineRoutes([toPickup, toDrop, onward], {
      pickupServiceSeconds: offer.pickupServiceSeconds,
      dropoffServiceSeconds: need.dropoffServiceSeconds,
      buildingHandoffSeconds: buildingSeconds,
    });
    const addedDistanceM = round(cooperative.distanceM - baseline.distanceM);
    const addedDurationSeconds = round(cooperative.durationSeconds - baseline.durationSeconds);
    const compensationCents = Math.max(offer.minimumCompensationCents, Math.ceil(addedDurationSeconds / 60) * 20);
    const handoffWaitSeconds = buildingGraph.edges
      .filter((row) => row.mode === 'wait' || row.mode === 'security')
      .reduce((sum, row) => sum + row.expectedTraversalSeconds, 0);
    const interactionBurden = round(10
      + offer.pickupServiceSeconds / 300
      + need.dropoffServiceSeconds / 300
      + handoffWaitSeconds / 300);
    const latest = Date.parse(need.latestAt);
    const arrival = Date.parse(intent.baselineJourney.departureAt) + cooperative.durationSeconds * 1000;
    const latenessSlackSeconds = round((latest - arrival) / 1000);
    const onTimeProbability = round(Math.max(0, intent.reliability.onTimeProbability - Math.max(0, -latenessSlackSeconds) / 3600));
    const temporalSlackSeconds = Math.max(0, latenessSlackSeconds);
    const temporalSlackPenaltySeconds = Math.max(0, scenario.policy.minimumTemporalSlackSeconds - temporalSlackSeconds);
    const failureProbability = round(1 - onTimeProbability * (1 - intent.reliability.cancellationProbability));
    const privacy = privacyExposure(scenario.policy, false, false);
    const burden = {
      addedDistanceM,
      addedDurationSeconds,
      pickupServiceSeconds: offer.pickupServiceSeconds,
      dropoffServiceSeconds: need.dropoffServiceSeconds,
      handoffWaitSeconds,
      latenessSlackSeconds,
      temporalSlackSeconds,
      temporalSlackPenaltySeconds,
      directSunSeconds: null,
      directSunRealized: false,
      carryingLoadGrams: round(item.massGrams * need.quantity),
      carryingLoadCm3: round(item.volumeCm3 * need.quantity),
      custodyRisk: riskScore(need.riskTier),
      accessibilityLoss: null,
      accessibilityRealized: false,
      interactionBurden,
      failureProbability,
      privacyExposureScore: privacy.score,
      compensationCents,
    };
    const gates = [
      gate('item_compatible', offer.itemId === need.itemId),
      gate('quantity_sufficient', offer.quantity >= need.quantity),
      gate('capacity_mass', burden.carryingLoadGrams <= intent.slack.carryingCapacityGrams),
      gate('capacity_volume', item.volumeCm3 * need.quantity <= intent.slack.carryingCapacityCm3),
      gate('distance_slack', addedDistanceM <= intent.slack.maximumAddedDistanceM),
      gate('need_distance_slack', addedDistanceM <= need.maximumCarrierDetourM),
      gate('duration_slack', addedDurationSeconds <= intent.slack.maximumAddedTimeSeconds),
      gate('need_duration_slack', addedDurationSeconds <= need.maximumCarrierDetourSeconds),
      gate('handoff_wait', burden.handoffWaitSeconds <= intent.slack.maximumHandoffWaitSeconds),
      gate('interaction_burden', interactionBurden <= intent.slack.interactionBurdenLimit),
      gate('deadline', latenessSlackSeconds >= 0),
      gate('reliability', onTimeProbability >= scenario.policy.minimumOnTimeProbability),
      gate('compensation', compensationCents <= need.maximumCompensationCents),
      gate('risk_tier', offer.riskTier === need.riskTier && item.riskTier === need.riskTier),
      gate('privacy_leakage_budget', privacy.score <= scenario.policy.privacyLeakageBudget.maximumExposureScore),
      gate('consent', intent.consentState === 'available' && offer.consentState === 'available' && need.consentState === 'available'),
    ];
    const participantIds = [need.requesterId, offer.participantId].sort();
    const plan = {
      schema: 'simulatte.cooperativePlan.v1',
      id: `coop-plan-${stableId(`${scenario.id}:${offer.id}:${intent.revisionId}`)}`,
      scenarioId: scenario.id,
      worldId: scenario.worldId,
      policyId: scenario.policy.id,
      needId: need.id,
      offerId: offer.id,
      intentId: intent.id,
      intentRevisionId: intent.revisionId,
      baselineCommitmentSha256: intent.baselineJourney.commitmentSha256,
      state: 'candidate',
      participantIds,
      carrierId: offer.participantId,
      routes: {
        baseline: { ...baseline, originNodeId: intent.baselineJourney.originNodeId, destinationNodeId: intent.baselineJourney.destinationNodeId },
        cooperative: {
          ...cooperative,
          originNodeId: intent.baselineJourney.originNodeId,
          destinationNodeId: intent.baselineJourney.destinationNodeId,
          pickupNodeId,
          dropoffNodeId: need.destinationNodeId,
          viaNodeIds: [pickupNodeId, need.destinationNodeId],
          timeDependentCost: {
            modelId: routingPolicy.route.timeDependentCosts.cooperativeHandoff.costModelId,
            fifo: routingPolicy.route.timeDependentCosts.cooperativeHandoff.fifo,
            reason: 'participant availability, pickup, and handoff windows can invalidate later departures',
          },
        },
      },
      marginalBurden: burden,
      reliability: {
        onTimeProbability,
        arrivalIntervalSeconds: intent.reliability.arrivalIntervalSeconds,
        cancellationProbability: intent.reliability.cancellationProbability,
        latestSafeReassignmentSeconds: scenario.failureInjection.latestSafeReassignmentSeconds,
        backupAvailable: true,
      },
      hardGates: gates,
      authorizationParticipantIds: [],
      searchComplete: true,
      selectedBy: 'deterministic_pareto_burden_v2',
      utilityScore: planUtility(burden, intent.reliability),
    };
    contracts.validatePlan(plan);
    return plan;
  }

  function planLeg(originNodeId, destinationNodeId, mode, worldModel, routingPolicy, cache) {
    const key = [worldModel.world.id, mode, originNodeId, destinationNodeId, routingPolicy.id].join('|');
    if (cache.has(key)) return cache.get(key);
    const mission = {
      constraints: {
        avoidStreetNames: [],
        maximumBikeRackDistanceM: null,
        lanePreference: mode === 'delivery_bike' ? 'protected' : 'any',
      },
      task: { type: 'point_to_point' },
    };
    const route = routePlanner.planRoute({ worldModel, originNodeId, destinationNodeId, mode, tick: 0, mission, policy: routingPolicy });
    const result = routeMetrics(route.segmentIds, worldModel, route);
    cache.set(key, result);
    return result;
  }

  function routeMetrics(segmentIds, worldModel, route = {}) {
    const totals = segmentIds.reduce((sum, segmentId) => {
      const segment = worldModel.segment(segmentId);
      sum.distanceM += segment.lengthM;
      sum.durationSeconds += segment.lengthM / segment.speedLimitMps;
      return sum;
    }, { distanceM: 0, durationSeconds: 0 });
    return {
      segmentIds: [...segmentIds],
      distanceM: round(totals.distanceM),
      durationSeconds: round(totals.durationSeconds),
      cost: route.cost ?? round(totals.durationSeconds),
      algorithm: route.algorithm || 'a_star_v1',
      evaluatedSegmentCount: route.evaluatedSegmentCount || segmentIds.length,
    };
  }

  function combineRoutes(routes, services) {
    const streetDistanceM = routes.reduce((sum, route) => sum + route.distanceM, 0);
    const streetTravelSeconds = routes.reduce((sum, route) => sum + route.durationSeconds, 0);
    const serviceSeconds = services.pickupServiceSeconds + services.dropoffServiceSeconds + services.buildingHandoffSeconds;
    return {
      segmentIds: routes.flatMap((route) => route.segmentIds),
      distanceM: round(streetDistanceM),
      durationSeconds: round(streetTravelSeconds + serviceSeconds),
      streetTravelSeconds: round(streetTravelSeconds),
      pickupServiceSeconds: round(services.pickupServiceSeconds),
      dropoffServiceSeconds: round(services.dropoffServiceSeconds),
      buildingHandoffSeconds: round(services.buildingHandoffSeconds),
      algorithm: 'pickup_dropoff_onward_a_star_plus_services_v2',
      evaluatedSegmentCount: routes.reduce((sum, route) => sum + route.evaluatedSegmentCount, 0),
    };
  }

  function routeCells(segmentIds, worldModel, cellSizeM) {
    const cells = new Set();
    segmentIds.forEach((segmentId) => {
      const segment = worldModel.segment(segmentId);
      for (let index = 1; index < segment.geometry.length; index += 1) {
        const start = segment.geometry[index - 1];
        const end = segment.geometry[index];
        const length = Math.hypot(end.x - start.x, end.y - start.y);
        const samples = Math.max(1, Math.ceil(length / (cellSizeM / 2)));
        for (let sample = 0; sample <= samples; sample += 1) {
          const ratio = sample / samples;
          cells.add(cellForPoint({ x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio }, cellSizeM));
        }
      }
    });
    return [...cells].sort();
  }

  function cellForPoint(point, size) {
    return `${Math.floor(point.x / size)}:${Math.floor(point.y / size)}`;
  }

  function neighborCells(cell) {
    const [x, y] = cell.split(':').map(Number);
    const rows = [];
    for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) rows.push(`${x + dx}:${y + dy}`);
    return rows.sort();
  }

  function timeBuckets(intent, durationSeconds, bucketSeconds) {
    const start = Math.floor(Date.parse(intent.baselineJourney.departureAt) / 1000 / bucketSeconds);
    const end = Math.ceil((Date.parse(intent.baselineJourney.departureAt) / 1000 + durationSeconds) / bucketSeconds);
    const rows = [];
    for (let value = start; value <= end; value += 1) rows.push(value);
    return rows;
  }

  function timeBucketRange(startAt, endAt, bucketSeconds) {
    const start = Math.floor(Date.parse(startAt) / 1000 / bucketSeconds);
    const end = Math.ceil(Date.parse(endAt) / 1000 / bucketSeconds);
    const rows = [];
    for (let value = start; value <= end; value += 1) rows.push(value);
    return rows;
  }

  function liquidityMetrics(matching, plan, settlement) {
    const burdens = matching.feasiblePlans.map((row) => row.marginalBurden.addedDurationSeconds).sort((a, b) => a - b);
    return {
      schema: 'simulatte.cooperativeLiquidityMetrics.v1',
      eligibleOpportunitiesPerRequest: matching.feasiblePlans.length,
      matchingCyclesToFeasiblePlan: matching.feasiblePlans.length ? 1 : null,
      fulfillmentProbability: Math.max(...matching.feasiblePlans.map((row) => row.reliability.onTimeProbability), 0),
      medianMarginalBurdenSeconds: burdens.length ? burdens[Math.floor(burdens.length / 2)] : null,
      selectedMarginalBurdenSeconds: plan.marginalBurden.addedDurationSeconds,
      cancellationProbability: plan.reliability.cancellationProbability,
      rescueCount: settlement ? 0 : null,
      handoffsPerFulfillment: settlement ? 1 : null,
      dedicatedTripsAvoided: settlement?.dedicatedTripAvoided ? 1 : 0,
      acceptedShare: settlement ? 1 : null,
      claimBoundary: 'Metrics describe this deterministic local scenario, not live network liquidity.',
    };
  }

  function cooperativeAccounting(plan, scenario) {
    const maximum = scenario.need.maximumCompensationCents;
    const paid = plan.marginalBurden.compensationCents;
    return {
      schema: 'simulatte.cooperativeAccounting.v1',
      mechanism: 'participant_declared_bounds_v1',
      compensationKind: 'direct',
      requesterMaximumCents: maximum,
      carrierMinimumCents: scenario.offers.find((row) => row.id === plan.offerId).minimumCompensationCents,
      settledCompensationCents: paid,
      requesterSurplusCents: maximum - paid,
      platformPriceHidden: false,
      mutualAidCreditDelta: 0,
    };
  }

  function selectionReceipt(plan, rows) {
    return {
      schema: 'simulatte.cooperativeSelectionReceipt.v1',
      selectedPlanId: plan.id,
      comparator: 'utilityScore including temporal slack, failure, and privacy then addedDurationSeconds then planId',
      candidates: rows.map((row) => ({
        planId: row.id,
        utilityScore: row.utilityScore,
        addedDurationSeconds: row.marginalBurden.addedDurationSeconds,
        onTimeProbability: row.reliability.onTimeProbability,
      })),
      selectionAuthority: 'inspectable_javascript',
      modelExecution: false,
    };
  }

  function planIdentity(plan) {
    return `${plan.id}:${plan.intentRevisionId}:${plan.baselineCommitmentSha256}:${plan.routes.cooperative.segmentIds.join(',')}`;
  }

  function filterRow(id, before, after) {
    const beforeIds = before.map((row) => row.id).sort();
    const afterIds = new Set(after.map((row) => row.id));
    return { id, beforeCount: before.length, afterCount: after.length, rejectedIds: beforeIds.filter((idValue) => !afterIds.has(idValue)) };
  }

  function gate(id, pass) {
    return { id, pass: Boolean(pass) };
  }

  function comparePlans(left, right) {
    return left.utilityScore - right.utilityScore
      || left.marginalBurden.addedDurationSeconds - right.marginalBurden.addedDurationSeconds
      || left.id.localeCompare(right.id);
  }

  function planUtility(burden, reliability) {
    return round(burden.addedDurationSeconds + burden.addedDistanceM / 5 + burden.interactionBurden * 30
      + burden.temporalSlackPenaltySeconds + burden.failureProbability * 300
      + burden.privacyExposureScore * 60 + reliability.cancellationProbability * 120 + burden.compensationCents / 2);
  }

  function privacyExposure(policy, exactRouteDisclosed, exactIdentityDisclosed) {
    const budget = policy.privacyLeakageBudget;
    const disclosedCategories = ['coarse_corridor', 'coarse_time_window'];
    let score = budget.coarseCorridorDisclosureScore + budget.coarseTimeWindowDisclosureScore;
    if (exactRouteDisclosed) {
      score += budget.exactRouteDisclosureScore;
      disclosedCategories.push('exact_route');
    }
    if (exactIdentityDisclosed) {
      score += budget.exactIdentityDisclosureScore;
      disclosedCategories.push('exact_identity');
    }
    return { score: round(score), disclosedCategories };
  }

  function riskScore(tier) {
    return tier === 'ordinary_goods' ? 0.1 : 1;
  }

  function pickBurden(burden) {
    return {
      addedDistanceM: burden.addedDistanceM,
      addedDurationSeconds: burden.addedDurationSeconds,
      handoffWaitSeconds: burden.handoffWaitSeconds,
      interactionBurden: burden.interactionBurden,
      compensationCents: burden.compensationCents,
    };
  }

  function custodyRecord(plan, scenario, state, custodianId, priorEventHash) {
    const custody = {
      schema: 'simulatte.custodyState.v1',
      planId: plan.id,
      needId: scenario.need.id,
      itemId: scenario.need.itemId,
      quantity: scenario.need.quantity,
      state,
      custodianId,
      priorEventHash,
    };
    contracts.validateCustodyState(custody);
    return custody;
  }

  function eventTime(scenario, index) {
    const base = Date.parse(scenario.intents[0].baselineJourney.departureAt);
    return new Date(base + index * 60_000).toISOString();
  }

  async function verifyBaselineCommitments(scenario) {
    for (const intent of scenario.intents) {
      const baseline = {
        originNodeId: intent.baselineJourney.originNodeId,
        destinationNodeId: intent.baselineJourney.destinationNodeId,
        departureAt: intent.baselineJourney.departureAt,
      };
      const actual = await receipts.sha256Hex(baseline);
      if (actual !== intent.baselineJourney.commitmentSha256) {
        throw cooperativeError('baseline_commitment_mismatch', `Intent ${intent.id} expected baseline commitment ${intent.baselineJourney.commitmentSha256}, received ${actual}`);
      }
    }
  }

  function assertPlanTransition(current, next) {
    const allowed = new Map([
      ['candidate', ['soft_hold', 'refused', 'expired']],
      ['soft_hold', ['mutually_authorized', 'revoked', 'expired']],
      ['mutually_authorized', ['frozen_prefix', 'revoked']],
      ['frozen_prefix', ['executing', 'failed']],
      ['executing', ['settled', 'failed', 'missed']],
      ['settled', []],
    ]);
    if (!(allowed.get(current) || []).includes(next)) throw cooperativeError('plan_transition_invalid', `Plan state ${current} cannot transition to ${next}`);
  }

  function stableId(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function round(value) {
    return Number(value.toFixed(6));
  }

  function cooperativeError(code, message, evidence = null) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'CooperativeEngineError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return { compileCooperativeRequest, createCooperativeSession, recognizesCooperativeRequest };
});
