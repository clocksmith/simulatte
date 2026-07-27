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
    notBeforeDay = 0,
  }) {
    const members = ensemble.samples.map((sample, index) => propagateMember({
      sample,
      campaign,
      forceModel,
      intervention,
      executionModel,
      executionSeed: `${seed}:execution:${index}`,
      notBeforeDay,
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
      executionProfile: {
        deliveryMode: intervention.deliveryMode || (intervention.id === 'none' ? 'none' : 'instantaneous-kinetic'),
        campaignDelayDays: Number(intervention.campaignDelayDays || 0),
        thrustDurationDays: Number(intervention.thrustDurationDays || 0),
        impulseCount: intervention.id === 'none'
          ? 0
          : intervention.deliveryMode === 'continuous-low-thrust'
            ? Math.max(1, Math.min(64, Math.round(Number(intervention.impulseProfileSteps || 1))))
            : 1,
        navigationSigmaMultiplier: Number(intervention.navigationSigmaMultiplier ?? 1),
      },
      members,
      probabilityClaimAllowed: false,
      interpretation: 'Finite synthetic ensemble inside a declared one-million-kilometer encounter screen, not an impact probability.',
    });
  }

  function propagateMember({
    sample,
    campaign,
    forceModel,
    intervention,
    executionModel,
    executionSeed,
    notBeforeDay,
  }) {
    const decisionDay = Math.min(
      Math.max(Number(intervention.decisionDay || 0), Number(notBeforeDay || 0)),
      campaign.terminalDay
    );
    const applicationDay = Math.min(
      decisionDay + Math.max(0, Number(intervention.campaignDelayDays || 0)),
      campaign.terminalDay
    );
    const first = propagation.propagate({
      stateVector: sample.state,
      startDay: 0,
      durationDays: applicationDay,
      stepDays: forceModel.stepDays,
      gmSunAuD2: forceModel.gmSunAu3Day2,
      sampleLimit: 256,
    });
    const success = intervention.id !== 'none'
      && unit(`${executionSeed}:launch`) < intervention.reliability * (1 - executionModel.launchFailureProbability);
    const navigationSigmaMultiplier = Math.max(0, Number(intervention.navigationSigmaMultiplier ?? 1));
    const executionScale = success
      ? Math.max(0, 1 + normal(`${executionSeed}:delivery`) * Math.hypot(
        executionModel.navigationSigmaFraction * navigationSigmaMultiplier,
        executionModel.deliverySigmaFraction,
        executionModel.momentumEnhancementSigma
      ))
      : 0;
    const profile = interventionProfile(intervention, applicationDay, campaign.terminalDay, success);
    let currentState = {
      positionAu: first.endpoint.positionAu,
      velocityAuD: first.endpoint.velocityAuD,
    };
    let currentDay = applicationDay;
    const trajectory = [...first.trajectory];
    const propagationReceipts = [first];
    const deliveredImpulseAuD = Number(intervention.deltaVAuD || 0) * executionScale;
    if (profile.impulseCount > 0) {
      for (let impulseIndex = 0; impulseIndex < profile.impulseCount; impulseIndex += 1) {
        const earth = propagation.earthState(currentDay, forceModel.gmSunAu3Day2);
        const relative = currentState.positionAu.map((row, index) => row - earth.positionAu[index]);
        const direction = normalize([-relative[1], relative[0], relative[2] || 0.01]);
        currentState = {
          positionAu: currentState.positionAu,
          velocityAuD: currentState.velocityAuD.map((row, index) => (
            row + direction[index] * deliveredImpulseAuD / profile.impulseCount
          )),
        };
        const segmentDays = profile.deliveryMode === 'continuous-low-thrust'
          ? profile.thrustDurationDays / profile.impulseCount
          : campaign.terminalDay - currentDay;
        if (segmentDays > 0) {
          const segment = propagateSegment(currentState, currentDay, segmentDays, forceModel);
          propagationReceipts.push(segment);
          trajectory.push(...segment.trajectory.slice(1));
          currentState = {
            positionAu: segment.endpoint.positionAu,
            velocityAuD: segment.endpoint.velocityAuD,
          };
          currentDay += segmentDays;
        }
      }
    }
    if (currentDay < campaign.terminalDay) {
      const coast = propagateSegment(currentState, currentDay, campaign.terminalDay - currentDay, forceModel);
      propagationReceipts.push(coast);
      trajectory.push(...coast.trajectory.slice(1));
    }
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
      executionProfile: {
        deliveryMode: profile.deliveryMode,
        decisionDay,
        applicationDay,
        campaignDelayDays: applicationDay - decisionDay,
        thrustDurationDays: profile.thrustDurationDays,
        impulseCount: profile.impulseCount,
        navigationSigmaMultiplier,
        deliveredDeltaVAuD: deliveredImpulseAuD,
      },
      minimumDistanceKm: closest.distanceKm,
      closestApproachDay: closest.day,
      insideScreeningRadius: closest.distanceKm <= ENCOUNTER_SCREENING_RADIUS_KM,
      bPlane,
      trajectory,
      propagationReceipts: propagationReceipts.map(compactPropagationReceipt),
    });
  }

  function interventionProfile(intervention, applicationDay, terminalDay, success) {
    const deliveryMode = intervention.deliveryMode || (intervention.id === 'none' ? 'none' : 'instantaneous-kinetic');
    if (!success || deliveryMode === 'none') {
      return { deliveryMode, thrustDurationDays: 0, impulseCount: 0 };
    }
    if (deliveryMode === 'continuous-low-thrust') {
      const thrustDurationDays = Math.max(
        0,
        Math.min(Number(intervention.thrustDurationDays || 0), terminalDay - applicationDay)
      );
      return {
        deliveryMode,
        thrustDurationDays,
        impulseCount: thrustDurationDays > 0
          ? Math.max(1, Math.min(64, Math.round(Number(intervention.impulseProfileSteps || 1))))
          : 0,
      };
    }
    return { deliveryMode, thrustDurationDays: 0, impulseCount: 1 };
  }

  function propagateSegment(stateVector, startDay, durationDays, forceModel) {
    return propagation.propagate({
      stateVector,
      startDay,
      durationDays,
      stepDays: forceModel.stepDays,
      gmSunAuD2: forceModel.gmSunAu3Day2,
      sampleLimit: 512,
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
