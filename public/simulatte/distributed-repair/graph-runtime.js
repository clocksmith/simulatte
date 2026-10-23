(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./graph-document.js') : root.SimulatteGraphDocument,
    node ? require('../../shared/contracts/world-spec.js') : root.SimulatteWorldSpec);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulatteGraphRuntime = api;
})(globalThis, function (documentApi, worldSpec) {
  'use strict';
  if (!documentApi) throw Error('System Diagram document contract is required');
  if (!worldSpec) throw Error('System Diagram WorldSpec contract is required');
  const MODEL = 'system-diagram/v2', HORIZON = 60, MAX_EVENTS = 20000, MAX_TASKS = 8192;
  const PRIORITY = Object.freeze({ down: 0, up: 1, complete: 2, deliver: 3, retry: 4, arrival: 5, deadline: 6 });
  const clone = value => structuredClone(value);
  function program(input, profileId = 'system-diagram-v1') {
    const doc = clone(documentApi.validate(input, { execution: true }));
    if (typeof profileId !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(profileId)) throw Error('Invalid System Diagram profile ID');
    const assumptions = [...documentApi.ASSUMPTIONS, ...doc.assumptions.filter(a => !documentApi.ASSUMPTIONS.includes(a))];
    return worldSpec.finalizeWorldSpec({ id: `world:${profileId}`, templateId: profileId, name: 'System Diagram Simulator',
      kind: 'executable-system-diagram', description: 'Synthetic authored topology with seeded discrete events and declared model assumptions.',
      modules: ['system-diagram'], objects: clone(doc.nodes), controls: [],
      params: { document: doc, documentIdentity: documentApi.identity(doc), profileId, model: MODEL, seed: doc.workload.seed, assumptions },
      source: { schema: 'simulatte.worldSpecSource.v1', prompt: '', compilerConfig: { lane: 'authored-system-diagram/v2', model: MODEL } },
      authorship: { schema: 'simulatte.worldSpecAuthoring.v2', revision: 0,
        sources: [{ id: 'source:system-diagram', authority: 'userOverride', label: 'Accepted system diagram and class definitions' }],
        fieldProvenance: [{ path: '/params/document', authority: 'userOverride', sourceId: 'source:system-diagram' }], patches: [], reconciliations: [] },
      determinism: { schema: 'simulatte.worldSpecDeterminism.v1', requiredClasses: ['simulation-reproducible', 'replay-identified'], seed: doc.workload.seed, simulationTolerance: 1e-9, pixelPolicy: null },
      dependencies: { schema: 'simulatte.worldSpecDependencies.v1', governedPacks: [], plugins: [], assets: [{ id: 'system-diagram-document', contentHash: worldSpec.contentHash(doc) }] },
      safety: { schema: 'simulatte.worldSpecSafety.v1', rules: [], status: 'not-declared' },
      unsupportedRequirements: [
        { id: 'production-fidelity', reason: 'Synthetic service, queue, memory and network parameters do not establish production performance or physical hardware validity.' },
        { id: 'external-execution', reason: 'No real crawling, model inference, infrastructure failures, clinical decisions or financial transactions execute.' },
        { id: 'distributed-protocols', reason: 'Asynchronous idempotent replica writes do not implement consensus, quorum or transactional consistency.' }
      ], unresolvedAmbiguities: [] });
  }
  function canonical(value, depth = 0, budget = { count: 0 }) {
    if (depth > 32 || ++budget.count > 500000) throw Error('Checkpoint structure exceeds bounded validation budget');
    if (Array.isArray(value)) return value.map(item => canonical(item, depth + 1, budget));
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key], depth + 1, budget)]));
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value;
    throw Error('Checkpoint contains unsupported values');
  }
  function create(input) {
    const doc = clone(documentApi.validate(input, { execution: true })), identity = documentApi.identity(doc), spec = program(doc);
    const definitions = new Map(doc.nodes.map(n => [n.id, documentApi.resolveNode(doc, n)]));
    let state;
    function initialize() {
      state = { schema: 'simulatte.systemDiagramState.v2', identity, time: 0, rng: doc.workload.seed, nextSequence: 1, nextRecord: 1, nextTask: 1, nextAttempt: 1,
        processedEvents: 0, peakMemoryMiB: 0, pending: [], events: [], requests: [], tasks: [], attempts: [], effects: [],
        nodes: doc.nodes.map(n => ({ id: n.id, active: [], queue: [], held: [], memoryMiB: 0, peakMemoryMiB: 0, completed: 0, failed: 0, online: true })),
        links: doc.links.map(l => ({ id: l.id, availableAt: 0, transfers: 0, delivered: 0, bytesMiB: 0 })), stopped: false };
      for (const n of definitions.values()) {
        const p = n.properties;
        if (p.failureAt !== null) { schedule(p.failureAt, 'down', { nodeId: n.id }); schedule(p.recoveryAt, 'up', { nodeId: n.id }); }
      }
      let index = 0;
      for (const n of definitions.values()) if (documentApi.SOURCES.includes(n.type)) {
        for (let i = 0; i < doc.workload.count; i++) {
          const id = `request-${++index}`, arrival = i * doc.workload.interval;
          state.requests.push({ id, sourceId: n.id, arrival, deadline: arrival + doc.workload.deadline, status: 'scheduled', payloadType: n.properties.outputType === 'preserve' ? doc.workload.payloadType : n.properties.outputType,
            pending: 0, failedKinds: [], attempts: [], deadlineMissed: false, completedAt: null, blocker: { kind: 'scheduled-arrival', time: arrival } });
          schedule(arrival, 'arrival', { requestId: id }); schedule(arrival + doc.workload.deadline, 'deadline', { requestId: id });
        }
      }
    }
    function schedule(time, kind, fields) {
      if (!Number.isFinite(time) || time < state.time - 1e-9) throw Error('Invalid causal event time');
      state.pending.push({ id: `pending-${state.nextSequence}`, time, kind, sequence: state.nextSequence++, ...fields });
      state.pending.sort((a, b) => a.time - b.time || PRIORITY[a.kind] - PRIORITY[b.kind] || a.sequence - b.sequence);
    }
    function record(kind, fields = {}, causes = []) {
      const e = { id: `event-${state.nextRecord++}`, time: state.time, kind, requestId: null, nodeId: null, taskId: null, attemptId: null, detail: '', ...fields, causes: [...causes] };
      state.events.push(e); return e.id;
    }
    function random() { state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0; return state.rng / 4294967296; }
    const nodeState = id => state.nodes.find(n => n.id === id);
    const request = id => state.requests[Number(id.slice('request-'.length)) - 1];
    const task = id => state.tasks[Number(id.slice('task-'.length)) - 1];
    const attempt = id => state.attempts[Number(id.slice('attempt-'.length)) - 1];
    function taskRecord(kind, t, detail = '', extra = {}) {
      const id = record(kind, { requestId: t.requestId, nodeId: t.nodeId, taskId: t.id, attemptId: t.attemptId, detail, ...extra }, t.cause ? [t.cause] : []); t.cause = id; return id;
    }
    function spawn(r, nodeId, payloadType, cause, deliveryTime = state.time, linkId = null) {
      if (state.tasks.length >= MAX_TASKS) throw Error('Synthetic graph task budget exceeded (8192); reduce crawler fan-out or workload');
      const t = { id: `task-${state.nextTask++}`, requestId: r.id, nodeId, payloadType, sizeMiB: doc.workload.payloadMiB, status: 'transit', retries: 0, attemptId: null, cause, linkId };
      state.tasks.push(t); r.pending++; schedule(deliveryTime, 'deliver', { taskId: t.id, linkId }); return t;
    }
    function release(t) {
      const ns = nodeState(t.nodeId); ns.active = ns.active.filter(id => id !== t.id); ns.queue = ns.queue.filter(id => id !== t.id);
      if (ns.held.includes(t.id)) { ns.held = ns.held.filter(id => id !== t.id); ns.memoryMiB = ns.held.reduce((sum, id) => sum + memory(task(id)), 0); }
    }
    function memory(t) { return definitions.get(t.nodeId).properties.memoryMiB + t.sizeMiB; }
    function finish(t, failure = null) {
      release(t); const r = request(t.requestId); t.status = failure ? 'failed' : 'completed'; r.pending--;
      if (failure) r.failedKinds.push(failure);
      if (r.pending === 0) {
        r.status = r.failedKinds.length ? r.failedKinds.some(k => ['queue-full', 'memory-limit'].includes(k)) ? 'rejected' : 'failed' : 'completed'; r.completedAt = state.time; r.blocker = null;
        taskRecord(`request-${r.status}`, t);
      }
    }
    function retry(t, reason) {
      release(t); const n = definitions.get(t.nodeId), ns = nodeState(t.nodeId), r = request(t.requestId);
      if (t.attemptId) { const a = attempt(t.attemptId); if (a && a.status === 'active') { a.status = 'failed'; a.finishedAt = state.time; a.reason = reason; ns.failed++; } }
      if (t.retries >= n.properties.retries) { taskRecord('retry-budget-exhausted', t, reason); finish(t, reason); return; }
      t.retries++; t.status = 'retry'; t.retryReason = reason; t.attemptId = null;
      const delay = n.properties.retryDelay * Math.pow(2, t.retries - 1) * (0.9 + 0.2 * random());
      const retryAt = state.time + delay; taskRecord('retry-scheduled', t, `${reason}; attempt ${t.retries + 1} at ${retryAt.toFixed(3)} s`);
      r.blocker = { kind: reason, nodeId: t.nodeId, taskId: t.id, retryAt, eventId: t.cause }; schedule(retryAt, 'retry', { taskId: t.id });
    }
    function admit(t) {
      const n = definitions.get(t.nodeId), ns = nodeState(n.id), r = request(t.requestId), p = n.properties;
      if (!documentApi.SOURCES.includes(n.type) && !n.ports.in.includes(t.payloadType)) { taskRecord('payload-rejected', t, `${t.payloadType} not accepted by ${n.label}`); finish(t, 'incompatible-payload'); return; }
      if (!ns.online) return retry(t, 'node-offline');
      if (ns.queue.length + ns.active.length >= p.queueCapacity) return retry(t, 'queue-full');
      if (ns.memoryMiB + memory(t) > p.memoryLimitMiB) return retry(t, 'memory-limit');
      t.status = 'queued'; ns.queue.push(t.id); ns.held.push(t.id); ns.memoryMiB += memory(t); ns.peakMemoryMiB = Math.max(ns.peakMemoryMiB, ns.memoryMiB);
      state.peakMemoryMiB = Math.max(state.peakMemoryMiB, state.nodes.reduce((sum, node) => sum + node.memoryMiB, 0));
      r.status = 'active'; taskRecord('queued', t); r.blocker = { kind: 'fifo-queue', nodeId: n.id, taskId: t.id, eventId: t.cause };
    }
    function clusterAvailable(n) {
      if (!n.clusterId) return true;
      const cluster = doc.clusters.find(c => c.id === n.clusterId);
      return state.nodes.filter(s => definitions.get(s.id).clusterId === n.clusterId).reduce((sum, s) => sum + s.active.length, 0) < cluster.capacity;
    }
    function drain() {
      for (const n of definitions.values()) {
        const ns = nodeState(n.id), p = n.properties;
        while (ns.online && ns.queue.length && ns.active.length < p.concurrency && clusterAvailable(n)) {
          const t = task(ns.queue.shift()), r = request(t.requestId), id = `attempt-${state.nextAttempt++}`;
          t.status = 'active'; t.attemptId = id; ns.active.push(t.id); r.attempts.push(id);
          const serviceTime = p.serviceTime * (0.9 + 0.2 * random());
          state.attempts.push({ id, requestId: r.id, taskId: t.id, nodeId: n.id, payloadType: t.payloadType, status: 'active', startedAt: state.time, finishedAt: null, serviceTime, reason: null });
          taskRecord('service-started', t, `${n.type}; ${serviceTime.toFixed(3)} s`);
          r.blocker = { kind: 'service', nodeId: n.id, taskId: t.id, attemptId: id, eventId: t.cause };
          schedule(state.time + serviceTime, 'complete', { taskId: t.id, attemptId: id });
        }
        for (const id of ns.queue) { const t = task(id); request(t.requestId).blocker = { kind: clusterAvailable(n) ? 'worker-concurrency' : 'cluster-concurrency', nodeId: n.id, taskId: id, eventId: t.cause }; }
      }
    }
    function complete(t, attemptId) {
      if (t.status !== 'active' || t.attemptId !== attemptId) return;
      const n = definitions.get(t.nodeId), ns = nodeState(n.id), r = request(t.requestId), a = attempt(attemptId);
      a.status = 'completed'; a.finishedAt = state.time; ns.completed++; taskRecord('service-completed', t);
      if (['database', 'replica'].includes(n.type)) {
        const key = `${r.id}:${n.id}`, duplicate = state.effects.some(e => e.key === key);
        const eventId = taskRecord(duplicate ? 'effect-deduplicated' : 'effect-committed', t, n.type === 'replica' ? 'Asynchronous replica write; no quorum modeled' : 'Idempotent logical request commit');
        if (!duplicate) state.effects.push({ key, requestId: r.id, nodeId: n.id, taskId: t.id, attemptId, time: state.time, eventId, payloadType: 'structured' });
      }
      const outputType = n.properties.outputType === 'preserve' ? t.payloadType : n.properties.outputType;
      if (outputType !== t.payloadType) taskRecord('payload-transformed', t, `${t.payloadType} → ${outputType}`);
      const outgoing = doc.links.filter(l => l.from === n.id), copies = n.type === 'crawler' ? n.properties.spawnCount : 1;
      for (const link of outgoing) for (let copy = 0; copy < copies; copy++) {
        const ls = state.links.find(l => l.id === link.id), start = Math.max(state.time, ls.availableAt), serializedAt = start + t.sizeMiB / link.capacity;
        ls.availableAt = serializedAt; ls.transfers++; ls.bytesMiB += t.sizeMiB;
        const cause = taskRecord('link-enqueued', t, `${link.id}; ${outputType}; arrival ${(serializedAt + link.latency).toFixed(3)} s`, { linkId: link.id });
        spawn(r, link.to, outputType, cause, serializedAt + link.latency, link.id);
      }
      finish(t);
    }
    function process(e) {
      if (e.kind === 'arrival') {
        const r = request(e.requestId); r.status = 'active'; const cause = record('request-arrived', { requestId: r.id, nodeId: r.sourceId, detail: r.payloadType }); spawn(r, r.sourceId, r.payloadType, cause);
      } else if (e.kind === 'deliver' || e.kind === 'retry') {
        const t = task(e.taskId); if (e.linkId) { state.links.find(l => l.id === e.linkId).delivered++; taskRecord('link-delivered', t, e.linkId, { linkId: e.linkId }); } admit(t);
      } else if (e.kind === 'complete') complete(task(e.taskId), e.attemptId);
      else if (e.kind === 'down') {
        const ns = nodeState(e.nodeId); ns.online = false; const cause = record('node-failed', { nodeId: e.nodeId, detail: 'Configured synthetic outage' });
        for (const id of [...ns.active]) { const t = task(id); t.cause = record('attempt-interrupted', { requestId: t.requestId, nodeId: t.nodeId, taskId: t.id, attemptId: t.attemptId }, [t.cause, cause]); retry(t, 'node-offline'); }
        for (const id of ns.queue) { const t = task(id); request(t.requestId).blocker = { kind: 'node-offline', nodeId: e.nodeId, taskId: id, eventId: cause }; }
      } else if (e.kind === 'up') { nodeState(e.nodeId).online = true; record('node-recovered', { nodeId: e.nodeId, detail: 'Configured synthetic recovery' }); }
      else if (e.kind === 'deadline') {
        const r = request(e.requestId); if (!['completed', 'failed', 'rejected'].includes(r.status)) { r.deadlineMissed = true; record('deadline-missed', { requestId: r.id, detail: `${r.pending} unfinished task(s)` }); }
      }
      drain(); refreshBlockers();
    }
    function blockersFor(r, owned = null, wakeups = null) {
      if (r.status === 'scheduled') return [{ kind: 'scheduled-arrival', time: r.arrival }];
      return (owned || state.tasks.filter(t => t.requestId === r.id && !['completed', 'failed'].includes(t.status))).map(t => {
        const n = definitions.get(t.nodeId), ns = nodeState(t.nodeId), pending = wakeups ? wakeups.get(t.id) : state.pending.find(e => e.taskId === t.id && ['deliver', 'retry'].includes(e.kind));
        const kind = t.status === 'transit' ? 'link-transit' : t.status === 'retry' ? t.retryReason : t.status === 'active' ? 'service' : !ns.online ? 'node-offline' : !clusterAvailable(n) ? 'cluster-concurrency' : 'worker-concurrency';
        return { kind, nodeId: t.nodeId, taskId: t.id, attemptId: t.attemptId, eventId: t.cause, ...(pending ? { wakeAt: pending.time } : {}), ...(t.linkId && t.status === 'transit' ? { linkId: t.linkId } : {}) };
      });
    }
    function refreshBlockers() {
      const owned = new Map(), wakes = new Map();
      for (const t of state.tasks) if (!['completed', 'failed'].includes(t.status)) { if (!owned.has(t.requestId)) owned.set(t.requestId, []); owned.get(t.requestId).push(t); }
      for (const e of state.pending) if (['deliver', 'retry'].includes(e.kind)) wakes.set(e.taskId, e);
      for (const r of state.requests) r.blocker = blockersFor(r, owned.get(r.id) || [], wakes)[0] || null;
    }
    function runUntil(time) {
      if (!Number.isFinite(time) || time < state.time || time > HORIZON) throw Error('Run time must advance within 0–60 seconds');
      while (state.pending.length && state.pending[0].time <= time) {
        if (state.processedEvents >= MAX_EVENTS) throw Error('Synthetic event budget exceeded (20000); reduce workload or fan-out');
        const e = state.pending.shift(); state.time = e.time; state.processedEvents++; process(e);
      }
      state.time = time; state.stopped = time === HORIZON; reconcile(); return snapshot();
    }
    function reconcile() {
      for (const n of state.nodes) {
        const expected = n.held.reduce((sum, id) => sum + memory(task(id)), 0);
        if (Math.abs(n.memoryMiB - expected) > 1e-6 || n.active.some(id => !n.held.includes(id)) || n.queue.some(id => !n.held.includes(id)) || n.held.length !== n.active.length + n.queue.length) throw Error(`Resource ownership does not reconcile at ${n.id}`);
      }
      for (const r of state.requests) if (r.pending !== state.tasks.filter(t => t.requestId === r.id && !['completed', 'failed'].includes(t.status)).length) throw Error(`Pending task count does not reconcile at ${r.id}`);
      return true;
    }
    function snapshot() {
      const arrived = state.requests.filter(r => r.status !== 'scheduled'), completed = arrived.filter(r => r.status === 'completed'), unfinished = arrived.filter(r => !['completed', 'failed', 'rejected'].includes(r.status));
      const nodes = state.nodes.map(n => ({ ...n, activeTaskIds: [...n.active], queuedTaskIds: [...n.queue], active: n.active.length, queued: n.queue.length, type: definitions.get(n.id).type }));
      const latencies = completed.map(r => r.completedAt - r.arrival).sort((a, b) => a - b);
      return clone({ model: MODEL, identity, worldSpecContentHash: spec.contentHash, time: state.time, horizon: HORIZON, requests: state.requests, attempts: state.attempts, effects: state.effects, nodes, links: state.links, events: state.events,
        metrics: { offered: arrived.length, planned: state.requests.length, completed: completed.length, rejected: arrived.filter(r => r.status === 'rejected').length,
          failed: arrived.filter(r => r.status === 'failed').length, unfinished: unfinished.length, deadlineMisses: arrived.filter(r => r.deadlineMissed || (r.completedAt !== null && r.completedAt > r.deadline)).length,
          memoryMiB: nodes.reduce((s, n) => s + n.memoryMiB, 0), peakMemoryMiB: state.peakMemoryMiB, backlog: nodes.reduce((s, n) => s + n.queued, 0),
          attempts: state.attempts.length, effects: state.effects.length, retryCount: state.events.filter(e => e.kind === 'retry-scheduled').length,
          throughput: state.time > 0 ? completed.length / state.time : 0, p95Latency: latencies.length ? latencies[Math.ceil(latencies.length * 0.95) - 1] : null },
        done: state.stopped || !state.pending.some(e => !['deadline', 'down', 'up'].includes(e.kind)), assumptions: [...documentApi.ASSUMPTIONS, ...doc.assumptions.filter(a => !documentApi.ASSUMPTIONS.includes(a))] });
    }
    function inspect(id) {
      const r = request(id); if (!r) return null;
      const history = state.events.filter(e => e.requestId === id || (!e.requestId && state.tasks.some(t => t.requestId === id && t.nodeId === e.nodeId)));
      return clone({ request: r, attempts: state.attempts.filter(a => a.requestId === id), effects: state.effects.filter(e => e.requestId === id), history, blocker: r.blocker, blockers: blockersFor(r) });
    }
    function checkpoint() { reconcile(); return clone({ schema: 'simulatte.systemDiagramCheckpoint.v2', model: MODEL, identity, state }); }
    function restore(value) {
      if (!value || value.schema !== 'simulatte.systemDiagramCheckpoint.v2' || value.model !== MODEL || value.identity !== identity || value.state?.identity !== identity || !Array.isArray(value.state.pending) || !Number.isFinite(value.state.time) || value.state.time < 0 || value.state.time > HORIZON) throw Error('Checkpoint belongs to another model/document or has an invalid time');
      const received = JSON.stringify(canonical(value));
      if (received.length > 8000000) throw Error('Checkpoint exceeds 8 MB validation limit');
      const reference = create(doc); reference.runUntil(value.state.time); const expected = reference.checkpoint();
      if (received !== JSON.stringify(canonical(expected))) throw Error('Checkpoint causal state does not match the seeded document execution');
      state = clone(expected.state); reconcile(); return snapshot();
    }
    function verify() {
      const replay = create(doc); replay.runUntil(state.time); const match = JSON.stringify(replay.checkpoint()) === JSON.stringify(checkpoint());
      return { status: match ? 'match' : 'diverged', events: state.processedEvents, identity, model: MODEL };
    }
    initialize();
    return Object.freeze({ program: () => clone(spec), runUntil, snapshot, inspect, checkpoint, restore, verify, reconcile, reset: () => { initialize(); return snapshot(); } });
  }
  return Object.freeze({ MODEL, HORIZON, MAX_EVENTS, MAX_TASKS, create, program });
});
