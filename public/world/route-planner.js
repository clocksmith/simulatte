(function attachAutonomyRoutePlanner(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyRoutePlanner = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyRoutePlanner() {
  const STREET_WORDS = Object.freeze({ avenue: 'av', ave: 'av', street: 'st', str: 'st', boulevard: 'blvd', road: 'rd', lane: 'ln', place: 'pl', square: 'sq' });
  const safetyRowsCache = new WeakMap();

  function planRoute({ worldModel, originNodeId, destinationNodeId, mode, tick, mission, policy, excludedSegmentIds = [], routeAmenityIndex = null, safetyHistoryIndex = null }) {
    const governedOverride = declaredRouteOverride({
      worldModel, originNodeId, destinationNodeId, mode, tick, mission, policy,
      excludedSegmentIds, safetyHistoryIndex,
    });
    if (governedOverride) return governedOverride;
    const avoidedStreetNames = new Set(mission.constraints.avoidStreetNames || []);
    const avoidedStreetKeys = new Set([...avoidedStreetNames].map(normalizeStreetName));
    const excludedStreetSegmentIds = new Set();
    const candidateExcludedSegmentIds = new Set(excludedSegmentIds);
    const excludedAmenitySegmentIds = new Set();
    const amenityRows = routeAmenityIndex ? new Map(routeAmenityIndex.segmentRows.map((row) => [row.segmentId, row])) : null;
    const safetyRows = rowsBySegment(safetyHistoryIndex);
    if (originNodeId === destinationNodeId) {
      return routeResult([], 0, [originNodeId], 0, routeCostBreakdown([], worldModel, mission, policy, safetyHistoryIndex), 'a_star_v1', routeConstraintReceipt(avoidedStreetNames, excludedStreetSegmentIds, candidateExcludedSegmentIds, excludedAmenitySegmentIds, mission.constraints.maximumBikeRackDistanceM));
    }
    const blocked = new Set(worldModel.blockedSegmentIds(tick));
    const maximumSpeedMps = worldModel.world.segments.reduce((maximum, segment) => segment.allowedModes.includes(mode) ? Math.max(maximum, segment.speedLimitMps) : maximum, 1);
    const open = createMinHeap(compareOpenRows);
    open.push({ nodeId: originNodeId, cost: 0, estimate: heuristic(worldModel, originNodeId, destinationNodeId, maximumSpeedMps), path: [] });
    const bestCost = new Map([[originNodeId, 0]]);
    const visited = [];
    let evaluatedSegmentCount = 0;

    while (open.size) {
      const current = open.pop();
      if (current.cost > (bestCost.get(current.nodeId) ?? Infinity)) continue;
      visited.push(current.nodeId);
      if (current.nodeId === destinationNodeId) {
        return routeResult(
          current.path,
          current.cost,
          visited,
          evaluatedSegmentCount,
          routeCostBreakdown(current.path, worldModel, mission, policy, safetyHistoryIndex),
          'a_star_v1',
          routeConstraintReceipt(avoidedStreetNames, excludedStreetSegmentIds, candidateExcludedSegmentIds, excludedAmenitySegmentIds, mission.constraints.maximumBikeRackDistanceM)
        );
      }
      for (const segment of worldModel.outgoing(current.nodeId)) {
        evaluatedSegmentCount += 1;
        if (!segment.allowedModes.includes(mode)) continue;
        if (policy.route.blockedSegmentsAreIneligible && blocked.has(segment.id)) continue;
        if (candidateExcludedSegmentIds.has(segment.id)) continue;
        if (mission.constraints.maximumBikeRackDistanceM !== null) {
          const amenityRow = amenityRows?.get(segment.id);
          if (!amenityRow || amenityRow.maximumNearestRackDistanceM === null || amenityRow.maximumNearestRackDistanceM > mission.constraints.maximumBikeRackDistanceM) {
            excludedAmenitySegmentIds.add(segment.id);
            continue;
          }
        }
        if (avoidedStreetKeys.has(normalizeStreetName(segment.source?.street))) {
          excludedStreetSegmentIds.add(segment.id);
          continue;
        }
        const nextCost = current.cost + segmentCost(segment, mission, policy, safetyRows?.get(segment.id));
        const previous = bestCost.get(segment.toNodeId);
        if (previous !== undefined && nextCost >= previous - 1e-12) continue;
        bestCost.set(segment.toNodeId, nextCost);
        open.push({
          nodeId: segment.toNodeId,
          cost: nextCost,
          estimate: nextCost + heuristic(worldModel, segment.toNodeId, destinationNodeId, maximumSpeedMps),
          path: [...current.path, segment.id],
        });
      }
    }
    const error = new Error(`route_not_found: ${originNodeId} to ${destinationNodeId} at tick ${tick} has no ${mode} path`);
    error.name = 'AutonomyRouteError';
    error.code = 'route_not_found';
    error.evidence = {
      originNodeId,
      destinationNodeId,
      tick,
      mode,
      blockedSegmentIds: [...blocked].sort(),
      avoidedStreetNames: [...avoidedStreetNames].sort(),
      excludedStreetSegmentIds: [...excludedStreetSegmentIds].sort(),
      candidateExcludedSegmentIds: [...candidateExcludedSegmentIds].sort(),
      excludedAmenitySegmentIds: [...excludedAmenitySegmentIds].sort(),
      maximumBikeRackDistanceM: mission.constraints.maximumBikeRackDistanceM,
      visitedNodeIds: visited,
    };
    throw error;
  }

  function declaredRouteOverride({ worldModel, originNodeId, destinationNodeId, mode, tick, mission, policy, excludedSegmentIds, safetyHistoryIndex }) {
    const override = mission.constraints.routeOverride;
    if (!override || !Array.isArray(override.segmentIds) || !override.segmentIds.length || excludedSegmentIds.length) return null;
    const blocked = new Set(worldModel.blockedSegmentIds(tick));
    const segments = override.segmentIds.map((id) => worldModel.segment(id));
    const startIndex = segments.findIndex((segment) => segment.fromNodeId === originNodeId);
    if (startIndex < 0) return null;
    const suffix = segments.slice(startIndex);
    if (suffix.at(-1).toNodeId !== destinationNodeId) return null;
    if (suffix.some((segment, index) => blocked.has(segment.id)
      || !segment.allowedModes.includes(mode)
      || (index > 0 && suffix[index - 1].toNodeId !== segment.fromNodeId))) return null;
    const segmentIds = suffix.map((row) => row.id);
    const costBreakdown = routeCostBreakdown(segmentIds, worldModel, mission, policy, safetyHistoryIndex);
    return routeResult(segmentIds, costBreakdown.total, suffix.map((row) => row.fromNodeId), suffix.length, costBreakdown, 'governed_environment_route_v1', {
      environmentFieldId: override.environmentFieldId,
      environmentSelectionId: override.selectionId,
      environmentObjective: override.objective,
      ...routeConstraintReceipt(new Set(), new Set(), new Set(), new Set(), mission.constraints.maximumBikeRackDistanceM),
    });
  }

  function planRouteAlternatives(args, maximumAlternatives = 3) {
    const baseline = planRoute(args);
    const candidates = new Map([[baseline.segmentIds.join('|'), { ...baseline, alternativeKind: 'baseline', deviatedFromSegmentId: null }]]);
    for (const segmentId of baseline.segmentIds) {
      if (candidates.size >= maximumAlternatives * 4) break;
      try {
        const route = planRoute({ ...args, excludedSegmentIds: [...(args.excludedSegmentIds || []), segmentId] });
        const key = route.segmentIds.join('|');
        if (route.segmentIds.length && !candidates.has(key)) candidates.set(key, { ...route, alternativeKind: 'single_edge_deviation', deviatedFromSegmentId: segmentId });
      } catch (error) {
        if (error.code !== 'route_not_found') throw error;
      }
    }
    return [...candidates.values()]
      .sort((left, right) => left.cost - right.cost || left.segmentIds.join('|').localeCompare(right.segmentIds.join('|')))
      .slice(0, maximumAlternatives)
      .map((route, index) => ({ ...route, alternativeRank: index + 1, forecast: forecastRoute(route, args.worldModel, args.mission, args.safetyHistoryIndex) }));
  }

  function forecastRoute(route, worldModel, mission, safetyHistoryIndex = null) {
    const segments = route.segmentIds.map((id) => worldModel.segment(id));
    const safetyRows = rowsBySegment(safetyHistoryIndex);
    const historical = segments.map((segment) => safetyRows?.get(segment.id)).filter(Boolean);
    const distanceM = segments.reduce((sum, segment) => sum + segment.lengthM, 0);
    const freeFlowSeconds = segments.reduce((sum, segment) => sum + segment.lengthM / Math.min(segment.speedLimitMps, mission.constraints.maximumSpeedMps), 0);
    const protectedDistanceM = segments.filter((segment) => segment.laneType === 'protected').reduce((sum, segment) => sum + segment.lengthM, 0);
    return {
      schema: 'simulatte.autonomyRouteForecast.v1',
      method: 'segment_speed_free_flow_v1',
      distanceM: round(distanceM),
      predictedDurationSeconds: round(freeFlowSeconds),
      accumulatedRiskScore: round(segments.reduce((sum, segment) => sum + segment.riskScore, 0)),
      historicalCrashCount: historical.reduce((sum, row) => sum + row.crashCount, 0),
      historicalInjuryCount: historical.reduce((sum, row) => sum + row.injuryCount, 0),
      historicalFatalityCount: historical.reduce((sum, row) => sum + row.fatalityCount, 0),
      historicalObservationScore: historical.reduce((sum, row) => sum + row.historicalObservationScore, 0),
      safetyHistoryIndexId: safetyHistoryIndex?.id || null,
      protectedDistanceRatio: distanceM ? round(protectedDistanceM / distanceM) : 0,
      assumptions: ['segment_speed_limits', 'no_signal_delay', 'no_actor_delay', 'no_unmodeled_congestion'],
      claimBoundary: 'This is a deterministic free-flow forecast over the governed route. Historical crash observations have no exposure denominator and are descriptive, not a safest-route or live-risk claim. Settlement against executed simulated time is required before timing becomes calibration evidence.',
    };
  }

  function planCircuitRoute({ worldModel, circuitId, currentNodeId, mode, tick, mission, policy }) {
    const circuit = (worldModel.world.circuits || []).find((row) => row.id === circuitId);
    if (!circuit) throw routeError('circuit_not_found', `World ${worldModel.world.id} has no circuit ${circuitId}`, { circuitId });
    if (circuit.mode !== mode) throw routeError('circuit_mode_mismatch', `Circuit ${circuitId} allows ${circuit.mode}, received ${mode}`, { circuitId, expectedMode: circuit.mode, mode });
    const startIndex = circuit.nodeIds.indexOf(currentNodeId);
    if (startIndex < 0) throw routeError('circuit_entry_mismatch', `Node ${currentNodeId} is not on circuit ${circuitId}`, { circuitId, currentNodeId });
    const segmentIds = [...circuit.segmentIds.slice(startIndex), ...circuit.segmentIds.slice(0, startIndex)];
    const blocked = new Set(worldModel.blockedSegmentIds(tick));
    const blockedCircuitIds = segmentIds.filter((id) => blocked.has(id));
    if (blockedCircuitIds.length) {
      throw routeError('circuit_blocked', `Circuit ${circuitId} has ${blockedCircuitIds.length} blocked segment(s) at tick ${tick}`, {
        circuitId, tick, blockedSegmentIds: blockedCircuitIds,
      });
    }
    const ineligibleIds = segmentIds.filter((id) => !worldModel.segment(id).allowedModes.includes(mode));
    if (ineligibleIds.length) throw routeError('circuit_mode_ineligible', `Circuit ${circuitId} contains segment(s) unavailable to ${mode}`, { circuitId, mode, segmentIds: ineligibleIds });
    const costBreakdown = routeCostBreakdown(segmentIds, worldModel, mission, policy);
    return routeResult(
      segmentIds,
      costBreakdown.total,
      [...circuit.nodeIds.slice(startIndex), ...circuit.nodeIds.slice(0, startIndex)],
      segmentIds.length,
      costBreakdown,
      'declared_closed_circuit_v1',
      { circuitId, circuitLengthM: circuit.lengthM, ...routeConstraintReceipt(new Set(), new Set(), new Set(), new Set(), null) }
    );
  }

  function segmentCost(segment, mission, policy, safetyRow = null) {
    const travel = segment.lengthM / segment.speedLimitMps * policy.route.travelWeight;
    const risk = segment.riskScore * policy.route.riskWeight;
    const historical = (safetyRow?.historicalObservationScore || 0) * (policy.route.historicalObservationWeight || 0);
    const preference = mission.constraints.lanePreference === 'protected' && segment.laneType === 'shared'
      ? policy.route.unprotectedPreferencePenalty : 0;
    return travel + risk + historical + preference;
  }

  function routeCostBreakdown(segmentIds, worldModel, mission, policy, safetyHistoryIndex = null) {
    const safetyRows = rowsBySegment(safetyHistoryIndex);
    const components = segmentIds.reduce((total, segmentId) => {
      const segment = worldModel.segment(segmentId);
      total.travel += segment.lengthM / segment.speedLimitMps * policy.route.travelWeight;
      total.risk += segment.riskScore * policy.route.riskWeight;
      total.historical += (safetyRows?.get(segmentId)?.historicalObservationScore || 0) * (policy.route.historicalObservationWeight || 0);
      if (mission.constraints.lanePreference === 'protected' && segment.laneType === 'shared') {
        total.preference += policy.route.unprotectedPreferencePenalty;
      }
      return total;
    }, { travel: 0, risk: 0, historical: 0, preference: 0 });
    return {
      travel: round(components.travel),
      risk: round(components.risk),
      historical: round(components.historical),
      preference: round(components.preference),
      total: round(components.travel + components.risk + components.historical + components.preference),
      formula: 'sum(lengthM / speedLimitMps * travelWeight + riskScore * riskWeight + historicalObservationScore * historicalObservationWeight + preferencePenalty)',
      weights: {
        travelWeight: policy.route.travelWeight,
        riskWeight: policy.route.riskWeight,
        historicalObservationWeight: policy.route.historicalObservationWeight || 0,
        unprotectedPreferencePenalty: policy.route.unprotectedPreferencePenalty,
      },
    };
  }

  function rowsBySegment(index) {
    if (!index) return null;
    if (!safetyRowsCache.has(index)) safetyRowsCache.set(index, new Map(index.segmentRows.map((row) => [row.segmentId, row])));
    return safetyRowsCache.get(index);
  }

  function heuristic(worldModel, fromNodeId, destinationNodeId, maximumSpeedMps = 7) {
    const from = worldModel.node(fromNodeId).position;
    const to = worldModel.node(destinationNodeId).position;
    return Math.hypot(from.x - to.x, from.y - to.y) / maximumSpeedMps;
  }

  function compareOpenRows(left, right) {
    return left.estimate - right.estimate || left.cost - right.cost || left.nodeId.localeCompare(right.nodeId) || left.path.join('|').localeCompare(right.path.join('|'));
  }

  function routeResult(segmentIds, cost, visitedNodeIds, evaluatedSegmentCount, costBreakdown, algorithm = 'a_star_v1', extension = {}) {
    return {
      schema: 'simulatte.autonomyRoutePlan.v2',
      algorithm,
      segmentIds,
      cost: round(cost),
      visitedNodeIds,
      evaluatedSegmentCount,
      costBreakdown,
      deterministicTieBreak: algorithm === 'a_star_v1' ? 'segment_id_ascending' : 'declared_circuit_order',
      ...extension,
    };
  }

  function routeConstraintReceipt(avoidedStreetNames, excludedStreetSegmentIds, candidateExcludedSegmentIds = new Set(), excludedAmenitySegmentIds = new Set(), maximumBikeRackDistanceM = null) {
    return {
      avoidedStreetNames: [...avoidedStreetNames].sort(),
      excludedStreetSegmentIds: [...excludedStreetSegmentIds].sort(),
      candidateExcludedSegmentIds: [...candidateExcludedSegmentIds].sort(),
      excludedAmenitySegmentIds: [...excludedAmenitySegmentIds].sort(),
      maximumBikeRackDistanceM,
    };
  }

  function routeError(code, message, evidence) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'AutonomyRouteError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  function round(value) {
    return Number(value.toFixed(9));
  }

  function normalizeStreetName(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean).map((word) => STREET_WORDS[word] || word).join(' ');
  }

  function createMinHeap(compare) {
    const rows = [];
    return {
      get size() { return rows.length; },
      push(value) {
        rows.push(value);
        let index = rows.length - 1;
        while (index > 0) {
          const parent = Math.floor((index - 1) / 2);
          if (compare(rows[parent], rows[index]) <= 0) break;
          [rows[parent], rows[index]] = [rows[index], rows[parent]];
          index = parent;
        }
      },
      pop() {
        const first = rows[0];
        const last = rows.pop();
        if (rows.length) {
          rows[0] = last;
          let index = 0;
          while (true) {
            const left = index * 2 + 1;
            const right = left + 1;
            let smallest = index;
            if (left < rows.length && compare(rows[left], rows[smallest]) < 0) smallest = left;
            if (right < rows.length && compare(rows[right], rows[smallest]) < 0) smallest = right;
            if (smallest === index) break;
            [rows[index], rows[smallest]] = [rows[smallest], rows[index]];
            index = smallest;
          }
        }
        return first;
      },
    };
  }

  return { forecastRoute, normalizeStreetName, planCircuitRoute, planRoute, planRouteAlternatives, routeCostBreakdown, segmentCost };
});
