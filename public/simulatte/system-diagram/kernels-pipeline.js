(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const registry = node ? require('./kernel-registry.js') : root.SimulatteSystemDiagramKernels;
  factory(registry);
  if (node) module.exports = registry;
})(globalThis, function (registry) {
  'use strict';
  const MS = 1000, KB_PER_MIB = 1024, MAX_LINEAGE = 64;
  const STATION = Object.freeze({ concurrency: 'concurrency', queueCapacity: 'queueCapacity' });
  const EVENT_KEYS = Object.freeze(['id', 'schemaVersion', 'eventTimeSec', 'entityId', 'sequence', 'valid', 'approved', 'side', 'amount', 'lineage']);
  const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
  const clone = value => JSON.parse(JSON.stringify(value));
  function register(kernel) {
    const onFault = kernel.onFault;
    kernel.onFault = (ctx, fault, active) => { if (fault.type === 'crash' && active) ctx.k.routes = {}; if (onFault) onFault(ctx, fault, active); };
    registry.register(kernel);
  }
  const has = (map, key) => Object.hasOwn(map, key);
  const own = (map, key) => has(map, key) ? map[key] : null;
  function eventOf(msg) {
    const e = msg.fields?.event;
    if (!e || typeof e !== 'object' || Array.isArray(e) || Object.keys(e).length !== EVENT_KEYS.length || EVENT_KEYS.some(k => !has(e, k))) return { error: 'Malformed event record' };
    if (typeof e.entityId !== 'string' || e.entityId.length > 120 || ![e.id, e.entityId].every(v => typeof v === 'string' && ID.test(v)) || !Number.isInteger(e.schemaVersion) || e.schemaVersion < 1 || e.schemaVersion > 1000 || !Number.isInteger(e.sequence) || e.sequence < 1 || !Number.isFinite(e.eventTimeSec) || !Number.isFinite(e.amount) || typeof e.valid !== 'boolean' || typeof e.approved !== 'boolean' || !['none', 'left', 'right'].includes(e.side)) return { error: 'Invalid event identity, schema, ordering or scalar fields' };
    if (!Array.isArray(e.lineage) || e.lineage.length >= MAX_LINEAGE || e.lineage.some(id => typeof id !== 'string' || !id || id.length > 64)) return { error: 'Event lineage exceeds its bounded contract' };
    return { event: clone(e) };
  }
  function append(ctx, e) { return { ...e, lineage: [...e.lineage, ctx.nodeId] }; }
  function finish(ctx, job) {
    const route = ctx.k.routes[job.id];
    delete ctx.k.routes[job.id];
    ctx.reply(job, { ok: !route.error, ...(route.error ? { err: route.error } : {}), ptype: 'event', kb: ctx.p.responseKb, fields: route.fields });
  }
  function next(ctx, job) {
    const route = ctx.k.routes[job.id];
    while (route.index < route.edges.length) {
      const edgeId = route.edges[route.index++];
      const result = ctx.call(job, edgeId, { ptype: 'event', idem: route.fields.pipelineIdempotencyKey || route.fields.event?.id || job.msg.idem, fields: route.fields }, { timeoutMs: ctx.p.callTimeoutMs, retries: ctx.p.retries, backoffMs: ctx.p.retryBackoffMs, slot: 'pipeline' });
      if (result !== null) return;
    }
    finish(ctx, job);
  }
  function route(ctx, job, port, e, error = null, extra = {}) {
    ctx.release(job);
    (ctx.k.routes ||= {})[job.id] = { edges: ctx.edges(port).map(edge => edge.id), index: 0, error, fields: { ...job.msg.fields, ...extra, event: e } };
    next(ctx, job);
  }
  function onResult(ctx, job, slot, result) {
    if (slot !== 'pipeline' || !own(ctx.k.routes || {}, job.id)) return;
    if (!result.ok) { ctx.k.routes[job.id].error ||= result.err || 'error'; finish(ctx, job); } else next(ctx, job);
  }
  function input(ctx, job) {
    const record = eventOf(job.msg);
    if (record.error) { ctx.count('malformed events'); ctx.log('event-invalid', record.error); route(ctx, job, 'quarantine', null, 'invalid', { pipelineReason: record.error }); return null; }
    return append(ctx, record.event);
  }
  function service(ctx, job) { if (ctx.p.errorRate > 0 && ctx.rand() < ctx.p.errorRate) { ctx.reply(job, { ok: false, err: 'error' }); return false; } return ctx.admit(job); }
  function limit(ctx, size) { if (size < ctx.p.maxRecords) return false; ctx.count('state capacity rejections'); return true; }

  register({ id: 'eventSource', station: null,
    init: () => ({ generated: 0, completed: 0, failed: 0, outstanding: 0, generation: 0, previous: null, emitted: [] }),
    start(ctx) { ctx.wake(ctx.p.startSec, { kind: 'emit', generation: ctx.k.generation }); },
    onWake(ctx, wake) {
      const k = ctx.k, p = ctx.p;
      if (wake.kind !== 'emit' || wake.generation !== k.generation || ctx.fault.down || k.generated >= p.count) return;
      if (k.outstanding >= p.maxOutstanding) { ctx.wake(p.intervalMs / MS, wake); return; }
      const i = k.generated, pair = Math.floor(i / 2) + 1, side = p.paired ? (i % 2 ? 'right' : 'left') : 'none';
      const seq = p.paired ? 1 : Math.floor(i / p.entities) + 1;
      let e = { id: `${ctx.nodeId}:event-${i + 1}`, schemaVersion: p.evolveAfter > 0 && i >= p.evolveAfter ? p.newSchemaVersion : p.schemaVersion,
        eventTimeSec: ctx.t - (p.lateEvery > 0 && (i + 1) % p.lateEvery === 0 ? p.lateByMs / MS : 0),
        entityId: p.paired ? `${ctx.nodeId}-pair-${pair}` : `${ctx.nodeId}-entity-${i % p.entities}`,
        sequence: p.outOfOrderEvery > 0 && (i + 1) % p.outOfOrderEvery === 0 ? Math.max(1, seq - 2) : seq,
        valid: !(p.invalidEvery > 0 && (i + 1) % p.invalidEvery === 0), approved: p.approved, side,
        amount: p.amount + (p.paired && side === 'right' && p.mismatchEvery > 0 && pair % p.mismatchEvery === 0 ? p.mismatchDelta : 0), lineage: [ctx.nodeId] };
      if (p.duplicateEvery > 0 && (i + 1) % p.duplicateEvery === 0 && k.previous) e = clone(k.previous);
      k.previous = clone(e); k.emitted.push(clone(e)); k.generated++; k.outstanding++;
      const msg = ctx.message({ ptype: 'event', kb: p.payloadKb, key: e.entityId, op: 'write', deadline: p.deadlineMs > 0 ? ctx.t + p.deadlineMs / MS : null, fields: { event: e, synthetic: true } });
      ctx.beginRequest(msg); const job = ctx.newJob(msg), edges = ctx.edges('out');
      if (!edges.length) { ctx.endRequest(msg, { ok: false, err: 'unavailable' }); ctx.reply(job, { ok: false, err: 'unavailable' }); k.outstanding--; k.failed++; }
      else if (ctx.call(job, edges[i % edges.length].id, {}, { timeoutMs: p.callTimeoutMs, retries: p.retries, backoffMs: p.retryBackoffMs, slot: 'event' }) === null) { ctx.endRequest(msg, { ok: true }); ctx.reply(job, { ok: true }); k.outstanding--; k.completed++; }
      if (k.generated < p.count) ctx.wake(p.intervalMs / MS, { kind: 'emit', generation: k.generation });
    },
    onResult(ctx, job, slot, result) {
      ctx.k.outstanding = Math.max(0, ctx.k.outstanding - 1); ctx.k[result.ok ? 'completed' : 'failed']++;
      ctx.endRequest(job.msg, { ok: result.ok, ...(result.ok ? {} : { err: result.err || 'error' }) });
      ctx.reply(job, { ok: result.ok, ...(result.ok ? {} : { err: result.err || 'error' }), fields: result.msg?.fields || job.msg.fields });
    },
    onFault(ctx, fault, active) { if (fault.type !== 'crash') return; ctx.k.generation++; if (active) { ctx.k.failed += ctx.k.outstanding; ctx.k.outstanding = 0; } else if (!ctx.fault.down && ctx.k.generated < ctx.p.count) ctx.wake(ctx.p.intervalMs / MS, { kind: 'emit', generation: ctx.k.generation }); },
    observe: ctx => ({ detail: { generated: ctx.k.generated, completed: ctx.k.completed, failed: ctx.k.failed, outstanding: ctx.k.outstanding, model: 'Finite synthetic records; scalar amounts and approval flags are authored test inputs' } })
  });

  register({ id: 'eventValidator', station: STATION, onRequest: service,
    onServed(ctx, job) {
      const e = input(ctx, job); if (!e) return;
      const reason = !e.valid ? 'Declared invalid record' : e.schemaVersion < ctx.p.minSchemaVersion || e.schemaVersion > ctx.p.maxSchemaVersion ? `Unsupported schema version ${e.schemaVersion}` : null;
      if (reason) { ctx.k.quarantined++; ctx.log('event-quarantined', `${e.id}: ${reason}`); route(ctx, job, 'quarantine', e, 'invalid', { pipelineReason: reason }); }
      else { ctx.k.accepted++; route(ctx, job, 'accepted', e); }
    }, init: () => ({ accepted: 0, quarantined: 0 }), onResult,
    observe: ctx => ({ detail: { accepted: ctx.k.accepted, quarantined: ctx.k.quarantined, 'schema range': `${ctx.p.minSchemaVersion}–${ctx.p.maxSchemaVersion}` } })
  });

  register({ id: 'approvalGate', station: STATION, onRequest: service,
    init: () => ({ epoch: 0, pending: {}, approved: 0, denied: 0 }),
    onServed(ctx, job) {
      const e = input(ctx, job); if (!e) return; ctx.release(job);
      ctx.k.pending[job.id] = e; ctx.wake(ctx.p.approvalMs / MS, { kind: 'decision', jobId: job.id, epoch: ctx.k.epoch });
    },
    onWake(ctx, wake) {
      if (wake.kind !== 'decision' || wake.epoch !== ctx.k.epoch) return;
      const e = own(ctx.k.pending, wake.jobId); delete ctx.k.pending[wake.jobId]; const job = ctx.job(wake.jobId); if (!e || !job) return;
      const approved = ctx.p.policy === 'flag' ? e.approved : !(ctx.p.denyEvery > 0 && e.sequence % ctx.p.denyEvery === 0);
      if (approved) { ctx.k.approved++; route(ctx, job, 'accepted', { ...e, approved: true }); }
      else { ctx.k.denied++; ctx.log('approval-denied', e.id); route(ctx, job, 'quarantine', e, 'invalid', { pipelineReason: 'Synthetic approval policy denied the event' }); }
    },
    onFault(ctx, fault, active) { if (fault.type === 'crash' && active) { ctx.k.epoch++; ctx.k.pending = {}; } }, onResult,
    observe: ctx => ({ detail: { 'pending approvals': Object.keys(ctx.k.pending).length, approved: ctx.k.approved, denied: ctx.k.denied, model: 'Delayed authored policy or input flag, not a human or clinical decision' } })
  });

  register({ id: 'eventLedger', station: STATION, onRequest: service,
    init: () => ({ seen: {}, sequences: {}, pairs: {}, committed: 0, duplicates: 0, outOfOrder: 0, mismatches: 0, reconciled: 0, lostPending: 0 }),
    onServed(ctx, job) {
      const e = input(ctx, job); if (!e) return; const k = ctx.k, p = ctx.p;
      if (has(k.seen, e.id)) {
        k.duplicates++;
        if (p.mode !== 'reconcile') route(ctx, job, 'accepted', e, null, { duplicate: true });
        else {
          const pair = own(k.pairs, e.entityId);
          if (pair?.committed) route(ctx, job, 'accepted', e, null, { duplicate: true, pipelineIdempotencyKey: `pair:${e.entityId}` });
          else if (pair?.left && pair.right && Math.abs(pair.left.amount - pair.right.amount) > p.tolerance) route(ctx, job, 'quarantine', e, 'invalid', { pipelineReason: 'Authored scalar records disagree' });
          else route(ctx, job, 'pending', e, null, { reconciliation: 'awaiting counterpart', duplicate: true });
        }
        return;
      }
      if (limit(ctx, Object.keys(k.seen).length)) { route(ctx, job, 'quarantine', e, 'rejected', { pipelineReason: 'Event identity state capacity exhausted' }); return; }
      if (p.mode === 'ordered') {
        const last = own(k.sequences, e.entityId) || 0;
        if (p.ordering === 'strict' ? e.sequence !== last + 1 : e.sequence <= last) { k.outOfOrder++; route(ctx, job, 'quarantine', e, 'invalid', { pipelineReason: `Sequence ${e.sequence} follows ${last}` }); return; }
        k.sequences[e.entityId] = e.sequence;
      }
      if (p.mode === 'reconcile') {
        if (!['left', 'right'].includes(e.side)) { route(ctx, job, 'quarantine', e, 'invalid', { pipelineReason: 'Reconciliation requires left/right records' }); return; }
        const existing = own(k.pairs, e.entityId);
        if (existing?.committed) {
          if (Math.abs(existing[e.side].amount - e.amount) > p.tolerance) { k.mismatches++; route(ctx, job, 'quarantine', e, 'invalid', { pipelineReason: 'Conflicting event cannot alter a committed pair' }); }
          else { k.seen[e.id] = true; k.duplicates++; route(ctx, job, 'accepted', e, null, { reconciliation: 'already committed', pipelineIdempotencyKey: `pair:${e.entityId}` }); }
          return;
        }
        if (!ctx.retain(e.id, ctx.derive(job.msg, { fields: { event: e } }), { kind: 'awaiting-counterpart', detail: `${e.entityId}: ${e.side} scalar ${e.amount}` })) { route(ctx, job, 'quarantine', e, 'rejected', { pipelineReason: 'Pending reconciliation payload exceeds memory budget' }); return; }
        const pair = existing || (k.pairs[e.entityId] = { left: null, right: null, committed: false });
        if (pair[e.side]) ctx.releaseRetained(pair[e.side].retainedKey);
        pair[e.side] = { amount: e.amount, eventId: e.id, retainedKey: e.id }; k.seen[e.id] = true;
        if (pair.left === null || pair.right === null) { route(ctx, job, 'pending', e, null, { reconciliation: 'awaiting counterpart' }); return; }
        if (Math.abs(pair.left.amount - pair.right.amount) > p.tolerance) { k.mismatches++; ctx.log('reconciliation-mismatch', e.entityId); route(ctx, job, 'quarantine', e, 'invalid', { pipelineReason: 'Authored scalar records disagree' }); return; }
        const effect = ctx.effect(`pair:${e.entityId}`, { idempotent: true }); if (!effect.suppressed) { k.committed++; k.reconciled++; } pair.committed = true;
        ctx.releaseRetained(pair.left.retainedKey); ctx.releaseRetained(pair.right.retainedKey);
      } else { k.seen[e.id] = true; const effect = ctx.effect(`event:${e.id}`, { idempotent: true }); if (!effect.suppressed) k.committed++; }
      route(ctx, job, 'accepted', e, null, p.mode === 'reconcile' ? { pipelineIdempotencyKey: `pair:${e.entityId}` } : {});
    }, onResult,
    onFault(ctx, fault, active) {
      if (fault.type !== 'crash' || !active) return;
      for (const [id, pair] of Object.entries(ctx.k.pairs)) if (!pair.committed) {
        for (const row of [pair.left, pair.right]) if (row) { ctx.releaseRetained(row.retainedKey); delete ctx.k.seen[row.eventId]; ctx.k.lostPending++; }
        delete ctx.k.pairs[id];
      }
    },
    observe: ctx => ({ detail: { committed: ctx.k.committed, duplicates: ctx.k.duplicates, 'out of order': ctx.k.outOfOrder, mismatches: ctx.k.mismatches, reconciled: ctx.k.reconciled, 'pending pairs': Object.values(ctx.k.pairs).filter(p => !p.committed).length, 'lost volatile pending records': ctx.k.lostPending, 'tracked identities': Object.keys(ctx.k.seen).length } })
  });

  register({ id: 'eventWindow', station: STATION, onRequest: service,
    init: () => ({ seen: {}, outputs: {}, windows: {}, maxTime: null, watermark: null, accepted: 0, late: 0, duplicates: 0, schemaRejected: 0, closed: 0 }),
    onServed(ctx, job) {
      const e = input(ctx, job); if (!e) return; const k = ctx.k, p = ctx.p;
      if (has(k.seen, e.id)) { k.duplicates++; route(ctx, job, 'accepted', e, null, { window: k.outputs[e.id], duplicate: true }); return; }
      if (e.schemaVersion > p.maxSchemaVersion) { k.schemaRejected++; route(ctx, job, 'quarantine', e, 'invalid', { pipelineReason: 'Window schema migration is not enabled for this version' }); return; }
      if (k.watermark !== null && e.eventTimeSec < k.watermark - p.allowedLateSec) { k.late++; ctx.log('late-event', `${e.id} at ${e.eventTimeSec}, watermark ${k.watermark}`); route(ctx, job, 'quarantine', e, 'dropped', { pipelineReason: 'Event exceeds allowed lateness' }); return; }
      if (limit(ctx, Object.keys(k.seen).length)) { route(ctx, job, 'quarantine', e, 'rejected'); return; }
      const start = Math.floor(e.eventTimeSec / p.windowSec) * p.windowSec, key = `${e.entityId}:${start}`;
      if (!has(k.windows, key) && Object.keys(k.windows).length >= p.maxWindows) { route(ctx, job, 'quarantine', e, 'rejected', { pipelineReason: 'Window state capacity exhausted' }); return; }
      const window = own(k.windows, key) || (k.windows[key] = { entityId: e.entityId, start, end: start + p.windowSec, count: 0, sum: 0, closed: false, revisions: 0 });
      if (window.closed) window.revisions++; window.count++; window.sum += e.amount; k.seen[e.id] = true; k.accepted++;
      k.maxTime = k.maxTime === null ? e.eventTimeSec : Math.max(k.maxTime, e.eventTimeSec); k.watermark = k.maxTime - p.watermarkLagSec;
      for (const row of Object.values(k.windows)) if (!row.closed && row.end <= k.watermark) { row.closed = true; k.closed++; }
      k.outputs[e.id] = { ...window, watermark: k.watermark };
      route(ctx, job, 'accepted', e, null, { window: k.outputs[e.id] });
    }, onResult,
    observe: ctx => ({ detail: { accepted: ctx.k.accepted, late: ctx.k.late, duplicates: ctx.k.duplicates, 'schema rejected': ctx.k.schemaRejected, windows: Object.keys(ctx.k.windows).length, 'closed windows': ctx.k.closed, watermark: ctx.k.watermark ?? 'none', model: 'Event-time tumbling aggregates with bounded retained state; updates within allowed lateness are revisions' } })
  });

  function releaseBuffer(ctx, jobId) {
    const held = own(ctx.k.reservations, jobId); if (!held) return; ctx.k.bufferKb -= held.residentKb;
    if (Math.abs(ctx.k.bufferKb) < 1e-8) ctx.k.bufferKb = 0; delete ctx.k.reservations[jobId];
  }
  register({ id: 'shuffleSpill', station: STATION,
    init: () => ({ epoch: 0, reservations: {}, bufferKb: 0, peakBufferKb: 0, spillKb: 0, shuffleKb: 0, spills: 0, completed: 0, tails: {}, checkpoint: null, checkpoints: 0 }),
    onRequest(ctx, job) {
      const record = eventOf(job.msg); if (record.error) { input(ctx, job); return; }
      const k = ctx.k, p = ctx.p, residentKb = Math.min(job.msg.kb, Math.max(0, p.bufferMiB * KB_PER_MIB - k.bufferKb)), spillKb = job.msg.kb - residentKb;
      if (!ctx.resizeMemory(job, residentKb / KB_PER_MIB)) { ctx.reply(job, { ok: false, err: 'rejected' }); return; }
      let hash = 2166136261; for (const c of record.event.entityId) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
      const partition = (hash >>> 0) % p.partitions;
      k.reservations[job.id] = { residentKb, spillKb, partition }; k.bufferKb += residentKb; k.peakBufferKb = Math.max(k.peakBufferKb, k.bufferKb); k.spillKb += spillKb; k.shuffleKb += job.msg.kb; if (spillKb > 0) k.spills++;
      if (!service(ctx, job)) releaseBuffer(ctx, job.id);
    },
    onServed(ctx, job) {
      const e = input(ctx, job); if (!e) { releaseBuffer(ctx, job.id); return; } const held = own(ctx.k.reservations, job.id); if (!held) { ctx.reply(job, { ok: false, err: 'invalid' }); return; }
      const delay = job.msg.kb / (ctx.p.shuffleMiBps * KB_PER_MIB) + held.spillKb * 2 / (ctx.p.spillMiBps * KB_PER_MIB);
      const start = Math.max(ctx.t, own(ctx.k.tails, String(held.partition)) || 0), until = start + delay;
      ctx.k.tails[held.partition] = until; held.event = e; ctx.release(job);
      ctx.wake(until - ctx.t, { kind: 'shuffle-done', jobId: job.id, epoch: ctx.k.epoch });
    },
    onWake(ctx, wake) {
      if (wake.kind !== 'shuffle-done' || wake.epoch !== ctx.k.epoch) return; const job = ctx.job(wake.jobId), held = own(ctx.k.reservations, wake.jobId); releaseBuffer(ctx, wake.jobId); if (!job) return; if (!held?.event) throw Error('Shuffle completion lost its payload reservation');
      ctx.k.completed++;
      if (ctx.p.checkpointEvery > 0 && ctx.k.completed % ctx.p.checkpointEvery === 0) {
        ctx.k.checkpoints++; ctx.k.checkpoint = { completed: ctx.k.completed, atSec: ctx.t, partitions: clone(ctx.k.tails) }; ctx.log('pipeline-checkpoint', `Completed offset ${ctx.k.completed}; logical partition snapshot ${ctx.k.checkpoints}`);
      }
      route(ctx, job, 'accepted', held.event, null, { shuffle: { partitions: ctx.p.partitions, syntheticSpill: true } });
    }, onResult,
    onFault(ctx, fault, active) { if (fault.type === 'crash' && active) { ctx.k.epoch++; ctx.k.reservations = {}; ctx.k.bufferKb = 0; ctx.k.tails = {}; } },
    observe: ctx => ({ detail: { 'buffer KiB': ctx.k.bufferKb, 'peak buffer KiB': ctx.k.peakBufferKb, 'spill KiB': ctx.k.spillKb, 'shuffle KiB': ctx.k.shuffleKb, spills: ctx.k.spills, completed: ctx.k.completed, checkpoints: ctx.k.checkpoints, model: 'FIFO partition transfer and spill write/read delay; logical checkpoint offsets, not durable disk or OS paging' } })
  });

  register({ id: 'eventQuarantine', station: STATION, onRequest: service,
    init: () => ({ records: [], overflow: 0, lost: 0 }),
    onServed(ctx, job) {
      if (ctx.k.records.length >= ctx.p.maxRecords) { ctx.k.overflow++; ctx.reply(job, { ok: false, err: 'rejected' }); return; }
      const e = eventOf(job.msg), reason = String(job.msg.fields?.pipelineReason || e.error || 'Quarantined record');
      const retainedKey = job.msg.id;
      if (!ctx.retain(retainedKey, job.msg, { kind: 'quarantined-event', detail: reason })) { ctx.k.overflow++; ctx.reply(job, { ok: false, err: 'rejected' }); return; }
      ctx.k.records.push({ requestId: job.msg.trace, event: e.event || null, reason, atSec: ctx.t, retainedKey, lost: false });
      ctx.log('quarantine-retained', e.event?.id || job.msg.trace); ctx.reply(job, { ok: true, ptype: 'event', fields: { ...job.msg.fields, quarantined: true } });
    },
    onFault(ctx, fault, active) { if (fault.type === 'crash' && active) for (const row of ctx.k.records) if (!row.lost) { ctx.releaseRetained(row.retainedKey); row.lost = true; row.event = null; ctx.k.lost++; } },
    observe: ctx => ({ detail: { quarantined: ctx.k.records.filter(r => !r.lost).length, 'lost volatile records': ctx.k.lost, overflow: ctx.k.overflow, model: 'Bounded retained RAM records; crash leaves loss tombstones, not a durable store or clinical review' } })
  });
});
