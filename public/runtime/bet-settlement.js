(function attachAutonomyBetSettlement(root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('../contracts/contract-validator.js')
    : root.SimulatteAutonomyContracts;
  const api = factory(contracts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyBetSettlement = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyBetSettlement(contracts) {
  function settleSelectedBet(bet, transition, policy, memory) {
    const prediction = {
      progressDeltaM: bet.prediction.progressDeltaM,
      endSpeedMps: bet.prediction.endSpeedMps,
      minimumClearanceM: bet.prediction.minimumClearanceM,
    };
    const observed = {
      progressDeltaM: transition.progressDeltaM,
      endSpeedMps: transition.endSpeedMps,
      minimumClearanceM: transition.minimumClearanceM,
    };
    const errors = {
      progressM: round(Math.abs(prediction.progressDeltaM - observed.progressDeltaM)),
      speedMps: round(Math.abs(prediction.endSpeedMps - observed.endSpeedMps)),
      clearanceM: round(Math.abs(prediction.minimumClearanceM - observed.minimumClearanceM)),
    };
    const won = errors.progressM <= policy.settlement.progressToleranceM &&
      errors.speedMps <= policy.settlement.speedToleranceMps &&
      errors.clearanceM <= policy.settlement.clearanceToleranceM;
    const settlement = {
      schema: 'simulatte.autonomyBetSettlement.v1',
      betId: bet.id,
      missionId: bet.missionId,
      tick: bet.tick,
      prediction,
      observed,
      errors,
      verdict: won ? 'won' : 'lost',
      scoreDelta: round((won ? 1 : -1) * bet.scoreStake.units),
    };
    contracts.validateSettlement(settlement);
    updateMemory(memory, bet.action.maneuver, settlement.verdict, policy);
    return settlement;
  }

  function updateMemory(memory, maneuver, verdict, policy) {
    const row = memory.calibrationByManeuver[maneuver];
    row.trials += 1;
    if (verdict === 'won') row.wins += 1;
    row.confidence = round(Math.max(
      policy.confidence.minimum,
      Math.min(policy.confidence.maximum, (policy.confidence.priorWins + row.wins) / (policy.confidence.priorTrials + row.trials))
    ));
    memory.settledBetCount += 1;
    if (verdict === 'won') memory.wonBetCount += 1;
  }

  function round(value) {
    return Number(value.toFixed(9));
  }

  return { settleSelectedBet, updateMemory };
});
