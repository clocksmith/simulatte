(function attachAutonomyBetProposer(root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('../contracts/contract-validator.js')
    : root.SimulatteAutonomyContracts;
  const dynamics = typeof module === 'object' && module.exports
    ? require('./reference-dynamics.js')
    : root.SimulatteAutonomyDynamics;
  const api = factory(contracts, dynamics);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyBetProposer = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyBetProposer(contracts, dynamics) {
  function proposeActionBets({ mission, observation, state, route, worldModel, embodiment, policy, policyMemory }) {
    const actions = candidateActions({ state, route, worldModel, embodiment, mission });
    if (actions.length > policy.runtime.maximumCandidatesPerTick) {
      throw new Error(`simulatte.autonomyPolicy.v1 allowed ${policy.runtime.maximumCandidatesPerTick} candidates, proposer produced ${actions.length}`);
    }
    return actions.map((action, index) => {
      const transition = dynamics.simulateAction({ state, action, worldModel, embodiment, mission, policy });
      const lookahead = simulateSafetyLookahead({ state, action, worldModel, embodiment, mission, policy });
      const confidence = maneuverConfidence(action.maneuver, policyMemory, policy);
      const units = Math.max(0.01, transition.progressDeltaM * confidence + (transition.willComplete ? 5 : 0));
      const bet = {
        schema: 'simulatte.autonomyActionBet.v2',
        id: `${mission.id}:${observation.tick}:${String(index).padStart(2, '0')}:${action.maneuver}`,
        missionId: mission.id,
        tick: observation.tick,
        policyId: policy.id,
        action,
        horizonTicks: policy.rollout.horizonTicks,
        prediction: {
          endPosition: transition.endPosition,
          endSpeedMps: transition.endSpeedMps,
          progressDeltaM: transition.progressDeltaM,
          minimumClearanceM: transition.minimumClearanceM,
          clearanceIsLowerBound: transition.clearanceIsLowerBound,
          willReachNode: transition.willReachNode,
          willArrive: transition.willArrive,
          willComplete: transition.willComplete,
          completionReason: transition.completionReason,
        },
        confidence,
        scoreStake: { units: round(units), kind: 'nonfinancial_policy_score' },
        evidence: {
          observationTick: observation.tick,
          routeRevision: observation.route.revision,
          modelKind: 'deterministic_reference_rollout',
        },
        status: 'proposed',
      };
      contracts.validateBet(bet);
      return { bet, transition, lookahead };
    });
  }

  function simulateSafetyLookahead({ state, action, worldModel, embodiment, mission, policy }) {
    const transitions = [];
    let cursor = structuredClone(state);
    let cursorAction = action;
    for (let index = 0; index < policy.safety.lookaheadTicks; index += 1) {
      const transition = dynamics.simulateAction({ state: cursor, action: cursorAction, worldModel, embodiment, mission, policy });
      transitions.push(transition);
      cursor = transition.state;
      cursorAction = followAction(action, cursor, embodiment);
      if (cursor.status !== 'active') break;
    }
    return {
      tickCount: transitions.length,
      minimumClearanceM: round(Math.min(...transitions.map((row) => row.minimumClearanceM))),
      clearanceIsLowerBound: transitions.every((row) => row.clearanceIsLowerBound),
      maximumSpeedMps: round(Math.max(...transitions.map((row) => row.endSpeedMps))),
      endPosition: transitions.at(-1).endPosition,
    };
  }

  function followAction(action, state, embodiment) {
    if (['wait', 'yield', 'emergency_stop'].includes(action.maneuver)) {
      const deceleration = action.maneuver === 'emergency_stop'
        ? embodiment.dynamics.emergencyDecelerationMps2
        : action.maneuver === 'yield'
          ? embodiment.dynamics.comfortableDecelerationMps2
          : state.speedMps / embodiment.dynamics.integrationStepSeconds;
      return actionForFollowup(action.maneuver, -deceleration);
    }
    return actionForFollowup(action.maneuver, 0);
  }

  function actionForFollowup(maneuver, accelerationMps2) {
    return { maneuver, accelerationMps2: round(accelerationMps2), targetSegmentId: null };
  }

  function candidateActions({ state, route, worldModel, embodiment, mission }) {
    const dynamicsConfig = embodiment.dynamics;
    const targetSegmentId = state.currentSegmentId ? null : route.segmentIds[0] || null;
    const targetSegment = state.currentSegmentId
      ? worldModel.segment(state.currentSegmentId)
      : targetSegmentId ? worldModel.segment(targetSegmentId) : null;
    const governedMaximum = targetSegment
      ? Math.min(targetSegment.speedLimitMps, mission.constraints.maximumSpeedMps, dynamicsConfig.maximumSpeedMps)
      : Math.min(mission.constraints.maximumSpeedMps, dynamicsConfig.maximumSpeedMps);
    const remainingAccelerationMps2 = Math.max(0, (governedMaximum - state.speedMps) / dynamicsConfig.integrationStepSeconds);
    const proceedAcceleration = Math.min(dynamicsConfig.normalAccelerationMps2, remainingAccelerationMps2);
    const strongAcceleration = Math.min(dynamicsConfig.strongAccelerationMps2, remainingAccelerationMps2);
    const rows = [
      action('emergency_stop', -dynamicsConfig.emergencyDecelerationMps2, null),
      action('yield', -dynamicsConfig.comfortableDecelerationMps2, null),
    ];
    if (!state.currentSegmentId) rows.splice(1, 0, action('wait', -state.speedMps / dynamicsConfig.integrationStepSeconds, null));
    if (state.currentSegmentId || targetSegmentId) {
      rows.push(action('proceed', proceedAcceleration, targetSegmentId));
      rows.push(action('accelerate', strongAcceleration, targetSegmentId));
    }
    if (!state.currentSegmentId && targetSegmentId && state.routeReason === 'blocked_segment') {
      rows.push(action('reroute', proceedAcceleration, targetSegmentId));
    }
    return rows;
  }

  function action(maneuver, accelerationMps2, targetSegmentId) {
    return { maneuver, accelerationMps2: round(accelerationMps2), targetSegmentId };
  }

  function maneuverConfidence(maneuver, memory, policy) {
    const row = memory.calibrationByManeuver[maneuver] || { wins: 0, trials: 0 };
    const confidence = (policy.confidence.priorWins + row.wins) / (policy.confidence.priorTrials + row.trials);
    return round(Math.max(policy.confidence.minimum, Math.min(policy.confidence.maximum, confidence)));
  }

  function round(value) {
    return Number(value.toFixed(9));
  }

  return { proposeActionBets, candidateActions, maneuverConfidence, simulateSafetyLookahead };
});
