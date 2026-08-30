(function attachAsteroidPresentation(root, factory) {
  const propagation = typeof module === 'object' && module.exports
    ? require('../../core/simulation/n-body-propagation.js') : root.SimulatteNBodyPropagation;
  const api = factory(propagation);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAsteroidPresentation = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAsteroidPresentation(propagation) {
  function createSemanticPresentation({ result, snapshot, forceModel, automaticView = true }) {
    const encounter = snapshot.activeEncounter === 'intervention'
      ? result.interventionEncounter
      : snapshot.activeEncounter === 'baseline'
        ? result.baselineEncounter
        : snapshot.interventionEncounter
          ? result.interventionEncounter
          : snapshot.baselineEncounter ? result.baselineEncounter : null;
    const representative = encounter?.members?.[0] || null;
    const trajectory = snapshot.fitReceipt && representative
      ? representative.trajectory.map((row) => row.positionAu)
      : [];
    const earthTrajectory = trajectory.length
      ? representative.trajectory.map((row) => propagation.earthState(row.day, forceModel.gmSunAu3Day2).positionAu)
      : [];
    const encounterObjects = (encounter?.members || []).map((member) => {
      const closest = member.trajectory.reduce((best, row) =>
        Math.abs(row.day - member.closestApproachDay) < Math.abs(best.day - member.closestApproachDay) ? row : best);
      return {
        id: `asteroid-encounter:${member.id}`,
        kind: 'synthetic_encounter_sample',
        geometry: { type: 'point', coordinates: closest.positionAu },
        quantities: {
          minimumDistanceKm: member.minimumDistanceKm,
          insideDeclaredScreen: member.insideScreeningRadius,
          executionSucceeded: member.executionSucceeded,
          xiKm: member.bPlane.xiKm,
          zetaKm: member.bPlane.zetaKm,
        },
        evidenceRefs: [result.ensembleReceipt.covarianceIdentity],
        truth: truth('simulated'),
      };
    });
    const actorPosition = representative && Number.isFinite(snapshot.trajectoryDay)
      ? positionAtDay(representative.trajectory, snapshot.trajectoryDay)
      : null;
    const actorObjects = actorPosition ? [{
      id: 'asteroid-active-clone',
      kind: 'synthetic_asteroid_actor',
      geometry: { type: 'point', coordinates: actorPosition },
      quantities: {
        progressFraction: snapshot.trajectoryProgress,
        encounterBranch: snapshot.activeEncounter,
      },
      evidenceRefs: [result.ensembleReceipt.covarianceIdentity],
      truth: truth('simulated'),
    }] : [];
    return deepFreeze({
      schema: 'simulatte.semanticPresentation.v4',
      coordinateSystem: 'heliocentric-ecliptic-au',
      epoch: epochForDay(result.campaign.startInstant, snapshot.trajectoryDay || 0),
      currentEventId: snapshot.eventIds.at(-1) || null,
      layers: [
        ...(trajectory.length ? [
        layer('asteroid-trajectories', 'orbit_ensemble', [{
          id: 'asteroid-representative-trajectory',
          kind: 'synthetic_asteroid_trajectory',
          geometry: { type: 'line_string', coordinates: trajectory },
          quantities: { fitResidualRmsArcsec: result.metrics.fitResidualRmsArcsec },
          evidenceRefs: [result.fitReceipt.covarianceReceipt.scalePolicy],
          truth: truth('simulated'),
        }], 'trajectory_bundle', 'fitResidualRmsArcsec'),
        layer('earth-reference', 'reference_orbit', [{
          id: 'earth-reference-trajectory',
          kind: 'modeled_earth_reference',
          geometry: { type: 'line_string', coordinates: earthTrajectory },
          quantities: {},
          evidenceRefs: [forceModel.id],
          truth: truth('modeled'),
        }], 'none', null),
        ] : []),
        ...(encounterObjects.length ? [
          layer('asteroid-encounters', 'encounter_distribution', encounterObjects, 'distribution_cluster', 'minimumDistanceKm'),
        ] : []),
        ...(actorObjects.length ? [
          layer('asteroid-active-clone-layer', 'progress_actor', actorObjects, 'none', 'progressFraction'),
        ] : []),
      ],
      viewIntents: automaticView ? [{
        schema: 'simulatte.viewIntent.v4',
        mode: snapshot.status === 'settled' ? 'compare' : actorObjects.length ? 'follow' : 'overview',
        targetIds: actorObjects.length
          ? actorObjects.map((row) => row.id)
          : trajectory.length ? ['asteroid-representative-trajectory', 'earth-reference-trajectory'] : [],
        transitionReason: snapshot.eventIds.at(-1) ? `simulation_event:${snapshot.eventIds.at(-1)}` : 'scenario_ready',
        priority: 70,
        expiresAtEventId: null,
        mayInterruptManualOverride: false,
      }] : [],
    });
  }

  function adaptToV3(semantic) {
    const objects = semantic.layers.flatMap((row) => row.objects);
    const actors = objects.filter((row) => row.kind === 'synthetic_asteroid_actor');
    return deepFreeze({
      schema: 'simulatte.pluginPresentation.v3',
      coordinateSystem: 'heliocentric-ecliptic-au',
      epoch: semantic.epoch,
      markers: objects.filter((row) => row.kind === 'synthetic_encounter_sample').map((row) => ({
        id: row.id,
        position: row.geometry.coordinates,
        label: `${Math.round(row.quantities.minimumDistanceKm).toLocaleString()} km modeled closest approach`,
        tone: row.quantities.insideDeclaredScreen ? 'amber' : 'cyan',
        radius: row.quantities.insideDeclaredScreen ? 0.9 : 0.55,
      })),
      paths: objects.filter((row) => row.geometry.type === 'line_string').map((row) => ({
        id: row.id,
        coordinates: row.geometry.coordinates,
        label: row.kind === 'modeled_earth_reference' ? 'Modeled Earth reference' : 'Representative synthetic orbit clone',
        tone: row.kind === 'modeled_earth_reference' ? 'blue' : 'amber',
        width: 1.1,
      })),
      actors: actors.map((row) => ({
        id: row.id,
        position: row.geometry.coordinates,
        label: `Synthetic clone · ${Math.round(row.quantities.progressFraction * 100)}%`,
        tone: 'green',
        radius: 0.7,
      })),
      areas: [],
      cameraTargets: [{ id: 'asteroid-encounter', center: [1, 0, 0], label: 'Synthetic encounter region', distance: 2.4 }],
      viewIntents: semantic.viewIntents,
    });
  }

  function layer(id, semanticType, objects, method, quantity) {
    return {
      id,
      semanticType,
      objects,
      aggregationHint: { method, quantity },
      temporalVisibility: { kind: 'always' },
      pickBehavior: { kind: 'inspect_evidence' },
    };
  }
  function truth(origin) {
    return {
      origin,
      temporalStatus: 'forecast',
      uncertainty: { kind: 'distribution', value: { interpretation: 'Synthetic orbit and execution ensemble.' } },
    };
  }
  function positionAtDay(trajectory, day) {
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
  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }
  return Object.freeze({ adaptToV3, createSemanticPresentation });
});
