(function attachInterstellarNetworkRouter(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.InterstellarNetworkRouter = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createInterstellarNetworkRouter() {
  const MAXIMUM_SEARCH_ATTEMPTS = 4096;
  const MAXIMUM_CANDIDATE_PATHS = 4096;
  const MAXIMUM_ALTERNATIVES = 5;

  function selectRoute({
    stellarStates,
    sourceId,
    targetId,
    routingMode,
    requiredRelayIds = [],
    eligibleRelayIds = [],
    maxHops,
    maxHopDistancePc,
    objective,
    processingDelayHours,
    evaluateEdge,
  }) {
    const statesById = new Map(stellarStates.map((row) => [row.sourceId, row]));
    requireEndpoint(statesById, sourceId, 'source');
    requireEndpoint(statesById, targetId, 'target');
    if (sourceId === targetId) throw routeError('interstellar_route_endpoints_equal', sourceId);
    if (!['direct', 'automatic', 'manual'].includes(routingMode)) {
      throw routeError('interstellar_routing_mode_invalid', routingMode);
    }
    if (!Number.isInteger(maxHops) || maxHops < 1 || maxHops > 8) {
      throw routeError('interstellar_route_hop_limit_invalid', maxHops);
    }
    if (!(maxHopDistancePc > 0) || maxHopDistancePc > 250000) {
      throw routeError('interstellar_route_distance_limit_invalid', maxHopDistancePc);
    }
    const edgeCache = new Map();
    const rejected = { distance: 0, unusable: 0, repeated: 0 };
    const required = [...new Set(requiredRelayIds)]
      .filter((id) => id !== 'none' && id !== sourceId && id !== targetId);
    required.forEach((id) => requireEndpoint(statesById, id, 'required relay'));
    let searchAttempts = 0;
    const edge = (fromId, toId) => {
      const id = `${fromId}->${toId}`;
      if (edgeCache.has(id)) return edgeCache.get(id);
      searchAttempts += 1;
      if (searchAttempts > MAXIMUM_SEARCH_ATTEMPTS) {
        throw routeError('interstellar_route_search_bound_exceeded', MAXIMUM_SEARCH_ATTEMPTS);
      }
      const from = statesById.get(fromId);
      const to = statesById.get(toId);
      const distancePc = distance(from.positionPc, to.positionPc);
      if (distancePc > maxHopDistancePc) {
        rejected.distance += 1;
        edgeCache.set(id, null);
        return null;
      }
      const evaluated = evaluateEdge(from, to, distancePc);
      if (
        !(evaluated?.latencySeconds >= 0)
        || !(evaluated?.effectiveDataRateGbps > 0)
        || !(evaluated?.packetSuccessProbability >= 0)
      ) {
        rejected.unusable += 1;
        edgeCache.set(id, null);
        return null;
      }
      const value = Object.freeze({ id, fromId, toId, distancePc, ...evaluated });
      edgeCache.set(id, value);
      return value;
    };
    const pathSearch = routingMode === 'direct'
      ? { paths: [[sourceId, targetId]], attempts: 1, truncated: false }
      : routingMode === 'manual'
        ? manualPaths(sourceId, targetId, requiredRelayIds, maxHops, statesById)
        : automaticPaths({
          sourceId,
          targetId,
          eligibleRelayIds,
          requiredRelayIds: required,
          maxHops,
          edge,
          onRepeated: () => { rejected.repeated += 1; },
        });
    const candidatePaths = pathSearch.paths;
    const candidates = candidatePaths.map((path) => evaluatePath(path, edge, processingDelayHours)).filter(Boolean);
    if (!candidates.length) {
      throw routeError('interstellar_route_unreachable', `${sourceId}->${targetId}`);
    }
    const ranked = rankCandidates(candidates, objective);
    return deepFreeze({
      schema: 'simulatte.interstellarRouteSelectionReceipt.v1',
      sourceId,
      targetId,
      routingMode,
      objective,
      maxHops,
      maxHopDistancePc,
      requiredRelayIds: required,
      eligibleRelayIds: [...new Set(eligibleRelayIds)],
      candidateCount: candidates.length,
      pathSearchAttempts: pathSearch.attempts,
      pathSearchBound: MAXIMUM_CANDIDATE_PATHS,
      pathSearchTruncated: pathSearch.truncated,
      evaluatedEdgeCount: edgeCache.size,
      searchAttempts,
      searchBound: MAXIMUM_SEARCH_ATTEMPTS,
      rejected,
      selectedPath: ranked[0].path,
      selectedMetrics: ranked[0].metrics,
      alternatives: ranked.slice(0, MAXIMUM_ALTERNATIVES),
      deterministicTieBreak: 'score_then_path-id',
    });
  }

  function automaticPaths({
    sourceId,
    targetId,
    eligibleRelayIds,
    requiredRelayIds,
    maxHops,
    edge,
    onRepeated,
  }) {
    const relays = [...new Set(eligibleRelayIds)]
      .filter((id) => id !== sourceId && id !== targetId)
      .sort();
    const paths = [];
    let truncated = false;
    let stateVisits = 0;
    const visit = (path) => {
      if (truncated) return;
      if (stateVisits >= MAXIMUM_CANDIDATE_PATHS) {
        truncated = true;
        return;
      }
      stateVisits += 1;
      const current = path.at(-1);
      if (path.length - 1 < maxHops && edge(current, targetId)) {
        const candidate = [...path, targetId];
        if (requiredRelayIds.every((id) => candidate.includes(id))) {
          if (paths.length >= MAXIMUM_CANDIDATE_PATHS) {
            truncated = true;
            return;
          }
          paths.push(candidate);
        }
      }
      if (path.length - 1 >= maxHops - 1) return;
      for (const relayId of relays) {
        if (path.includes(relayId)) {
          onRepeated();
          continue;
        }
        if (edge(current, relayId)) visit([...path, relayId]);
        if (truncated) break;
      }
    };
    visit([sourceId]);
    return { paths, attempts: stateVisits, truncated };
  }

  function manualPaths(sourceId, targetId, requiredRelayIds, maxHops, statesById) {
    const required = [...new Set(requiredRelayIds)]
      .filter((id) => id !== 'none' && id !== sourceId && id !== targetId);
    required.forEach((id) => requireEndpoint(statesById, id, 'manual relay'));
    if (required.length + 1 > maxHops) {
      throw routeError('interstellar_manual_route_hop_limit_exceeded', required.length + 1);
    }
    const permutationsResult = boundedPermutations(required);
    return {
      paths: permutationsResult.rows.map((relays) => [sourceId, ...relays, targetId]),
      attempts: permutationsResult.attempts,
      truncated: permutationsResult.truncated,
    };
  }

  function boundedPermutations(values) {
    const rows = [];
    let truncated = false;
    let attempts = 0;
    const visit = (prefix, remaining) => {
      if (truncated) return;
      if (!remaining.length) {
        if (rows.length >= MAXIMUM_CANDIDATE_PATHS) {
          truncated = true;
          return;
        }
        attempts += 1;
        rows.push(prefix);
        return;
      }
      remaining.forEach((value, index) => {
        if (truncated) return;
        visit([...prefix, value], remaining.filter((_, candidateIndex) => candidateIndex !== index));
      });
    };
    visit([], values);
    return { rows, attempts, truncated };
  }

  function evaluatePath(path, edge, processingDelayHours) {
    const edges = [];
    for (let index = 0; index < path.length - 1; index += 1) {
      const evaluated = edge(path[index], path[index + 1]);
      if (!evaluated) return null;
      edges.push(evaluated);
    }
    const processingSeconds = Math.max(0, path.length - 2) * processingDelayHours * 3600;
    const latencySeconds = edges.reduce((sum, row) => sum + row.latencySeconds, processingSeconds);
    const bottleneckDataRateGbps = Math.min(...edges.map((row) => row.effectiveDataRateGbps));
    const transmissionEnergyJ = edges.reduce((sum, row) => sum + row.transmissionEnergyJ, 0);
    const packetSuccessProbability = edges.reduce(
      (product, row) => product * row.packetSuccessProbability,
      1,
    );
    return {
      path,
      edgeIds: edges.map((row) => row.id),
      metrics: {
        hopCount: edges.length,
        latencySeconds,
        bottleneckDataRateGbps,
        transmissionEnergyJ,
        packetSuccessProbability,
      },
    };
  }

  function rankCandidates(candidates, objective) {
    const supported = ['latency', 'throughput', 'energy', 'reliability', 'balanced'];
    if (!supported.includes(objective)) throw routeError('interstellar_route_objective_invalid', objective);
    const domains = {
      latencySeconds: extent(candidates, 'latencySeconds'),
      bottleneckDataRateGbps: extent(candidates, 'bottleneckDataRateGbps'),
      transmissionEnergyJ: extent(candidates, 'transmissionEnergyJ'),
      packetSuccessProbability: extent(candidates, 'packetSuccessProbability'),
    };
    return candidates.map((candidate) => {
      const metrics = candidate.metrics;
      const score = objective === 'latency' ? normalize(metrics.latencySeconds, domains.latencySeconds)
        : objective === 'throughput' ? 1 - normalize(metrics.bottleneckDataRateGbps, domains.bottleneckDataRateGbps)
          : objective === 'energy' ? normalize(metrics.transmissionEnergyJ, domains.transmissionEnergyJ)
            : objective === 'reliability' ? 1 - normalize(metrics.packetSuccessProbability, domains.packetSuccessProbability)
              : (
                normalize(metrics.latencySeconds, domains.latencySeconds)
                + (1 - normalize(metrics.bottleneckDataRateGbps, domains.bottleneckDataRateGbps))
                + normalize(metrics.transmissionEnergyJ, domains.transmissionEnergyJ)
                + (1 - normalize(metrics.packetSuccessProbability, domains.packetSuccessProbability))
              ) / 4;
      return { ...candidate, score };
    }).sort((left, right) => left.score - right.score || left.path.join(':').localeCompare(right.path.join(':')));
  }

  function extent(candidates, key) {
    const values = candidates.map((row) => row.metrics[key]);
    return [Math.min(...values), Math.max(...values)];
  }
  function normalize(value, [minimum, maximum]) {
    return maximum === minimum ? 0 : (value - minimum) / (maximum - minimum);
  }
  function requireEndpoint(statesById, id, role) {
    if (!statesById.has(id)) throw routeError('interstellar_route_star_missing', `${role}:${id}`);
  }
  function distance(left, right) {
    return Math.hypot(...right.map((value, index) => value - left[index]));
  }
  function routeError(code, detail) {
    const error = new Error(`${code}: ${detail}`);
    error.code = code;
    return error;
  }
  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  return Object.freeze({ MAXIMUM_CANDIDATE_PATHS, MAXIMUM_SEARCH_ATTEMPTS, selectRoute });
});
