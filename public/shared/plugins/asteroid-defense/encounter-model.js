(function attachAsteroidEncounter(root, factory) {
  const propagation = typeof module === 'object' && module.exports
    ? require('../../core/simulation/n-body-propagation.js') : root.SimulatteNBodyPropagation;
  const nodeCrypto = typeof module === 'object' && module.exports ? require('node:crypto') : null;
  const api = factory(propagation, nodeCrypto);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAsteroidEncounterModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createEncounterModel(propagation, nodeCrypto) {
  const AU_KM = 149597870.7;
  const ENCOUNTER_SCREENING_RADIUS_KM = 1000000;

  function propagateEnsemble({
    ensemble,
    campaign,
    forceModel,
    intervention,
    executionModel,
    seed,
  }) {
    const members = ensemble.samples.map((sample, index) => propagateMember({
      sample,
      campaign,
      forceModel,
      intervention,
      executionModel,
      executionSeed: `${seed}:execution:${index}`,
    }));
    const sortedDistances = members.map((row) => row.minimumDistanceKm).sort((a, b) => a - b);
    const thresholdCount = members.filter((row) => row.insideScreeningRadius).length;
    return deepFreeze({
      schema: 'simulatte.asteroidEncounterEnsembleReceipt.v1',
      interventionId: intervention.id,
      ensembleSize: members.length,
      screeningRadiusKm: ENCOUNTER_SCREENING_RADIUS_KM,
      modeledScreeningFraction: thresholdCount / members.length,
      minimumDistanceKm: sortedDistances[0],
      medianDistanceKm: quantile(sortedDistances, 0.5),
      maximumDistanceKm: sortedDistances.at(-1),
      members,
      probabilityClaimAllowed: false,
      interpretation: 'Finite synthetic ensemble inside a declared one-million-kilometer encounter screen, not an impact probability.',
    });
  }

  function propagateMember({ sample, campaign, forceModel, intervention, executionModel, executionSeed }) {
    const decisionDay = Math.min(intervention.decisionDay, campaign.terminalDay);
    const first = propagation.propagate({
      stateVector: sample.state,
      startDay: 0,
      durationDays: decisionDay,
      stepDays: forceModel.stepDays,
      gmSunAuD2: forceModel.gmSunAu3Day2,
      sampleLimit: 256,
    });
    const success = intervention.id !== 'none'
      && unit(`${executionSeed}:launch`) < intervention.reliability * (1 - executionModel.launchFailureProbability);
    const executionScale = success
      ? 1 + normal(`${executionSeed}:delivery`) * Math.hypot(
        executionModel.navigationSigmaFraction,
        executionModel.deliverySigmaFraction,
        executionModel.momentumEnhancementSigma
      )
      : 0;
    const decisionEarth = propagation.earthState(decisionDay, forceModel.gmSunAu3Day2);
    const relative = first.endpoint.positionAu.map((row, index) => row - decisionEarth.positionAu[index]);
    const direction = normalize([-relative[1], relative[0], relative[2] || 0.01]);
    const velocity = first.endpoint.velocityAuD.map((row, index) => row + direction[index] * intervention.deltaVAuD * executionScale);
    const second = propagation.propagate({
      stateVector: { positionAu: first.endpoint.positionAu, velocityAuD: velocity },
      startDay: decisionDay,
      durationDays: campaign.terminalDay - decisionDay,
      stepDays: forceModel.stepDays,
      gmSunAuD2: forceModel.gmSunAu3Day2,
      sampleLimit: 512,
    });
    const trajectory = [...first.trajectory, ...second.trajectory.slice(1)];
    const approaches = trajectory.map((row) => {
      const earth = propagation.earthState(row.day, forceModel.gmSunAu3Day2);
      const relativePosition = row.positionAu.map((value, index) => value - earth.positionAu[index]);
      const distanceKm = Math.hypot(...relativePosition) * AU_KM;
      return { day: row.day, distanceKm, relativePositionAu: relativePosition, asteroidPositionAu: row.positionAu };
    });
    const closest = approaches.reduce((best, row) => row.distanceKm < best.distanceKm ? row : best);
    const bPlane = {
      xiKm: closest.relativePositionAu[1] * AU_KM,
      zetaKm: closest.relativePositionAu[2] * AU_KM,
      approximation: 'local heliocentric ecliptic projection; not operational target-plane analysis',
    };
    return deepFreeze({
      id: sample.id,
      executionSucceeded: success,
      executionScale,
      minimumDistanceKm: closest.distanceKm,
      closestApproachDay: closest.day,
      insideScreeningRadius: closest.distanceKm <= ENCOUNTER_SCREENING_RADIUS_KM,
      bPlane,
      trajectory,
      propagationReceipts: [first, second].map(compactPropagationReceipt),
    });
  }

  function compactPropagationReceipt(receipt) {
    const { trajectory, ...identity } = receipt;
    return deepFreeze({
      ...identity,
      trajectorySummary: {
        sampleCount: trajectory.length,
        firstDay: trajectory[0]?.day ?? null,
        lastDay: trajectory.at(-1)?.day ?? null,
      },
    });
  }

  function normalize(vector) {
    const magnitude = Math.hypot(...vector);
    return vector.map((row) => row / magnitude);
  }
  function quantile(values, fraction) { return values[Math.floor((values.length - 1) * fraction)]; }
  function normal(seed) {
    const a = Math.max(1e-12, unit(`${seed}:a`));
    const b = unit(`${seed}:b`);
    return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
  }
  function unit(seed) {
    const hash = nodeCrypto
      ? nodeCrypto.createHash('sha256').update(seed).digest('hex')
      : fallbackHash(seed);
    return Number.parseInt(hash.slice(0, 8), 16) / 0xffffffff;
  }
  function fallbackHash(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash.toString(16).padStart(8, '0').repeat(8);
  }
  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  return Object.freeze({ AU_KM, ENCOUNTER_SCREENING_RADIUS_KM, propagateEnsemble });
});
