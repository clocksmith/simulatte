(function attachAsteroidV4(root, factory) {
  const builder = typeof module === 'object' && module.exports
    ? require('../../core/simulation/plugin-v4-builder.js') : root.SimulattePluginV4Builder;
  const propagation = typeof module === 'object' && module.exports
    ? require('../../core/simulation/n-body-propagation.js') : root.SimulatteNBodyPropagation;
  const api = factory(builder, propagation);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAsteroidV4 = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAsteroidV4(builder, propagation) {
  const PLUGIN_ID = 'asteroid-defense';
  const MODEL_HASHES = Object.freeze({
    orbitFit: 'ee6af91acf7efb8a7c5602b939fca005161630b7ce53a5debb188c31c2dd3006',
    ensemble: '69236a83edcbfbf07bdd63b30fb08d19b0dd28f4dccc6b420eb120057f5143e2',
    encounter: '8600ce8c2e549f9a14f95fc6c0d1b0f98e3a2a2b9291b755da347690aa125f83',
    propagation: 'ccdb8fc4462878971f510c195f6c55b47613bc506264f0095b6a7daf230de9a0',
  });

  function createContribution({ datasets, config, result, snapshot, comparison = null }) {
    const records = datasets.dataReceipts.map((receipt) => builder.datasetRecord(
      receipt.datasetId,
      receipt,
      metadataFor(receipt.datasetId)
    ));
    const computationalParents = records.filter((row) => !/historical-benchmark|jpl-reference/.test(row.id));
    const models = Object.entries(MODEL_HASHES).map(([id, contentHash]) => builder.modelRecord({
      id: `${PLUGIN_ID}:model:${id}`,
      datasetId: 'asteroid-model-governance-v1',
      contentHash,
      parentIds: computationalParents.map((row) => row.id),
      metadata: { algorithm: id },
      lineage: {
        axes: {
          origin: 'derived',
          temporalStatus: 'forecast',
          uncertainty: { kind: 'distribution', value: { interpretation: 'Derived from synthetic observations and declared model assumptions.' } },
        },
        contentVersion: `${id}-v1`,
        scenarioEpoch: `scenario:${result.scenarioIdentity}`,
        license: { required: false, identifier: null },
      },
    }));
    const simulated = builder.provenance({
      origin: 'simulated',
      temporalStatus: 'forecast',
      uncertainty: { kind: 'distribution', value: { interpretation: 'Synthetic orbit and intervention ensemble; not an impact probability.' } },
      records: models,
    });
    const scenarioClaim = builder.provenance({
      origin: 'scenario',
      temporalStatus: 'forecast',
      uncertainty: { kind: 'distribution', value: { interpretation: 'Synthetic observations and policy controls.' } },
      records: records.filter((row) => /synthetic-observation|decision-policies/.test(row.id)),
    });
    const encounter = snapshot.interventionEncounter
      ? result.interventionEncounter
      : result.baselineEncounter;
    const representative = encounter.members[0];
    const maxDistance = Math.max(1, ...encounter.members.map((row) => row.minimumDistanceKm));
    const layers = [
      builder.layer({
        id: 'asteroid-representative-trajectory',
        kind: 'path',
        label: 'Representative synthetic orbit clone',
        geometry: builder.geometry('polyline', 'heliocentric-ecliptic-au', representative.trajectory.map((row) => row.positionAu)),
        quantity: builder.quantity('fit-residual', result.metrics.fitResidualRmsArcsec, 'arcsec', [0, Math.max(5, result.metrics.fitResidualRmsArcsec * 1.2)]),
        role: 'primary',
        importance: 1,
        aggregationKey: 'asteroid-orbit-ensemble',
        provenance: simulated,
      }),
      builder.layer({
        id: 'earth-reference-trajectory',
        kind: 'path',
        label: 'Modeled Earth reference',
        geometry: builder.geometry('polyline', 'heliocentric-ecliptic-au', representative.trajectory.map(
          (row) => propagation.earthState(row.day, datasets.forceModels.models[0].gmSunAu3Day2).positionAu
        )),
        role: 'context',
        importance: 0.55,
        aggregationKey: 'solar-reference',
        provenance: simulated,
      }),
      ...encounter.members.map((member) => {
        const closest = member.trajectory.reduce((best, row) =>
          Math.abs(row.day - member.closestApproachDay) < Math.abs(best.day - member.closestApproachDay) ? row : best);
        return builder.layer({
          id: `asteroid-encounter:${member.id}`,
          kind: 'point',
          label: `${member.id} modeled closest approach`,
          geometry: builder.geometry('point', 'heliocentric-ecliptic-au', [closest.positionAu]),
          quantity: builder.quantity('minimum-encounter-distance', member.minimumDistanceKm, 'km', [0, maxDistance]),
          role: member.insideScreeningRadius ? 'event' : 'context',
          importance: member.insideScreeningRadius ? 0.95 : 0.35,
          aggregationKey: 'asteroid-encounter-distribution',
          provenance: simulated,
        });
      }),
    ];
    const events = result.events.map((row, sequence) => builder.event({
      id: row.id,
      pluginId: PLUGIN_ID,
      sequence,
      simulationTimeMs: row.simulationTimeMs,
      kind: row.kind,
      causationIds: row.causationIds,
      correlationId: result.id,
      payload: row.payload,
      provenance: simulated,
    }));
    const presentation = builder.presentation({
      pluginId: PLUGIN_ID,
      coordinateSystem: 'heliocentric-ecliptic-au',
      epoch: result.campaign.startInstant,
      layers,
      viewIntents: [builder.viewIntent({
        id: `asteroid-view:${snapshot.id}`,
        mode: comparison?.settlement ? 'compare' : snapshot.status.includes('propagated') ? 'follow' : 'overview',
        targetIds: snapshot.status.includes('propagated')
          ? layers.filter((row) => row.kind === 'point').map((row) => row.id)
          : ['asteroid-representative-trajectory', 'earth-reference-trajectory'],
        reasonEventId: snapshot.eventIds.at(-1) || null,
        priority: 75,
      })],
    });
    const campaign = datasets.campaigns.campaigns.find((row) => row.id === result.scenarioId);
    const controls = builder.controls([
      select('observationCampaignId', 'Synthetic campaign', result.configurationIdentity.observationCampaignId,
        datasets.campaigns.campaigns.map((row) => option(row.id, row.label)), scenarioClaim),
      select('followUpPolicyId', 'Follow-up policy', result.configurationIdentity.followUpPolicyId, [
        option('fixed-cadence', 'Fixed cadence'),
        option('information-gain', 'Information-gain sampling'),
      ], scenarioClaim),
      select('decisionPolicyId', 'Decision policy', result.configurationIdentity.decisionPolicyId, [
        option('act-at-threshold', 'Act at threshold'),
        option('observe-then-decide', 'Observe then decide'),
      ], scenarioClaim),
      select('interventionArchetypeId', 'Intervention', result.configurationIdentity.interventionArchetypeId,
        datasets.interventions.archetypes.map((row) => option(row.id, row.label)), scenarioClaim),
      number('observationBudget', 'Observation budget', result.configurationIdentity.observationBudget, 4, campaign.observations.length, 1, scenarioClaim),
      number('ensembleSize', 'Orbit clones', result.configurationIdentity.ensembleSize, 4, 64, 4, scenarioClaim),
      range('decisionThreshold', 'Modeled screening threshold', result.configurationIdentity.decisionThreshold, 0, 1, 0.05, scenarioClaim),
    ], [{
      id: 'no-intervention-vs-selected',
      label: 'No intervention versus selected policy',
      baselineScenarioId: `${result.scenarioId}:no-intervention`,
      variantScenarioId: `${result.scenarioId}:${result.requestedInterventionId}`,
      synchronizedClock: true,
    }]);
    const state = builder.state({
      id: snapshot.id,
      pluginId: PLUGIN_ID,
      simulationTimeMs: snapshot.simulationTimeMs,
      status: snapshot.status,
      previousStateId: previousSnapshotId(result, snapshot),
      eventIds: snapshot.eventIds,
      measures: [
        builder.quantity('fit-residual', result.metrics.fitResidualRmsArcsec, 'arcsec'),
        builder.quantity('baseline-screening-frequency', result.metrics.baselineModeledScreeningFraction, 'ratio'),
        builder.quantity('intervention-screening-frequency', result.metrics.interventionModeledScreeningFraction, 'ratio'),
        builder.quantity('intervention-median-distance', result.metrics.interventionMedianDistanceKm, 'km'),
      ],
      provenance: simulated,
    });
    const inspections = [{
      id: 'asteroid-fit-and-encounter',
      label: 'Synthetic orbit fit and encounter boundary',
      targetIds: layers.map((row) => row.id),
      fields: [
        field('campaign', 'Synthetic campaign', result.scenarioId, null, scenarioClaim),
        field('observations', 'Acquired observations', result.fitReceipt.observationIds.length, 'observations', scenarioClaim),
        field('fit-termination', 'Fit termination', result.fitReceipt.terminationReason, null, simulated),
        field('fit-rms', 'Angular residual RMS', result.metrics.fitResidualRmsArcsec, 'arcsec', simulated),
        field('covariance', 'Covariance PSD', result.fitReceipt.covarianceReceipt.positiveSemidefinite, null, simulated),
        field('screening-radius', 'Declared encounter screen', result.baselineEncounter.screeningRadiusKm, 'km', simulated),
        field('screening-language', 'Interpretation', result.baselineEncounter.interpretation, null, simulated),
        field('requested-intervention', 'Requested intervention', result.requestedInterventionId, null, scenarioClaim),
        field('applied-intervention', 'Applied intervention', result.appliedInterventionId, null, simulated),
        field('hidden-policy-access', 'Policy access to hidden truth', false, null, simulated),
        field('force-omissions', 'Force-model omissions', datasets.forceModels.models[0].omissions, null, simulated),
        field('claim-boundary', 'Claim boundary', result.settlement.claimBoundary, null, simulated),
      ],
    }];
    return builder.contribution({
      pluginId: PLUGIN_ID,
      presentation,
      events,
      controls,
      state,
      inspections,
      provenanceRecords: [...records, ...models],
    });
  }

  function metadataFor(id) {
    if (/historical-benchmark|jpl-reference/.test(id)) return {
      license: 'NASA-JPL-public-data',
      contentVersion: 'retrieved-2026-07-26',
      truth: {
        origin: 'observed',
        temporalStatus: 'snapshot',
        uncertainty: { kind: 'missing', value: { reason: 'Pinned API source fields retained.' } },
      },
    };
    return { scenarioKind: 'asteroid-defense', contentVersion: '1.0.0' };
  }
  function previousSnapshotId(result, snapshot) {
    const index = result.snapshots.findIndex((row) => row.id === snapshot.id);
    return index > 0 ? result.snapshots[index - 1].id : null;
  }
  function select(id, label, value, options, provenance) {
    return { id, label, kind: 'select', value, options, minimum: null, maximum: null, step: null, provenance };
  }
  function number(id, label, value, minimum, maximum, step, provenance) {
    return { id, label, kind: 'number', value, options: null, minimum, maximum, step, provenance };
  }
  function range(id, label, value, minimum, maximum, step, provenance) {
    return { id, label, kind: 'range', value, options: null, minimum, maximum, step, provenance };
  }
  function option(value, label) { return { value, label }; }
  function field(id, label, value, unit, provenance) { return { id, label, value, unit, provenance }; }

  return Object.freeze({ MODEL_HASHES, createContribution });
});
