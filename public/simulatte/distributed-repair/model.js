(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./architecture.js') : root.SimulatteRepairArchitecture);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulatteDistributedRepair = api;
})(globalThis, function (architecture) {
  'use strict';
  const MODEL = 'distributed-repair/v1';
  const DEFAULT_CONFIG = typeof module === 'object' && module.exports ? require('../../data/distributed-repair/config.json') : null;
  const PRIORITY = Object.freeze({ cpu: 0, finish: 0, transfer: 0, capacity: 1, down: 1, up: 1, commit: 2, ack: 3, lease: 4, arrival: 5, dispatch: 6 });
  const clone = value => structuredClone(value);
  function schedule(s, kind, at, data = {}) {
    if (!Number.isFinite(at) || at < s.time) throw Error('Invalid event time');
    s.pending.push({ id: ++s.sequence, kind, at, ...data });
    s.pending.sort((a, b) => a.at - b.at || PRIORITY[a.kind] - PRIORITY[b.kind] || a.id - b.id);
  }
  function record(s, kind, requestId = null, attemptId = null, causes = [], detail = '') {
    const row = { id: `event-${s.history.length + 1}`, time: s.time, kind, requestId, attemptId, causes: [...causes], detail };
    s.history.push(row); return row.id;
  }
  function workload(seed, config) {
    const w = config.workload;
    let rng = seed >>> 0;
    const arrivals = Array.from({ length: w.count }, (_, i) => {
      rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
      return { id: `request-${i + 1}`, at: i === 0 ? 0 : w.burstStartSeconds + (i - 1) * w.arrivalIntervalSeconds, cpu: w.cpuWork, work: i === 0 ? w.firstGpuWork : w.gpuWorkBase + (rng % 5) * w.gpuWorkJitter, bytes: w.requestMiB, deadline: (i === 0 ? 0 : w.burstStartSeconds + (i - 1) * w.arrivalIntervalSeconds) + w.deadlineSeconds };
    });
    return { arrivals, rng };
  }
  function initialize(policy, seed, graph = architecture.initial(), config = DEFAULT_CONFIG) {
    architecture.validate(graph);
    validateConfig(config);
    if (!config.policies[policy] || !Number.isInteger(seed)) throw Error('Declared policy and integer seed required');
    const source = workload(seed, config);
    const s = { model: MODEL, config: clone(config), architecture: clone(graph), policy, seed, rng: source.rng, time: 0, sequence: 0, store: true, capacity: 1,
      pending: [], history: [], requests: [], attempts: [], effects: [], source: source.arrivals, lostAck: false,
      gpuWork: 0, peakMemory: 0, memory: 0, memoryAllocated: 0, memoryReleased: 0 };
    source.arrivals.forEach(row => schedule(s, 'arrival', row.at, { requestId: row.id }));
    schedule(s, 'down', config.faults.storeDownSeconds); schedule(s, 'up', config.faults.storeUpSeconds);
    schedule(s, 'capacity', config.faults.gpuThrottleSeconds, { capacity: config.faults.gpuThrottleFraction }); schedule(s, 'capacity', config.faults.gpuRestoreSeconds, { capacity: 1 });
    return s;
  }
  function memory(s, amount) {
    s.memory += amount;
    if (amount > 0) s.memoryAllocated += amount; else s.memoryReleased -= amount;
    s.peakMemory = Math.max(s.peakMemory, s.memory);
  }
  function active(s) { return s.attempts.filter(a => ['cpu', 'gpu', 'stage-transfer'].includes(a.phase)); }
  function resource(s, a) {
    const network = a.phase.endsWith('transfer');
    const id = network ? a.route.linkIds[a.stage - 1] : a.route.nodeIds[a.stage];
    const row = (network ? s.architecture.links : s.architecture.nodes).find(n => n.id === id);
    return { id, capacity: row.capacity, clusterId: network ? null : row.clusterId };
  }
  function rates(s) {
    const workers = active(s);
    return new Map(workers.map(a => {
      const r = resource(s, a), peers = workers.filter(b => resource(s, b).id === r.id).length;
      let rate = r.capacity / peers;
      if (r.clusterId) {
        const cluster = s.architecture.clusters.find(c => c.id === r.clusterId);
        rate = Math.min(rate, cluster.capacity / workers.filter(b => resource(s, b).clusterId === r.clusterId).length);
      }
      if (a.phase === 'gpu') rate *= s.capacity;
      return [a.id, rate];
    }));
  }
  function integrate(s, time) {
    const current = rates(s), elapsed = time - s.time;
    for (const a of active(s)) {
      const used = Math.max(0, Math.min(a.remaining, elapsed * current.get(a.id)));
      a.remaining = Math.max(0, a.remaining - used);
      if (a.phase === 'gpu') { a.performed += used; a.gpuRemaining = Math.max(0, a.gpuRemaining - used); s.gpuWork += used; }
    }
    s.time = time;
  }
  // Each membership, failure or capacity change invalidates old completion estimates.
  function reestimate(s) {
    const current = rates(s);
    s.pending = s.pending.filter(e => !['finish', 'cpu', 'transfer'].includes(e.kind));
    for (const a of active(s)) {
      a.generation++;
      if (current.get(a.id) > 0) schedule(s, a.phase === 'gpu' ? 'finish' : a.phase === 'cpu' ? 'cpu' : 'transfer',
        s.time + a.remaining / current.get(a.id), { attemptId: a.id, generation: a.generation });
    }
  }
  function begin(s, a, phase, work) { a.phase = phase; a.remaining = work; reestimate(s); }
  function releaseAttempt(s, a) {
    if (a.memory) { memory(s, -a.memory); a.memory = 0; }
  }
  function terminal(s, r, status) {
    r.status = status; r.owner = null;
    if (r.memory) { memory(s, -r.memory); r.memory = 0; }
  }
  function dispatch(s, r, cause) {
    if (r.status !== 'queued') return;
    if (s.config.policies[s.policy].backpressure && !s.store) {
      r.blocker = { kind: 'store-unavailable', eventId: s.storeEvent };
      return;
    }
    if (s.config.policies[s.policy].backpressure && s.attempts.filter(a => !['expired', 'acknowledged'].includes(a.phase)).length >= s.config.resources.boundedConcurrency) {
      r.blocker = { kind: 'worker-capacity', attemptIds: s.attempts.filter(a => !['expired', 'acknowledged'].includes(a.phase)).map(a => a.id) }; return;
    }
    const previous = s.attempts.filter(a => a.requestId === r.id);
    if (previous.length >= s.config.policies[s.policy].retryBudget) {
      terminal(s, r, 'dead-letter'); r.last = record(s, 'retry-budget-exhausted', r.id, null, [cause]); return;
    }
    const routes = architecture.paths(s.architecture);
    const route = routes.reduce((best, path) => {
      const load = p => p.nodeIds.slice(1, -1).reduce((sum, id) => sum + active(s).filter(a => a.route.nodeIds.includes(id)).length / s.architecture.nodes.find(n => n.id === id).capacity, 0);
      return load(path) < load(best) ? path : best;
    }, routes[0]);
    const a = { stage: 1, route: clone(route), id: `${r.id}:attempt-${previous.length + 1}`, requestId: r.id, phase: 'waiting-input', remaining: s.config.resources.transferMiB,
      performed: 0, gpuRemaining: r.work * route.nodeIds.filter(id => s.architecture.nodes.find(n => n.id === id).type === 'gpu').length, generation: 0, memory: s.config.resources.attemptMiB, leaseUntil: s.time + s.config.resources.leaseSeconds, last: null };
    s.attempts.push(a); memory(s, a.memory); r.owner = a.id; r.status = 'in-flight'; r.blocker = null;
    a.last = record(s, 'attempt-started', r.id, a.id, [cause], 'Lease owns delivery, not the logical request'); r.last = a.last;
    begin(s, a, 'stage-transfer', s.config.resources.transferMiB); schedule(s, 'lease', a.leaseUntil, { attemptId: a.id });
  }
  function process(s, e) {
    const a = s.attempts.find(row => row.id === e.attemptId);
    const r = s.requests.find(row => row.id === (e.requestId || a?.requestId));
    switch (e.kind) {
      case 'arrival': {
        const input = s.source.find(row => row.id === e.requestId);
        const request = { ...input, status: 'queued', owner: null, memory: 0, last: null, blocker: null };
        s.requests.push(request);
        request.last = record(s, 'arrived', request.id);
        if (s.requests.filter(row => ['queued', 'in-flight'].includes(row.status)).length > s.config.policies[s.policy].admission) {
          request.status = 'rejected'; request.last = record(s, 'admission-rejected', request.id, null, [request.last], 'Outstanding request limit');
        } else { request.memory = request.bytes; memory(s, request.memory); dispatch(s, request, request.last); }
        break;
      }
      case 'cpu':
        if (a.phase !== 'cpu' || e.generation !== a.generation) break;
        a.last = record(s, 'cpu-completed', r.id, a.id, [a.last]);
        if (s.architecture.nodes.find(n => n.id === a.route.nodeIds[a.stage + 1]).type === 'store') { memory(s, s.config.resources.resultMiB); a.memory += s.config.resources.resultMiB; }
        a.stage++; begin(s, a, 'stage-transfer', s.config.resources.transferMiB); break;
      case 'transfer': {
        if (!a.phase.endsWith('transfer') || e.generation !== a.generation) break;
        const phase = a.phase, link = resource(s, a);
        a.phase = 'propagation'; a.generation++; reestimate(s);
        const latency = s.architecture.links.find(l => l.id === link.id).latency;
        schedule(s, 'dispatch', s.time + latency, { attemptId: a.id, transition: 'stage-transfer' });
        break;
      }
      case 'finish':
        if (a.phase !== 'gpu' || e.generation !== a.generation) break;
        a.remaining = 0; a.phase = 'awaiting-commit';
        if (s.architecture.nodes.find(n => n.id === a.route.nodeIds[a.stage + 1]).type === 'store') { memory(s, s.config.resources.resultMiB); a.memory += s.config.resources.resultMiB; }
        a.last = record(s, 'gpu-completed', r.id, a.id, [a.last]); reestimate(s);
        a.stage++; begin(s, a, 'stage-transfer', s.config.resources.transferMiB); break;
      case 'down': case 'up':
        s.store = e.kind === 'up'; s.storeEvent = record(s, s.store ? 'store-restored' : 'store-disabled', null, null, [], e.kind === 'down' ? `Scheduled ${s.config.faults.storeDownSeconds} s outage; default first GPU completes at 3.02 s` : 'Service restored');
        if (s.store) for (const request of s.requests.filter(row => row.status === 'queued')) dispatch(s, request, request.last);
        break;
      case 'capacity':
        s.capacity = e.capacity; record(s, 'gpu-capacity-changed', null, null, [], String(e.capacity)); reestimate(s); break;
      case 'commit': {
        if (a.phase !== 'awaiting-commit') break;
        if (r.owner !== a.id || s.time >= a.leaseUntil) {
          a.last = record(s, 'stale-owner-fenced', r.id, a.id, [a.last]); a.phase = 'expired'; releaseAttempt(s, a); break;
        }
        if (!s.store) {
          a.last = record(s, 'acknowledgement-failed', r.id, a.id, [a.last, s.storeEvent], 'No committed result; retain output until lease expiry');
          r.blocker = { kind: 'result-store', eventId: s.storeEvent, attemptId: a.id }; r.last = a.last; break;
        }
        const existing = s.effects.find(row => row.requestId === r.id);
        if (!s.config.policies[s.policy].idempotent || !existing) s.effects.push({ id: `effect-${s.effects.length + 1}`, requestId: r.id, attemptId: a.id, time: s.time });
        a.last = record(s, existing && s.config.policies[s.policy].idempotent ? 'commit-deduplicated' : 'result-committed', r.id, a.id, [a.last, ...(existing ? [existing.eventId] : [])].filter(Boolean));
        if (!existing || !s.config.policies[s.policy].idempotent) s.effects.at(-1).eventId = a.last;
        if (s.config.faults.loseFirstSuccessfulAck && !s.lostAck) {
          s.lostAck = true; a.last = record(s, 'acknowledgement-lost', r.id, a.id, [a.last], 'One successful commit reply is lost in both policies'); r.last = a.last;
          r.blocker = { kind: 'acknowledgement', eventId: a.last }; break;
        }
        schedule(s, 'ack', s.time + s.config.resources.ackSeconds, { attemptId: a.id }); break;
      }
      case 'ack':
        if (r.owner !== a.id || s.time >= a.leaseUntil) break;
        a.phase = 'acknowledged'; releaseAttempt(s, a); terminal(s, r, 'completed'); r.blocker = null;
        r.last = record(s, 'acknowledged', r.id, a.id, [a.last]); break;
      case 'lease':
        if (a.phase === 'acknowledged' || r.owner !== a.id) break;
        a.last = record(s, 'lease-expired', r.id, a.id, [a.last]);
        if (a.phase === 'awaiting-commit') { a.phase = 'expired'; releaseAttempt(s, a); }
        r.status = 'queued'; r.owner = null; r.last = a.last;
        schedule(s, 'dispatch', s.time + s.config.resources.retryDelaySeconds, { requestId: r.id }); break;
      case 'dispatch':
        if (e.transition) {
          const node = s.architecture.nodes.find(n => n.id === a.route.nodeIds[a.stage]);
          if (node.type === 'cpu') begin(s, a, 'cpu', r.cpu);
          else if (node.type === 'gpu') { a.last = record(s, 'gpu-started', r.id, a.id, [a.last]); begin(s, a, 'gpu', r.work); }
          else { a.phase = 'awaiting-commit'; a.generation++; reestimate(s); schedule(s, 'commit', s.time + s.config.resources.commitSeconds, { attemptId: a.id }); }
        } else dispatch(s, r, r.last);
        break;
      default: throw Error('Unsupported event');
    }
    // Expired computations still consume work; they cannot commit another lease's result.
    if (s.config.policies[s.policy].backpressure && s.store) for (const request of s.requests.filter(row => row.status === 'queued')) dispatch(s, request, request.last);
    for (const attempt of s.attempts) if (attempt.phase === 'expired' && attempt.memory) releaseAttempt(s, attempt);
  }
  function advance(state, target) {
    const s = clone(state);
    if (!Number.isFinite(target) || target < s.time) throw Error('Cannot reverse logical time');
    let count = 0;
    while (s.pending[0]?.at <= target) {
      if (++count > 100000) throw Error('Event budget exceeded');
      const e = s.pending.shift(); integrate(s, e.at); process(s, e);
    }
    integrate(s, target); return s;
  }
  function observe(state, time) {
    if (!Number.isFinite(time) || time < state.time || state.pending[0]?.at <= time) throw Error('Observation must remain before the next unexecuted event');
    const projected = clone(state); integrate(projected, time); return projected;
  }
  function metrics(s) {
    const status = key => s.requests.filter(r => r.status === key).length;
    const retained = s.requests.reduce((sum, r) => sum + r.memory, 0) + s.attempts.reduce((sum, a) => sum + a.memory, 0);
    return { offered: s.requests.length, completed: status('completed'), rejected: status('rejected'), deadLetter: status('dead-letter'),
      unfinished: status('queued') + status('in-flight'), backlog: status('queued'), attempts: s.attempts.length,
      duplicateCompute: s.attempts.filter(a => !a.id.endsWith(':attempt-1')).reduce((sum, a) => sum + a.performed, 0),
      deadlineMisses: s.requests.filter(r => r.status !== 'rejected' && (r.status === 'completed' ? s.history.find(e => e.id === r.last).time : s.time) > r.deadline).length,
      effects: s.effects.length, memory: s.memory, peakMemory: s.peakMemory, retained,
      allocated: s.memoryAllocated, released: s.memoryReleased, gpuWork: s.gpuWork };
  }
  function inspect(s, id) {
    const r = s.requests.find(row => row.id === id); if (!r) return null;
    const attempts = s.attempts.filter(a => a.requestId === id);
    const history = s.history.filter(e => e.requestId === id);
    const causes = new Set(history.flatMap(e => e.causes));
    return { request: clone(r), attempts: clone(attempts), effects: clone(s.effects.filter(e => e.requestId === id)),
      blocker: r.blocker || (r.status === 'in-flight' ? { kind: attempts.find(a => a.id === r.owner)?.phase || 'delivery', attemptId: r.owner } : null),
      history: clone(s.history.filter(e => e.requestId === id || causes.has(e.id))) };
  }
  function moduleRecord(policy = 'baseline', seed = 42, graph = architecture.initial(), config = DEFAULT_CONFIG) {
    graph = clone(architecture.validate(graph));
    config = clone(validateConfig(config));
    return { id: 'distributed-repair', implementationId: MODEL, implementationHash: 'distributed-repair-model-v1', clock: { kind: 'event', intervalSeconds: null },
      lifecycle: { initialize: () => initialize(policy, seed, graph, config), nextEventTime: ({ state }) => state.pending[0]?.at ?? null,
        advance: ({ state, toTime, controls = [] }) => {
          let next = advance(state, toTime);
          for (const control of controls) {
            if (control.payload?.kind !== 'repair') throw Error('Unsupported intervention');
            schedule(next, 'up', toTime);
          }
          if (controls.length) next = advance(next, toTime);
          return { state: next, events: [], diagnostics: [] };
        }, emit: () => [],
        checkpoint: ({ state }) => clone(state), restore: ({ checkpoint }) => clone(checkpoint),
        aggregate: () => { throw Error('Lossy aggregation unsupported'); }, refine: () => { throw Error('Refinement unsupported'); }, dispose() {} } };
  }
  function validateConfig(config) {
    if (!config || config.schema !== 'simulatte.distributedRepairConfig.v1') throw Error('Missing declared model configuration');
    if (Object.keys(config).sort().join(',') !== ['schema','version','horizonSeconds','policies','workload','resources','faults','claimBoundary'].sort().join(',')) throw Error('Missing or undeclared configuration fields');
    if (typeof config.version !== 'string' || typeof config.claimBoundary !== 'string' || !Number.isInteger(config.resources?.boundedConcurrency) || config.resources.boundedConcurrency < 1 || config.resources.boundedConcurrency > 128) throw Error('Invalid configuration identity or concurrency');
    if (config.horizonSeconds !== 40 || !Number.isInteger(config.workload?.count) || config.workload.count < 1 || config.workload.count > 32) throw Error('Unsupported experiment bounds');
    for (const policy of ['baseline', 'bounded']) {
      const p = config.policies?.[policy];
      if (!p || Object.keys(p).sort().join(',') !== 'admission,backpressure,idempotent,retryBudget' || !Number.isInteger(p.admission) || p.admission < 1 || p.admission > 128 || !Number.isInteger(p.retryBudget) || p.retryBudget < 1 || p.retryBudget > 12 || typeof p.backpressure !== 'boolean' || typeof p.idempotent !== 'boolean') throw Error('Invalid delivery policy');
    }
    for (const section of ['workload', 'resources', 'faults']) for (const [key, value] of Object.entries(config[section] || {})) {
      if (section === 'faults' && key === 'loseFirstSuccessfulAck' && typeof value === 'boolean') continue;
      if (!Number.isFinite(value) || value < 0 || value > 1000 || (section !== 'faults' && value === 0)) throw Error(`Invalid ${section}.${key}`);
    }
    if (Object.keys(config.policies).sort().join(',') !== 'baseline,bounded') throw Error('Unsupported policy names');
    const expected = { workload: ['count','burstStartSeconds','arrivalIntervalSeconds','cpuWork','firstGpuWork','gpuWorkBase','gpuWorkJitter','requestMiB','deadlineSeconds'], resources: ['attemptMiB','resultMiB','transferMiB','leaseSeconds','commitSeconds','ackSeconds','retryDelaySeconds','boundedConcurrency'], faults: ['storeDownSeconds','storeUpSeconds','gpuThrottleSeconds','gpuRestoreSeconds','gpuThrottleFraction','loseFirstSuccessfulAck'] };
    for (const [section, keys] of Object.entries(expected)) if (Object.keys(config[section] || {}).length !== keys.length || keys.some(key => !Object.hasOwn(config[section], key))) throw Error('Missing or unsupported model configuration fields');
    if (config.faults.storeUpSeconds < config.faults.storeDownSeconds || config.faults.gpuRestoreSeconds < config.faults.gpuThrottleSeconds || typeof config.faults.loseFirstSuccessfulAck !== 'boolean') throw Error('Invalid fault schedule');
    return config;
  }
  return Object.freeze({ MODEL, validateConfig, initialize, advance, observe, metrics, inspect, moduleRecord });
});
