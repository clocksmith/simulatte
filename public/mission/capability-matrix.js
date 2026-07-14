(function attachAutonomyCapabilityMatrix(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyCapabilities = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyCapabilityMatrix() {
  const MATRIX_SCHEMA = 'simulatte.autonomyCapabilityMatrix.v1';
  const RECEIPT_SCHEMA = 'simulatte.autonomyCapabilityReceipt.v1';
  const EMBODIMENT_KINDS = Object.freeze(['pedestrian', 'bicycle', 'scooter', 'car']);
  const MISSION_FAMILIES = Object.freeze(['delivery', 'point_to_point', 'closed_circuit']);
  const CIRCUIT_TERMINATIONS = Object.freeze(['distance', 'laps', 'duration']);

  function buildCapabilityMatrix(world, embodimentInput) {
    const embodiments = Array.isArray(embodimentInput) ? embodimentInput : embodimentInput ? [embodimentInput] : [];
    const rows = EMBODIMENT_KINDS.flatMap((kind) => {
      const embodiment = embodiments.find((candidate) => candidate.kind === kind) || null;
      const mode = embodiment?.mode || null;
      const graphSegments = mode ? world.segments.filter((segment) => segment.allowedModes.includes(mode)) : [];
      const graphArtifactIds = [...new Set(graphSegments.map((segment) => segment.source?.datasetId).filter(Boolean))].sort();
      const circuits = mode ? (world.circuits || []).filter((circuit) => circuit.mode === mode) : [];
      return MISSION_FAMILIES.map((missionFamily) => capabilityRow({
        kind,
        missionFamily,
        embodiment,
        graphSegments,
        graphArtifactIds,
        circuits,
      }));
    });
    return {
      schema: MATRIX_SCHEMA,
      worldId: world.id,
      worldContentVersion: world.contentVersion,
      rows,
      claimBoundary: 'A supported row proves only that the named embodiment, mission family, and governed graph or circuit artifacts are registered together. It does not establish physical-world autonomy or legality outside those artifacts.',
    };
  }

  function capabilityRow({ kind, missionFamily, embodiment, graphSegments, graphArtifactIds, circuits }) {
    const blockingReasons = [];
    if (!embodiment) blockingReasons.push('embodiment_not_registered');
    const requiredTaskType = missionFamily === 'closed_circuit' ? 'loop' : missionFamily;
    if (embodiment && !embodiment.supportedTaskTypes.includes(requiredTaskType)) blockingReasons.push('mission_family_not_registered');
    if (missionFamily === 'closed_circuit' && circuits.length === 0) blockingReasons.push('circuit_artifact_not_registered');
    if (missionFamily !== 'closed_circuit' && graphSegments.length === 0) blockingReasons.push('routable_graph_not_registered');
    return {
      id: `${kind}:${missionFamily}`,
      embodimentKind: kind,
      embodimentId: embodiment?.id || null,
      mode: embodiment?.mode || null,
      missionFamily,
      supported: blockingReasons.length === 0,
      terminationKinds: missionFamily === 'closed_circuit' ? [...CIRCUIT_TERMINATIONS] : missionFamily === 'delivery' ? ['arrival'] : ['arrival'],
      artifactIds: [embodiment?.id, ...graphArtifactIds, ...circuits.map((circuit) => circuit.id)].filter(Boolean),
      graphSegmentCount: graphSegments.length,
      circuitIds: circuits.map((circuit) => circuit.id),
      blockingReasons,
    };
  }

  function requireCapability(matrix, { embodimentKind, missionFamily, terminationKind, circuitId = null }) {
    const row = matrix.rows.find((candidate) => candidate.embodimentKind === embodimentKind && candidate.missionFamily === missionFamily);
    if (!row) throw capabilityError('capability_row_missing', `Capability matrix has no ${embodimentKind} x ${missionFamily} row`, { embodimentKind, missionFamily });
    const blockingReasons = [...row.blockingReasons];
    if (!row.terminationKinds.includes(terminationKind)) blockingReasons.push('termination_not_registered');
    if (circuitId && !row.circuitIds.includes(circuitId)) blockingReasons.push('circuit_artifact_not_registered');
    if (blockingReasons.length) {
      throw capabilityError('capability_not_available', `${row.id} is blocked by ${[...new Set(blockingReasons)].join(', ')}`, {
        row: structuredClone(row),
        terminationKind,
        circuitId,
      });
    }
    return {
      schema: RECEIPT_SCHEMA,
      matrixSchema: matrix.schema,
      rowId: row.id,
      embodimentKind,
      embodimentId: row.embodimentId,
      missionFamily,
      terminationKind,
      artifactIds: [...row.artifactIds],
      circuitId,
    };
  }

  function capabilityError(code, message, evidence) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'AutonomyCapabilityError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return {
    CIRCUIT_TERMINATIONS,
    EMBODIMENT_KINDS,
    MATRIX_SCHEMA,
    MISSION_FAMILIES,
    RECEIPT_SCHEMA,
    buildCapabilityMatrix,
    requireCapability,
  };
});
