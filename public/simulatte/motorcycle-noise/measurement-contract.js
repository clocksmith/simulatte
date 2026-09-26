(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MotorcycleMeasurementContract = api;
})(globalThis, function() {
  /** @typedef {{schema:string, scenarioId:number, requestId:number, time:number,
   * observationKey:string, configurationKey:string}} MeasurementIdentity */
  function key(value) {
    return JSON.stringify(value, (_, v) => {
      if (typeof v === 'number' && !Number.isFinite(v)) throw Error('Nonfinite measurement input');
      return v;
    });
  }
  function capture(scenarioId, requestId, time, observation, configuration) {
    if (!Number.isInteger(scenarioId) || scenarioId < 0 || !Number.isInteger(requestId) || requestId < 1 || !Number.isFinite(time) || time < 0) throw Error('Invalid measurement identity');
    return Object.freeze({ schema:'simulatte.measurementIdentity.v1', scenarioId, requestId, time,
      observationKey:key(observation), configurationKey:key(configuration) });
  }
  function observerKey(observer) {
    // A tracked observer moves with simulation time. Its sampled position stays
    // in the result; its stable identity, rather than its new position, gates it.
    return observer.trackId ? {mode:observer.mode,trackId:observer.trackId} : observer;
  }
  function focusKey(focus,observer) {
    return observer.trackId?{mode:observer.mode,trackId:observer.trackId,span:focus.span}:focus;
  }
  function accepts(received, expected, observation, configuration) {
    return !!received && !!expected && Object.keys(expected).every(k => received[k] === expected[k]) &&
      expected.observationKey === key(observation) && expected.configurationKey === key(configuration);
  }
  return Object.freeze({capture,accepts,observerKey,focusKey});
});
