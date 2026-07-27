(function attachAsteroidOrbitDetermination(root, factory) {
  const propagation = typeof module === 'object' && module.exports
    ? require('../../core/simulation/n-body-propagation.js') : root.SimulatteNBodyPropagation;
  const api = factory(propagation);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAsteroidOrbitDetermination = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createOrbitDetermination(propagation) {
  function fit({ campaign, forceModel, observationBudget, followUpPolicyId, fit }) {
    const selection = selectObservations(
      campaign.observations,
      observationBudget,
      followUpPolicyId,
      { initialState: campaign.initialGuess, forceModel }
    );
    const observations = selection.observations;
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
      observationSelectionReceipt: selection.receipt,
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

  function selectObservations(rows, budget, policyId, context = {}) {
    const count = Math.min(rows.length, budget);
    if (policyId === 'fixed-cadence') {
      const observations = rows.slice(0, count);
      return {
        observations,
        receipt: {
          method: 'chronological_fixed_cadence',
          selectedObservationIds: observations.map((row) => row.id),
          selectionSteps: observations.map((row, index) => ({
            step: index,
            observationId: row.id,
            epochDayTdb: row.epochDayTdb,
          })),
        },
      };
    }
    if (policyId !== 'information-gain') throw fitError('asteroid_follow_up_policy_invalid', policyId);
    if (!context.initialState || !context.forceModel) {
      throw fitError('asteroid_information_gain_context_missing', 'Information-gain selection requires an initial state and force model');
    }
    const selected = [rows[0]];
    const remaining = rows.slice(1);
    const selectionSteps = [{
      step: 0,
      observationId: rows[0].id,
      epochDayTdb: rows[0].epochDayTdb,
      logDetInformation: informationScore(selected, context.initialState, context.forceModel),
      candidateCount: rows.length,
    }];
    while (selected.length < count && remaining.length) {
      const candidates = remaining.map((row) => ({
        row,
        score: informationScore([...selected, row], context.initialState, context.forceModel),
      })).sort((left, right) => (
        right.score - left.score
        || left.row.epochDayTdb - right.row.epochDayTdb
        || left.row.id.localeCompare(right.row.id)
      ));
      const chosen = candidates[0];
      selected.push(chosen.row);
      remaining.splice(remaining.indexOf(chosen.row), 1);
      selectionSteps.push({
        step: selected.length - 1,
        observationId: chosen.row.id,
        epochDayTdb: chosen.row.epochDayTdb,
        logDetInformation: chosen.score,
        candidateCount: candidates.length,
        runnerUpLogDetInformation: candidates[1]?.score ?? null,
      });
    }
    selected.sort((left, right) => left.epochDayTdb - right.epochDayTdb || left.id.localeCompare(right.id));
    return {
      observations: selected,
      receipt: {
        method: 'greedy_d_optimal_actual_measurement_jacobian_v1',
        selectedObservationIds: selected.map((row) => row.id),
        selectionSteps,
        regularization: 1e-9,
      },
    };
  }

  function informationScore(observations, initialState, forceModel) {
    const state = flattenState(initialState);
    const jacobian = centralJacobian(state, observations, forceModel);
    const normal = multiplyTranspose(jacobian)
      .map((row, i) => row.map((value, j) => value + (i === j ? 1e-9 : 0)));
    return logDeterminantPositiveDefinite(normal);
  }

  function logDeterminantPositiveDefinite(matrix) {
    const rows = matrix.map((row) => [...row]);
    let result = 0;
    for (let column = 0; column < rows.length; column += 1) {
      let pivot = column;
      for (let row = column + 1; row < rows.length; row += 1) {
        if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
      }
      const value = Math.max(1e-300, Math.abs(rows[pivot][column]));
      result += Math.log(value);
      [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
      for (let row = column + 1; row < rows.length; row += 1) {
        const factor = rows[row][column] / rows[column][column];
        for (let index = column + 1; index < rows.length; index += 1) {
          rows[row][index] -= factor * rows[column][index];
        }
      }
    }
    return result;
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
    const eigenvalues = symmetric ? symmetricEigenvalues(covariance) : [];
    const scale = Math.max(1e-30, ...eigenvalues.map(Math.abs));
    const tolerance = Math.max(1e-30, scale * 1e-10);
    const positiveSemidefinite = symmetric
      && eigenvalues.length === covariance.length
      && eigenvalues.every((value) => Number.isFinite(value) && value >= -tolerance);
    const positive = eigenvalues.filter((value) => value > tolerance);
    return {
      rank: positive.length,
      symmetric,
      positiveSemidefinite,
      minimumEigenvalue: eigenvalues.length ? Math.min(...eigenvalues) : null,
      maximumEigenvalue: eigenvalues.length ? Math.max(...eigenvalues) : null,
      eigenvalueTolerance: tolerance,
      conditionEstimate: positive.length
        ? Math.max(...positive) / Math.max(1e-30, Math.min(...positive))
        : Infinity,
    };
  }

  function symmetricEigenvalues(matrix) {
    const rows = matrix.map((row, i) => row.map((value, j) => 0.5 * (value + matrix[j][i])));
    const maximumSweeps = rows.length * rows.length * 20;
    for (let sweep = 0; sweep < maximumSweeps; sweep += 1) {
      let p = 0;
      let q = 1;
      let maximum = 0;
      for (let i = 0; i < rows.length; i += 1) {
        for (let j = i + 1; j < rows.length; j += 1) {
          if (Math.abs(rows[i][j]) > maximum) {
            maximum = Math.abs(rows[i][j]);
            p = i;
            q = j;
          }
        }
      }
      if (maximum <= 1e-14) break;
      const angle = 0.5 * Math.atan2(2 * rows[p][q], rows[q][q] - rows[p][p]);
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      for (let index = 0; index < rows.length; index += 1) {
        if (index === p || index === q) continue;
        const left = rows[index][p];
        const right = rows[index][q];
        rows[index][p] = rows[p][index] = cosine * left - sine * right;
        rows[index][q] = rows[q][index] = sine * left + cosine * right;
      }
      const pp = rows[p][p];
      const qq = rows[q][q];
      const pq = rows[p][q];
      rows[p][p] = cosine * cosine * pp - 2 * sine * cosine * pq + sine * sine * qq;
      rows[q][q] = sine * sine * pp + 2 * sine * cosine * pq + cosine * cosine * qq;
      rows[p][q] = rows[q][p] = 0;
    }
    return rows.map((row, index) => row[index]).sort((left, right) => left - right);
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

  return Object.freeze({ fit, predictAngles, selectObservations, validateCovariance });
});
