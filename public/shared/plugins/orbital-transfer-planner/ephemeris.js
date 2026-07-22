(function attachEphemeris(root, factory) {
  const api = factory();
  root.OrbitalTransferEphemeris = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createEphemerisModule() {
  function getBodyState(ephemerisDataset, bodyId, day, options = {}) {
    const bodyData = ephemerisDataset?.bodies?.[bodyId];
    if (!bodyData || !Array.isArray(bodyData.vectors) || !bodyData.vectors.length) {
      throw ephemerisError('ephemeris_body_missing', `Ephemeris body ${bodyId} was not found`, { bodyId });
    }
    if (!Number.isFinite(day)) throw ephemerisError('ephemeris_day_invalid', `Ephemeris day expected a finite number, received ${day}`, { bodyId, day });
    const firstDay = numericDay(bodyData.vectors[0], 0);
    const lastDay = numericDay(bodyData.vectors.at(-1), bodyData.vectors.length - 1);
    const clamp = options.clamp === true;
    if (!clamp && (day < firstDay || day > lastDay)) {
      throw ephemerisError('ephemeris_day_out_of_range', `Day ${day} is outside ${firstDay}..${lastDay} for ${bodyId}`, { bodyId, day, firstDay, lastDay });
    }
    const boundedDay = Math.max(firstDay, Math.min(lastDay, day));
    const lowerIndex = lowerBound(bodyData.vectors, boundedDay);
    const lower = bodyData.vectors[lowerIndex];
    const upper = bodyData.vectors[Math.min(lowerIndex + 1, bodyData.vectors.length - 1)];
    validateState(lower, bodyId);
    validateState(upper, bodyId);
    const lowerDay = numericDay(lower, lowerIndex);
    const upperDay = numericDay(upper, lowerIndex + 1);
    const ratio = upperDay === lowerDay ? 0 : (boundedDay - lowerDay) / (upperDay - lowerDay);
    return Object.freeze({
      schema: 'simulatte.orbitalBodyState.v1',
      bodyId,
      day: boundedDay,
      epochIso: epochForDay(ephemerisDataset, boundedDay),
      positionAu: Object.freeze(interpolateVector(lower.positionAu, upper.positionAu, ratio)),
      velocityAuD: Object.freeze(interpolateVector(lower.velocityAuD, upper.velocityAuD, ratio)),
      interpolation: ratio === 0 ? 'exact_sample' : 'linear_state_vector_v1',
      sourceSampleDays: Object.freeze([lowerDay, upperDay]),
    });
  }

  function lowerBound(rows, day) {
    let lo = 0;
    let hi = rows.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (numericDay(rows[mid], mid) <= day) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  function numericDay(row, fallback) {
    return Number.isFinite(row?.day) ? Number(row.day) : fallback;
  }

  function interpolateVector(left, right, ratio) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== 3 || right.length !== 3) {
      throw ephemerisError('ephemeris_vector_invalid', 'Ephemeris vectors must contain three numeric components');
    }
    return left.map((value, index) => value + (right[index] - value) * ratio);
  }

  function validateState(row, bodyId) {
    for (const key of ['positionAu', 'velocityAuD']) {
      if (!Array.isArray(row?.[key]) || row[key].length !== 3 || row[key].some((value) => !Number.isFinite(value))) {
        throw ephemerisError('ephemeris_state_invalid', `${bodyId} ${key} expected three finite values`, { bodyId, key });
      }
    }
  }

  function epochForDay(dataset, day) {
    const start = Date.parse(dataset?.epochStart || dataset?.epoch?.start || '');
    if (!Number.isFinite(start)) return null;
    return new Date(start + day * 86400000).toISOString();
  }

  function ephemerisError(code, message, evidence = null) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'OrbitalEphemerisError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return Object.freeze({ getBodyState, epochForDay, ephemerisError });
});
