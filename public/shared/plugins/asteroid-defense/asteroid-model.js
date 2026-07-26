(function attachAsteroidModel(root, factory) {
  const orbitApi = typeof module === 'object' && module.exports
    ? require('./orbit-determination.js') : root.SimulatteAsteroidOrbitDetermination;
  const ensembleApi = typeof module === 'object' && module.exports
    ? require('./covariance-ensemble.js') : root.SimulatteAsteroidCovarianceEnsemble;
  const encounterApi = typeof module === 'object' && module.exports
    ? require('./encounter-model.js') : root.SimulatteAsteroidEncounterModel;
  const nodeCrypto = typeof module === 'object' && module.exports ? require('node:crypto') : null;
  const api = factory(orbitApi, ensembleApi, encounterApi, nodeCrypto);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAsteroidModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAsteroidModel(
  orbitApi,
  ensembleApi,
  encounterApi,
  nodeCrypto
) {
  const DAY_MS = 86400000;

  function runScenario({ datasets, config, scenario, policyOverrides = {} }) {
    const campaign = datasets.campaigns.campaigns.find((row) => row.id === scenario.observationCampaignId);
    const forceModel = datasets.forceModels.models.find((row) => row.id === scenario.forceModelId);
    const requestedIntervention = datasets.interventions.archetypes.find(
      (row) => row.id === (policyOverrides.interventionArchetypeId || scenario.interventionArchetypeId)
    );
    const noIntervention = datasets.interventions.archetypes.find((row) => row.id === 'none');
    const executionModel = datasets.execution.models.find((row) => row.id === scenario.executionUncertaintyModelId);
    if (!campaign || !forceModel || !requestedIntervention || !noIntervention || !executionModel) {
      throw modelError('asteroid_scenario_input_missing', scenario.observationCampaignId);
    }
    const followUpPolicyId = policyOverrides.followUpPolicyId || scenario.followUpPolicyId;
    const fitReceipt = orbitApi.fit({
      campaign,
      forceModel,
      observationBudget: scenario.observationBudget,
      followUpPolicyId,
      fit: config.fit,
    });
    if (!fitReceipt.covarianceReceipt.positiveSemidefinite) {
      throw modelError('asteroid_covariance_invalid', campaign.id);
    }
    const ensembleReceipt = ensembleApi.generate({
      fitReceipt,
      ensembleSize: scenario.ensembleSize,
      seed: scenario.seed,
    });
    const baselineEncounter = encounterApi.propagateEnsemble({
      ensemble: ensembleReceipt,
      campaign,
      forceModel,
      intervention: noIntervention,
      executionModel,
      seed: scenario.seed,
    });
    const thresholdSatisfied = baselineEncounter.modeledScreeningFraction >= scenario.decisionThreshold;
    const evidenceSatisfied = scenario.decisionPolicyId === 'act-at-threshold'
      || (fitReceipt.converged && fitReceipt.observationIds.length >= Math.min(8, campaign.observations.length));
    const interventionApplied = requestedIntervention.id !== 'none' && thresholdSatisfied && evidenceSatisfied;
    const appliedIntervention = interventionApplied ? requestedIntervention : noIntervention;
    const interventionEncounter = appliedIntervention.id === 'none'
      ? baselineEncounter
      : encounterApi.propagateEnsemble({
        ensemble: ensembleReceipt,
        campaign,
        forceModel,
        intervention: appliedIntervention,
        executionModel,
        seed: scenario.seed,
      });
    const fitError = hiddenEvaluation(fitReceipt.fittedState, campaign.hiddenTruth.initialState);
    const configurationIdentity = {
      profileId: 'asteroid-defense-v1',
      worldModelId: 'solar-system-ephemeris-v2',
      observationCampaignId: campaign.id,
      forceModelId: forceModel.id,
      seed: scenario.seed,
      followUpPolicyId,
      decisionPolicyId: scenario.decisionPolicyId,
      interventionArchetypeId: requestedIntervention.id,
      executionUncertaintyModelId: executionModel.id,
      ensembleSize: scenario.ensembleSize,
      observationBudget: scenario.observationBudget,
      decisionThreshold: scenario.decisionThreshold,
      fit: config.fit,
      propagation: config.propagation,
      datasetHashes: datasets.dataReceipts.map((row) => [row.datasetId, row.sha256]),
    };
    const scenarioIdentity = hash(configurationIdentity);
    const events = buildEvents({
      scenarioIdentity,
      campaign,
      fitReceipt,
      ensembleReceipt,
      baselineEncounter,
      interventionEncounter,
      requestedIntervention,
      appliedIntervention,
    });
    const snapshots = buildSnapshots({
      scenarioIdentity,
      events,
      campaign,
      fitReceipt,
      ensembleReceipt,
      baselineEncounter,
      interventionEncounter,
      requestedIntervention,
      appliedIntervention,
    });
    const metrics = {
      observationCount: fitReceipt.observationIds.length,
      fitResidualRmsArcsec: fitReceipt.residualRmsRad * 180 / Math.PI * 3600,
      fitStateErrorAu: fitError.positionErrorAu,
      covarianceConditionEstimate: fitReceipt.covarianceReceipt.conditionEstimate,
      baselineModeledScreeningFraction: baselineEncounter.modeledScreeningFraction,
      interventionModeledScreeningFraction: interventionEncounter.modeledScreeningFraction,
      baselineMedianDistanceKm: baselineEncounter.medianDistanceKm,
      interventionMedianDistanceKm: interventionEncounter.medianDistanceKm,
      successfulExecutionCount: interventionEncounter.members.filter((row) => row.executionSucceeded).length,
    };
    return deepFreeze({
      schema: 'simulatte.asteroidDefenseRun.v1',
      id: `asteroid:${scenarioIdentity}`,
      scenarioIdentity,
      scenarioId: campaign.id,
      seed: scenario.seed,
      configurationIdentity,
      campaign: publicCampaign(campaign),
      fitReceipt,
      ensembleReceipt,
      baselineEncounter,
      interventionEncounter,
      requestedInterventionId: requestedIntervention.id,
      appliedInterventionId: appliedIntervention.id,
      interventionApplied,
      hiddenEvaluation: {
        ...fitError,
        hiddenTruthId: campaign.hiddenTruth.id,
        hiddenTruthHash: campaign.hiddenTruth.truthHash,
        policyAccessible: false,
      },
      metrics,
      events,
      snapshots,
      settlement: {
        schema: 'simulatte.asteroidSettlement.v1',
        status: 'settled',
        orbitFitConverged: fitReceipt.converged,
        covarianceValid: fitReceipt.covarianceReceipt.positiveSemidefinite,
        ensembleComplete: ensembleReceipt.samples.length === scenario.ensembleSize,
        probabilityClaimAllowed: false,
        claimBoundary: 'Synthetic ensemble screening frequency only; no operational impact probability or public danger assessment.',
      },
      claimBoundary: 'Inside this declared synthetic simulation, the observation and intervention policy changed the modeled encounter distribution.',
    });
  }

  function buildEvents({
    scenarioIdentity,
    campaign,
    fitReceipt,
    ensembleReceipt,
    baselineEncounter,
    interventionEncounter,
    requestedIntervention,
    appliedIntervention,
  }) {
    const rows = [];
    append('observations.acquired', campaign.observations.at(-1).epochDayTdb * DAY_MS, {
      observationIds: fitReceipt.observationIds,
    });
    append('orbit.fit-completed', (campaign.observations.at(-1).epochDayTdb + 1) * DAY_MS, {
      terminationReason: fitReceipt.terminationReason,
      residualRmsRad: fitReceipt.residualRmsRad,
    });
    append('orbit.ensemble-generated', (campaign.observations.at(-1).epochDayTdb + 2) * DAY_MS, {
      ensembleSize: ensembleReceipt.ensembleSize,
      covarianceIdentity: ensembleReceipt.covarianceIdentity,
    });
    append('encounter.baseline-propagated', (campaign.observations.at(-1).epochDayTdb + 3) * DAY_MS, {
      modeledScreeningFraction: baselineEncounter.modeledScreeningFraction,
    });
    append('decision.evaluated', (campaign.observations.at(-1).epochDayTdb + 4) * DAY_MS, {
      requestedInterventionId: requestedIntervention.id,
      appliedInterventionId: appliedIntervention.id,
    });
    append('encounter.intervention-propagated', campaign.terminalDay * DAY_MS, {
      modeledScreeningFraction: interventionEncounter.modeledScreeningFraction,
    });
    append('scenario.settled', (campaign.terminalDay + 1) * DAY_MS, {
      claimBoundary: 'simulation-only',
    });
    return rows;

    function append(kind, simulationTimeMs, payload) {
      rows.push({
        id: `asteroid:${scenarioIdentity}:${rows.length + 1}`,
        kind,
        simulationTimeMs,
        causationIds: rows.length ? [rows.at(-1).id] : [],
        payload,
      });
    }
  }

  function buildSnapshots({
    scenarioIdentity,
    events,
    campaign,
    fitReceipt,
    ensembleReceipt,
    baselineEncounter,
    interventionEncounter,
    requestedIntervention,
    appliedIntervention,
  }) {
    const phases = [
      ['ready', 0],
      ['observed', events[0].simulationTimeMs],
      ['fitted', events[1].simulationTimeMs],
      ['ensemble', events[2].simulationTimeMs],
      ['baseline-propagated', events[3].simulationTimeMs],
      ['decision', events[4].simulationTimeMs],
      ['intervention-propagated', events[5].simulationTimeMs],
      ['settled', events[6].simulationTimeMs],
    ];
    return phases.map(([status, simulationTimeMs], index) => deepFreeze({
      schema: 'simulatte.asteroidDefenseState.v1',
      id: `${scenarioIdentity}:snapshot-${index}`,
      simulationTimeMs,
      status,
      observationCount: index >= 1 ? fitReceipt.observationIds.length : 0,
      fitReceipt: index >= 2 ? fitReceipt : null,
      ensembleReceipt: index >= 3 ? ensembleReceipt : null,
      baselineEncounter: index >= 4 ? encounterSummary(baselineEncounter) : null,
      requestedInterventionId: index >= 5 ? requestedIntervention.id : null,
      appliedInterventionId: index >= 5 ? appliedIntervention.id : null,
      interventionEncounter: index >= 6 ? encounterSummary(interventionEncounter) : null,
      eventIds: events.slice(0, index).map((row) => row.id),
      campaign: { id: campaign.id, startInstant: campaign.startInstant, terminalDay: campaign.terminalDay },
    }));
  }

  function encounterSummary(encounter) {
    return deepFreeze({
      schema: 'simulatte.asteroidEncounterSummary.v1',
      interventionId: encounter.interventionId,
      ensembleSize: encounter.ensembleSize,
      screeningRadiusKm: encounter.screeningRadiusKm,
      modeledScreeningFraction: encounter.modeledScreeningFraction,
      minimumDistanceKm: encounter.minimumDistanceKm,
      medianDistanceKm: encounter.medianDistanceKm,
      maximumDistanceKm: encounter.maximumDistanceKm,
      successfulExecutionCount: encounter.members.filter((row) => row.executionSucceeded).length,
    });
  }

  function hiddenEvaluation(fitted, hidden) {
    return {
      positionErrorAu: Math.hypot(...fitted.positionAu.map((row, index) => row - hidden.positionAu[index])),
      velocityErrorAuD: Math.hypot(...fitted.velocityAuD.map((row, index) => row - hidden.velocityAuD[index])),
    };
  }

  function publicCampaign(campaign) {
    const { hiddenTruth, ...publicValue } = campaign;
    return publicValue;
  }

  function hash(value) {
    const text = stable(value);
    if (nodeCrypto) return nodeCrypto.createHash('sha256').update(text).digest('hex');
    let result = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      result ^= text.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return result.toString(16).padStart(8, '0').repeat(8);
  }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
  }
  function modelError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.code = code;
    return error;
  }
  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  return Object.freeze({ runScenario });
});
