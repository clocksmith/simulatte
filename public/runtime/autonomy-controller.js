(function attachAutonomyController(root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('../contracts/contract-validator.js')
    : root.SimulatteAutonomyContracts;
  const worldApi = typeof module === 'object' && module.exports
    ? require('../world/world-model.js')
    : root.SimulatteAutonomyWorld;
  const routePlanner = typeof module === 'object' && module.exports
    ? require('../world/route-planner.js')
    : root.SimulatteAutonomyRoutePlanner;
  const observations = typeof module === 'object' && module.exports
    ? require('./observation-builder.js')
    : root.SimulatteAutonomyObservationBuilder;
  const occurrences = typeof module === 'object' && module.exports
    ? require('./occurrence-engine.js')
    : root.SimulatteAutonomyOccurrences;
  const proposer = typeof module === 'object' && module.exports
    ? require('./bet-proposer.js')
    : root.SimulatteAutonomyBetProposer;
  const safety = typeof module === 'object' && module.exports
    ? require('./safety-gate.js')
    : root.SimulatteAutonomySafetyGate;
  const selector = typeof module === 'object' && module.exports
    ? require('./bet-selector.js')
    : root.SimulatteAutonomyBetSelector;
  const dynamics = typeof module === 'object' && module.exports
    ? require('./reference-dynamics.js')
    : root.SimulatteAutonomyDynamics;
  const settlementApi = typeof module === 'object' && module.exports
    ? require('./bet-settlement.js')
    : root.SimulatteAutonomyBetSettlement;
  const receipts = typeof module === 'object' && module.exports
    ? require('./canonical-receipts.js')
    : root.SimulatteAutonomyReceipts;
  const verifier = typeof module === 'object' && module.exports
    ? require('../verifier/journey-verifier.js')
    : root.SimulatteAutonomyJourneyVerifier;
  const api = factory(contracts, worldApi, routePlanner, observations, occurrences, proposer, safety, selector, dynamics, settlementApi, receipts, verifier);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyController = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createControllerModule(
  contracts,
  worldApi,
  routePlanner,
  observations,
  occurrences,
  proposer,
  safety,
  selector,
  dynamics,
  settlementApi,
  receipts,
  verifier
) {
  // Loaded governed assets are hash-verified and remain immutable for their
  // object lifetime. Rebuilding a controller must not rescan the full render
  // geometry on the UI thread.
  const staticValidationCache = new WeakMap();

  function createAutonomyController({ world, featureCatalog, occurrenceCatalog = null, routeContributors = [], routeObjective = {}, embodiment, policy, mission, regionComposition = null, onTick = null }) {
    validateStaticInputs(world, featureCatalog, occurrenceCatalog);
    contracts.validateEmbodiment(embodiment);
    contracts.validatePolicy(policy);
    contracts.validateMission(mission, world, embodiment);
    const worldModel = worldApi.createWorldModel(world);
    const policyMemory = observations.createPolicyMemory(policy);
    const receiptChain = receipts.createReceiptChain();
    const state = initialState(mission, worldModel);
    state.embodimentKind = embodiment.kind;
    state.renderProfile = embodiment.renderProfile;
    const occurrenceEngine = occurrenceCatalog ? occurrences.createOccurrenceEngine(occurrenceCatalog) : null;
    const eventHistory = [occurrences.eventRow({ tick: 0, kind: 'mission_started', sourceId: mission.id })];
    let occurrenceReceipt = evaluateOccurrences(occurrenceEngine, state.tick, eventHistory);
    worldModel.applyRuntimeEffects(occurrenceReceipt.effects);
    const planning = buildJourneyPlanning({ worldModel, mission, embodiment, policy, routeContributors, routeObjective });
    if (mission.constraints.daylightOnly && !departureInsideDaylightWindow(mission)) {
      state.status = 'failed';
      state.terminalReason = 'daylight_departure_outside_window';
    }
    let activeRoute = null;

    async function step() {
      if (state.status !== 'active') return snapshot();
      if (state.tick >= policy.runtime.maximumTicks) {
        state.status = 'failed';
        state.terminalReason = 'budget_exhausted';
        return snapshot();
      }
      if (missionIsComplete(state, mission)) {
        completeMission(state, mission);
        return snapshot();
      }

      try {
        occurrenceReceipt = evaluateOccurrences(occurrenceEngine, state.tick, eventHistory);
        worldModel.applyRuntimeEffects(occurrenceReceipt.effects);
        activeRoute = ensureRoute({ state, activeRoute, worldModel, mission, embodiment, policy, routeContributors, routeObjective });
        const observation = observations.buildObservation({ mission, state, route: activeRoute, worldModel, policyMemory, policy, featureCatalog, occurrenceReceipt });
        const proposals = proposer.proposeActionBets({ mission, observation, state, route: activeRoute, worldModel, embodiment, policy, policyMemory });
        const gatedRows = safety.gateActionBets({ proposals, state, route: activeRoute, worldModel, embodiment, mission, policy });
        const selection = selector.selectActionBet(gatedRows, policy);
        const beforeState = structuredClone(state);
        const transition = dynamics.simulateAction({
          state,
          action: selection.selected.bet.action,
          worldModel,
          embodiment,
          mission,
          policy,
        });
        const settlement = settlementApi.settleSelectedBet(selection.selected.bet, transition, policy, policyMemory);
        const violations = transitionViolations(selection.selected, transition, beforeState, worldModel, embodiment, mission, policy);
        const tick = state.tick;
        Object.assign(state, transition.state);
        const stopCompleted = recordOrderedStopProgress(state, transition, mission);
        const lapCompleted = recordCircuitProgress(state, beforeState, transition, mission);
        if (violations.length) {
          state.status = 'failed';
          state.terminalReason = 'safety_violation';
          state.violations.push(...violations);
        }
        if (transition.reachedNodeId && activeRoute.segmentIds[0] === transition.enteredSegmentId) {
          activeRoute = { ...activeRoute, segmentIds: activeRoute.segmentIds.slice(1) };
        }
        if (transition.reachedNodeId && !transition.enteredSegmentId && state.currentNodeId) {
          activeRoute = { ...activeRoute, segmentIds: activeRoute.segmentIds.slice(1) };
        }
        if (!violations.length && (transition.willComplete || missionIsComplete(state, mission))) completeMission(state, mission);
        const emittedEvents = transitionEvents({ transition, observation, mission, state, lapCompleted, stopCompleted });
        eventHistory.push(...emittedEvents);
        const tickReceipt = buildTickReceipt({ tick, observation, route: activeRoute, selection, transition, settlement, violations, state, emittedEvents, lapCompleted });
        if (state.currentSegmentId) state.routeReason = 'continued';
        const entry = await receipts.appendReceiptEntry(receiptChain, tickReceipt);
        if (typeof onTick === 'function') onTick({ entry, snapshot: snapshot() });
        return snapshot();
      } catch (error) {
        state.status = 'failed';
        state.terminalReason = error.code || 'runtime_failure';
        const failure = {
          schema: 'simulatte.autonomyFailureReceipt.v1',
          tick: state.tick,
          code: error.code || 'runtime_failure',
          message: error.message,
          evidence: error.evidence || null,
        };
        await receipts.appendReceiptEntry(receiptChain, failure);
        if (typeof onTick === 'function') onTick({ entry: receiptChain.entries.at(-1), snapshot: snapshot() });
        return snapshot();
      }
    }

    async function run(maximumTicks = policy.runtime.maximumTicks) {
      const stopAt = Math.min(policy.runtime.maximumTicks, state.tick + maximumTicks);
      while (state.status === 'active' && state.tick < stopAt) await step();
      if (state.status === 'active' && state.tick >= policy.runtime.maximumTicks) {
        state.status = 'failed';
        state.terminalReason = 'budget_exhausted';
      }
      return snapshot();
    }

    function snapshot() {
      return structuredClone({
        schema: 'simulatte.autonomyControllerSnapshot.v2',
        state,
        route: activeRoute,
        policyMemory,
        occurrenceReceipt,
        eventCount: eventHistory.length,
        traceEntryCount: receiptChain.entries.length,
        terminalHash: receiptChain.terminalHash,
        planning,
      });
    }

    async function journeyReceipt() {
      const integrityCheck = await receipts.verifyReceiptChain(receiptChain, { yieldEveryEntries: 8 });
      const verification = verifier.verifyJourney({ mission, state, receiptChain, worldModel, planning });
      verification.integrityPass = integrityCheck.pass;
      verification.pass = verification.pass && integrityCheck.pass;
      return {
        schema: 'simulatte.autonomyJourneyReceipt.v2',
        mission: structuredClone(mission),
        identities: {
          worldId: world.id,
          worldContentVersion: world.contentVersion,
          embodimentId: embodiment.id,
          policyId: policy.id,
          occurrenceCatalogId: occurrenceCatalog ? occurrenceCatalog.id : null,
          regionRegistryId: regionComposition ? regionComposition.registryId : null,
          regionCompositionId: regionComposition ? regionComposition.id : null,
          regionPackIds: regionComposition ? [...regionComposition.packIds] : [],
          circuitId: mission.task.type === 'loop' ? mission.task.circuitId : null,
          boundaryGeometrySha256: mission.grounding?.source?.geometryWgs84Sha256 || null,
          routeContributorIds: routeContributors.map((row) => row.id).sort(),
        },
        events: structuredClone(eventHistory),
        planning: structuredClone(planning),
        terminalState: state.terminalReason || state.status,
        finalState: structuredClone(state),
        settlement: buildJourneySettlement(mission, state, planning.forecast),
        trace: structuredClone(receiptChain.entries),
        verification,
        integrity: {
          algorithm: receiptChain.algorithm,
          terminalHash: receiptChain.terminalHash,
          entryCount: receiptChain.entries.length,
        },
      };
    }

    return {
      schema: 'simulatte.autonomyController.v1',
      step,
      run,
      snapshot,
      journeyReceipt,
      planning: () => structuredClone(planning),
      worldModel,
    };
  }

  function validateStaticInputs(world, featureCatalog, occurrenceCatalog) {
    const cached = staticValidationCache.get(world);
    if (cached?.featureCatalog === featureCatalog && cached?.occurrenceCatalog === occurrenceCatalog) return;
    contracts.validateFeatureCatalog(featureCatalog);
    contracts.validateWorld(world, featureCatalog);
    if (occurrenceCatalog) contracts.validateOccurrenceCatalog(occurrenceCatalog, world);
    staticValidationCache.set(world, { featureCatalog, occurrenceCatalog });
  }

  function initialState(mission, worldModel) {
    return {
      schema: 'simulatte.autonomyAgentState.v2',
      embodimentId: mission.embodimentId,
      embodimentKind: null,
      renderProfile: null,
      taskType: mission.task.type,
      terminationKind: mission.task.type === 'loop' ? mission.task.termination.kind : 'arrival',
      tick: 0,
      simulatedTimeSeconds: 0,
      currentNodeId: mission.originNodeId,
      currentSegmentId: null,
      segmentProgressM: 0,
      speedMps: 0,
      position: { ...worldModel.node(mission.originNodeId).position },
      status: 'active',
      terminalReason: null,
      payloadStatus: mission.task.type === 'delivery' ? 'loaded' : 'not_applicable',
      distanceTraveledM: 0,
      completedLaps: 0,
      remainingStopNodeIds: mission.task.type === 'loop' ? [] : [...mission.task.stopNodeIds],
      completedStopNodeIds: [],
      circuitSegmentsCompleted: 0,
      lastCompletedLapDistanceM: null,
      routeRevision: 0,
      routeReason: 'initial',
      violations: [],
    };
  }

  function ensureRoute({ state, activeRoute, worldModel, mission, embodiment, policy, routeContributors = [], routeObjective = {} }) {
    if (state.currentSegmentId && activeRoute) return activeRoute;
    if (mission.task.type === 'loop') {
      if (missionIsComplete(state, mission)) {
        state.routeReason = 'termination_target_reached';
        return emptyRoute('declared_closed_circuit_v1');
      }
      const planned = routePlanner.planCircuitRoute({
        worldModel,
        circuitId: mission.task.circuitId,
        currentNodeId: state.currentNodeId,
        mode: embodiment.mode,
        tick: state.tick,
        mission,
        policy,
      });
      state.routeReason = !activeRoute ? 'initial' : activeRoute.segmentIds.length ? 'continued' : 'lap_restart';
      return planned;
    }
    const targetNodeId = currentTargetNodeId(state, mission);
    if (!targetNodeId) {
      state.routeReason = 'at_destination';
      return emptyRoute();
    }
    const planned = routePlanner.planRoute({
      worldModel,
      originNodeId: state.currentNodeId,
      destinationNodeId: targetNodeId,
      mode: embodiment.mode,
      tick: state.tick,
      mission,
      policy,
      routeContributors,
      routeObjective,
    });
    if (!activeRoute) {
      state.routeReason = 'initial';
    } else if (sameRows(planned.segmentIds, activeRoute.segmentIds)) {
      state.routeReason = 'continued';
    } else {
      const blocked = new Set(worldModel.blockedSegmentIds(state.tick));
      state.routeReason = activeRoute.segmentIds.some((id) => blocked.has(id)) ? 'blocked_segment' : 'route_exhausted';
      state.routeRevision += 1;
    }
    return planned;
  }

  function transitionViolations(selected, transition, beforeState, worldModel, embodiment, mission, policy) {
    const violations = [];
    if (!selected.gate.accepted) violations.push(violation('gate_bypass', { betId: selected.bet.id }));
    if (transition.minimumClearanceM < policy.safety.minimumPedestrianClearanceM) {
      violations.push(violation('pedestrian_clearance', {
        minimumClearanceM: transition.minimumClearanceM,
        clearanceIsLowerBound: transition.clearanceIsLowerBound,
        requiredClearanceM: policy.safety.minimumPedestrianClearanceM,
        actorId: transition.closestActorId,
      }));
    }
    if (transition.enteredSegmentId) {
      const segment = worldModel.segment(transition.enteredSegmentId);
      const signal = worldModel.signalForEntry(beforeState.currentNodeId, transition.enteredSegmentId, beforeState.tick);
      if (signal && signal.state !== 'green') violations.push(violation('signal_compliance', { signalId: signal.id, state: signal.state }));
      if (worldModel.blockedSegmentIds(beforeState.tick).includes(segment.id)) violations.push(violation('blocked_segment_entry', { segmentId: segment.id }));
      if (!segment.allowedModes.includes(embodiment.mode)) violations.push(violation('mode_eligibility', { segmentId: segment.id, mode: embodiment.mode }));
    }
    const activeSegmentId = transition.state.currentSegmentId || transition.enteredSegmentId;
    if (activeSegmentId) {
      const segment = worldModel.segment(activeSegmentId);
      const maximum = Math.min(segment.speedLimitMps, embodiment.dynamics.maximumSpeedMps, mission.constraints.maximumSpeedMps);
      if (transition.endSpeedMps > maximum + policy.safety.maximumSpeedToleranceMps) {
        violations.push(violation('speed_limit', { speedMps: transition.endSpeedMps, maximumSpeedMps: maximum }));
      }
    }
    if (mission.constraints.daylightOnly) {
      const endLocalMinutes = mission.constraints.departureLocalMinutes + transition.state.simulatedTimeSeconds / 60;
      if (endLocalMinutes > mission.constraints.daylightWindowLocalMinutes[1] + 1e-9) {
        violations.push(violation('daylight_window', {
          endLocalMinutes: round(endLocalMinutes),
          sunsetLocalMinutes: mission.constraints.daylightWindowLocalMinutes[1],
        }));
      }
    }
    if (mission.constraints.maximumDurationSeconds !== null
      && transition.state.simulatedTimeSeconds > mission.constraints.maximumDurationSeconds + 1e-9) {
      violations.push(violation('arrival_deadline', {
        actualDurationSeconds: transition.state.simulatedTimeSeconds,
        maximumDurationSeconds: mission.constraints.maximumDurationSeconds,
      }));
    }
    return violations;
  }

  function departureInsideDaylightWindow(mission) {
    const [sunrise, sunset] = mission.constraints.daylightWindowLocalMinutes;
    const departure = mission.constraints.departureLocalMinutes;
    return departure >= sunrise && departure < sunset;
  }

  function buildTickReceipt({ tick, observation, route, selection, transition, settlement, violations, state, emittedEvents, lapCompleted }) {
    return {
      schema: 'simulatte.autonomyTickReceipt.v2',
      tick,
      observation,
      route: {
        schema: 'simulatte.autonomyRouteDecision.v1',
        segmentIds: observation.route.segmentIds,
        revision: observation.route.revision,
        reason: observation.route.reason,
      },
      bets: selection.rows.map((row) => ({ bet: row.bet, gate: row.gate, utility: row.utility, utilityBreakdown: row.utilityBreakdown })),
      selectedBetId: selection.selectedBetId,
      transition: {
        schema: transition.schema,
        startPosition: transition.startPosition,
        endPosition: transition.endPosition,
        progressDeltaM: transition.progressDeltaM,
        endSpeedMps: transition.endSpeedMps,
        minimumClearanceM: transition.minimumClearanceM,
        closestActorId: transition.closestActorId,
        enteredSegmentId: transition.enteredSegmentId,
        reachedNodeId: transition.reachedNodeId,
        willArrive: transition.willArrive,
        willComplete: transition.willComplete,
        completionReason: transition.completionReason,
      },
      lapCompleted,
      settlement,
      emittedEvents,
      violations,
      stateAfter: {
        tick: state.tick,
        status: state.status,
        currentNodeId: state.currentNodeId,
        currentSegmentId: state.currentSegmentId,
        position: { ...state.position },
        speedMps: state.speedMps,
        payloadStatus: state.payloadStatus,
        distanceTraveledM: state.distanceTraveledM,
        simulatedTimeSeconds: state.simulatedTimeSeconds,
        completedLaps: state.completedLaps,
        remainingStopNodeIds: [...state.remainingStopNodeIds],
        completedStopNodeIds: [...state.completedStopNodeIds],
        circuitSegmentsCompleted: state.circuitSegmentsCompleted,
      },
    };
  }

  function completeMission(state, mission) {
    state.status = 'completed';
    state.terminalReason = 'completed';
    state.speedMps = 0;
    if (mission.task.type === 'delivery') state.payloadStatus = 'delivered';
  }

  function buildJourneySettlement(mission, state, forecast = null) {
    const termination = mission.task.type === 'loop' ? mission.task.termination : null;
    const targetDistanceM = termination?.targetDistanceM ?? null;
    const targetLaps = termination?.targetLaps ?? null;
    const targetDurationSeconds = termination?.targetDurationSeconds ?? null;
    const distanceErrorM = targetDistanceM === null ? null : Number((state.distanceTraveledM - targetDistanceM).toFixed(9));
    const durationErrorSeconds = targetDurationSeconds === null ? null : Number((state.simulatedTimeSeconds - targetDurationSeconds).toFixed(9));
    const predictedDurationSeconds = forecast?.predictedDurationSeconds ?? null;
    const etaErrorSeconds = predictedDurationSeconds === null ? null : Number((state.simulatedTimeSeconds - predictedDurationSeconds).toFixed(9));
    const amountCents = mission.economics?.amountCents ?? null;
    const grossHourlyCents = amountCents === null || state.simulatedTimeSeconds <= 0 ? null : Math.round(amountCents * 3600 / state.simulatedTimeSeconds);
    return {
      schema: 'simulatte.autonomyJourneySettlement.v1',
      taskType: mission.task.type,
      terminationKind: termination?.kind || 'arrival',
      completionReason: state.status === 'completed'
        ? mission.task.type === 'loop' ? loopCompletionReason(mission) : 'destination_reached'
        : state.terminalReason || state.status,
      targetDistanceM,
      targetLaps,
      targetDurationSeconds,
      actualDistanceM: state.distanceTraveledM,
      actualDurationSeconds: state.simulatedTimeSeconds,
      distanceErrorM,
      durationErrorSeconds,
      exactTargetSettlement: mission.task.type !== 'loop'
        ? state.status === 'completed' && state.currentNodeId === mission.destinationNodeId
        : distanceErrorM === 0 || durationErrorSeconds === 0 || (targetLaps !== null && state.completedLaps === targetLaps),
      completedLaps: state.completedLaps,
      finalPartialDistanceM: mission.grounding?.finalPartialDistanceM ?? null,
      finalSegmentId: state.currentSegmentId,
      finalSegmentProgressM: state.segmentProgressM,
      boundaryGeometrySha256: mission.grounding?.source?.geometryWgs84Sha256 || null,
      predictedDurationSeconds,
      etaErrorSeconds,
      timing: {
        departureLocalMinutes: mission.constraints.departureLocalMinutes,
        arrivalLocalMinutes: round(mission.constraints.departureLocalMinutes + state.simulatedTimeSeconds / 60),
        arrivalDeadlineLocalMinutes: mission.constraints.arrivalDeadlineLocalMinutes,
        daylightOnly: mission.constraints.daylightOnly,
        daylightWindowLocalMinutes: [...mission.constraints.daylightWindowLocalMinutes],
      },
      orderedStops: mission.task.type === 'loop' ? null : {
        declaredStopNodeIds: [...mission.task.stopNodeIds],
        completedStopNodeIds: [...state.completedStopNodeIds],
        remainingStopNodeIds: [...state.remainingStopNodeIds],
      },
      economics: amountCents === null ? null : {
        schema: 'simulatte.journeyEconomicsSettlement.v1',
        currency: mission.economics.currency,
        declaredGrossAmountCents: amountCents,
        grossHourlyCents,
        simulatedPaidSeconds: state.simulatedTimeSeconds,
        excludedCosts: ['waiting_outside_journey', 'expenses', 'taxes', 'platform_deductions', 'unpaid_work'],
      },
    };
  }

  function buildJourneyPlanning({ worldModel, mission, embodiment, policy, routeContributors = [], routeObjective = {} }) {
    if (mission.task.type === 'loop') {
      const route = routePlanner.planCircuitRoute({
        worldModel, circuitId: mission.task.circuitId, currentNodeId: mission.originNodeId,
        mode: embodiment.mode, tick: 0, mission, policy,
      });
      const oneLap = routePlanner.forecastRoute(route, worldModel, mission);
      const targetDistanceM = mission.task.termination.targetDistanceM ?? oneLap.distanceM;
      const predictedDurationSeconds = mission.task.termination.kind === 'duration'
        ? mission.task.termination.targetDurationSeconds
        : targetDistanceM / Math.min(embodiment.dynamics.maximumSpeedMps, mission.constraints.maximumSpeedMps);
      return {
        schema: 'simulatte.autonomyJourneyPlanning.v1',
        forecast: { ...oneLap, distanceM: targetDistanceM, predictedDurationSeconds: round(predictedDurationSeconds) },
        alternatives: [],
        pluginAudits: evaluateSelectedRouteContributors(routeContributors, route, worldModel),
      };
    }
    const legAlternatives = [];
    let originNodeId = mission.originNodeId;
    mission.task.stopNodeIds.forEach((destinationNodeId, legIndex) => {
      const routes = routePlanner.planRouteAlternatives({
        worldModel, originNodeId, destinationNodeId, mode: embodiment.mode, tick: 0, mission, policy, routeContributors, routeObjective,
      }, 3);
      legAlternatives.push({ legIndex, originNodeId, destinationNodeId, routes });
      originNodeId = destinationNodeId;
    });
    const candidateLegSets = [legAlternatives.map((row) => row.routes[0])];
    for (let legIndex = 0; legIndex < legAlternatives.length && candidateLegSets.length < 3; legIndex += 1) {
      const alternative = legAlternatives[legIndex].routes[1];
      if (!alternative) continue;
      const rows = legAlternatives.map((row) => row.routes[0]);
      rows[legIndex] = alternative;
      candidateLegSets.push(rows);
    }
    const alternatives = candidateLegSets.map((legs, index) => combineJourneyLegs({ legs, legAlternatives, worldModel, mission, index }));
    const pluginAudits = evaluateSelectedRouteContributors(routeContributors, alternatives[0], worldModel);
    return {
      schema: 'simulatte.autonomyJourneyPlanning.v1',
      forecast: structuredClone(alternatives[0].forecast),
      alternatives,
      pluginAudits: structuredClone(pluginAudits),
    };
  }

  function evaluateSelectedRouteContributors(contributors, route, worldModel) {
    return Object.fromEntries([...contributors].sort((left, right) => left.id.localeCompare(right.id)).flatMap((contributor) => {
      if (typeof contributor.evaluateRoute !== 'function') return [];
      return [[contributor.pluginId, contributor.evaluateRoute({ route, worldModel })]];
    }));
  }

  function combineJourneyLegs({ legs, legAlternatives, worldModel, mission, index }) {
    const segmentIds = legs.flatMap((row) => row.segmentIds);
    const forecast = routePlanner.forecastRoute({ segmentIds }, worldModel, mission);
    const sums = legs.reduce((total, row) => {
      total.cost += row.cost;
      total.travel += row.costBreakdown.travel;
      total.risk += row.costBreakdown.risk;
      total.preference += row.costBreakdown.preference;
      total.pluginWeighted += row.costBreakdown.pluginWeighted || 0;
      Object.entries(row.costBreakdown.pluginDimensions || {}).forEach(([id, value]) => { total.pluginDimensions[id] = (total.pluginDimensions[id] || 0) + value; });
      total.evaluated += row.evaluatedSegmentCount;
      return total;
    }, { cost: 0, travel: 0, risk: 0, preference: 0, pluginWeighted: 0, pluginDimensions: {}, evaluated: 0 });
    return {
      schema: 'simulatte.autonomyJourneyRoutePlan.v1',
      alternativeRank: index + 1,
      alternativeKind: index === 0 ? 'baseline' : 'single_leg_deviation',
      algorithm: legs.length === 1 ? legs[0].algorithm || null : 'governed_multi_leg_route_v1',
      environmentFieldId: legs.length === 1 ? legs[0].environmentFieldId || null : null,
      environmentSelectionId: legs.length === 1 ? legs[0].environmentSelectionId || null : null,
      segmentIds,
      cost: round(sums.cost),
      evaluatedSegmentCount: sums.evaluated,
      costBreakdown: {
        travel: round(sums.travel), risk: round(sums.risk), preference: round(sums.preference), pluginWeighted: round(sums.pluginWeighted), pluginDimensions: Object.fromEntries(Object.entries(sums.pluginDimensions).sort().map(([id, value]) => [id, round(value)])), total: round(sums.travel + sums.risk + sums.preference + sums.pluginWeighted),
        formula: 'sum(leg core costs + leg plugin weighted costs)',
        weights: structuredClone(legs[0].costBreakdown.weights),
      },
      forecast,
      legs: legs.map((row, legIndex) => ({
        legNumber: legIndex + 1,
        originNodeId: legAlternatives[legIndex].originNodeId,
        destinationNodeId: legAlternatives[legIndex].destinationNodeId,
        segmentIds: [...row.segmentIds],
        forecast: structuredClone(row.forecast),
      })),
    };
  }

  function emptyRoute(algorithm = 'a_star_v1') {
    return {
      schema: 'simulatte.autonomyRoutePlan.v2',
      algorithm,
      segmentIds: [],
      cost: 0,
      visitedNodeIds: [],
      evaluatedSegmentCount: 0,
      costBreakdown: {
        travel: 0,
        risk: 0,
        preference: 0,
        pluginDimensions: {},
        pluginWeighted: 0,
        total: 0,
        formula: 'core costs + declared plugin dimensions',
        weights: { travelWeight: 0, riskWeight: 0, unprotectedPreferencePenalty: 0 },
      },
      deterministicTieBreak: algorithm === 'a_star_v1' ? 'segment_id_ascending' : 'declared_circuit_order',
      avoidedStreetNames: [],
      excludedStreetSegmentIds: [],
      pluginRejections: [],
    };
  }

  function evaluateOccurrences(engine, tick, events) {
    if (engine) return engine.evaluate({ tick, events });
    return {
      schema: 'simulatte.autonomyOccurrenceReceipt.v1',
      catalogId: null,
      tick,
      eventCount: events.length,
      activePatternIds: [],
      evaluations: [],
      effects: { signalStates: [], actorStates: [], activeActorIds: [], controlledActorIds: [], blockedSegmentIds: [], annotations: [] },
      conflicts: [],
      resolutionRule: 'no_occurrence_catalog',
    };
  }

  function transitionEvents({ transition, observation, mission, state, lapCompleted = null, stopCompleted = null }) {
    const rows = [];
    const tick = state.tick;
    if (transition.enteredSegmentId) rows.push(['segment_entered', transition.enteredSegmentId, { routeRevision: observation.route.revision }]);
    if (transition.reachedNodeId) rows.push(['node_reached', transition.reachedNodeId, { enteredSegmentId: transition.enteredSegmentId }]);
    if (['blocked_segment', 'route_exhausted'].includes(observation.route.reason)) {
      rows.push(['route_revised', transition.enteredSegmentId || state.currentSegmentId, { reason: observation.route.reason, revision: observation.route.revision }]);
    }
    if (lapCompleted) rows.push(['lap_completed', mission.task.circuitId, structuredClone(lapCompleted)]);
    if (stopCompleted) rows.push(['ordered_stop_completed', stopCompleted.nodeId, structuredClone(stopCompleted)]);
    if (transition.willComplete) rows.push(['mission_completed', mission.id, {
      completionReason: transition.completionReason,
      destinationNodeId: mission.destinationNodeId,
      terminationKind: mission.task.type === 'loop' ? mission.task.termination.kind : 'arrival',
      targetDistanceM: mission.task.type === 'loop' ? mission.task.termination.targetDistanceM ?? null : null,
      targetLaps: mission.task.type === 'loop' ? mission.task.termination.targetLaps ?? null : null,
      targetDurationSeconds: mission.task.type === 'loop' ? mission.task.termination.targetDurationSeconds ?? null : null,
      distanceTraveledM: state.distanceTraveledM,
      simulatedTimeSeconds: state.simulatedTimeSeconds,
    }]);
    return rows.map(([kind, sourceId, evidence], sequence) => occurrences.eventRow({ tick, kind, sourceId, evidence, sequence }));
  }

  function sameRows(left, right) {
    return left.length === right.length && left.every((row, index) => row === right[index]);
  }

  function violation(kind, evidence) {
    return { schema: 'simulatte.autonomyViolation.v1', kind, evidence };
  }

  function missionIsComplete(state, mission) {
    if (mission.task.type === 'loop') {
      const termination = mission.task.termination;
      return termination.kind === 'duration'
        ? state.simulatedTimeSeconds >= termination.targetDurationSeconds - 1e-9
        : state.distanceTraveledM >= termination.targetDistanceM - 1e-9;
    }
    return state.remainingStopNodeIds.length === 0 && state.currentNodeId === mission.destinationNodeId && !state.currentSegmentId;
  }

  function currentTargetNodeId(state, mission) {
    return mission.task.type === 'loop' ? null : state.remainingStopNodeIds[0] || null;
  }

  function recordOrderedStopProgress(state, transition, mission) {
    if (mission.task.type === 'loop' || !transition.reachedNodeId || state.remainingStopNodeIds[0] !== transition.reachedNodeId) return null;
    const nodeId = state.remainingStopNodeIds.shift();
    state.completedStopNodeIds.push(nodeId);
    return {
      schema: 'simulatte.autonomyOrderedStopReceipt.v1',
      nodeId,
      stopNumber: state.completedStopNodeIds.length,
      totalStops: mission.task.stopNodeIds.length,
      finalStop: state.remainingStopNodeIds.length === 0,
      distanceTraveledM: state.distanceTraveledM,
      simulatedTimeSeconds: state.simulatedTimeSeconds,
    };
  }

  function recordCircuitProgress(state, beforeState, transition, mission) {
    if (mission.task.type !== 'loop' || !transition.reachedNodeId) return null;
    const traversedSegmentId = beforeState.currentSegmentId || transition.enteredSegmentId;
    const expectedSegmentId = mission.grounding.segmentIds[state.circuitSegmentsCompleted];
    if (traversedSegmentId !== expectedSegmentId) return null;
    state.circuitSegmentsCompleted += 1;
    if (state.circuitSegmentsCompleted < mission.grounding.segmentIds.length) return null;
    state.completedLaps += 1;
    state.circuitSegmentsCompleted = 0;
    state.lastCompletedLapDistanceM = mission.grounding.circuitLengthM;
    return {
      schema: 'simulatte.autonomyLapReceipt.v1',
      circuitId: mission.task.circuitId,
      lapNumber: state.completedLaps,
      circuitLengthM: mission.grounding.circuitLengthM,
      lapDistanceM: mission.grounding.circuitLengthM,
      cumulativeDistanceM: state.distanceTraveledM,
      segmentIds: [...mission.grounding.segmentIds],
      boundaryGeometrySha256: mission.grounding.source.geometryWgs84Sha256,
    };
  }

  function loopCompletionReason(mission) {
    const kind = mission.task.termination.kind;
    return kind === 'distance' ? 'distance_target_reached' : kind === 'laps' ? 'lap_target_reached' : 'duration_target_reached';
  }

  function round(value) {
    return Number(Number(value).toFixed(9));
  }

  return { buildJourneyPlanning, buildJourneySettlement, createAutonomyController, currentTargetNodeId, evaluateOccurrences, initialState, ensureRoute, loopCompletionReason, missionIsComplete, recordCircuitProgress, recordOrderedStopProgress, transitionEvents, transitionViolations };
});
