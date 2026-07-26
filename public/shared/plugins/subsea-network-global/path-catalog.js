(function attachSubseaPathCatalog(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSubseaPathCatalog = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSubseaPathCatalog() {
  const MAX_EXPANSIONS_PER_DEMAND = 4096;

  function buildPathCatalog({
    edges,
    demands,
    failedEdgeIds = [],
    excludedLandingIds = [],
    pathLimitPerCommodity,
  }) {
    if (!Number.isInteger(pathLimitPerCommodity) || pathLimitPerCommodity < 1 || pathLimitPerCommodity > 16) {
      throw pathError('subsea_path_limit_invalid', 'pathLimitPerCommodity must be an integer from 1 to 16');
    }
    const failed = new Set(failedEdgeIds);
    const excluded = new Set(excludedLandingIds);
    const activeEdges = edges.filter((edge) => !failed.has(edge.id)
      && !excluded.has(edge.fromLandingId)
      && !excluded.has(edge.toLandingId));
    const arcs = activeEdges.flatMap((edge) => [
      arc(edge, edge.fromLandingId, edge.toLandingId, 'forward'),
      ...(edge.isBidirectional ? [arc(edge, edge.toLandingId, edge.fromLandingId, 'reverse')] : []),
    ]);
    const adjacency = new Map();
    arcs.forEach((row) => {
      const rows = adjacency.get(row.fromLandingId) || [];
      rows.push(row);
      adjacency.set(row.fromLandingId, rows);
    });
    adjacency.forEach((rows) => rows.sort(compareArc));

    const rejected = [];
    const paths = demands.flatMap((demand) => enumeratePaths({
      demand,
      adjacency,
      pathLimit: pathLimitPerCommodity,
      rejected,
    }));
    return deepFreeze({
      schema: 'simulatte.plugin.subseaPathCatalogReceipt.v1',
      algorithm: 'deterministic-bounded-loop-free-uniform-cost-v1',
      pathLimitPerCommodity,
      activeEdgeIds: activeEdges.map((row) => row.id).sort(),
      failedEdgeIds: [...failed].sort(),
      excludedLandingIds: [...excluded].sort(),
      paths,
      rejected,
      catalogHash: stableHash({ paths, failedEdgeIds: [...failed].sort(), excludedLandingIds: [...excluded].sort() }),
    });
  }

  function enumeratePaths({ demand, adjacency, pathLimit, rejected }) {
    if (demand.originLandingId === demand.destinationLandingId) {
      rejected.push(rejection(demand.id, 'origin_equals_destination', []));
      return [];
    }
    const frontier = [{
      nodeId: demand.originLandingId,
      nodeIds: [demand.originLandingId],
      arcs: [],
      cost: 0,
    }];
    const accepted = [];
    let expansions = 0;
    while (frontier.length && accepted.length < pathLimit && expansions < MAX_EXPANSIONS_PER_DEMAND) {
      frontier.sort(compareCandidate);
      const candidate = frontier.shift();
      if (candidate.nodeId === demand.destinationLandingId) {
        accepted.push(pathRow(demand, candidate, accepted.length));
        continue;
      }
      const nextArcs = adjacency.get(candidate.nodeId) || [];
      if (!nextArcs.length) {
        rejected.push(rejection(demand.id, 'dead_end', candidate.nodeIds));
        continue;
      }
      for (const nextArc of nextArcs) {
        if (candidate.nodeIds.includes(nextArc.toLandingId)) {
          rejected.push(rejection(demand.id, 'loop_rejected', [...candidate.nodeIds, nextArc.toLandingId]));
          continue;
        }
        frontier.push({
          nodeId: nextArc.toLandingId,
          nodeIds: [...candidate.nodeIds, nextArc.toLandingId],
          arcs: [...candidate.arcs, nextArc],
          cost: candidate.cost + nextArc.latencyMs,
        });
      }
      expansions += 1;
    }
    if (!accepted.length) rejected.push(rejection(demand.id, 'disconnected', [demand.originLandingId]));
    if (expansions >= MAX_EXPANSIONS_PER_DEMAND) {
      rejected.push(rejection(demand.id, 'expansion_limit_reached', [demand.originLandingId]));
    }
    return accepted;
  }

  function pathRow(demand, candidate, rank) {
    const edgeIds = candidate.arcs.map((row) => row.edgeId);
    const directions = candidate.arcs.map((row) => row.direction);
    return {
      id: `${demand.id}:path-${rank + 1}:${stableHash({ edgeIds, directions }).slice(0, 8)}`,
      demandId: demand.id,
      originLandingId: demand.originLandingId,
      destinationLandingId: demand.destinationLandingId,
      nodeIds: candidate.nodeIds,
      edgeIds,
      directions,
      latencyMs: Number(candidate.cost.toFixed(6)),
      rank: rank + 1,
    };
  }

  function arc(edge, fromLandingId, toLandingId, direction) {
    return {
      id: `${edge.id}:${direction}`,
      edgeId: edge.id,
      fromLandingId,
      toLandingId,
      direction,
      latencyMs: edge.latencyMs,
    };
  }

  function rejection(demandId, reason, nodeIds) {
    return { id: `${demandId}:rejected:${reason}:${stableHash(nodeIds).slice(0, 8)}`, demandId, reason, nodeIds };
  }

  function compareArc(left, right) {
    return left.latencyMs - right.latencyMs || left.id.localeCompare(right.id);
  }

  function compareCandidate(left, right) {
    return left.cost - right.cost
      || left.arcs.length - right.arcs.length
      || left.arcs.map((row) => row.id).join('|').localeCompare(right.arcs.map((row) => row.id).join('|'));
  }

  function stableHash(value) {
    const text = canonical(value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }

  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }

  function pathError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteSubseaPathError';
    error.code = code;
    return error;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  return Object.freeze({ buildPathCatalog, stableHash });
});
