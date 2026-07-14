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
  const accessibility = typeof module === 'object' && module.exports
    ? require('../world/accessibility-audit.js')
    : root.SimulatteAccessibilityAudit;
  const api = factory(contracts, worldApi, routePlanner, observations, occurrences, proposer, safety, selector, dynamics, settlementApi, receipts, verifier, accessibility);
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
  verifier,
  accessibility
) {
  function createAutonomyController({ world, featureCatalog, occurrenceCatalog = null, accessibilityIndex = null, routeAmenityIndex = null, safetyHistoryIndex = null, embodiment, policy, mission, regionComposition = null, onTick = null }) {
    contracts.validateFeatureCatalog(featureCatalog);
    contracts.validateWorld(world, featureCatalog);
    if (occurrenceCatalog) contracts.validateOccurrenceCatalog(occurrenceCatalog, world);
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
    const planning = buildJourneyPlanning({ worldModel, mission, embodiment, policy, accessibilityIndex, routeAmenityIndex, safetyHistoryIndex });
    if (mission.constraints.accessibilityProfile && planning.accessibility.verdict !== 'supported') {
      state.status = 'failed';
      state.terminalReason = 'accessibility_route_not_supported';
    } else if (mission.constraints.daylightOnly && !departureInsideDaylightWindow(mission)) {
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
        activeRoute = ensureRoute({ state, activeRoute, worldModel, mission, embodiment, policy, routeAmenityIndex, safetyHistoryIndex });
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
      const integrityCheck = await receipts.verifyReceiptChain(receiptChain);
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
          safetyHistoryIndexId: safetyHistoryIndex?.id || null,
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

  function ensureRoute({ state, activeRoute, worldModel, mission, embodiment, policy, routeAmenityIndex = null, safetyHistoryIndex = null }) {
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
      routeAmenityIndex,
      safetyHistoryIndex,
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

  function buildJourneyPlanning({ worldModel, mission, embodiment, policy, accessibilityIndex = null, routeAmenityIndex = null, safetyHistoryIndex = null }) {
    if (mission.task.type === 'loop') {
      const route = routePlanner.planCircuitRoute({
        worldModel, circuitId: mission.task.circuitId, currentNodeId: mission.originNodeId,
        mode: embodiment.mode, tick: 0, mission, policy,
      });
      const oneLap = routePlanner.forecastRoute(route, worldModel, mission, safetyHistoryIndex);
      const targetDistanceM = mission.task.termination.targetDistanceM ?? oneLap.distanceM;
      const predictedDurationSeconds = mission.task.termination.kind === 'duration'
        ? mission.task.termination.targetDurationSeconds
        : targetDistanceM / Math.min(embodiment.dynamics.maximumSpeedMps, mission.constraints.maximumSpeedMps);
      return {
        schema: 'simulatte.autonomyJourneyPlanning.v1',
        forecast: { ...oneLap, distanceM: targetDistanceM, predictedDurationSeconds: round(predictedDurationSeconds) },
        alternatives: [],
        accessibility: routeAccessibility({ route, worldModel, accessibilityIndex, mission }),
        amenities: routeAmenityAudit({ route, routeAmenityIndex, mission }),
        safetyHistory: routeSafetyHistoryAudit({ route, safetyHistoryIndex, policy }),
      };
    }
    const legAlternatives = [];
    let originNodeId = mission.originNodeId;
    mission.task.stopNodeIds.forEach((destinationNodeId, legIndex) => {
      const routes = routePlanner.planRouteAlternatives({
        worldModel, originNodeId, destinationNodeId, mode: embodiment.mode, tick: 0, mission, policy, routeAmenityIndex, safetyHistoryIndex,
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
    const alternatives = candidateLegSets.map((legs, index) => combineJourneyLegs({ legs, legAlternatives, worldModel, mission, safetyHistoryIndex, index })).map((route) => ({
      ...route,
      accessibility: routeAccessibility({ route, worldModel, accessibilityIndex, mission }),
      amenities: routeAmenityAudit({ route, routeAmenityIndex, mission }),
      safetyHistory: routeSafetyHistoryAudit({ route, safetyHistoryIndex, policy }),
    }));
    return {
      schema: 'simulatte.autonomyJourneyPlanning.v1',
      forecast: structuredClone(alternatives[0].forecast),
      alternatives,
      accessibility: structuredClone(alternatives[0].accessibility),
      amenities: structuredClone(alternatives[0].amenities),
      safetyHistory: structuredClone(alternatives[0].safetyHistory),
    };
  }

  function combineJourneyLegs({ legs, legAlternatives, worldModel, mission, safetyHistoryIndex, index }) {
    const segmentIds = legs.flatMap((row) => row.segmentIds);
    const forecast = routePlanner.forecastRoute({ segmentIds }, worldModel, mission, safetyHistoryIndex);
    const sums = legs.reduce((total, row) => {
      total.cost += row.cost;
      total.travel += row.costBreakdown.travel;
      total.risk += row.costBreakdown.risk;
      total.historical += row.costBreakdown.historical || 0;
      total.preference += row.costBreakdown.preference;
      total.evaluated += row.evaluatedSegmentCount;
      return total;
    }, { cost: 0, travel: 0, risk: 0, historical: 0, preference: 0, evaluated: 0 });
    return {
      schema: 'simulatte.autonomyJourneyRoutePlan.v1',
      alternativeRank: index + 1,
      alternativeKind: index === 0 ? 'baseline' : 'single_leg_deviation',
      segmentIds,
      cost: round(sums.cost),
      evaluatedSegmentCount: sums.evaluated,
      costBreakdown: {
        travel: round(sums.travel), risk: round(sums.risk), historical: round(sums.historical), preference: round(sums.preference), total: round(sums.travel + sums.risk + sums.historical + sums.preference),
        formula: 'sum(leg.travel + leg.risk + leg.historical + leg.preference)',
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

  function routeAccessibility({ route, worldModel, accessibilityIndex, mission }) {
    return {
      ...accessibility.auditRouteAccessibility({ route, worldModel, index: accessibilityIndex }),
      requestedProfile: mission.constraints.accessibilityProfile,
      enforced: mission.constraints.accessibilityProfile !== null,
    };
  }

  function routeAmenityAudit({ route, routeAmenityIndex, mission }) {
    const maximumDistanceM = mission.constraints.maximumBikeRackDistanceM;
    if (maximumDistanceM === null) {
      return {
        schema: 'simulatte.autonomyRouteAmenityAudit.v1',
        status: 'not_requested',
        requestedMaximumDistanceM: null,
        pass: true,
        claimBoundary: routeAmenityIndex?.claimBoundary || 'No bicycle-parking proximity claim was requested.',
      };
    }
    if (!routeAmenityIndex) {
      return {
        schema: 'simulatte.autonomyRouteAmenityAudit.v1', status: 'unavailable', requestedMaximumDistanceM: maximumDistanceM,
        pass: false, failure: 'route_amenity_index_not_loaded', claimBoundary: 'No proximity claim is available without a pinned amenity index.',
      };
    }
    const rowsById = new Map(routeAmenityIndex.segmentRows.map((row) => [row.segmentId, row]));
    const routeRows = route.segmentIds.map((id) => rowsById.get(id) || { segmentId: id, maximumNearestRackDistanceM: null, limitingRackId: null });
    const failures = routeRows.filter((row) => row.maximumNearestRackDistanceM === null || row.maximumNearestRackDistanceM > maximumDistanceM);
    const limiting = routeRows.filter((row) => Number.isFinite(row.maximumNearestRackDistanceM))
      .sort((left, right) => right.maximumNearestRackDistanceM - left.maximumNearestRackDistanceM || left.segmentId.localeCompare(right.segmentId))[0] || null;
    return {
      schema: 'simulatte.autonomyRouteAmenityAudit.v1',
      status: failures.length ? 'blocked' : 'supported',
      requestedMaximumDistanceM: maximumDistanceM,
      pass: failures.length === 0,
      routeSegmentCount: routeRows.length,
      maximumObservedDistanceM: limiting?.maximumNearestRackDistanceM ?? null,
      limitingSegmentId: limiting?.segmentId || null,
      limitingRackId: limiting?.limitingRackId || null,
      failedSegmentIds: failures.slice(0, 40).map((row) => row.segmentId),
      identities: { indexId: routeAmenityIndex.id, sourceReceiptSha256: routeAmenityIndex.source.sourceReceiptSha256 },
      claimBoundary: routeAmenityIndex.claimBoundary,
    };
  }

  function routeSafetyHistoryAudit({ route, safetyHistoryIndex, policy }) {
    if (!safetyHistoryIndex) {
      return {
        schema: 'simulatte.autonomyRouteSafetyHistoryAudit.v1', status: 'unavailable', appliedToSelection: false,
        crashCount: null, injuryCount: null, fatalityCount: null, historicalObservationScore: null,
        claimBoundary: 'No historical crash comparison is available without a pinned safety-history index.',
      };
    }
    const rowsById = new Map(safetyHistoryIndex.segmentRows.map((row) => [row.segmentId, row]));
    const physicalRows = new Map();
    route.segmentIds.forEach((segmentId) => {
      const row = rowsById.get(segmentId);
      if (row && !physicalRows.has(row.physicalKey)) physicalRows.set(row.physicalKey, row);
    });
    const rows = [...physicalRows.values()];
    return {
      schema: 'simulatte.autonomyRouteSafetyHistoryAudit.v1',
      status: 'observed_history_joined',
      appliedToSelection: (policy.route.historicalObservationWeight || 0) > 0,
      historicalObservationWeight: policy.route.historicalObservationWeight || 0,
      crashCount: rows.reduce((sum, row) => sum + row.crashCount, 0),
      injuryCount: rows.reduce((sum, row) => sum + row.injuryCount, 0),
      fatalityCount: rows.reduce((sum, row) => sum + row.fatalityCount, 0),
      historicalObservationScore: rows.reduce((sum, row) => sum + row.historicalObservationScore, 0),
      physicalSegmentsWithHistory: rows.length,
      identities: { indexId: safetyHistoryIndex.id, sourceReceiptSha256: safetyHistoryIndex.source.sourceReceiptSha256 },
      claimBoundary: safetyHistoryIndex.claimBoundary,
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
        historical: 0,
        preference: 0,
        total: 0,
        formula: 'travel + risk + historical + preference',
        weights: { travelWeight: 0, riskWeight: 0, historicalObservationWeight: 0, unprotectedPreferencePenalty: 0 },
      },
      deterministicTieBreak: algorithm === 'a_star_v1' ? 'segment_id_ascending' : 'declared_circuit_order',
      avoidedStreetNames: [],
      excludedStreetSegmentIds: [],
      excludedAmenitySegmentIds: [],
      maximumBikeRackDistanceM: null,
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

  return { buildJourneyPlanning, buildJourneySettlement, createAutonomyController, currentTargetNodeId, evaluateOccurrences, initialState, ensureRoute, loopCompletionReason, missionIsComplete, recordCircuitProgress, recordOrderedStopProgress, routeAmenityAudit, routeSafetyHistoryAudit, transitionEvents, transitionViolations };
});
