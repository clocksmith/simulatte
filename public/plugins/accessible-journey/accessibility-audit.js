(function attachAccessibilityAudit(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAccessibilityAudit = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAccessibleJourneyAudit() {
  function auditRouteAccessibility({ route, worldModel, index }) {
    if (!index) return unavailableAudit('accessibility_index_not_loaded');
    if (index.schema !== 'simulatte.autonomyAccessibilityIndex.v1') return unavailableAudit('accessibility_index_schema_invalid');
    const evidenceByNodeId = new Map(index.nodeRows.map((row) => [row.nodeId, row]));
    const segments = route.segmentIds.map((id) => worldModel.segment(id));
    const nodeIds = [...new Set(segments.flatMap((segment) => [segment.fromNodeId, segment.toNodeId]))];
    const missingNodeIds = nodeIds.filter((id) => !evidenceByNodeId.has(id));
    const failedRows = nodeIds.map((id) => evidenceByNodeId.get(id)).filter((row) => row && row.status === 'fails_simulation_thresholds');
    const unresolvedRows = nodeIds.map((id) => evidenceByNodeId.get(id)).filter((row) => row && row.status === 'insufficient_measurements');
    const topologyRows = segments.filter((segment) => segment.source?.accessibilityProof !== 'established_by_source').map((segment) => ({
      segmentId: segment.id,
      accessibilityProof: segment.source?.accessibilityProof || 'not_declared',
    }));
    const simulationThresholdPass = nodeIds.length > 0 && missingNodeIds.length === 0 && failedRows.length === 0 && unresolvedRows.length === 0;
    const sourceTopologyPass = topologyRows.length === 0;
    const verdict = simulationThresholdPass && sourceTopologyPass ? 'supported' : failedRows.length ? 'blocked' : 'unresolved';
    return {
      schema: 'simulatte.autonomyAccessibilityAudit.v1',
      verdict,
      simulationThresholdPass,
      sourceTopologyPass,
      counts: {
        routeSegments: segments.length,
        routeNodes: nodeIds.length,
        nodesWithRampEvidence: nodeIds.length - missingNodeIds.length,
        missingNodes: missingNodeIds.length,
        failedRamps: failedRows.length,
        unresolvedRamps: unresolvedRows.length,
        topologyRowsWithoutAccessibilityProof: topologyRows.length,
      },
      failures: {
        missingNodeIds: missingNodeIds.slice(0, 40),
        failedRamps: failedRows.slice(0, 40).map((row) => ({ nodeId: row.nodeId, rampId: row.rampId, failures: row.failures, metrics: row.metrics })),
        unresolvedRamps: unresolvedRows.slice(0, 40).map((row) => ({ nodeId: row.nodeId, rampId: row.rampId })),
        topologyRows: topologyRows.slice(0, 40),
      },
      identities: {
        accessibilityIndexId: index.id,
        sourceReceiptSha256: index.source.sourceReceiptSha256,
        sourceBytesSha256: index.source.sourceBytesSha256,
        worldId: index.world.id,
        policyId: index.policy.id,
      },
      claimBoundary: index.claimBoundary,
    };
  }

  function unavailableAudit(reason) {
    return {
      schema: 'simulatte.autonomyAccessibilityAudit.v1',
      verdict: 'unavailable',
      reason,
      claimBoundary: 'No accessibility claim is available without the pinned ramp index and route topology evidence.',
    };
  }

  return { auditRouteAccessibility, unavailableAudit };
});
