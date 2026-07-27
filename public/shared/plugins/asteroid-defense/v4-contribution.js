(function attachAsteroidV4(root, factory) {
  const builder = typeof module === 'object' && module.exports
    ? require('../../core/simulation/plugin-v4-builder.js') : root.SimulattePluginV4Builder;
  const propagation = typeof module === 'object' && module.exports
    ? require('../../core/simulation/n-body-propagation.js') : root.SimulatteNBodyPropagation;
  const catalog = typeof module === 'object' && module.exports
    ? require('./asteroid-catalog.js') : root.SimulatteAsteroidCatalog;
  const api = factory(builder, propagation, catalog);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAsteroidV4 = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAsteroidV4(builder, propagation, catalog) {
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
    const observedCatalog = builder.provenance({
      origin: 'observed',
      temporalStatus: 'snapshot',
      uncertainty: {
        kind: 'missing',
        value: {
          interpretation: 'JPL-published osculating elements shown as bounded catalog context; null catalog fields remain missing.',
        },
      },
      records: records.filter((row) => /jpl-neo-context/.test(row.id)),
    });
    const encounter = snapshot.activeEncounter === 'intervention'
      ? result.interventionEncounter
      : snapshot.activeEncounter === 'baseline'
        ? result.baselineEncounter
        : snapshot.interventionEncounter
          ? result.interventionEncounter
          : snapshot.baselineEncounter ? result.baselineEncounter : null;
    const representative = encounter?.members?.[0] || null;
    const actorPosition = representative && Number.isFinite(snapshot.trajectoryDay)
      ? positionAtDay(representative.trajectory, snapshot.trajectoryDay)
      : null;
    const epoch = epochForDay(result.campaign.startInstant, snapshot.trajectoryDay || 0);
    const epochTdbJd = julianDate(epoch);
    const catalogObjects = catalog.visualCatalog(datasets.neoCatalog.objects, epochTdbJd, 120);
    const earthPosition = representative
      ? propagation.earthState(
        Number.isFinite(snapshot.trajectoryDay) ? snapshot.trajectoryDay : 0,
        datasets.forceModels.models[0].gmSunAu3Day2
      ).positionAu
      : [1, 0, 0];
    const activeTrajectories = snapshot.ensembleReceipt
      ? (encounter?.members || []).slice(0, 10)
      : [];
    const showBranchComparison = Boolean(
      snapshot.interventionEncounter || snapshot.status === 'intervention-propagating' || snapshot.status === 'settled'
    );
    const interventionActor = interventionVisual({
      result,
      snapshot,
      actorPosition,
      earthPosition,
      simulated,
    });
    const visibleObservations = observationsForSnapshot(result, snapshot);
    const maxDistance = Math.max(1, ...(encounter?.members || []).map((row) => row.minimumDistanceKm));
    const layers = [
      ...catalogObjects.map(({ object, positionAu }) => builder.layer({
        id: `jpl-neo-context:${object.id}`,
        kind: 'point',
        label: object.potentiallyHazardous
          ? `${object.fullName} · JPL potentially hazardous classification`
          : object.fullName,
        geometry: builder.geometry('point', 'heliocentric-ecliptic-au', [positionAu]),
        quantity: builder.quantity(
          'catalog.absolute-magnitude',
          Number.isFinite(object.absoluteMagnitudeH) ? object.absoluteMagnitudeH : 32,
          'H',
          [5, 32]
        ),
        role: 'context',
        importance: object.potentiallyHazardous ? 0.5 : 0.12,
        aggregationKey: null,
        provenance: observedCatalog,
      })),
      ...visibleObservations.map((observation) => {
        const observer = propagation.earthState(
          observation.epochDayTdb,
          datasets.forceModels.models[0].gmSunAu3Day2
        ).positionAu;
        const direction = [
          Math.cos(observation.declinationRad) * Math.cos(observation.rightAscensionRad),
          Math.cos(observation.declinationRad) * Math.sin(observation.rightAscensionRad),
          Math.sin(observation.declinationRad),
        ];
        const sightline = observer.map((value, index) => value + direction[index] * 0.72);
        return builder.layer({
          id: `asteroid-observation:${observation.id}`,
          kind: 'path',
          label: `Synthetic angular observation · ${observation.epochUtc}`,
          geometry: builder.geometry('polyline', 'heliocentric-ecliptic-au', [observer, sightline]),
          quantity: builder.quantity(
            'observation.angular-uncertainty',
            angularSigma(observation),
            'radian',
            [0, 0.0001]
          ),
          role: 'event',
          importance: 0.76,
          aggregationKey: 'asteroid-observation-rays',
          provenance: scenarioClaim,
        });
      }),
      ...(snapshot.fitReceipt && representative ? [
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
      builder.layer({
        id: 'earth-encounter-target',
        kind: 'actor',
        label: 'Modeled Earth encounter reference',
        geometry: builder.geometry('point', 'heliocentric-ecliptic-au', [earthPosition]),
        quantity: builder.quantity('actor.earth.reference', 1, 'state', [0, 1]),
        role: 'primary',
        importance: 1,
        aggregationKey: 'earth-encounter-target',
        provenance: simulated,
      }),
      ] : []),
      ...activeTrajectories.map((member, index) => builder.layer({
        id: `asteroid-clone-path:${snapshot.activeEncounter || 'baseline'}:${member.id}`,
        kind: 'path',
        label: `${snapshot.activeEncounter || 'baseline'} uncertainty clone ${index + 1}`,
        geometry: builder.geometry(
          'polyline',
          'heliocentric-ecliptic-au',
          member.trajectory.map((row) => row.positionAu)
        ),
        quantity: builder.quantity(
          member.insideScreeningRadius ? 'encounter.screened-clone' : 'encounter.clone',
          member.minimumDistanceKm,
          'km',
          [0, maxDistance]
        ),
        role: member.insideScreeningRadius ? 'event' : 'comparison',
        importance: member.insideScreeningRadius ? 0.72 : 0.22,
        aggregationKey: `asteroid-clones:${snapshot.activeEncounter || 'baseline'}`,
        provenance: simulated,
      })),
      ...(showBranchComparison ? [
        ...result.baselineEncounter.members.slice(0, 6).map((member, index) => builder.layer({
          id: `asteroid-baseline-branch:${member.id}`,
          kind: 'path',
          label: `No-intervention clone ${index + 1}`,
          geometry: builder.geometry('polyline', 'heliocentric-ecliptic-au', member.trajectory.map((row) => row.positionAu)),
          quantity: builder.quantity('comparison.baseline-trajectory', member.minimumDistanceKm, 'km', [0, maxDistance]),
          role: 'comparison',
          importance: 0.28,
          aggregationKey: 'asteroid-baseline-comparison',
          provenance: simulated,
        })),
        ...result.interventionEncounter.members.slice(0, 6).map((member, index) => builder.layer({
          id: `asteroid-intervention-branch:${member.id}`,
          kind: 'path',
          label: `Selected-policy clone ${index + 1}`,
          geometry: builder.geometry('polyline', 'heliocentric-ecliptic-au', member.trajectory.map((row) => row.positionAu)),
          quantity: builder.quantity('comparison.intervention-trajectory', member.minimumDistanceKm, 'km', [0, maxDistance]),
          role: 'comparison',
          importance: 0.42,
          aggregationKey: 'asteroid-intervention-comparison',
          provenance: simulated,
        })),
      ] : []),
      ...(encounter?.members || []).map((member) => {
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
      ...(actorPosition ? [builder.layer({
        id: 'asteroid-active-clone',
        kind: 'actor',
        label: `${snapshot.activeEncounter || 'encounter'} trajectory · ${Math.round((snapshot.trajectoryProgress || 0) * 100)}%`,
        geometry: builder.geometry('point', 'heliocentric-ecliptic-au', [actorPosition]),
        quantity: builder.quantity(
          'actor.asteroid.route-progress',
          snapshot.trajectoryProgress,
          'ratio',
          [0, 1]
        ),
        role: 'event',
        importance: 1,
        aggregationKey: 'asteroid-active-clone',
        provenance: simulated,
      })] : []),
      ...interventionActor,
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
      epoch,
      layers,
      viewIntents: [builder.viewIntent({
        id: `asteroid-view:${snapshot.id}`,
        mode: comparison?.settlement
          ? 'compare'
          : snapshot.status.includes('intervention') && interventionActor.length ? 'follow'
            : snapshot.status.includes('propagating') && actorPosition ? 'follow'
              : snapshot.status === 'settled' ? 'compare' : 'overview',
        targetIds: snapshot.status.includes('intervention') && interventionActor.length
          ? [
            ...interventionActor.filter((row) => row.kind === 'actor').map((row) => row.id),
            ...(actorPosition ? ['asteroid-active-clone'] : []),
          ]
          : snapshot.status.includes('propagating') && actorPosition
            ? ['asteroid-active-clone', 'earth-encounter-target']
            : snapshot.status === 'settled'
              ? ['earth-encounter-target', 'asteroid-representative-trajectory']
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
        builder.quantity('observation-count', snapshot.observationCount, 'observations'),
        ...(snapshot.fitReceipt ? [builder.quantity('fit-residual', result.metrics.fitResidualRmsArcsec, 'arcsec')] : []),
        ...(snapshot.baselineEncounter ? [builder.quantity('baseline-screening-frequency', snapshot.baselineEncounter.modeledScreeningFraction, 'ratio')] : []),
        ...(snapshot.baselineEncounter ? [
          builder.quantity(
            'baseline-screened-clones',
            Math.round(snapshot.baselineEncounter.modeledScreeningFraction * result.configurationIdentity.ensembleSize),
            'clones'
          ),
        ] : []),
        ...(snapshot.interventionEncounter ? [
          builder.quantity('intervention-screening-frequency', snapshot.interventionEncounter.modeledScreeningFraction, 'ratio'),
          builder.quantity('intervention-median-distance', snapshot.interventionEncounter.medianDistanceKm, 'km'),
          builder.quantity(
            'intervention-screened-clones',
            Math.round(snapshot.interventionEncounter.modeledScreeningFraction * result.configurationIdentity.ensembleSize),
            'clones'
          ),
        ] : []),
      ],
      provenance: simulated,
    });
    const inspections = [{
      id: 'asteroid-fit-and-encounter',
      label: 'Synthetic orbit fit and encounter boundary',
      targetIds: layers.map((row) => row.id),
        fields: [
          field('campaign', 'Synthetic campaign', result.scenarioId, null, scenarioClaim),
          field('stage', 'Scientific stage', snapshot.status, null, scenarioClaim),
          field('observations', 'Acquired observations', snapshot.observationCount, 'observations', scenarioClaim),
          ...(snapshot.fitReceipt ? [
            field('fit-termination', 'Fit termination', snapshot.fitReceipt.terminationReason, null, simulated),
            field('fit-rms', 'Angular residual RMS', result.metrics.fitResidualRmsArcsec, 'arcsec', simulated),
            field('covariance', 'Covariance PSD', snapshot.fitReceipt.covarianceReceipt.positiveSemidefinite, null, simulated),
            field('follow-up-method', 'Follow-up selection method', snapshot.fitReceipt.observationSelectionReceipt.method, null, simulated),
            field('selected-observations', 'Selected observation IDs', snapshot.fitReceipt.observationSelectionReceipt.selectedObservationIds, null, simulated),
          ] : []),
          ...(snapshot.baselineEncounter ? [
            field('screening-radius', 'Declared encounter screen', snapshot.baselineEncounter.screeningRadiusKm, 'km', simulated),
            field('screening-language', 'Interpretation', snapshot.baselineEncounter.interpretation, null, simulated),
          ] : []),
          ...(snapshot.requestedInterventionId ? [
            field('requested-intervention', 'Requested intervention', snapshot.requestedInterventionId, null, scenarioClaim),
            field('applied-intervention', 'Applied intervention', snapshot.appliedInterventionId, null, simulated),
            field('execution-profile', 'Intervention execution profile', result.metrics.interventionExecutionProfile, null, simulated),
          ] : []),
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
    if (/historical-benchmark|jpl-reference|jpl-neo-context/.test(id)) return {
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

  function positionAtDay(trajectory, day) {
    if (!trajectory?.length) return null;
    let lowerIndex = 0;
    for (let index = 1; index < trajectory.length && trajectory[index].day <= day; index += 1) lowerIndex = index;
    const lower = trajectory[lowerIndex];
    const upper = trajectory[Math.min(trajectory.length - 1, lowerIndex + 1)];
    const ratio = upper.day === lower.day ? 0 : (day - lower.day) / (upper.day - lower.day);
    return lower.positionAu.map((value, index) => value + (upper.positionAu[index] - value) * ratio);
  }

  function epochForDay(startInstant, day) {
    const start = Date.parse(startInstant || '');
    return Number.isFinite(start) ? new Date(start + day * 86400000).toISOString() : startInstant;
  }

  function julianDate(instant) {
    const epochMs = Date.parse(instant || '');
    return Number.isFinite(epochMs) ? epochMs / 86400000 + 2440587.5 : 2461248.5;
  }

  function interventionVisual({ result, snapshot, actorPosition, earthPosition, simulated }) {
    if (!actorPosition || !snapshot.status.includes('intervention') || result.appliedInterventionId === 'none') return [];
    const progress = Number.isFinite(snapshot.trajectoryProgress) ? snapshot.trajectoryProgress : 0;
    const launchPosition = earthPosition;
    const vehiclePosition = launchPosition.map(
      (value, index) => value + (actorPosition[index] - value) * Math.min(1, Math.max(0, progress * 1.4))
    );
    const label = result.appliedInterventionId.replaceAll('-', ' ');
    return [
      builder.layer({
        id: 'asteroid-intervention-transfer',
        kind: 'path',
        label: `${label} modeled delivery path`,
        geometry: builder.geometry('polyline', 'heliocentric-ecliptic-au', [launchPosition, vehiclePosition, actorPosition]),
        quantity: builder.quantity('intervention.delivery-progress', progress, 'ratio', [0, 1]),
        role: 'event',
        importance: 0.88,
        aggregationKey: 'asteroid-intervention',
        provenance: simulated,
      }),
      builder.layer({
        id: 'asteroid-intervention-vehicle',
        kind: 'actor',
        label: `${label} vehicle`,
        geometry: builder.geometry('point', 'heliocentric-ecliptic-au', [vehiclePosition]),
        quantity: builder.quantity('actor.spacecraft.intervention-progress', progress, 'ratio', [0, 1]),
        role: 'event',
        importance: 1,
        aggregationKey: 'asteroid-intervention',
        provenance: simulated,
      }),
      ...(progress >= 0.7 ? [builder.layer({
        id: 'asteroid-intervention-effect',
        kind: 'point',
        label: `${label} modeled perturbation`,
        geometry: builder.geometry('point', 'heliocentric-ecliptic-au', [actorPosition]),
        quantity: builder.quantity('intervention.impulse-event', 1, 'event', [0, 1]),
        role: 'event',
        importance: 1,
        aggregationKey: 'asteroid-intervention-effect',
        provenance: simulated,
      })] : []),
    ];
  }

  function observationsForSnapshot(result, snapshot) {
    if (!snapshot.observationCount) return [];
    const selectedIds = snapshot.fitReceipt?.observationIds || [];
    if (selectedIds.length) {
      const selected = new Set(selectedIds);
      return result.campaign.observations.filter((row) => selected.has(row.id));
    }
    return result.campaign.observations.slice(0, snapshot.observationCount);
  }

  function angularSigma(observation) {
    const covariance = observation.covarianceRad2 || [];
    return Math.sqrt(Math.max(0, Number(covariance[0]?.[0] || 0) + Number(covariance[1]?.[1] || 0)));
  }

  return Object.freeze({ MODEL_HASHES, createContribution, julianDate, positionAtDay });
});
