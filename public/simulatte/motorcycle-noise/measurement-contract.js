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
    return acceptsCompleted(received, expected, configuration) &&
      matches(expected, observation, configuration);
  }
  function acceptsCompleted(received, expected, configuration) {
    // Audio can play a completed viewpoint sample while the next is in flight.
    // Its request, scenario, sampled position, time, and treatment must still match.
    return !!received && !!expected && Object.keys(expected).every(k => received[k] === expected[k]) &&
      expected.configurationKey === key(configuration);
  }
  function matches(identity, observation, configuration) {
    return !!identity && identity.observationKey === key(observation) && identity.configurationKey === key(configuration);
  }
  function describe(data) {
    const point=data.observer.point;
    return [
      ['received-sound','Estimated sound here',data.observer.total,'All computed paths and powered contributions at the sampled microphone; dBA values are not additive.'],
      ['traffic-sound','Traffic',data.observer.traffic,'Traffic contribution at the same microphone and instant, excluding the configured background.'],
      ['background-sound','Background',data.background,'Configured background at the sampled microphone.'],
    ].map(([kind,label,value,definition])=>({kind,value,unit:'dBA',domain:null,measurement:{label,
      subject:`${point.mode || 'Observer'} at (${point.x.toFixed(1)}, ${point.y.toFixed(1)}), ${point.z.toFixed(1)} m high`,
      definition:definition+' This sample does not measure accumulated exposure.',timeBasis:'instant',interval:{start:data.time,end:data.time,unit:'seconds'},
      validity:'valid',freshness:'current',context:`Sampled at simulation time ${data.time.toFixed(2)} s`}}));
  }
  function appendHistory(history, data) {
    const previous = history.at(-1), identity = data.identity;
    const discontinuity = !previous || data.time < previous.time || ['scenarioId','observationKey','configurationKey'].some(k => previous.identity[k] !== identity[k]);
    const next = data.time < (previous?.time ?? 0) ? [] : history.slice();
    if (previous && data.time === previous.time && !discontinuity) return next;
    next.push({time:data.time,level:data.observer.total,point:{...data.observer.point},identity:{...identity},breakBefore:discontinuity});
    return next.slice(-80);
  }
  return Object.freeze({capture,accepts,acceptsCompleted,matches,observerKey,focusKey,appendHistory,describe});
});
