(function attachSubseaAllocationSolver(root, factory) {
  const pathApi = typeof module === 'object' && module.exports
    ? require('./path-catalog.js')
    : root.SimulatteSubseaPathCatalog;
  const api = factory(pathApi);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSubseaAllocationSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSubseaAllocationSolver(pathApi) {
  const POLICY_IDS = Object.freeze([
    'weighted-throughput',
    'essential-service-priority',
    'proportional-fair',
    'geographic-equity',
  ]);

  function solveAllocation({ edges, demands, pathCatalog, policyId, solver }) {
    if (!POLICY_IDS.includes(policyId)) throw solverError('subsea_policy_invalid', `Unknown policy ${policyId}`);
    const variables = pathCatalog.paths.map((path, index) => ({
      id: path.id,
      index,
      path,
      demand: demands.find((row) => row.id === path.demandId),
    }));
    if (variables.some((row) => !row.demand)) throw solverError('subsea_path_demand_missing', 'Path references an unknown demand');
    const constraints = buildConstraints(edges, demands, variables);
    const linearObjective = variables.map((row) => policyWeight(row.demand, policyId)
      - row.path.latencyMs * solver.regularizationEpsilon);
    const solved = ['proportional-fair', 'geographic-equity'].includes(policyId)
      ? solveFair({ variables, constraints, policyId, solver })
      : simplexMaximize({ objective: linearObjective, constraints, solver });
    const allocation = materializeAllocation({ edges, demands, variables, solution: solved.solution });
    const verification = verifyAllocation({ edges, demands, pathCatalog, allocation, tolerance: solver.absoluteTolerance });
    const receipt = deepFreeze({
      schema: 'simulatte.plugin.subseaAllocationReceipt.v1',
      algorithm: solved.algorithm,
      policyId,
      matrixHash: pathApi.stableHash({
        variables: variables.map((row) => row.id),
        constraints,
        policyId,
      }),
      variableOrdering: variables.map((row) => row.id),
      objectiveValue: solved.objectiveValue,
      pivotCount: solved.pivotCount,
      iterationCount: solved.iterationCount,
      primalResidual: verification.maximumResidual,
      dualResidual: solved.dualResidual,
      dualityGap: solved.dualityGap,
      terminationReason: solved.terminationReason,
      rejectedBasisStates: solved.rejectedBasisStates,
      feasibility: verification,
    });
    if (!verification.isValid) {
      throw solverError('subsea_allocation_invalid', verification.violations.join('; '), receipt);
    }
    if (solved.terminationReason !== 'optimal' && solved.terminationReason !== 'gap_tolerance_reached') {
      throw solverError('subsea_allocation_nonconvergent', solved.terminationReason, receipt);
    }
    return deepFreeze({ allocation, receipt });
  }

  function buildConstraints(edges, demands, variables) {
    const edgeConstraints = edges.map((edge) => ({
      id: `edge:${edge.id}`,
      coefficients: variables.map((row) => row.path.edgeIds.includes(edge.id) ? 1 : 0),
      bound: edge.availableGbps,
    }));
    const demandConstraints = demands.map((demand) => ({
      id: `demand:${demand.id}`,
      coefficients: variables.map((row) => row.demand.id === demand.id ? 1 : 0),
      bound: demand.requestedGbps,
    }));
    return [...edgeConstraints, ...demandConstraints];
  }

  function simplexMaximize({ objective, constraints, solver }) {
    const variableCount = objective.length;
    const constraintCount = constraints.length;
    if (!variableCount) {
      return emptySolution('simplex-zero-variable-feasible-v1');
    }
    constraints.forEach((constraint) => {
      if (!Number.isFinite(constraint.bound) || constraint.bound < 0) {
        throw solverError('subsea_constraint_bound_invalid', `${constraint.id} has invalid bound`);
      }
    });
    const width = variableCount + constraintCount + 1;
    const height = constraintCount + 1;
    const tableau = Array.from({ length: height }, () => Array(width).fill(0));
    const basis = [];
    constraints.forEach((constraint, rowIndex) => {
      constraint.coefficients.forEach((value, columnIndex) => {
        tableau[rowIndex][columnIndex] = value;
      });
      tableau[rowIndex][variableCount + rowIndex] = 1;
      tableau[rowIndex][width - 1] = constraint.bound;
      basis[rowIndex] = variableCount + rowIndex;
    });
    objective.forEach((value, columnIndex) => {
      tableau[constraintCount][columnIndex] = -value;
    });
    let pivotCount = 0;
    const rejectedBasisStates = [];
    while (pivotCount < solver.maximumIterations) {
      const entering = firstEnteringColumn(tableau[constraintCount], width - 1, solver.absoluteTolerance);
      if (entering < 0) break;
      const leaving = leavingRow(tableau, entering, constraintCount, width - 1, basis, solver.absoluteTolerance);
      if (leaving < 0) {
        return simplexResult({
          algorithm: 'deterministic-primal-simplex-bland-v1',
          tableau,
          basis,
          variableCount,
          pivotCount,
          terminationReason: 'unbounded',
          rejectedBasisStates,
        });
      }
      pivot(tableau, leaving, entering);
      basis[leaving] = entering;
      pivotCount += 1;
    }
    const optimal = firstEnteringColumn(tableau[constraintCount], width - 1, solver.absoluteTolerance) < 0;
    return simplexResult({
      algorithm: 'deterministic-primal-simplex-bland-v1',
      tableau,
      basis,
      variableCount,
      pivotCount,
      terminationReason: optimal ? 'optimal' : 'iteration_limit',
      rejectedBasisStates,
    });
  }

  function solveFair({ variables, constraints, policyId, solver }) {
    const count = variables.length;
    if (!count) return emptySolution('deterministic-frank-wolfe-v1');
    let solution = Array(count).fill(0);
    let objectiveValue = fairObjective(solution, variables, policyId, solver.regularizationEpsilon);
    let totalPivots = 0;
    let gap = Infinity;
    let iteration = 0;
    for (; iteration < solver.maximumIterations; iteration += 1) {
      const delivered = deliveredByDemand(solution, variables);
      const gradient = variables.map((row) => {
        const demandWeight = policyWeight(row.demand, policyId);
        return demandWeight / ((delivered.get(row.demand.id) || 0) + solver.regularizationEpsilon)
          - row.path.latencyMs * solver.regularizationEpsilon;
      });
      const oracle = simplexMaximize({ objective: gradient, constraints, solver });
      if (oracle.terminationReason !== 'optimal') return { ...oracle, algorithm: 'deterministic-frank-wolfe-v1' };
      totalPivots += oracle.pivotCount;
      const direction = oracle.solution.map((value, index) => value - solution[index]);
      gap = gradient.reduce((sum, value, index) => sum + value * direction[index], 0);
      if (gap <= solver.absoluteTolerance + solver.relativeTolerance * Math.max(1, Math.abs(objectiveValue))) break;
      const step = boundedLineSearch(solution, direction, variables, policyId, solver.regularizationEpsilon);
      solution = solution.map((value, index) => Math.max(0, value + step * direction[index]));
      objectiveValue = fairObjective(solution, variables, policyId, solver.regularizationEpsilon);
    }
    return {
      algorithm: 'deterministic-frank-wolfe-with-simplex-oracle-v1',
      solution,
      objectiveValue,
      pivotCount: totalPivots,
      iterationCount: iteration,
      dualResidual: Math.max(0, gap),
      dualityGap: Math.max(0, gap),
      terminationReason: gap <= solver.absoluteTolerance + solver.relativeTolerance * Math.max(1, Math.abs(objectiveValue))
        ? 'gap_tolerance_reached'
        : 'iteration_limit',
      rejectedBasisStates: [],
    };
  }

  function materializeAllocation({ edges, demands, variables, solution }) {
    const pathFlows = variables.map((row, index) => ({
      pathId: row.id,
      demandId: row.demand.id,
      edgeIds: row.path.edgeIds,
      nodeIds: row.path.nodeIds,
      latencyMs: row.path.latencyMs,
      flowGbps: clean(solution[index] || 0),
    })).filter((row) => row.flowGbps > 0);
    const demandResults = demands.map((demand) => {
      const rows = pathFlows.filter((row) => row.demandId === demand.id);
      const deliveredGbps = clean(rows.reduce((sum, row) => sum + row.flowGbps, 0));
      const weightedLatency = rows.reduce((sum, row) => sum + row.flowGbps * row.latencyMs, 0);
      return {
        ...demand,
        deliveredGbps,
        droppedGbps: clean(Math.max(0, demand.requestedGbps - deliveredGbps)),
        latencyMs: deliveredGbps ? clean(weightedLatency / deliveredGbps) : null,
        pathAllocations: rows,
      };
    });
    const edgeResults = edges.map((edge) => {
      const loadGbps = clean(pathFlows.filter((row) => row.edgeIds.includes(edge.id))
        .reduce((sum, row) => sum + row.flowGbps, 0));
      return {
        ...edge,
        loadGbps,
        utilizationRatio: edge.availableGbps ? clean(loadGbps / edge.availableGbps) : 0,
      };
    });
    return { pathFlows, demands: demandResults, edges: edgeResults };
  }

  function verifyAllocation({ edges, demands, pathCatalog, allocation, tolerance }) {
    const violations = [];
    let maximumResidual = 0;
    const pathById = new Map(pathCatalog.paths.map((row) => [row.id, row]));
    allocation.pathFlows.forEach((flow) => {
      const path = pathById.get(flow.pathId);
      if (!path) violations.push(`unknown path ${flow.pathId}`);
      if (!Number.isFinite(flow.flowGbps) || flow.flowGbps < -tolerance) violations.push(`invalid flow ${flow.pathId}`);
      if (path && (path.originLandingId !== flow.nodeIds[0] || path.destinationLandingId !== flow.nodeIds.at(-1))) {
        violations.push(`path endpoints invalid ${flow.pathId}`);
      }
    });
    allocation.demands.forEach((row) => {
      const residual = Math.abs(row.requestedGbps - row.deliveredGbps - row.droppedGbps);
      maximumResidual = Math.max(maximumResidual, residual);
      if (residual > tolerance || row.deliveredGbps < -tolerance || row.droppedGbps < -tolerance) {
        violations.push(`demand conservation failed ${row.id}`);
      }
    });
    allocation.edges.forEach((row) => {
      const residual = Math.max(0, row.loadGbps - row.availableGbps);
      maximumResidual = Math.max(maximumResidual, residual);
      if (residual > tolerance) violations.push(`edge capacity exceeded ${row.id}`);
    });
    const activeEdgeIds = new Set(edges.filter((row) => row.availableGbps > 0).map((row) => row.id));
    allocation.pathFlows.forEach((flow) => {
      if (flow.edgeIds.some((edgeId) => !activeEdgeIds.has(edgeId))) violations.push(`flow uses unavailable edge ${flow.pathId}`);
    });
    return {
      isValid: violations.length === 0,
      maximumResidual: clean(maximumResidual),
      violations,
      checkedDemandCount: demands.length,
      checkedEdgeCount: edges.length,
      checkedPathFlowCount: allocation.pathFlows.length,
    };
  }

  function firstEnteringColumn(objectiveRow, rightHandColumn, tolerance) {
    for (let column = 0; column < rightHandColumn; column += 1) {
      if (objectiveRow[column] < -tolerance) return column;
    }
    return -1;
  }

  function leavingRow(tableau, entering, constraintCount, rightHandColumn, basis, tolerance) {
    let selected = -1;
    let bestRatio = Infinity;
    for (let row = 0; row < constraintCount; row += 1) {
      const coefficient = tableau[row][entering];
      if (coefficient <= tolerance) continue;
      const ratio = tableau[row][rightHandColumn] / coefficient;
      if (ratio < bestRatio - tolerance || (Math.abs(ratio - bestRatio) <= tolerance && basis[row] < (basis[selected] ?? Infinity))) {
        bestRatio = ratio;
        selected = row;
      }
    }
    return selected;
  }

  function pivot(tableau, pivotRow, pivotColumn) {
    const divisor = tableau[pivotRow][pivotColumn];
    tableau[pivotRow] = tableau[pivotRow].map((value) => value / divisor);
    tableau.forEach((row, rowIndex) => {
      if (rowIndex === pivotRow) return;
      const multiplier = row[pivotColumn];
      if (!multiplier) return;
      tableau[rowIndex] = row.map((value, columnIndex) => value - multiplier * tableau[pivotRow][columnIndex]);
    });
  }

  function simplexResult({ algorithm, tableau, basis, variableCount, pivotCount, terminationReason, rejectedBasisStates }) {
    const constraintCount = tableau.length - 1;
    const solution = Array(variableCount).fill(0);
    basis.forEach((column, row) => {
      if (column < variableCount) solution[column] = clean(tableau[row].at(-1));
    });
    return {
      algorithm,
      solution,
      objectiveValue: clean(tableau[constraintCount].at(-1)),
      pivotCount,
      iterationCount: pivotCount,
      dualResidual: terminationReason === 'optimal' ? 0 : Infinity,
      dualityGap: terminationReason === 'optimal' ? 0 : Infinity,
      terminationReason,
      rejectedBasisStates,
    };
  }

  function emptySolution(algorithm) {
    return {
      algorithm,
      solution: [],
      objectiveValue: 0,
      pivotCount: 0,
      iterationCount: 0,
      dualResidual: 0,
      dualityGap: 0,
      terminationReason: 'optimal',
      rejectedBasisStates: [],
    };
  }

  function policyWeight(demand, policyId) {
    if (policyId === 'essential-service-priority') return demand.categoryId === 'essential' ? demand.weight * 10 : demand.weight;
    if (policyId === 'geographic-equity') return 1 / Math.max(1, demand.requestedGbps);
    return demand.weight;
  }

  function deliveredByDemand(solution, variables) {
    const values = new Map();
    variables.forEach((row, index) => values.set(row.demand.id, (values.get(row.demand.id) || 0) + solution[index]));
    return values;
  }

  function fairObjective(solution, variables, policyId, epsilon) {
    const delivered = deliveredByDemand(solution, variables);
    const demands = [...new Map(variables.map((row) => [row.demand.id, row.demand])).values()];
    return demands.reduce((sum, demand) => sum
      + policyWeight(demand, policyId) * Math.log((delivered.get(demand.id) || 0) + epsilon), 0)
      - variables.reduce((sum, row, index) => sum + solution[index] * row.path.latencyMs * epsilon, 0);
  }

  function boundedLineSearch(solution, direction, variables, policyId, epsilon) {
    let left = 0;
    let right = 1;
    for (let iteration = 0; iteration < 48; iteration += 1) {
      const first = left + (right - left) / 3;
      const second = right - (right - left) / 3;
      const firstValue = fairObjective(solution.map((value, index) => value + first * direction[index]), variables, policyId, epsilon);
      const secondValue = fairObjective(solution.map((value, index) => value + second * direction[index]), variables, policyId, epsilon);
      if (firstValue < secondValue) left = first;
      else right = second;
    }
    return (left + right) / 2;
  }

  function clean(value) {
    return Math.abs(value) < 1e-9 ? 0 : Number(value.toFixed(9));
  }

  function solverError(code, message, receipt = null) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteSubseaAllocationError';
    error.code = code;
    error.receipt = receipt;
    return error;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  return Object.freeze({ POLICY_IDS, solveAllocation, verifyAllocation });
});
