(function attachAutonomyBetSelector(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyBetSelector = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyBetSelector() {
  function selectActionBet(gatedRows, policy) {
    const approach = policy.selection.approach;
    const scored = gatedRows.map((row) => {
      const utilityBreakdown = row.gate.accepted ? utilityComponents(row.bet, policy, approach) : null;
      return { ...row, utility: utilityBreakdown ? utilityBreakdown.total : null, utilityBreakdown };
    });
    const eligible = scored.filter((row) => row.gate.accepted);
    if (!eligible.length) {
      const error = new Error('no_safe_action: all proposed action bets failed a hard safety gate');
      error.name = 'AutonomySelectionError';
      error.code = 'no_safe_action';
      error.evidence = scored.map((row) => ({ betId: row.bet.id, blockingCheckIds: row.gate.blockingCheckIds }));
      throw error;
    }
    const selectedId = chooseEligible(eligible, policy).bet.id;
    const rows = scored.map((row) => ({
      ...row,
      bet: {
        ...row.bet,
        status: row.bet.id === selectedId ? 'selected' : row.gate.accepted ? 'not_executed' : 'rejected',
      },
    }));
    const selected = rows.find((row) => row.bet.id === selectedId);
    return {
      schema: 'simulatte.autonomyBetSelection.v1',
      selectedBetId: selectedId,
      selectedUtility: selected.utility,
      approach,
      eligibleBetIds: eligible.map((row) => row.bet.id),
      rejectedBetIds: rows.filter((row) => !row.gate.accepted).map((row) => row.bet.id),
      deterministicTieBreak: 'bet_id_ascending',
      rows,
      selected,
    };
  }

  function chooseEligible(eligible, policy) {
    const ordered = [...eligible].sort((left, right) => right.utility - left.utility || left.bet.id.localeCompare(right.bet.id));
    if (policy.selection.approach !== 'seeded_eligible') return ordered[0];
    const byId = [...eligible].sort((left, right) => left.bet.id.localeCompare(right.bet.id));
    const tick = byId[0].bet.tick;
    const index = hash32(`${policy.selection.seed}:${tick}:${byId.map((row) => row.bet.id).join('|')}`) % byId.length;
    return byId[index];
  }

  function utilityForApproach(bet, policy, approach) {
    return utilityComponents(bet, policy, approach).total;
  }

  function hash32(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function utility(bet, policy) {
    return utilityComponents(bet, policy, 'evidence_scored').total;
  }

  function utilityComponents(bet, policy, approach = 'evidence_scored') {
    const weights = policy.utility;
    if (approach === 'progress_only') {
      const progress = bet.prediction.progressDeltaM;
      const arrival = bet.prediction.willArrive ? weights.arrivalBonus : 0;
      return { progress: round(progress), clearance: 0, confidence: 0, arrival: round(arrival), maneuver: 0, total: round(progress + arrival), formula: 'progressDeltaM + arrivalBonus' };
    }
    const progress = bet.prediction.progressDeltaM * weights.progressWeight;
    const clearance = bet.prediction.minimumClearanceM * weights.clearanceWeight;
    const confidence = bet.confidence * weights.confidenceWeight;
    const arrival = bet.prediction.willArrive ? weights.arrivalBonus : 0;
    let maneuver = 0;
    if (bet.action.maneuver === 'wait') maneuver -= weights.waitPenalty;
    if (bet.action.maneuver === 'emergency_stop') maneuver -= weights.emergencyStopPenalty;
    if (bet.action.maneuver === 'reroute') maneuver += weights.rerouteBonus;
    if (bet.action.maneuver === 'accelerate') maneuver -= weights.strongAccelerationPenalty;
    return {
      progress: round(progress),
      clearance: round(clearance),
      confidence: round(confidence),
      arrival: round(arrival),
      maneuver: round(maneuver),
      total: round(progress + clearance + confidence + arrival + maneuver),
      formula: 'progress * weight + clearance * weight + confidence * weight + arrival bonus + maneuver adjustment',
    };
  }

  function round(value) {
    return Number(value.toFixed(9));
  }

  return { selectActionBet, chooseEligible, utilityForApproach, utilityComponents, utility, hash32 };
});
