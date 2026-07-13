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
  function createAutonomyController({ world, featureCatalog, occurrenceCatalog = null, embodiment, policy, mission, regionComposition = null, onTick = null }) {
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
    const occurrenceEngine = occurrenceCatalog ? occurrences.createOccurrenceEngine(occurrenceCatalog) : null;
    const eventHistory = [occurrences.eventRow({ tick: 0, kind: 'mission_started', sourceId: mission.id })];
    let occurrenceReceipt = evaluateOccurrences(occurrenceEngine, state.tick, eventHistory);
    worldModel.applyRuntimeEffects(occurrenceReceipt.effects);
    let activeRoute = null;

    async function step() {
      if (state.status !== 'active') return snapshot();
      if (state.tick >= policy.runtime.maximumTicks) {
        state.status = 'failed';
        state.terminalReason = 'budget_exhausted';
        return snapshot();
      }
      if (state.currentNodeId === mission.destinationNodeId && !state.currentSegmentId) {
        completeMission(state);
        return snapshot();
      }

      try {
        occurrenceReceipt = evaluateOccurrences(occurrenceEngine, state.tick, eventHistory);
        worldModel.applyRuntimeEffects(occurrenceReceipt.effects);
        activeRoute = ensureRoute({ state, activeRoute, worldModel, mission, embodiment, policy });
        const observation = observations.buildObservation({ mission, state, route: activeRoute, worldModel, policyMemory, policy, featureCatalog, occurrenceReceipt });
        const proposals = proposer.proposeActionBets({ mission, observation, state, route: activeRoute, worldModel, embodiment, policy, policyMemory });
        const gatedRows = safety.gateActionBets({ proposals, state, route: activeRoute, worldModel, embodiment, mission, policy });
        const selection = selector.selectActionBet(gatedRows, policy);
        const transition = dynamics.simulateAction({
          state,
          action: selection.selected.bet.action,
          worldModel,
          embodiment,
          mission,
          policy,
        });
        const settlement = settlementApi.settleSelectedBet(selection.selected.bet, transition, policy, policyMemory);
        const violations = transitionViolations(selection.selected, transition, state, worldModel, embodiment, mission, policy);
        const tick = state.tick;
        Object.assign(state, transition.state);
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
        if (transition.willArrive) completeMission(state);
        const emittedEvents = transitionEvents({ transition, observation, mission, state });
        eventHistory.push(...emittedEvents);
        const tickReceipt = buildTickReceipt({ tick, observation, route: activeRoute, selection, transition, settlement, violations, state, emittedEvents });
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
        schema: 'simulatte.autonomyControllerSnapshot.v1',
        state,
        route: activeRoute,
        policyMemory,
        occurrenceReceipt,
        eventCount: eventHistory.length,
        traceEntryCount: receiptChain.entries.length,
        terminalHash: receiptChain.terminalHash,
      });
    }

    async function journeyReceipt() {
      const integrityCheck = await receipts.verifyReceiptChain(receiptChain);
      const verification = verifier.verifyJourney({ mission, state, receiptChain, worldModel });
      verification.integrityPass = integrityCheck.pass;
      verification.pass = verification.pass && integrityCheck.pass;
      return {
        schema: 'simulatte.autonomyJourneyReceipt.v1',
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
        },
        events: structuredClone(eventHistory),
        terminalState: state.terminalReason || state.status,
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
      worldModel,
    };
  }

  function initialState(mission, worldModel) {
    return {
      schema: 'simulatte.autonomyAgentState.v1',
      tick: 0,
      simulatedTimeSeconds: 0,
      currentNodeId: mission.originNodeId,
      currentSegmentId: null,
      segmentProgressM: 0,
      speedMps: 0,
      position: { ...worldModel.node(mission.originNodeId).position },
      status: 'active',
      terminalReason: null,
      payloadStatus: 'loaded',
      distanceTraveledM: 0,
      routeRevision: 0,
      routeReason: 'initial',
      violations: [],
    };
  }

  function ensureRoute({ state, activeRoute, worldModel, mission, embodiment, policy }) {
    if (state.currentSegmentId && activeRoute) return activeRoute;
    if (state.currentNodeId === mission.destinationNodeId) {
      state.routeReason = 'at_destination';
      return emptyRoute();
    }
    const planned = routePlanner.planRoute({
      worldModel,
      originNodeId: state.currentNodeId,
      destinationNodeId: mission.destinationNodeId,
      mode: embodiment.mode,
      tick: state.tick,
      mission,
      policy,
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
    return violations;
  }

  function buildTickReceipt({ tick, observation, route, selection, transition, settlement, violations, state, emittedEvents }) {
    return {
      schema: 'simulatte.autonomyTickReceipt.v1',
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
      },
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
      },
    };
  }

  function completeMission(state) {
    state.status = 'completed';
    state.terminalReason = 'completed';
    state.payloadStatus = 'delivered';
  }

  function emptyRoute() {
    return {
      schema: 'simulatte.autonomyRoutePlan.v1',
      algorithm: 'a_star_v1',
      segmentIds: [],
      cost: 0,
      visitedNodeIds: [],
      evaluatedSegmentCount: 0,
      costBreakdown: {
        travel: 0,
        risk: 0,
        preference: 0,
        total: 0,
        formula: 'travel + risk + preference',
        weights: { travelWeight: 0, riskWeight: 0, unprotectedPreferencePenalty: 0 },
      },
      deterministicTieBreak: 'segment_id_ascending',
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

  function transitionEvents({ transition, observation, mission, state }) {
    const rows = [];
    const tick = state.tick;
    if (transition.enteredSegmentId) rows.push(['segment_entered', transition.enteredSegmentId, { routeRevision: observation.route.revision }]);
    if (transition.reachedNodeId) rows.push(['node_reached', transition.reachedNodeId, { enteredSegmentId: transition.enteredSegmentId }]);
    if (['blocked_segment', 'route_exhausted'].includes(observation.route.reason)) {
      rows.push(['route_revised', transition.enteredSegmentId || state.currentSegmentId, { reason: observation.route.reason, revision: observation.route.revision }]);
    }
    if (transition.willArrive) rows.push(['mission_completed', mission.id, { destinationNodeId: mission.destinationNodeId }]);
    return rows.map(([kind, sourceId, evidence], sequence) => occurrences.eventRow({ tick, kind, sourceId, evidence, sequence }));
  }

  function sameRows(left, right) {
    return left.length === right.length && left.every((row, index) => row === right[index]);
  }

  function violation(kind, evidence) {
    return { schema: 'simulatte.autonomyViolation.v1', kind, evidence };
  }

  return { createAutonomyController, evaluateOccurrences, initialState, ensureRoute, transitionEvents, transitionViolations };
});
