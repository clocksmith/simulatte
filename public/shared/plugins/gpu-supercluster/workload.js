(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteClusterWorkload = api;
})(globalThis, function() {
  const STEP_MS = 1, DURATION_MS = 400;
  // A bounded synchronous training session. Racks execute forward/backward work
  // independently; the collective cannot start until every gradient is ready.
  function create(result, actions = []) {
    return { timeMs: 0, iteration: 0, communication: 0, communicating: false,
      totalWaitMs: 0, transferMs: result.collectives.commTimeMs,
      computeMs: result.collectives.computeTimeMs, actions: actions.map(a => ({ ...a })),
      appliedActions: 0, racks: result.topology.racks.map((rack, index) => ({
        id: rack.id, work: 0, waitMs: 0, task: 'forward', waitingFor: [],
        // Declared deterministic imbalance across workers, not random animation.
        computeMs: result.collectives.computeTimeMs * (0.94 + 0.06 * index / Math.max(1, result.topology.racks.length - 1)),
        slowdown: index === 0 ? result.config.stragglerThrottlePercent : 0,
      })) };
  }
  function applyDue(state) {
    while (state.appliedActions < state.actions.length && state.actions[state.appliedActions].atMs <= state.timeMs) {
      const action = state.actions[state.appliedActions++];
      const rack = state.racks.find(r => r.id === action.rackId);
      if (!rack) throw Error('Unknown workload rack');
      rack.slowdown = action.slowdown;
    }
  }
  function intervene(state, rackId, slowdown) {
    if (!state.racks.some(r => r.id === rackId) || ![0,95].includes(slowdown)) throw Error('Invalid straggler intervention');
    if (state.timeMs >= DURATION_MS) throw Error('Training session has finished');
    // Editing a reconstructed past branches the action history at that time.
    state.actions = state.actions.slice(0,state.appliedActions);
    state.actions.push({ atMs: state.timeMs, rackId, slowdown });
    applyDue(state);
    return snapshot(state);
  }
  function step(state) {
    if (state.timeMs >= DURATION_MS) return snapshot(state);
    applyDue(state);
    if (state.communicating) {
      state.communication = Math.min(1,state.communication + STEP_MS / Math.max(STEP_MS,state.transferMs));
      for (const rack of state.racks) { rack.task='allreduce'; rack.waitingFor=[]; }
      if (state.communication >= 1) {
        state.iteration++; state.communicating=false; state.communication=0;
        for (const rack of state.racks) { rack.work=0; rack.task='forward'; }
      }
    } else {
      for (const rack of state.racks) rack.work=Math.min(1,rack.work + STEP_MS*(1-rack.slowdown/100)/Math.max(STEP_MS,rack.computeMs));
      const pending=state.racks.filter(r=>r.work<1).map(r=>r.id);
      for (const rack of state.racks) {
        rack.task=rack.work<1/3?'forward':rack.work<1?'backward':pending.length?'waiting':'allreduce';
        rack.waitingFor=rack.task==='waiting'?[...pending]:[];
        if(rack.task==='waiting'){rack.waitMs+=STEP_MS;state.totalWaitMs+=STEP_MS;}
      }
      if(!pending.length)state.communicating=true;
    }
    state.timeMs+=STEP_MS;
    return snapshot(state);
  }
  function snapshot(state) {
    return { schema:'simulatte.clusterWorkload.v1', timeMs:state.timeMs, durationMs:DURATION_MS,
      iteration:state.iteration, communication:state.communication, communicating:state.communicating,
      totalWaitMs:state.totalWaitMs, actions:state.actions.map(a=>({...a})),
      racks:state.racks.map(r=>({...r,waitingFor:[...r.waitingFor]})) };
  }
  return Object.freeze({ create, step, intervene, snapshot, STEP_MS, DURATION_MS });
});
