(function attachCounterfactualRunner(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteCounterfactualRunner = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCounterfactualApi() {
  const STREET_WORDS = Object.freeze({ avenue: 'av', ave: 'av', street: 'st', str: 'st', boulevard: 'blvd', road: 'rd', lane: 'ln', place: 'pl', square: 'sq' });
  async function compareCounterfactual({
    sdk, mission, routeObjective = {}, intervention,
  }) {
    validateIntervention(intervention);
    const baseline = await runLane({
      id: 'baseline', sdk, mission, routeObjective,
    });
    let changed = null;
    let challenger;
    try {
      changed = applyIntervention({ world: sdk.worldQuery.snapshot(), mission, routeObjective, intervention });
      challenger = await runLane({
        id: intervention.id, sdk, mission: changed.mission, routeObjective: changed.routeObjective,
      });
    } catch (error) {
      challenger = refusedLane(intervention.id, error);
    }
    const payload = {
      schema: 'simulatte.counterfactualComparison.v1',
      intervention: structuredClone(intervention),
      identities: {
        worldId: sdk.worldQuery.snapshot().id,
        worldContentVersion: sdk.worldQuery.snapshot().contentVersion,
        sourceSnapshotDate: sdk.worldQuery.snapshot().provenance.snapshotDate,
        embodimentId: mission.embodimentId,
        missionId: mission.id,
      },
      baseline,
      challenger,
      diff: outcomeDiff(baseline, challenger),
      claimBoundary: 'This compares deterministic simulated outcomes under one declared intervention. It does not predict live traffic, physical-world behavior, policy causality, or effects outside the governed world snapshot.',
    };
    return {
      ...payload,
      integrity: {
        algorithm: 'sha256-canonical-json-v1',
        payloadSha256: await sdk.receipts.sha256Hex(payload),
      },
    };
  }

  async function runLane({ id, sdk, mission, routeObjective }) {
    try {
      const journey = await sdk.simulation.run({ id, mission, routeObjective });
      return {
        schema: 'simulatte.counterfactualLane.v1', id, status: journey.finalState.status,
        terminalReason: journey.finalState.terminalReason, verificationPass: journey.verification.pass,
        route: routeSummary(journey.planning), settlement: structuredClone(journey.settlement),
        pluginAudits: structuredClone(journey.planning.pluginAudits),
        journeyReceiptSha256: await sdk.receipts.sha256Hex(journey), journeyTerminalHash: journey.integrity.terminalHash,
      };
    } catch (error) {
      return refusedLane(id, error);
    }
  }

  function routeSummary(planning) {
    const selected = planning.alternatives?.[0] || null;
    return {
      forecast: structuredClone(planning.forecast), segmentIds: selected ? [...selected.segmentIds] : [],
      alternativeCount: planning.alternatives?.length || 0, costBreakdown: structuredClone(selected?.costBreakdown || null),
    };
  }

  function refusedLane(id, error) {
    return {
      schema: 'simulatte.counterfactualLane.v1', id, status: 'refused',
      terminalReason: error.code || 'counterfactual_runtime_failure', verificationPass: false,
      route: null, settlement: null, pluginAudits: null,
      journeyReceiptSha256: null, journeyTerminalHash: null,
      failure: { code: error.code || 'counterfactual_runtime_failure', message: error.message, evidence: error.evidence || null },
    };
  }

  function applyIntervention({ world, mission, routeObjective = {}, intervention }) {
    const changedMission = structuredClone(mission);
    const changedRouteObjective = structuredClone(routeObjective);
    if (intervention.kind === 'close_street') {
      const canonical = governedStreetName(world, intervention.streetName);
      if (!canonical) throw counterfactualError('intervention_street_not_grounded', `Street closure expected a routed street, received ${intervention.streetName}`);
      changedMission.constraints.avoidStreetNames = [...new Set([...changedMission.constraints.avoidStreetNames, canonical])];
      const existing = changedMission.obligations.find((row) => row.kind === 'street_avoidance');
      if (existing) existing.required = true;
      else changedMission.obligations.push({ id: 'obligation-street-avoidance-counterfactual', kind: 'street_avoidance', required: true });
      changedMission.id = `${mission.id}-closed-${hash32(canonical).toString(16)}`;
    } else if (intervention.kind === 'historical_crash_weighting') {
      changedRouteObjective.historicalObservation = intervention.historicalObservationWeight;
    } else if (intervention.kind === 'world_snapshot') {
      if (intervention.snapshotDate !== world.provenance.snapshotDate) {
        throw counterfactualError('snapshot_not_loaded', `Loaded world is ${world.provenance.snapshotDate}; ${intervention.snapshotDate} requires a separately pinned world pack`);
      }
    }
    return { mission: changedMission, routeObjective: changedRouteObjective };
  }

  function outcomeDiff(baseline, challenger) {
    const baselineSegments = new Set(baseline.route?.segmentIds || []);
    const challengerSegments = new Set(challenger.route?.segmentIds || []);
    const shared = [...baselineSegments].filter((id) => challengerSegments.has(id)).length;
    const union = new Set([...baselineSegments, ...challengerSegments]).size;
    return {
      completionChanged: baseline.status !== challenger.status,
      verificationChanged: baseline.verificationPass !== challenger.verificationPass,
      predictedDurationDeltaSeconds: numericDelta(baseline.route?.forecast?.predictedDurationSeconds, challenger.route?.forecast?.predictedDurationSeconds),
      actualDurationDeltaSeconds: numericDelta(baseline.settlement?.actualDurationSeconds, challenger.settlement?.actualDurationSeconds),
      distanceDeltaM: numericDelta(baseline.settlement?.actualDistanceM, challenger.settlement?.actualDistanceM),
      accumulatedRiskDelta: numericDelta(baseline.route?.forecast?.accumulatedRiskScore, challenger.route?.forecast?.accumulatedRiskScore),
      historicalCrashDelta: numericDelta(auditValue(baseline, 'crashCount'), auditValue(challenger, 'crashCount')),
      historicalInjuryDelta: numericDelta(auditValue(baseline, 'injuryCount'), auditValue(challenger, 'injuryCount')),
      historicalObservationScoreDelta: numericDelta(auditValue(baseline, 'historicalObservationScore'), auditValue(challenger, 'historicalObservationScore')),
      routeJaccard: union ? Number((shared / union).toFixed(9)) : null,
      baselineOnlySegmentIds: [...baselineSegments].filter((id) => !challengerSegments.has(id)).sort(),
      challengerOnlySegmentIds: [...challengerSegments].filter((id) => !baselineSegments.has(id)).sort(),
    };
  }

  function auditValue(lane, key) {
    const rows = Object.values(lane.pluginAudits || {});
    const audit = rows.find((row) => Number.isFinite(row?.[key]));
    return audit?.[key] ?? null;
  }

  function governedStreetName(world, requested) {
    const key = normalizeStreetName(requested);
    return [...new Set(world.segments.map((segment) => segment.source?.street).filter(Boolean))]
      .sort().find((name) => normalizeStreetName(name) === key) || null;
  }

  function normalizeStreetName(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean).map((word) => STREET_WORDS[word] || word).join(' ');
  }

  function validateIntervention(intervention) {
    if (!intervention || !['close_street', 'historical_crash_weighting', 'world_snapshot'].includes(intervention.kind)) {
      throw counterfactualError('intervention_invalid', 'Expected close_street, historical_crash_weighting, or world_snapshot intervention');
    }
    if (!intervention.id) throw counterfactualError('intervention_id_missing', 'Intervention requires an ID');
    if (intervention.kind === 'close_street' && !intervention.streetName) throw counterfactualError('intervention_street_missing', 'Street closure requires streetName');
    if (intervention.kind === 'historical_crash_weighting' && !(intervention.historicalObservationWeight > 0)) throw counterfactualError('intervention_weight_invalid', 'Historical crash weighting requires a positive historicalObservationWeight');
    if (intervention.kind === 'world_snapshot' && !/^\d{4}-\d{2}-\d{2}$/.test(intervention.snapshotDate || '')) throw counterfactualError('intervention_snapshot_invalid', 'World snapshot requires YYYY-MM-DD');
  }

  function numericDelta(left, right) {
    return Number.isFinite(left) && Number.isFinite(right) ? Number((right - left).toFixed(9)) : null;
  }

  function hash32(value) {
    let hash = 2166136261;
    for (const character of String(value)) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function counterfactualError(code, message, evidence = null) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteCounterfactualError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return { applyIntervention, compareCounterfactual, governedStreetName, outcomeDiff };
});
