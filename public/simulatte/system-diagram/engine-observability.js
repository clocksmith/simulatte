(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulatteSystemDiagramObservability = api;
})(globalThis, function () {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const BYTES_PER_KB = 1000, BYTES_PER_MIB = 1024 * 1024;
  function initialize(s) { s.observability = { sequence: 0, requestCount: 0, requests: {}, attempts: {}, effects: '', effectReceipts: '', latestEffects: {}, backgroundLate: {}, faults: [], jobs: {}, jobHistory: '', allocations: {}, nodeMemory: {}, nodePeak: {}, memoryMiB: 0, peakMemoryMiB: 0, durable: {}, slots: {}, memoryPolicy: {}, garbageSequence: 0, retained: {}, retainedCount: 0, resources: '', latestResource: {} }; return s; }
  function messageOf(value) { return value && (value.msg || value.m || value); }
  function note(R, kind, details = {}) {
    const o = R.s.observability, msg = messageOf(details.message || details.job || R.currentJob), trace = details.requestId || msg?.trace || R.currentTrace || null;
    const r = trace ? o.requests[trace] : null, nodeId = details.nodeId || details.job?.nodeId || R.currentJob?.nodeId || null;
    if (o.sequence >= R.eng.maxRecords) { R.s.error = `Causal record bound ${R.eng.maxRecords} reached; unfinished work is retained`; return { id: r?.lastEvent || null, seq: o.sequence, requestId: trace, nodeId }; }
    const event = { id: `cause-${++o.sequence}`, seq: o.sequence, t: R.s.t, time: R.s.t, kind, requestId: trace, nodeId,
      jobId: details.job?.id || R.currentJob?.id || null, attemptId: details.attemptId || null, detail: details.detail || '', causes: [] };
    if (r?.lastEvent) event.causes.push(r.lastEvent); const resource = o.latestResource[nodeId]; if (resource && !event.causes.includes(resource)) event.causes.push(resource);
    for (const f of o.faults) if (nodeId && f.nodeIds.includes(nodeId) && !event.causes.includes(f.id)) event.causes.push(f.id);
    if (r) { r.history += JSON.stringify(event) + '\n'; r.lastEvent = event.id; }
    if (nodeId && /^(memory-|gc-|resident-memory|retained-)/.test(kind)) { o.resources += JSON.stringify(event) + '\n'; o.latestResource[nodeId] = event.id; }
    return event;
  }
  function begin(R, nodeId, msg) { const o = R.s.observability;
    if (o.requestCount >= R.eng.maxRecords) { R.s.error = `Request record bound ${R.eng.maxRecords} reached; unfinished work is retained`; return; }
    o.requestCount++; o.requests[msg.trace] = { id: msg.trace, sourceId: nodeId, arrival: R.s.t, deadline: msg.deadline, status: 'in-flight', completedAt: null, err: null, payloadType: msg.ptype, input: clone({ ptype: msg.ptype, kb: msg.kb, tokens: msg.tokens, key: msg.key, op: msg.op, deadline: msg.deadline, idem: msg.idem, hops: msg.hops, fields: msg.fields }), latencyMs: null, history: '', lastEvent: null };
    note(R, 'request-arrived', { nodeId, message: msg });
  }
  function end(R, trace, ok, err) { const r = R.s.observability.requests[trace]; if (!r || r.status !== 'in-flight') return;
    r.status = ok ? 'completed' : err === 'timeout' ? 'timed-out' : err === 'rejected' ? 'rejected' : 'failed'; r.completedAt = R.s.t; r.err = err; r.latencyMs = (R.s.t - r.arrival) * 1000;
    note(R, `request-${r.status}`, { nodeId: r.sourceId, requestId: trace, detail: err || '' });
  }
  function allocate(R, key, nodeId, msg, p) { const o = R.s.observability; if (o.allocations[key]) return true;
    const amount = Math.max(0, Number(msg.kb) || 0) * BYTES_PER_KB / BYTES_PER_MIB + (Number(p.memoryPerRequestMiB) || 0), current = o.nodeMemory[nodeId] || 0;
    if (Number.isFinite(p.memoryLimitMiB) && current + amount > p.memoryLimitMiB + 1e-9) { note(R, 'memory-rejected', { nodeId, message: msg, detail: `${amount} MiB allocation exceeds ${p.memoryLimitMiB} MiB admission limit` }); const m = policy(R, nodeId); m.ooms++; if (p.memoryOomPolicy === 'crash' && !m.oomPending) { m.oomPending = true; R.resourceOps.schedule(R.s.t, { k: 'mem', action: 'oom', n: nodeId }); } return false; }
    o.allocations[key] = { key, nodeId, requestId: msg.trace, amount }; o.nodeMemory[nodeId] = current + amount; o.memoryMiB += amount;
    o.nodePeak[nodeId] = Math.max(o.nodePeak[nodeId] || 0, o.nodeMemory[nodeId]); o.peakMemoryMiB = Math.max(o.peakMemoryMiB, o.memoryMiB); memoryChanged(R, nodeId, p); return true;
  }
  function free(R, key, retainGarbage = false) { const o = R.s.observability, item = o.allocations[key]; if (!item) return;
    o.nodeMemory[item.nodeId] -= item.amount; o.memoryMiB -= item.amount; if (Math.abs(o.nodeMemory[item.nodeId]) < 1e-9) o.nodeMemory[item.nodeId] = 0; if (Math.abs(o.memoryMiB) < 1e-9) o.memoryMiB = 0; delete o.allocations[key];
    const p = R.resourceOps.params(item.nodeId), fraction = retainGarbage && !R.resourceOps.down(item.nodeId) ? p.memoryGarbageFraction || 0 : 0;
    if (fraction > 0) { const amount = item.amount * fraction, garbageKey = `garbage:${item.nodeId}:${++o.garbageSequence}`; o.allocations[garbageKey] = { ...item, key: garbageKey, amount, garbage: true }; o.nodeMemory[item.nodeId] += amount; o.memoryMiB += amount; } memoryChanged(R, item.nodeId, p);
  }
  function jobCreated(R, rec, p) { const o = R.s.observability; o.jobs[rec.id] = { id: rec.id, nodeId: rec.nodeId, requestId: rec.msg.trace, born: R.s.t, finishedAt: null, status: 'active', msg: clone(rec.msg) };
    rec.memoryRejected = !allocate(R, `job:${rec.id}`, rec.nodeId, rec.msg, p); note(R, 'job-created', { nodeId: rec.nodeId, job: rec });
  }
  function jobFinished(R, rec, ok, err) { const logical = R.s.observability.requests[rec.msg.trace]; if (logical && rec.nodeId !== logical.sourceId && rec.msg.deadline !== null && R.s.t > rec.msg.deadline) R.s.observability.backgroundLate[rec.msg.trace] = true; const saved = R.s.observability.jobs[rec.id]; if (saved) { saved.status = ok ? 'completed' : 'failed'; saved.finishedAt = R.s.t; saved.err = err; }
    if (saved) { R.s.observability.jobHistory += JSON.stringify(saved) + '\n'; delete R.s.observability.jobs[rec.id]; }
    const async = R.s.observability.attempts[`async:${rec.msg.id}`]; if (async) { async.status = ok ? 'completed' : 'failed'; async.finishedAt = R.s.t; async.err = err; }
    note(R, ok ? 'job-completed' : 'job-failed', { nodeId: rec.nodeId, job: rec, detail: err || '' }); free(R, `job:${rec.id}`, true);
  }
  function attempt(R, call, msg, edgeId, number, async = false) { const o = R.s.observability, id = call ? `${call.id}:${number}` : `async:${msg.id}`;
    o.attempts[id] = { id, callId: call?.id || null, requestId: msg.trace, nodeId: R.x.edges.get(edgeId).to, callerNodeId: R.x.edges.get(edgeId).from, edgeId, number, startedAt: R.s.t, finishedAt: null, status: 'in-flight', err: null, async };
    note(R, 'call-attempt', { nodeId: R.x.edges.get(edgeId).from, message: msg, attemptId: id, detail: `${edgeId} try ${number}` });
  }
  function attemptEnded(R, callId, number, ok, err, message) { const a = R.s.observability.attempts[`${callId}:${number}`]; if (!a || a.status !== 'in-flight') return;
    a.status = ok ? 'completed' : 'failed'; a.err = err; a.finishedAt = R.s.t; note(R, ok ? 'call-completed' : 'call-failed', { nodeId: a.callerNodeId, requestId: a.requestId, message, attemptId: a.id, detail: err || '' });
  }
  function effect(R, nodeId, key, result) {
    const o = R.s.observability, attemptId = R.currentJob?.from ? `${R.currentJob.from.callId}:${R.currentJob.from.attempt}` : null;
    const identity = JSON.stringify([nodeId, key]), original = o.latestEffects[identity];
    const event = note(R, result.suppressed ? 'effect-suppressed' : 'effect-committed', { nodeId, detail: key, attemptId });
    if (result.suppressed) {
      // A suppression receipt identifies the existing local effect, but confirms it only when this exact RPC acknowledgement arrives.
      if (original && attemptId) o.effectReceipts += JSON.stringify({ effectId: original, attemptId, eventId: event.id }) + '\n';
    } else {
      const id = `effect-${event.seq}`; o.latestEffects[identity] = id;
      o.effects += JSON.stringify({ id, requestId: event.requestId, nodeId, key, t: R.s.t, time: R.s.t, eventId: event.id, duplicate: result.duplicate, attemptId }) + '\n';
    }
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
  function policy(R, id) { return R.s.observability.memoryPolicy[id] ||= { factor: 1, gcUntil: null, gcGeneration: 0, lastGcAt: null, gcs: 0, ooms: 0, oomPending: false, pressureTransitions: 0, reviewAt: null }; }
  function memoryFactor(R, id) { const m = R.s.observability.memoryPolicy[id]; return m?.gcUntil !== null && m?.gcUntil !== undefined && R.s.t < m.gcUntil ? Infinity : m?.factor || 1; }
  function memoryChanged(R, id, p) {
    const m = policy(R, id), used = R.s.observability.nodeMemory[id] || 0, ratio = p.memoryLimitMiB > 0 ? used / p.memoryLimitMiB : 0;
    const threshold = p.memoryPressureThreshold, thrash = p.memoryThrashFactor;
    const factor = Number.isFinite(threshold) && Number.isFinite(thrash) && ratio >= threshold ? 1 + (thrash - 1) * (threshold === 1 ? 1 : Math.min(1, (ratio - threshold) / (1 - threshold))) : 1;
    if (Math.abs(factor - m.factor) > 1e-9) { m.factor = factor; m.pressureTransitions++; note(R, 'memory-pressure', { nodeId: id, detail: `${used} MiB; service slowdown ${factor}` }); R.resourceOps.schedule(R.s.t, { k: 'mem', action: 'changed', n: id }); }
    const garbage = Object.values(R.s.observability.allocations).some(a => a.nodeId === id && a.garbage);
    if (p.memoryGcPauseMs > 0 && garbage && ratio >= threshold && m.gcUntil === null && m.lastGcAt !== null && R.s.t - m.lastGcAt < p.memoryGcCooldownMs / 1000 && m.reviewAt === null) { m.reviewAt = m.lastGcAt + p.memoryGcCooldownMs / 1000; R.resourceOps.schedule(m.reviewAt, { k: 'mem', action: 'review', n: id, g: m.gcGeneration }); }
    if (p.memoryGcPauseMs > 0 && garbage && ratio >= threshold && m.gcUntil === null && (m.lastGcAt === null || R.s.t - m.lastGcAt >= p.memoryGcCooldownMs / 1000)) {
      m.gcUntil = R.s.t + p.memoryGcPauseMs / 1000; m.lastGcAt = R.s.t; m.gcGeneration++; m.gcs++;
      note(R, 'gc-started', { nodeId: id, detail: `Pause until ${m.gcUntil}; only modeled garbage allocations are reclaimable` });
      R.resourceOps.schedule(R.s.t, { k: 'mem', action: 'changed', n: id }); R.resourceOps.schedule(m.gcUntil, { k: 'mem', action: 'gc', n: id, g: m.gcGeneration });
    }
  }
  function memoryEvent(R, event) {
    const m = policy(R, event.n);
    if (event.action === 'review' && event.g === m.gcGeneration) { m.reviewAt = null; memoryChanged(R, event.n, R.resourceOps.params(event.n)); }
    if (event.action === 'gc' && event.g === m.gcGeneration) { m.gcUntil = null; const o = R.s.observability; let reclaimed = 0;
      for (const [key, a] of Object.entries(o.allocations)) if (a.nodeId === event.n && a.garbage) { reclaimed += a.amount; o.nodeMemory[event.n] -= a.amount; o.memoryMiB -= a.amount; delete o.allocations[key]; }
      note(R, 'gc-completed', { nodeId: event.n, detail: `${reclaimed} MiB reclaimed` }); memoryChanged(R, event.n, R.resourceOps.params(event.n));
    }
  }
  function crashMemory(R, id) { const o = R.s.observability, m = policy(R, id); m.gcUntil = null; m.gcGeneration++; m.oomPending = false; m.reviewAt = null;
    for (const [key, a] of Object.entries(o.allocations)) if (a.nodeId === id && a.garbage) { o.nodeMemory[id] -= a.amount; o.memoryMiB -= a.amount; delete o.allocations[key]; } memoryChanged(R, id, R.resourceOps.params(id)); }
  function resizeMemory(R, rec, residentMiB) { if (!Number.isFinite(residentMiB) || residentMiB < 0) throw Error('Resident payload memory must be finite MiB >= 0'); const o = R.s.observability, key = `job:${rec.id}`, old = o.allocations[key]; if (!old) return false;
    const p = R.resourceOps.params(rec.nodeId), next = residentMiB + (p.memoryPerRequestMiB || 0), delta = next - old.amount;
    if (Number.isFinite(p.memoryLimitMiB) && (o.nodeMemory[rec.nodeId] || 0) + delta > p.memoryLimitMiB + 1e-9) { note(R, 'memory-rejected', { nodeId: rec.nodeId, job: rec, detail: `Resident payload resize to ${residentMiB} MiB exceeds admission budget` }); const m = policy(R, rec.nodeId); m.ooms++; if (p.memoryOomPolicy === 'crash' && !m.oomPending) { m.oomPending = true; R.resourceOps.schedule(R.s.t, { k: 'mem', action: 'oom', n: rec.nodeId }); } return false; }
    old.amount = next; o.nodeMemory[rec.nodeId] += delta; o.memoryMiB += delta; o.nodePeak[rec.nodeId] = Math.max(o.nodePeak[rec.nodeId] || 0, o.nodeMemory[rec.nodeId]); o.peakMemoryMiB = Math.max(o.peakMemoryMiB, o.memoryMiB);
    note(R, 'resident-memory-resized', { nodeId: rec.nodeId, job: rec, detail: `${residentMiB} MiB resident payload; ${p.memoryPerRequestMiB || 0} MiB base allocation` }); memoryChanged(R, rec.nodeId, p); return true;
  }
  function retain(R, nodeId, key, msg, details = {}) {
    if (typeof key !== 'string' || !key || key.length > 128 || !msg || typeof msg.trace !== 'string' || !Number.isFinite(msg.kb) || msg.kb < 0 || typeof details.kind !== 'string' || typeof details.detail !== 'string') throw Error('Retained payload requires a bounded key, message and kind/detail strings');
    const o = R.s.observability, records = o.retained[nodeId] ||= {}; if (records[key] || o.retainedCount >= R.eng.maxInFlight) return false;
    const allocation = `retained:${nodeId}:${key}`; if (!allocate(R, allocation, nodeId, msg, R.resourceOps.params(nodeId))) return false;
    const event = note(R, 'retained-payload', { nodeId, message: msg, detail: details.detail }); records[key] = { key, msg: clone(msg), kind: details.kind, detail: details.detail, eventId: event.id }; o.retainedCount++; return true;
  }
  function releaseRetained(R, nodeId, key) { const o = R.s.observability, record = o.retained[nodeId]?.[key]; if (!record) return false;
    if (record.msg.deadline !== null && R.s.t > record.msg.deadline) o.backgroundLate[record.msg.trace] = true;
    note(R, 'retained-payload-released', { nodeId, message: record.msg, detail: record.detail }); free(R, `retained:${nodeId}:${key}`, true); delete o.retained[nodeId][key]; o.retainedCount--; return true;
  }
  function group(R, nodeId) { const id = R.x.nodes.get(nodeId).groupId; return id ? R.x.groups.get(id) : null; }
  function slotsUsed(R, g) { return g.nodeIds.reduce((sum, id) => sum + (R.s.st[id]?.busy.length || 0) + Object.keys(R.s.observability.slots[id] || {}).length, 0); }
  function available(R, id) { const g = group(R, id); return !g || g.kind !== 'resource' || slotsUsed(R, g) < g.capacity; }
  function acquire(R, id, key) { const o = R.s.observability; if (o.slots[id]?.[key]) return true; if (!available(R, id)) return false; (o.slots[id] ||= {})[key] = true; return true; }
  function releaseSlot(R, id, key) { const slots = R.s.observability.slots[id]; if (slots) delete slots[key]; }
  function clearSlots(R, id) { R.s.observability.slots[id] = {}; }
  function tape(text) { return text ? text.trimEnd().split('\n').map(row => JSON.parse(row)) : []; }
  function effectsView(s) {
    const o = s.observability, confirmed = new Map();
    for (const receipt of tape(o.effectReceipts)) if (o.attempts[receipt.attemptId]?.status === 'completed') confirmed.set(receipt.effectId, receipt);
    return tape(o.effects).map(e => {
      const a = e.attemptId ? o.attempts[e.attemptId] : null, receipt = confirmed.get(e.id);
      const acknowledgement = !e.attemptId ? 'one-way' : a?.status === 'completed' || receipt ? 'received' : a?.status === 'failed' ? 'unknown' : 'pending';
      return { ...e, acknowledgement, confirmationEvidence: receipt ? { kind: 'idempotent-retry', ...receipt } : null, claim: 'Modeled local commit; acknowledgement does not prove production durability' };
    });
  }
  function backgroundDeadlines(s) {
    const o = s.observability, late = new Set(Object.keys(o.backgroundLate));
    function check(nodeId, msg) { const r = o.requests[msg.trace]; if (r && nodeId !== r.sourceId && msg.deadline !== null && s.t > msg.deadline) late.add(msg.trace); }
    for (const job of Object.values(s.jobs)) check(job.nodeId, job.msg);
    for (const [nodeId, records] of Object.entries(o.durable)) for (const record of Object.values(records)) check(nodeId, record.msg);
    for (const [nodeId, records] of Object.entries(o.retained)) for (const record of Object.values(records)) check(nodeId, record.msg);
    return new Set([...late].filter(id => o.requests[id]?.status === 'completed'));
  }
  function inspectState(s, id) {
    const o = s.observability, r = o.requests[id]; if (!r) return null;
    const blockers = [];
    for (const rec of Object.values(s.jobs)) if (rec.msg.trace === id) blockers.push({ kind: rec.phase, nodeId: rec.nodeId, jobId: rec.id, eventId: r.lastEvent });
    for (const [nodeId, rows] of Object.entries(o.durable)) for (const row of Object.values(rows)) if (row.msg.trace === id) blockers.push({ kind: row.status, nodeId, delivery: row.delivery, eventId: r.lastEvent });
    for (const [nodeId, records] of Object.entries(o.retained)) for (const record of Object.values(records)) if (record.msg.trace === id) blockers.push({ kind: record.kind, nodeId, key: record.key, eventId: record.eventId, detail: record.detail });
    const attempts = Object.values(o.attempts).filter(a => a.requestId === id), effects = effectsView(s).filter(e => e.requestId === id), allocations = Object.values(o.allocations).filter(a => a.requestId === id);
    const request = { ...r, backgroundDeadlineMissed: backgroundDeadlines(s).has(id), history: undefined, blocker: blockers[0] || null, blockers, attempts: attempts.length, effects: effects.length, backgroundPending: r.status === 'in-flight' ? 0 : blockers.length,
      retainedMiB: allocations.reduce((sum, a) => sum + a.amount, 0), deadlineMissed: r.deadline !== null && (r.completedAt === null ? s.t : r.completedAt) > r.deadline };
    delete request.history; const history = tape(r.history), resources = [...o.faults, ...tape(o.resources)], needed = new Set(history.flatMap(e => e.causes)); const byId = new Map([...resources, ...Object.values(o.requests).flatMap(row => tape(row.history))].map(e => [e.id, e])); function causes(id) { for (const cause of byId.get(id)?.causes || []) if (!needed.has(cause)) { needed.add(cause); causes(cause); } } [...needed].forEach(causes);
    return clone({ request, blocker: request.blocker, blockers, attempts, effects, jobs: [...tape(o.jobHistory).filter(j => j.requestId === id), ...Object.values(o.jobs).filter(j => j.requestId === id)], history: [...new Map([...needed].map(id => byId.get(id)).filter(Boolean).concat(history).map(e => [e.id, e])).values()].sort((a, b) => a.seq - b.seq) });
  }
  function view(s) { const o = s.observability, byId = new Map(), backgroundLate = backgroundDeadlines(s);
    for (const r of Object.values(o.requests)) byId.set(r.id, { ...r, backgroundDeadlineMissed: backgroundLate.has(r.id), input: clone(r.input), history: undefined, blocker: null, blockers: [], attempts: 0, effects: 0, backgroundPending: 0, retainedMiB: 0 });
    for (const a of Object.values(o.attempts)) if (byId.has(a.requestId)) byId.get(a.requestId).attempts++;
    for (const e of tape(o.effects)) if (byId.has(e.requestId)) byId.get(e.requestId).effects++;
    for (const job of Object.values(s.jobs)) { const r = byId.get(job.msg.trace); if (r) r.blockers.push({ kind: job.phase, nodeId: job.nodeId, jobId: job.id, eventId: r.lastEvent }); }
    for (const [nodeId, rows] of Object.entries(o.durable)) for (const row of Object.values(rows)) { const r = byId.get(row.msg.trace); if (r) r.blockers.push({ kind: row.status, nodeId, delivery: row.delivery, eventId: r.lastEvent }); }
    for (const [nodeId, records] of Object.entries(o.retained)) for (const record of Object.values(records)) { const r = byId.get(record.msg.trace); if (r) r.blockers.push({ kind: record.kind, nodeId, key: record.key, eventId: record.eventId, detail: record.detail }); }
    for (const a of Object.values(o.allocations)) if (byId.has(a.requestId)) byId.get(a.requestId).retainedMiB += a.amount;
    for (const r of byId.values()) { delete r.history; r.blocker = r.blockers[0] || null; r.backgroundPending = r.status === 'in-flight' ? 0 : r.blockers.length; r.deadlineMissed = r.deadline !== null && (r.completedAt === null ? s.t : r.completedAt) > r.deadline; }
    return { backgroundDeadlineMisses: backgroundLate.size, requests: [...byId.values()], attempts: clone(Object.values(o.attempts)), effects: effectsView(s), unknownEffects: effectsView(s).filter(e => e.acknowledgement === 'unknown').length, memoryMiB: o.memoryMiB, peakMemoryMiB: o.peakMemoryMiB };
  }
  function reconcile(s) { const o = s.observability, total = Object.values(o.allocations).reduce((sum, a) => sum + a.amount, 0); if (Math.abs(total - o.memoryMiB) > 1e-6) throw Error('Global memory allocation ledger does not reconcile');
    for (const [nodeId, amount] of Object.entries(o.nodeMemory)) if (Math.abs(Object.values(o.allocations).filter(a => a.nodeId === nodeId).reduce((sum, a) => sum + a.amount, 0) - amount) > 1e-6) throw Error(`Memory allocation ledger does not reconcile at ${nodeId}`); return true; }
  return Object.freeze({ initialize, retain, releaseRetained, memoryChanged, memoryFactor, memoryEvent, crashMemory, resizeMemory, note, begin, end, jobCreated, jobFinished, attempt, attemptEnded, effect, fault, syncKernel, available, acquire, releaseSlot, clearSlots, group, inspectState, view, reconcile });
});
