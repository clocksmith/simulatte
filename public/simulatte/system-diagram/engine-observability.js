(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulatteSystemDiagramObservability = api;
})(globalThis, function () {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  function initialize(s) { s.observability = { sequence: 0, requestCount: 0, requests: {}, attempts: {}, effects: '', faults: [], jobs: {}, jobHistory: '', allocations: {}, nodeMemory: {}, nodePeak: {}, memoryMiB: 0, peakMemoryMiB: 0, durable: {}, slots: {} }; return s; }
  function messageOf(value) { return value && (value.msg || value.m || value); }
  function note(R, kind, details = {}) {
    const o = R.s.observability, msg = messageOf(details.message || details.job || R.currentJob), trace = details.requestId || msg?.trace || R.currentTrace || null;
    const r = trace ? o.requests[trace] : null, nodeId = details.nodeId || details.job?.nodeId || R.currentJob?.nodeId || null;
    if (o.sequence >= R.eng.maxRecords) { R.s.error = `Causal record bound ${R.eng.maxRecords} reached; unfinished work is retained`; return { id: r?.lastEvent || null, seq: o.sequence, requestId: trace, nodeId }; }
    const event = { id: `cause-${++o.sequence}`, seq: o.sequence, t: R.s.t, time: R.s.t, kind, requestId: trace, nodeId,
      jobId: details.job?.id || R.currentJob?.id || null, attemptId: details.attemptId || null, detail: details.detail || '', causes: [] };
    if (r?.lastEvent) event.causes.push(r.lastEvent);
    for (const f of o.faults) if (nodeId && f.nodeIds.includes(nodeId) && !event.causes.includes(f.id)) event.causes.push(f.id);
    if (r) { r.history += JSON.stringify(event) + '\n'; r.lastEvent = event.id; }
    return event;
  }
  function begin(R, nodeId, msg) { const o = R.s.observability;
    if (o.requestCount >= R.eng.maxRecords) { R.s.error = `Request record bound ${R.eng.maxRecords} reached; unfinished work is retained`; return; }
    o.requestCount++; o.requests[msg.trace] = { id: msg.trace, sourceId: nodeId, arrival: R.s.t, deadline: msg.deadline, status: 'in-flight', completedAt: null, err: null, payloadType: msg.ptype, latencyMs: null, history: '', lastEvent: null };
    note(R, 'request-arrived', { nodeId, message: msg });
  }
  function end(R, trace, ok, err) { const r = R.s.observability.requests[trace]; if (!r || r.status !== 'in-flight') return;
    r.status = ok ? 'completed' : err === 'timeout' ? 'timed-out' : err === 'rejected' ? 'rejected' : 'failed'; r.completedAt = R.s.t; r.err = err; r.latencyMs = (R.s.t - r.arrival) * 1000;
    note(R, `request-${r.status}`, { nodeId: r.sourceId, requestId: trace, detail: err || '' });
  }
  function allocate(R, key, nodeId, msg, p) { const o = R.s.observability; if (o.allocations[key]) return true;
    const amount = Math.max(0, Number(msg.kb) || 0) / 1024 + (Number(p.memoryPerRequestMiB) || 0), current = o.nodeMemory[nodeId] || 0;
    if (Number.isFinite(p.memoryLimitMiB) && current + amount > p.memoryLimitMiB + 1e-9) { note(R, 'memory-rejected', { nodeId, message: msg, detail: `${amount} MiB allocation exceeds ${p.memoryLimitMiB} MiB admission limit` }); return false; }
    o.allocations[key] = { key, nodeId, requestId: msg.trace, amount }; o.nodeMemory[nodeId] = current + amount; o.memoryMiB += amount;
    o.nodePeak[nodeId] = Math.max(o.nodePeak[nodeId] || 0, o.nodeMemory[nodeId]); o.peakMemoryMiB = Math.max(o.peakMemoryMiB, o.memoryMiB); return true;
  }
  function free(R, key) { const o = R.s.observability, item = o.allocations[key]; if (!item) return;
    o.nodeMemory[item.nodeId] -= item.amount; o.memoryMiB -= item.amount; if (Math.abs(o.nodeMemory[item.nodeId]) < 1e-9) o.nodeMemory[item.nodeId] = 0; if (Math.abs(o.memoryMiB) < 1e-9) o.memoryMiB = 0; delete o.allocations[key];
  }
  function jobCreated(R, rec, p) { const o = R.s.observability; o.jobs[rec.id] = { id: rec.id, nodeId: rec.nodeId, requestId: rec.msg.trace, born: R.s.t, finishedAt: null, status: 'active', msg: clone(rec.msg) };
    rec.memoryRejected = !allocate(R, `job:${rec.id}`, rec.nodeId, rec.msg, p); note(R, 'job-created', { nodeId: rec.nodeId, job: rec });
  }
  function jobFinished(R, rec, ok, err) { const saved = R.s.observability.jobs[rec.id]; if (saved) { saved.status = ok ? 'completed' : 'failed'; saved.finishedAt = R.s.t; saved.err = err; }
    if (saved) { R.s.observability.jobHistory += JSON.stringify(saved) + '\n'; delete R.s.observability.jobs[rec.id]; }
    const async = R.s.observability.attempts[`async:${rec.msg.id}`]; if (async) { async.status = ok ? 'completed' : 'failed'; async.finishedAt = R.s.t; async.err = err; }
    note(R, ok ? 'job-completed' : 'job-failed', { nodeId: rec.nodeId, job: rec, detail: err || '' }); free(R, `job:${rec.id}`);
  }
  function attempt(R, call, msg, edgeId, number, async = false) { const o = R.s.observability, id = call ? `${call.id}:${number}` : `async:${msg.id}`;
    o.attempts[id] = { id, callId: call?.id || null, requestId: msg.trace, nodeId: R.x.edges.get(edgeId).to, callerNodeId: R.x.edges.get(edgeId).from, edgeId, number, startedAt: R.s.t, finishedAt: null, status: 'in-flight', err: null, async };
    note(R, 'call-attempt', { nodeId: R.x.edges.get(edgeId).from, message: msg, attemptId: id, detail: `${edgeId} try ${number}` });
  }
  function attemptEnded(R, callId, number, ok, err, message) { const a = R.s.observability.attempts[`${callId}:${number}`]; if (!a || a.status !== 'in-flight') return;
    a.status = ok ? 'completed' : 'failed'; a.err = err; a.finishedAt = R.s.t; note(R, ok ? 'call-completed' : 'call-failed', { nodeId: a.callerNodeId, requestId: a.requestId, message, attemptId: a.id, detail: err || '' });
  }
  function effect(R, nodeId, key, result) { const event = note(R, result.suppressed ? 'effect-suppressed' : 'effect-committed', { nodeId, detail: key });
    if (!result.suppressed) R.s.observability.effects += JSON.stringify({ id: `effect-${event.seq}`, requestId: event.requestId, nodeId, key, t: R.s.t, time: R.s.t, eventId: event.id, duplicate: result.duplicate }) + '\n';
  }
  function fault(R, f, active) { const nodeIds = f.target.kind === 'node' ? [f.target.id] : f.target.kind === 'group' ? R.x.groups.get(f.target.id).nodeIds : [];
    const e = note(R, active ? 'fault-applied' : 'fault-cleared', { detail: `${f.type} ${f.target.kind}:${f.target.id}` }); R.s.observability.faults.push({ ...e, nodeIds });
  }
  function syncKernel(R, id, p) { if (R.readonly) return; const kernel = R.x.nodes.get(id).kernel, k = R.s.kernel[id], o = R.s.observability; if (!k || !['queue', 'deadLetter'].includes(kernel)) return;
    const rows = kernel === 'queue' ? Object.entries(k.msgs).map(([key, row]) => ({ key: `queue:${id}:${key}`, msg: row.m, status: row.st, delivery: row.d })) : k.kept.map(row => ({ key: `dead:${id}:${row.id}`, msg: row.m, status: 'dead-letter', delivery: row.m.delivery }));
    const present = new Set(rows.map(row => row.key)), previous = o.durable[id] || {};
    for (const [key, value] of Object.entries(previous)) if (!present.has(key)) { note(R, 'retained-message-released', { nodeId: id, message: value.msg, detail: value.status }); free(R, key); }
    const next = {};
    for (const row of rows) { const old = previous[row.key]; if (!old || old.status !== row.status || old.delivery !== row.delivery) note(R, row.status === 'dead-letter' ? 'dead-letter-retained' : 'queue-state', { nodeId: id, message: row.msg, detail: `${row.status}; delivery ${row.delivery}` });
      if (!o.allocations[row.key] && !allocate(R, row.key, id, row.msg, p)) { allocate(R, row.key, id, row.msg, { ...p, memoryLimitMiB: undefined }); R.s.error = `Durable memory limit exceeded at ${id}; retained messages remain accounted`; } next[row.key] = row;
    } o.durable[id] = next;
  }
  function group(R, nodeId) { const id = R.x.nodes.get(nodeId).groupId; return id ? R.x.groups.get(id) : null; }
  function slotsUsed(R, g) { return g.nodeIds.reduce((sum, id) => sum + (R.s.st[id]?.busy.length || 0) + Object.keys(R.s.observability.slots[id] || {}).length, 0); }
  function available(R, id) { const g = group(R, id); return !g || g.kind !== 'resource' || slotsUsed(R, g) < g.capacity; }
  function acquire(R, id, key) { const o = R.s.observability; if (o.slots[id]?.[key]) return true; if (!available(R, id)) return false; (o.slots[id] ||= {})[key] = true; return true; }
  function releaseSlot(R, id, key) { const slots = R.s.observability.slots[id]; if (slots) delete slots[key]; }
  function clearSlots(R, id) { R.s.observability.slots[id] = {}; }
  function tape(text) { return text ? text.trimEnd().split('\n').map(row => JSON.parse(row)) : []; }
  function inspectState(s, id) {
    const o = s.observability, r = o.requests[id]; if (!r) return null;
    const blockers = [];
    for (const rec of Object.values(s.jobs)) if (rec.msg.trace === id) blockers.push({ kind: rec.phase, nodeId: rec.nodeId, jobId: rec.id, eventId: r.lastEvent });
    for (const [nodeId, rows] of Object.entries(o.durable)) for (const row of Object.values(rows)) if (row.msg.trace === id) blockers.push({ kind: row.status, nodeId, delivery: row.delivery, eventId: r.lastEvent });
    const attempts = Object.values(o.attempts).filter(a => a.requestId === id), effects = tape(o.effects).filter(e => e.requestId === id), allocations = Object.values(o.allocations).filter(a => a.requestId === id);
    const request = { ...r, history: undefined, blocker: blockers[0] || null, blockers, attempts: attempts.length, effects: effects.length, backgroundPending: r.status === 'in-flight' ? 0 : blockers.length,
      retainedMiB: allocations.reduce((sum, a) => sum + a.amount, 0), deadlineMissed: r.deadline !== null && (r.completedAt === null ? s.t : r.completedAt) > r.deadline };
    delete request.history; const history = tape(r.history), needed = new Set(history.flatMap(e => e.causes));
    return clone({ request, blocker: request.blocker, blockers, attempts, effects, jobs: [...tape(o.jobHistory).filter(j => j.requestId === id), ...Object.values(o.jobs).filter(j => j.requestId === id)], history: [...o.faults.filter(f => needed.has(f.id)), ...history].sort((a, b) => a.seq - b.seq) });
  }
  function view(s) { const o = s.observability, byId = new Map();
    for (const r of Object.values(o.requests)) byId.set(r.id, { ...r, history: undefined, blocker: null, blockers: [], attempts: 0, effects: 0, backgroundPending: 0, retainedMiB: 0 });
    for (const a of Object.values(o.attempts)) if (byId.has(a.requestId)) byId.get(a.requestId).attempts++;
    for (const e of tape(o.effects)) if (byId.has(e.requestId)) byId.get(e.requestId).effects++;
    for (const job of Object.values(s.jobs)) { const r = byId.get(job.msg.trace); if (r) r.blockers.push({ kind: job.phase, nodeId: job.nodeId, jobId: job.id, eventId: r.lastEvent }); }
    for (const [nodeId, rows] of Object.entries(o.durable)) for (const row of Object.values(rows)) { const r = byId.get(row.msg.trace); if (r) r.blockers.push({ kind: row.status, nodeId, delivery: row.delivery, eventId: r.lastEvent }); }
    for (const a of Object.values(o.allocations)) if (byId.has(a.requestId)) byId.get(a.requestId).retainedMiB += a.amount;
    for (const r of byId.values()) { delete r.history; r.blocker = r.blockers[0] || null; r.backgroundPending = r.status === 'in-flight' ? 0 : r.blockers.length; r.deadlineMissed = r.deadline !== null && (r.completedAt === null ? s.t : r.completedAt) > r.deadline; }
    return { requests: [...byId.values()], attempts: clone(Object.values(o.attempts)), effects: tape(o.effects), memoryMiB: o.memoryMiB, peakMemoryMiB: o.peakMemoryMiB };
  }
  function reconcile(s) { const o = s.observability, total = Object.values(o.allocations).reduce((sum, a) => sum + a.amount, 0); if (Math.abs(total - o.memoryMiB) > 1e-6) throw Error('Global memory allocation ledger does not reconcile');
    for (const [nodeId, amount] of Object.entries(o.nodeMemory)) if (Math.abs(Object.values(o.allocations).filter(a => a.nodeId === nodeId).reduce((sum, a) => sum + a.amount, 0) - amount) > 1e-6) throw Error(`Memory allocation ledger does not reconcile at ${nodeId}`); return true; }
  return Object.freeze({ initialize, note, begin, end, jobCreated, jobFinished, attempt, attemptEnded, effect, fault, syncKernel, available, acquire, releaseSlot, clearSlots, group, inspectState, view, reconcile });
});
