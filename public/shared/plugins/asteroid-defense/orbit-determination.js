(function attachAsteroidOrbitDetermination(root, factory) {
  const propagation = typeof module === 'object' && module.exports
    ? require('../../core/simulation/n-body-propagation.js') : root.SimulatteNBodyPropagation;
  const api = factory(propagation);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAsteroidOrbitDetermination = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createOrbitDetermination(propagation) {
  function fit({ campaign, forceModel, observationBudget, followUpPolicyId, fit }) {
    const observations = selectObservations(campaign.observations, observationBudget, followUpPolicyId);
    if (observations.length < 4) throw fitError('asteroid_fit_observations_insufficient', 'At least four angular observations are required');
    let state = flattenState(campaign.initialGuess);
    let damping = fit.initialDamping;
    let current = residualEvaluation(state, observations, forceModel);
    const iterations = [];
    let terminationReason = 'maximum_iterations';
    for (let iteration = 0; iteration < fit.maximumIterations; iteration += 1) {
      const jacobian = centralJacobian(state, observations, forceModel, current.residuals);
      const normal = multiplyTranspose(jacobian);
      const rhs = multiplyTransposeVector(jacobian, current.residuals).map((row) => -row);
      const damped = normal.map((row, i) => row.map((value, j) => value + (i === j ? damping : 0)));
      let correction;
      try {
        correction = solve(damped, rhs);
      } catch {
        damping *= 10;
        iterations.push(receiptIteration(iteration, current, damping, Infinity, true, 'singular_normal_matrix'));
        continue;
      }
      const correctionNorm = Math.hypot(...correction);
      const candidateState = state.map((value, index) => value + correction[index]);
      const candidate = residualEvaluation(candidateState, observations, forceModel);
      const rejected = !(candidate.weightedCost < current.weightedCost);
      const relativeCostReduction = rejected ? 0 : (current.weightedCost - candidate.weightedCost) / Math.max(1, current.weightedCost);
      iterations.push(receiptIteration(iteration, rejected ? current : candidate, damping, correctionNorm, rejected, rejected ? 'cost_not_reduced' : null));
      if (rejected) {
        damping *= 10;
      } else {
        state = candidateState;
        current = candidate;
        damping = Math.max(1e-12, damping / 3);
        if (correctionNorm <= fit.correctionTolerance || current.residualRmsRad <= fit.residualToleranceRad || relativeCostReduction <= 1e-9) {
          terminationReason = relativeCostReduction <= 1e-9 ? 'converged_cost' : 'converged_correction';
          break;
        }
      }
    }
    const finalJacobian = centralJacobian(state, observations, forceModel, current.residuals);
    const normal = multiplyTranspose(finalJacobian);
    const regularized = normal.map((row, i) => row.map((value, j) => value + (i === j ? 1e-12 : 0)));
    const inverse = invert(regularized);
    const degreesOfFreedom = Math.max(1, current.residuals.length - 6);
    const varianceScale = current.weightedCost / degreesOfFreedom;
    const covariance = inverse.map((row, i) => row.map((value, j) =>
      0.5 * (value + inverse[j][i]) * Math.max(1e-12, varianceScale)));
    const covarianceReceipt = validateCovariance(covariance);
    const converged = terminationReason.startsWith('converged');
    return deepFreeze({
      schema: 'simulatte.asteroidOrbitFitReceipt.v1',
      method: 'weighted_nonlinear_least_squares_lm_central_difference',
      referenceEpochTdbDay: campaign.referenceEpochTdbDay,
      referenceCenter: forceModel.referenceCenter,
      referenceFrame: forceModel.referenceFrame,
      timeScale: forceModel.timeScale,
      observationIds: observations.map((row) => row.id),
      observationRowHashes: observations.map((row) => row.rowHash),
      observationBudget,
      followUpPolicyId,
      initialGuess: campaign.initialGuess,
      fittedState: unflattenState(state),
      iterations,
      iterationCount: iterations.length,
      residualRmsRad: current.residualRmsRad,
      weightedCost: current.weightedCost,
      dampingFinal: damping,
      terminationReason,
      converged,
      covariance,
      covarianceReceipt: {
        ...covarianceReceipt,
        degreesOfFreedom,
        varianceScale,
        scalePolicy: 'weighted_residual_cost_per_degree_of_freedom',
      },
      omissions: forceModel.omissions,
    });
  }

  function selectObservations(rows, budget, policyId) {
    const count = Math.min(rows.length, budget);
    if (policyId === 'fixed-cadence') return rows.slice(0, count);
    if (policyId !== 'information-gain') throw fitError('asteroid_follow_up_policy_invalid', policyId);
    if (count === 1) return [rows[0]];
    return [...new Set(Array.from({ length: count }, (_, index) => Math.round(index * (rows.length - 1) / (count - 1))))]
      .map((index) => rows[index]);
  }

  function residualEvaluation(vector, observations, forceModel) {
    const state = unflattenState(vector);
    const residuals = [];
    observations.forEach((observation) => {
      const predicted = predictAngles(state, observation.epochDayTdb, forceModel);
      const sigmaRa = Math.sqrt(observation.covarianceRad2[0][0]);
      const sigmaDec = Math.sqrt(observation.covarianceRad2[1][1]);
      residuals.push(wrap(observation.rightAscensionRad - predicted.rightAscensionRad) / sigmaRa);
      residuals.push((observation.declinationRad - predicted.declinationRad) / sigmaDec);
    });
    const weightedCost = residuals.reduce((sum, row) => sum + row * row, 0);
    const residualRmsRad = Math.sqrt(weightedCost / residuals.length)
      * Math.sqrt(observations.reduce((sum, row) => sum + row.covarianceRad2[0][0] + row.covarianceRad2[1][1], 0) / (2 * observations.length));
    return { residuals, weightedCost, residualRmsRad };
  }

  function predictAngles(state, day, forceModel) {
    const asteroid = propagation.propagate({
      stateVector: state,
      startDay: 0,
      durationDays: day,
      stepDays: Math.min(forceModel.stepDays, Math.max(day, forceModel.stepDays)),
      gmSunAuD2: forceModel.gmSunAu3Day2,
      sampleLimit: 2,
    }).endpoint;
    const earth = propagation.earthState(day, forceModel.gmSunAu3Day2);
    const line = asteroid.positionAu.map((row, index) => row - earth.positionAu[index]);
    const radius = Math.hypot(...line);
    return { rightAscensionRad: Math.atan2(line[1], line[0]), declinationRad: Math.asin(line[2] / radius) };
  }

  function centralJacobian(state, observations, forceModel) {
    const steps = [1e-5, 1e-5, 1e-5, 1e-7, 1e-7, 1e-7];
    const columns = state.map((_, index) => {
      const left = [...state];
      const right = [...state];
      left[index] -= steps[index];
      right[index] += steps[index];
      const a = residualEvaluation(left, observations, forceModel).residuals;
      const b = residualEvaluation(right, observations, forceModel).residuals;
      return a.map((value, row) => (b[row] - value) / (2 * steps[index]));
    });
    return columns[0].map((_, row) => columns.map((column) => column[row]));
  }

  function multiplyTranspose(matrix) {
    const columns = matrix[0].length;
    return Array.from({ length: columns }, (_, i) => Array.from({ length: columns }, (_, j) =>
      matrix.reduce((sum, row) => sum + row[i] * row[j], 0)));
  }

  function multiplyTransposeVector(matrix, vector) {
    return Array.from({ length: matrix[0].length }, (_, column) =>
      matrix.reduce((sum, row, index) => sum + row[column] * vector[index], 0));
  }

  function solve(matrix, rhs) {
    const rows = matrix.map((row, index) => [...row, rhs[index]]);
    for (let column = 0; column < rhs.length; column += 1) {
      let pivot = column;
      for (let row = column + 1; row < rows.length; row += 1) {
        if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
      }
      if (Math.abs(rows[pivot][column]) < 1e-18) throw fitError('asteroid_fit_singular', `column ${column}`);
      [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
      const divisor = rows[column][column];
      rows[column] = rows[column].map((value) => value / divisor);
      for (let row = 0; row < rows.length; row += 1) {
        if (row === column) continue;
        const factor = rows[row][column];
        rows[row] = rows[row].map((value, index) => value - factor * rows[column][index]);
      }
    }
    return rows.map((row) => row.at(-1));
  }

  function invert(matrix) {
    return matrix.map((_, column) => solve(matrix, matrix.map((__, row) => Number(row === column))))
      .map((column, i, columns) => columns.map((row) => row[i]));
  }

  function validateCovariance(covariance) {
    const symmetric = covariance.every((row, i) => row.every((value, j) => Math.abs(value - covariance[j][i]) <= 1e-6));
    const positiveDiagonal = covariance.every((row, index) => row[index] > 0 && Number.isFinite(row[index]));
    return {
      rank: positiveDiagonal ? 6 : 0,
      symmetric,
      positiveSemidefinite: symmetric && positiveDiagonal,
      conditionEstimate: Math.max(...covariance.map((row, index) => row[index]))
        / Math.max(1e-30, Math.min(...covariance.map((row, index) => row[index]))),
    };
  }

  function receiptIteration(index, result, damping, correctionNorm, rejected, rejectionReason) {
    return {
      index,
      residualRmsRad: result.residualRmsRad,
      weightedCost: result.weightedCost,
      damping,
      correctionNorm,
      rejected,
      rejectionReason,
    };
  }

  function flattenState(value) { return [...value.positionAu, ...value.velocityAuD]; }
  function unflattenState(value) { return { positionAu: value.slice(0, 3), velocityAuD: value.slice(3, 6) }; }
  function wrap(value) { return Math.atan2(Math.sin(value), Math.cos(value)); }
  function fitError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.code = code;
    return error;
  }
  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  return Object.freeze({ fit, predictAngles, selectObservations });
});
