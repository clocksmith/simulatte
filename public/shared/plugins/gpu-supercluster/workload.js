(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteClusterWorkload = api;
})(globalThis, function() {
  const STEP_MS = 1, DURATION_MS = 400, TOTAL_STEPS = 400, EPSILON = 1e-10;
  function create(result, actions = [], {durationMs = DURATION_MS} = {}) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) throw Error('Invalid workload duration');
    const targetRack=result.config.stragglerNodeId
      ? result.topology.gpus.find(g=>g.nodeId===result.config.stragglerNodeId)?.rackId
      : result.topology.racks[0]?.id;
    if(!targetRack)throw Error('Unknown straggler node');
    const state = { durationMs, timeMs: 0, iteration: 0, communication: 0, communicating: false,
      totalWaitMs: 0, transferMs: result.collectives.tensorTransferMs + result.collectives.communicationPlan.durationMs,
      tensorTransferMs: result.collectives.tensorTransferMs, plan: result.collectives.communicationPlan,
      computeMs: result.collectives.computeTimeMs, actions: actions.map(a => ({ ...a })), appliedActions: 0,
      racks: result.topology.racks.map((rack, index) => ({
        id: rack.id, work: 0, waitMs: 0, task: 'forward', waitingFor: [],
        computeMs: result.collectives.computeTimeMs * (0.94 + 0.06 * index / Math.max(1, result.topology.racks.length - 1)),
        slowdown: rack.id === targetRack ? result.config.stragglerThrottlePercent : 0,
      })) };
    let previous = -1;
    for (const action of state.actions) {
      validateAction(state, action);
      if (action.atMs < previous) throw Error('Workload actions must be ordered');
      previous = action.atMs;
    }
    if (!Number.isFinite(state.computeMs) || !(state.computeMs > 0) || !(state.transferMs >= 0) || !Number.isFinite(state.transferMs)) throw Error('Invalid workload durations');
    return state;
  }
  function validateAction(state, action) {
    if (!state.racks.some(r => r.id === action.rackId) || ![0, 95].includes(action.slowdown) ||
      !Number.isFinite(action.atMs) || action.atMs < 0 || action.atMs >= state.durationMs) throw Error('Invalid straggler intervention');
  }
  function applyDue(state) {
    while (state.appliedActions < state.actions.length && state.actions[state.appliedActions].atMs <= state.timeMs + EPSILON) {
      const action = state.actions[state.appliedActions++];
      state.racks.find(r => r.id === action.rackId).slowdown = action.slowdown;
    }
  }
  function intervene(state, rackId, slowdown) {
    if (state.timeMs >= state.durationMs) throw Error('Training session has finished');
    const action = { atMs: state.timeMs, rackId, slowdown }; validateAction(state, action);
    state.actions = state.actions.slice(0, state.appliedActions);
    state.actions.push(action); applyDue(state);
    return snapshot(state);
  }
  function updateTasks(state) {
    const pending = state.racks.filter(r => r.work < 1).map(r => r.id);
    for (const rack of state.racks) {
      rack.task = state.communicating ? 'allreduce' : rack.work < 1 / 3 ? 'forward' : rack.work < 1 ? 'backward' : 'waiting';
      rack.waitingFor = rack.task === 'waiting' ? [...pending] : [];
    }
  }
  // Integrate exactly between compute completions, collective completion, and
  // timestamped interventions. The observation timestep cannot discard work.
  function step(state, dtMs = STEP_MS) {
    if (!Number.isFinite(dtMs) || dtMs <= 0) throw Error('Invalid workload timestep');
    const end = Math.min(state.durationMs, state.timeMs + dtMs);
    while (state.timeMs < end - EPSILON) {
      applyDue(state);
      let dt = Math.min(end - state.timeMs, (state.actions[state.appliedActions]?.atMs ?? end) - state.timeMs);
      if (state.communicating) {
        const remaining = (1 - state.communication) * state.transferMs;
        dt = Math.min(dt, remaining);
        state.communication = state.transferMs ? Math.min(1, state.communication + dt / state.transferMs) : 1;
        if (remaining <= dt + EPSILON) {
          state.iteration++; state.communicating = false; state.communication = 0;
          for (const rack of state.racks) rack.work = 0;
        }
      } else {
        const pending = state.racks.filter(r => r.work < 1);
        dt = Math.min(dt, ...pending.map(r => (1 - r.work) * r.computeMs / (1 - r.slowdown / 100)));
        for (const rack of state.racks) {
          if (rack.work >= 1) { rack.waitMs += dt; state.totalWaitMs += dt; }
          else {
            rack.work = Math.min(1, rack.work + dt * (1 - rack.slowdown / 100) / rack.computeMs);
            if (1 - rack.work < EPSILON) rack.work = 1;
          }
        }
        if (state.racks.every(r => r.work === 1)) state.communicating = true;
      }
      state.timeMs += dt; updateTasks(state);
    }
    state.timeMs = Math.abs(end-state.durationMs)<EPSILON?state.durationMs:end; applyDue(state); updateTasks(state);
    return snapshot(state);
  }
  function snapshot(state) {
    const transferTime = state.communication * state.transferMs - state.tensorTransferMs;
    const round = state.communicating && transferTime >= 0 ? state.plan.rounds.find(r => transferTime < r.startMs + r.durationMs) : null;
    const stage = round?.stages.find(h => transferTime - round.startMs < h.startMs + h.durationMs);
    return { schema: 'simulatte.clusterWorkload.v2', timeMs: state.timeMs, durationMs: state.durationMs,
      iteration: state.iteration, communication: state.communication, communicating: state.communicating,
      collectiveOperation: state.plan.operation, collectiveRound: round?.index ?? null,
      activeLinkIds: stage ? [...new Set(stage.links.map(l => l.id))] : [],
      transfers: stage ? stage.links.map(l => ({...l,progress:(transferTime-round.startMs-stage.startMs)/stage.durationMs})) : [],
      totalWaitMs: state.totalWaitMs, actions: state.actions.map(a => ({ ...a })),
      racks: state.racks.map(r => ({ ...r, waitingFor: [...r.waitingFor] })) };
  }
  return Object.freeze({ create, step, intervene, snapshot, STEP_MS, DURATION_MS, TOTAL_STEPS });
});
