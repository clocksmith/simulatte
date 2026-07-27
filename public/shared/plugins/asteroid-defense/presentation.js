(function attachAsteroidPresentation(root, factory) {
  const propagation = typeof module === 'object' && module.exports
    ? require('../../core/simulation/n-body-propagation.js') : root.SimulatteNBodyPropagation;
  const api = factory(propagation);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAsteroidPresentation = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAsteroidPresentation(propagation) {
  function createSemanticPresentation({ result, snapshot, forceModel }) {
    const encounter = snapshot.interventionEncounter
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
    return deepFreeze({
      schema: 'simulatte.semanticPresentation.v4',
      coordinateSystem: 'heliocentric-ecliptic-au',
      epoch: result.campaign.startInstant,
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
      ],
      viewIntents: [{
        schema: 'simulatte.viewIntent.v4',
        mode: snapshot.status === 'settled' ? 'compare' : snapshot.status.includes('propagated') ? 'follow' : 'overview',
        targetIds: snapshot.status.includes('propagated')
          ? encounterObjects.map((row) => row.id)
          : trajectory.length ? ['asteroid-representative-trajectory', 'earth-reference-trajectory'] : [],
        transitionReason: snapshot.eventIds.at(-1) ? `simulation_event:${snapshot.eventIds.at(-1)}` : 'scenario_ready',
        priority: 70,
        expiresAtEventId: null,
        mayInterruptManualOverride: false,
      }],
    });
  }

  function adaptToV3(semantic) {
    const objects = semantic.layers.flatMap((row) => row.objects);
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
      actors: [],
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
  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }
  return Object.freeze({ adaptToV3, createSemanticPresentation });
});
