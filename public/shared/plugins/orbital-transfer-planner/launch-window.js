(function attachLaunchWindow(root, factory) {
  const api = factory(root);
  root.OrbitalTransferLaunchWindow = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createLaunchWindowModule(root) {
  const nodeEphemeris = typeof module === 'object' && module.exports ? require('./ephemeris.js') : null;
  const nodeLambert = typeof module === 'object' && module.exports ? require('./lambert.js') : null;
  const nodePatched = typeof module === 'object' && module.exports ? require('./patched-conic.js') : null;
  function scanLaunchWindow(options) {
    const ephemeris = nodeEphemeris || root.OrbitalTransferEphemeris;
    const lambert = nodeLambert || root.OrbitalTransferLambert;
    const patched = nodePatched || root.OrbitalTransferPatchedConic;
    if (!ephemeris || !lambert || !patched) throw new Error('launch_window_dependency_missing');
    const {
      ephemerisDataset, departureBodyId = 'earth', arrivalBodyId, gmSunAuD2,
      departureStartDay = 0, departureEndDay = 365, departureStepDays = 5,
      tofMinDays = 80, tofMaxDays = 400, tofStepDays = 5,
      objectiveWeights = { deltaV: 1, timeOfFlight: 0 }, bodyConstants = {},
      maximumCandidates = 64,
    } = options || {};
    if (!arrivalBodyId) throw new Error('launch_window_arrival_body_missing');
    const rows = [];
    let attempted = 0;
    let failed = 0;
    for (let departureDay = departureStartDay; departureDay <= departureEndDay + 1e-9; departureDay += departureStepDays) {
      const departureState = ephemeris.getBodyState(ephemerisDataset, departureBodyId, departureDay);
      for (let tofDays = tofMinDays; tofDays <= tofMaxDays + 1e-9; tofDays += tofStepDays) {
        attempted += 1;
        const arrivalDay = departureDay + tofDays;
        try {
          const arrivalState = ephemeris.getBodyState(ephemerisDataset, arrivalBodyId, arrivalDay);
          const transfer = lambert.solveLambert(departureState.positionAu, arrivalState.positionAu, tofDays, gmSunAuD2);
          if (!transfer.converged) { failed += 1; continue; }
          const endpoint = patched.evaluatePatchedConic({
            departureState, arrivalState, lambert: transfer,
            departureBody: bodyConstants[departureBodyId], arrivalBody: bodyConstants[arrivalBodyId],
          });
          const objective = endpoint.totalDeltaVKmS * Number(objectiveWeights.deltaV ?? 1)
            + tofDays * Number(objectiveWeights.timeOfFlight ?? 0);
          rows.push(Object.freeze({
            id: `${departureBodyId}-${arrivalBodyId}-${departureDay}-${tofDays}`,
            departureBodyId, arrivalBodyId, departureDay, arrivalDay, tofDays,
            departureEpoch: departureState.epochIso, arrivalEpoch: arrivalState.epochIso,
            objective, transfer, endpoint,
            trajectory: Object.freeze([departureState.positionAu, arrivalState.positionAu]),
          }));
        } catch (error) {
          if (['ephemeris_day_out_of_range', 'lambert_no_root', 'lambert_geometry_singular'].includes(error?.code)) { failed += 1; continue; }
          throw error;
        }
      }
    }
    rows.sort((left, right) => left.objective - right.objective || left.endpoint.totalDeltaVKmS - right.endpoint.totalDeltaVKmS || left.departureDay - right.departureDay || left.tofDays - right.tofDays || left.id.localeCompare(right.id));
    const candidates = rows.slice(0, maximumCandidates);
    return Object.freeze({
      schema: 'simulatte.launchWindowSearch.v1',
      departureBodyId, arrivalBodyId,
      search: Object.freeze({ departureStartDay, departureEndDay, departureStepDays, tofMinDays, tofMaxDays, tofStepDays, attempted, converged: rows.length, failed }),
      selected: candidates[0] || null,
      candidates: Object.freeze(candidates),
      deterministicTieBreak: 'objective_then_delta_v_then_departure_then_tof_then_id',
      claimBoundary: 'Bounded grid search over a pinned ephemeris with a single-revolution Lambert and patched-conic endpoint model.',
    });
  }
  return Object.freeze({ scanLaunchWindow });
});
