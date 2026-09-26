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
    const state=ratio===0?lower:hermiteState(lower,upper,ratio,upperDay-lowerDay);
    return Object.freeze({
      schema: 'simulatte.orbitalBodyState.v1',
      bodyId,
      day: boundedDay,
      epochIso: epochForDay(ephemerisDataset, boundedDay),
      positionAu: Object.freeze(state.positionAu.slice()),
      velocityAuD: Object.freeze(state.velocityAuD.slice()),
      interpolation: ratio === 0 ? 'exact_sample' : 'cubic_hermite_state_vector_v1',
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

  // Position and its derivative share one polynomial. Endpoint velocities
  // constrain the curve in AU/day; the sample interval is measured in days.
  function hermiteState(a,b,t,h) {
    const t2=t*t,t3=t2*t;
    const positionAu=a.positionAu.map((p,i)=>(2*t3-3*t2+1)*p+(t3-2*t2+t)*h*a.velocityAuD[i]
      +(-2*t3+3*t2)*b.positionAu[i]+(t3-t2)*h*b.velocityAuD[i]);
    const velocityAuD=a.positionAu.map((p,i)=>(6*t2-6*t)/h*p+(3*t2-4*t+1)*a.velocityAuD[i]
      +(-6*t2+6*t)/h*b.positionAu[i]+(3*t2-2*t)*b.velocityAuD[i]);
    return {positionAu,velocityAuD};
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
