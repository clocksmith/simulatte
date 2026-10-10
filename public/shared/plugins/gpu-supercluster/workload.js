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
      totalWaitMs: 0, computeEquivalentMs: 0, transferMs: result.collectives.tensorCommunicationPlan.durationMs + result.collectives.communicationPlan.durationMs,
      tensorPlan: result.collectives.tensorCommunicationPlan, plan: result.collectives.communicationPlan,
      computeMs: result.collectives.computeTimeMs, actions: actions.map(a => ({ ...a })), appliedActions: 0,
      racks: result.topology.racks.map((rack, index) => ({
        id: rack.id, work: 0, waitMs: 0, computingMs: 0, communicationMs: 0,
        productiveMs: 0, slowdownLossMs: 0, task: 'forward', waitingFor: [],
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
        for (const rack of state.racks) rack.communicationMs += dt;
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
            rack.computingMs += dt;
            rack.productiveMs += dt * (1 - rack.slowdown / 100);
            rack.slowdownLossMs += dt * rack.slowdown / 100;
            state.computeEquivalentMs += dt * (1 - rack.slowdown / 100);
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
    const elapsedMs = state.communication * state.transferMs;
    const isTensor = elapsedMs < state.tensorPlan.durationMs;
    const plan = isTensor ? state.tensorPlan : state.plan;
    const transferTime = isTensor ? elapsedMs : elapsedMs - state.tensorPlan.durationMs;
    const round = state.communicating ? plan.rounds.find(r => transferTime < r.startMs + r.durationMs) : null;
    const stage = round?.stages.find(h => transferTime - round.startMs < h.startMs + h.durationMs);
    return { schema: 'simulatte.clusterWorkload.v3', timeMs: state.timeMs, durationMs: state.durationMs,
      iteration: state.iteration, communication: state.communication, communicating: state.communicating,
      communicationPhase: state.communicating ? (isTensor ? 'tensor' : 'data') : null,
      collectiveOperation: plan.operation, collectiveRound: round?.index ?? null,
      activeLinkIds: stage ? [...new Set(stage.links.map(l => l.id))] : [],
      transfers: stage ? stage.links.map(l => ({...l,progress:(transferTime-round.startMs-stage.startMs)/stage.durationMs})) : [],
      totalWaitMs: state.totalWaitMs, computeEquivalentMs: state.computeEquivalentMs, actions: state.actions.map(a => ({ ...a })),
      racks: state.racks.map(r => ({ ...r, waitingFor: [...r.waitingFor] })) };
  }
  function compareExecuted(result, observed) {
    if (!observed || !Array.isArray(observed.actions) || !Array.isArray(observed.racks) || !Number.isFinite(observed.durationMs) || !Number.isFinite(observed.timeMs) || observed.timeMs < 0 || observed.timeMs > observed.durationMs) throw Error('Invalid executed comparison interval');
    const actions=observed.actions.filter(action=>action.atMs<=observed.timeMs);
    const replay=(history,time)=>{const state=create(result,history,{durationMs:observed.durationMs});if(time>0)step(state,time);return snapshot(state);};
    const baseline=replay([],observed.timeMs),intervention=replay(actions,observed.timeMs);
    if(intervention.iteration!==observed.iteration || Math.abs(intervention.totalWaitMs-observed.totalWaitMs)>1e-6 ||
      Math.abs(intervention.computeEquivalentMs-observed.computeEquivalentMs)>1e-6) throw Error('Executed comparison diverges from observed workload');
    for (const key of ['iteration','totalWaitMs','computeEquivalentMs']) {
      if(!Number.isFinite(observed[key]))throw Error('Invalid observed workload metric');
    }
    if(observed.racks.length!==intervention.racks.length)throw Error('Executed rack inventory diverges');
    for(const [i,rack] of intervention.racks.entries()) {
      const actual=observed.racks[i];
      if(actual.id!==rack.id)throw Error('Executed rack identity diverges');
      for(const key of ['waitMs','productiveMs','communicationMs','slowdownLossMs']) {
        if(!Number.isFinite(actual[key])||Math.abs(actual[key]-rack[key])>1e-6)throw Error('Executed rack metric diverges');
      }
    }
    const restoration=actions.filter(action=>action.slowdown===0).at(-1)?.atMs ?? null;
    const baseRestore=restoration===null?null:replay([],restoration),variantRestore=restoration===null?null:replay(actions,restoration);
    const metrics=sample=>({completedIterations:sample.iteration,productiveComputeRackMs:sample.computeEquivalentMs,
      communicationRackMs:sample.racks.reduce((sum,rack)=>sum+rack.communicationMs,0),synchronizationWaitingRackMs:sample.totalWaitMs});
    const branches={baseline:metrics(baseline),intervention:metrics(intervention)};
    const differences=Object.fromEntries(Object.keys(branches.baseline).map(key=>[key,branches.intervention[key]-branches.baseline[key]]));
    return {schema:'simulatte.executedClusterComparison.v1',scope:'executed-run',interval:{start:0,end:observed.timeMs,unit:'ms'},
      startingConfiguration:JSON.stringify(result.config),actions:actions.map(action=>({...action})),branches,differences,
      lastRestorationTimeMs:restoration,
      racks:intervention.racks.map((rack,i)=>({id:rack.id,extraWaitingMs:rack.waitMs-baseline.racks[i].waitMs,
        additionalComputeLossMs:rack.slowdownLossMs-baseline.racks[i].slowdownLossMs,
        afterRestorationAdditionalWaitingMs:restoration===null?null:(rack.waitMs-variantRestore.racks[i].waitMs)-(baseline.racks[i].waitMs-baseRestore.racks[i].waitMs)})),
      claimBoundary:'Same configured workload, duration and initial rack state; variant replays timestamped live actions, baseline omits them. Rack milliseconds sum across racks. Facility power and temperature are separate configured steady-state estimates.',
    };
  }
  return Object.freeze({ create, step, intervene, snapshot, compareExecuted, STEP_MS, DURATION_MS, TOTAL_STEPS });
});
