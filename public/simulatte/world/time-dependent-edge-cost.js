(function attachTimeDependentEdgeCost(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteTimeDependentEdgeCost = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createTimeDependentEdgeCost() {
  function defineCostModel({ id, version = 'v1', fifo, evaluate, claimBoundary }) {
    if (typeof id !== 'string' || !id) throw costError('cost_model_id_invalid');
    if (typeof version !== 'string' || !version) throw costError('cost_model_version_invalid');
    if (typeof fifo !== 'boolean') throw costError('cost_model_fifo_invalid');
    if (typeof evaluate !== 'function') throw costError('cost_model_evaluator_invalid');
    if (typeof claimBoundary !== 'string' || !claimBoundary) throw costError('cost_model_claim_boundary_invalid');
    return Object.freeze({
      schema: 'simulatte.timeDependentEdgeCostModel.v1',
      id,
      version,
      fifo,
      evaluate,
      claimBoundary,
    });
  }

  function evaluateRoute({ model, segmentIds, worldModel, departureAt, routeCandidateId = null }) {
    validateModel(model);
    const departureMs = Date.parse(departureAt);
    if (!Number.isFinite(departureMs)) throw costError('route_departure_invalid');
    if (!Array.isArray(segmentIds)) throw costError('route_segments_invalid');
    let arrivalOffsetSeconds = 0;
    let generalizedCost = 0;
    const edgeRows = segmentIds.map((segmentId, edgeIndex) => {
      const segment = worldModel.segment(segmentId);
      const enteredAt = new Date(departureMs + arrivalOffsetSeconds * 1000).toISOString();
      const result = model.evaluate({
        segment,
        segmentId,
        edgeIndex,
        enteredAt,
        arrivalOffsetSeconds,
        routeCandidateId,
      });
      validateEvaluation(result, segmentId);
      const row = {
        schema: 'simulatte.timeDependentEdgeEvaluation.v1',
        modelId: model.id,
        modelVersion: model.version,
        routeCandidateId,
        segmentId,
        edgeIndex,
        enteredAt,
        arrivalOffsetSeconds: round(arrivalOffsetSeconds),
        traversalSeconds: round(result.traversalSeconds),
        generalizedCost: round(result.generalizedCost),
        components: structuredCloneSafe(result.components || {}),
        evidence: structuredCloneSafe(result.evidence || {}),
      };
      arrivalOffsetSeconds += result.traversalSeconds;
      generalizedCost += result.generalizedCost;
      return row;
    });
    return {
      schema: 'simulatte.timeDependentRouteEvaluation.v1',
      model: {
        schema: model.schema,
        id: model.id,
        version: model.version,
        fifo: model.fifo,
        claimBoundary: model.claimBoundary,
      },
      routeCandidateId,
      departureAt: new Date(departureMs).toISOString(),
      arrivalAt: new Date(departureMs + arrivalOffsetSeconds * 1000).toISOString(),
      traversalSeconds: round(arrivalOffsetSeconds),
      generalizedCost: round(generalizedCost),
      edgeRows,
    };
  }

  function verifyFifo({ model, segment, departureInstants }) {
    validateModel(model);
    if (!Array.isArray(departureInstants) || departureInstants.length < 2) throw costError('fifo_departures_invalid');
    const rows = departureInstants.map((enteredAt, edgeIndex) => {
      const departureMs = Date.parse(enteredAt);
      if (!Number.isFinite(departureMs)) throw costError('fifo_departure_invalid');
      const result = model.evaluate({
        segment,
        segmentId: segment.id,
        edgeIndex,
        enteredAt: new Date(departureMs).toISOString(),
        arrivalOffsetSeconds: 0,
        routeCandidateId: 'fifo-probe',
      });
      validateEvaluation(result, segment.id);
      return {
        enteredAt: new Date(departureMs).toISOString(),
        enteredAtMs: departureMs,
        traversalSeconds: result.traversalSeconds,
        exitedAtMs: departureMs + result.traversalSeconds * 1000,
      };
    }).sort((left, right) => left.enteredAtMs - right.enteredAtMs);
    const violations = [];
    for (let index = 1; index < rows.length; index += 1) {
      if (rows[index].exitedAtMs + 1e-6 < rows[index - 1].exitedAtMs) {
        violations.push({ earlier: rows[index - 1].enteredAt, later: rows[index].enteredAt });
      }
    }
    return {
      schema: 'simulatte.fifoVerification.v1',
      modelId: model.id,
      declaredFifo: model.fifo,
      observedFifo: violations.length === 0,
      departureCount: rows.length,
      violations,
      pass: model.fifo ? violations.length === 0 : true,
      claimBoundary: 'This probe checks the supplied departure instants for one edge. It is not a proof over all edges or continuous time.',
    };
  }

  function validateModel(model) {
    if (!model || model.schema !== 'simulatte.timeDependentEdgeCostModel.v1') throw costError('cost_model_invalid');
    if (typeof model.fifo !== 'boolean' || typeof model.evaluate !== 'function') throw costError('cost_model_invalid');
  }

  function validateEvaluation(result, segmentId) {
    if (!result || !Number.isFinite(result.traversalSeconds) || result.traversalSeconds < 0) {
      throw costError('edge_traversal_invalid', segmentId);
    }
    if (!Number.isFinite(result.generalizedCost) || result.generalizedCost < 0) {
      throw costError('edge_cost_invalid', segmentId);
    }
  }

  function structuredCloneSafe(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function round(value) {
    return Number(value.toFixed(6));
  }

  function costError(code, detail = '') {
    const error = new Error(`${code}${detail ? `: ${detail}` : ''}`);
    error.name = 'TimeDependentEdgeCostError';
    error.code = code;
    return error;
  }

  return { defineCostModel, evaluateRoute, verifyFifo };
});
