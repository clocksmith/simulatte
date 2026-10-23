(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const registry = node ? require('./kernel-registry.js') : root.SimulatteSystemDiagramKernels;
  factory(registry);
  if (node) module.exports = registry;
})(globalThis, function (registry) {
  'use strict';
  if (!registry) throw Error('System Diagram kernel registry is required');
  const station = Object.freeze({ concurrency: 'concurrency', queueCapacity: 'queueCapacity' });
  function options(p, slot, timeout) { return { timeoutMs: timeout ?? p.callTimeoutMs, retries: p.retries || 0, backoffMs: p.retryBackoffMs || 0, multiplier: p.backoffMultiplier || 2, jitter: Boolean(p.retryJitter), slot }; }
  function terminal(ctx, job, result = { ok: true }) { ctx.reply(job, { ...result, kb: result.msg?.kb ?? ctx.p.responseKb ?? job.msg.kb, ptype: result.msg?.ptype ?? job.msg.ptype, fields: result.msg?.fields || {} }); }
  function launchFlow(ctx, job, portId, patch, settings = {}) {
    const edges = ctx.edges(portId); job.data.flow = { edges, next: 0, waiting: 0, failed: null, last: null, patch, settings };
    if (!edges.length) { terminal(ctx, job); return; }
    if (ctx.p.blockingCalls === false) ctx.release(job);
    const flow = job.data.flow;
    if (settings.parallel ?? ctx.p.callMode === 'parallel') { for (const id of edges) { if (ctx.edge(id).params.mode !== 'async') flow.waiting++; ctx.call(job, id, patch, options(ctx.p, id, settings.timeout)); } if (!flow.waiting) terminal(ctx, job); }
    else nextCall(ctx, job);
  }
  function nextCall(ctx, job) {
    const flow = job.data.flow;
    while (flow.next < flow.edges.length) { const id = flow.edges[flow.next++]; if (ctx.edge(id).params.mode === 'async') { ctx.call(job, id, flow.patch, options(ctx.p, id, flow.settings.timeout)); continue; }
      flow.waiting = 1; ctx.call(job, id, flow.patch, options(ctx.p, id, flow.settings.timeout)); return;
    }
    terminal(ctx, job, flow.failed || flow.last || { ok: true });
  }
  function flowResult(ctx, job, slot, result) {
    const flow = job.data.flow; if (!flow) return; flow.waiting--; flow.last = result; if (!result.ok) flow.failed = result;
    if (flow.settings.parallel ?? ctx.p.callMode === 'parallel') { if (flow.waiting === 0) terminal(ctx, job, flow.failed || flow.last); }
    else if (!result.ok) terminal(ctx, job, result); else nextCall(ctx, job);
    void slot;
  }
  function sourceAllowed(ctx) { return (!ctx.p.maxRequests || ctx.k.generated < ctx.p.maxRequests) && (!ctx.p.stopSec || ctx.t < ctx.p.stopSec) && !ctx.fault.down; }
  function sourceEmit(ctx, user = null) {
    if (!sourceAllowed(ctx)) return; ctx.k.generated++; ctx.k.active++;
    const p = ctx.p, msg = ctx.message({ ptype: p.payload, kb: p.requestKb, tokens: Math.max(0, Math.round(p.tokensMean)), key: String(ctx.zipf(p.keySpace, p.zipfS)), op: ctx.rand() < p.readFraction ? 'read' : 'write',
      deadline: p.deadlineMs > 0 ? ctx.t + p.deadlineMs / 1000 : null, fields: { idempotencyKeys: p.idempotencyKeys } });
    ctx.beginRequest(msg); const job = ctx.newJob(msg); if (!job) return; job.data.user = user;
    if (!ctx.hold(job)) return;
    const edges = ctx.edges('out'); if (!edges.length) { ctx.endRequest(msg, { ok: false, err: 'unavailable' }); ctx.reply(job, { ok: false, err: 'unavailable' }); ctx.k.active--; return; }
    job.data.pending = edges.filter(id => ctx.edge(id).params.mode !== 'async').length; job.data.failed = null;
    for (const id of edges) ctx.call(job, id, {}, { timeoutMs: p.timeoutMs, retries: p.retries, backoffMs: p.retryBackoffMs, multiplier: 2, jitter: p.retryJitter, slot: id });
    if (!job.data.pending) sourceDone(ctx, job, { ok: true });
  }
  function sourceDone(ctx, job, result) { ctx.endRequest(job.msg, result); ctx.reply(job, result); ctx.k.active = Math.max(0, ctx.k.active - 1); if (ctx.p.pattern === 'closed' && sourceAllowed(ctx)) ctx.wake(ctx.p.thinkMs / 1000, { kind: 'source', generation: ctx.k.generation, user: job.data.user }); }
  function sourceNext(ctx) { const p = ctx.p; let rate = p.ratePerSec; if (p.pattern === 'diurnal') rate *= 0.55 + 0.45 * Math.sin(ctx.t / p.periodSec * Math.PI * 2); if (p.pattern === 'ramp') rate += (p.rampToRate - rate) * Math.min(1, ctx.t / p.periodSec); if (rate <= 0) return null; return p.pattern === 'poisson' ? ctx.exp(1 / rate) : 1 / rate; }
  registry.register({ id: 'source', station: null,
    init: () => ({ generated: 0, active: 0, generation: 0 }),
    start(ctx) { const p = ctx.p; if (!['closed', 'burst'].includes(p.pattern) && p.ratePerSec <= 0) return; if (p.pattern === 'closed') for (let i = 0; i < p.users; i++) ctx.wake(p.startSec, { kind: 'source', generation: ctx.k.generation, user: i });
      else ctx.wake(p.pattern === 'burst' ? p.burstAtSec : p.startSec, { kind: 'source', generation: ctx.k.generation, index: 0 }); },
    onWake(ctx, data) { if (data.generation !== ctx.k.generation || !sourceAllowed(ctx)) return; if (!['closed', 'burst'].includes(ctx.p.pattern) && ctx.p.ratePerSec <= 0) return; sourceEmit(ctx, data.user ?? null);
      if (ctx.p.pattern === 'closed') return;
      if (ctx.p.pattern === 'burst') { const index = data.index + 1; if (index < ctx.p.burstCount && sourceAllowed(ctx)) ctx.wake(ctx.p.burstSpacingMs / 1000, { ...data, index }); }
      else { const delay = sourceNext(ctx); if (delay !== null && sourceAllowed(ctx)) ctx.wake(delay, data); }
    },
    onResult(ctx, job, slot, result) { if (!result.ok) job.data.failed = result; job.data.pending--; if (job.data.pending === 0) sourceDone(ctx, job, job.data.failed || result); void slot; },
    onFault(ctx, f, active) { if (f.type !== 'crash' && f.type !== 'outage') return; ctx.k.generation++; if (active) ctx.k.active = 0; else if (!ctx.fault.down) ctx.wake(0, { kind: 'source', generation: ctx.k.generation, index: 0 }); },
    onControl(ctx, c) { if (c.kind !== 'setParams') return false; ctx.k.generation++; ctx.wake(0, { kind: 'source', generation: ctx.k.generation, index: 0 }); return true; },
    observe: ctx => ({ detail: { Generated: ctx.k.generated, 'Waiting for replies': ctx.k.active } })
  });
  registry.register({ id: 'service', station, onServed(ctx, job) { const patch = ctx.p.outputPayload === 'inherit' ? {} : { ptype: ctx.p.outputPayload }; launchFlow(ctx, job, 'calls', patch); }, onResult: flowResult });
  registry.register({ id: 'endpoint', station,
    init: ctx => ({ tokens: ctx.p.rateBurst, updatedAt: 0 }),
    onRequest(ctx, job) { if (ctx.p.rateLimitPerSec > 0) { ctx.k.tokens = Math.min(ctx.p.rateBurst, ctx.k.tokens + (ctx.t - ctx.k.updatedAt) * ctx.p.rateLimitPerSec); ctx.k.updatedAt = ctx.t;
        if (ctx.k.tokens < 1) { ctx.count('Rate limited'); ctx.reply(job, { ok: false, err: 'rate-limited' }); return; } ctx.k.tokens--; } ctx.admit(job); },
    onServed: (ctx, job) => terminal(ctx, job)
  });
  registry.register({ id: 'database', station: { concurrency: 'connections', queueCapacity: 'queueCapacity' },
    onRequest(ctx, job) { const mean = (job.msg.op === 'write' ? ctx.p.writeMs : ctx.p.readMs) + ctx.p.perKbMs * job.msg.kb; ctx.admit(job, ctx.serviceMs(mean, ctx.p.serviceDist, ctx.p.serviceCv)); },
    onServed(ctx, job) { if (job.msg.op === 'write') { const e = ctx.effect(job.msg.idem, { idempotent: ctx.p.idempotentWrites, windowSec: ctx.p.idempotencyWindowSec }); ctx.count(e.suppressed ? 'Deduplicated writes' : 'Writes'); } else ctx.count('Reads'); ctx.reply(job, { ok: true, kb: ctx.p.responseKb, ptype: 'rows' }); }
  });
  function queueDispatch(ctx) {
    if (ctx.fault.down) return; const edges = ctx.edges('consumers'); if (!edges.length) return;
    for (const item of ctx.k.items) {
      if (item.status !== 'ready' || item.availableAt > ctx.t) continue;
      const selected = item.subscriberEdgeId || edges[ctx.k.cursor++ % edges.length];
      if (ctx.k.items.filter(other => other.status === 'leased' && other.edgeId === selected).length >= ctx.p.prefetch) continue;
      if (item.receives >= ctx.p.maxReceives) { queueDeadLetter(ctx, item); continue; }
      const holder = ctx.getJob(item.jobId); if (!holder || holder.status === 'finished') { item.status = 'done'; continue; }
      item.edgeId = selected; item.status = 'leased'; item.receives++; item.generation++; holder.msg.delivery = item.receives;
      ctx.count('Deliveries'); ctx.log('queue-delivery', `${item.id} receive ${item.receives}`, holder);
      ctx.call(holder, selected, { delivery: item.receives }, { timeoutMs: ctx.p.visibilityTimeoutMs, retries: 0, backoffMs: 0, multiplier: 1, jitter: false, slot: { itemId: item.id, generation: item.generation } });
      ctx.wake(ctx.p.visibilityTimeoutMs / 1000, { kind: 'lease', itemId: item.id, generation: item.generation });
    }
  }
  function queueDeadLetter(ctx, item) { const holder = ctx.getJob(item.jobId); item.status = 'dead-letter'; ctx.count('Dead letters'); ctx.log('dead-letter', `${item.id} exhausted receives`, holder);
    const edge = ctx.edges('dlq')[0]; if (edge && holder) { ctx.send(edge, holder.msg); ctx.reply(holder, { ok: true }); } else if (holder) { holder.status = 'dead-letter'; } }
  function queueRequeue(ctx, item) { if (item.status !== 'leased') return; item.status = 'ready'; item.availableAt = ctx.t + ctx.p.retryDelayMs / 1000; item.generation++; if (item.receives >= ctx.p.maxReceives) queueDeadLetter(ctx, item); else ctx.wake(ctx.p.retryDelayMs / 1000, { kind: 'dispatch' }); }
  registry.register({ id: 'queue', station: null,
    init: () => ({ items: [], next: 0, cursor: 0 }),
    onRequest(ctx, job) { const edges = ctx.edges('consumers'), targets = ctx.p.mode === 'topic' && edges.length ? edges : [null]; if (ctx.k.items.filter(i => !['done', 'dead-letter'].includes(i.status)).length + targets.length > ctx.p.capacity) { ctx.count('Rejected'); ctx.reply(job, { ok: false, err: 'rejected' }); return; }
      for (const edgeId of targets) { const holder = ctx.newJob(ctx.derive(job.msg, {})); if (!holder || !ctx.hold(holder)) continue; holder.status = 'queue-retained';
        ctx.k.items.push({ id: `item-${++ctx.k.next}`, jobId: holder.id, edgeId, subscriberEdgeId: edgeId, receives: 0, status: 'ready', availableAt: ctx.t + ctx.p.enqueueMs / 1000, generation: 0 }); }
      ctx.reply(job, { ok: true, kb: 0 }); ctx.wake(ctx.p.enqueueMs / 1000, { kind: 'dispatch' });
    },
    onWake(ctx, data) { if (data.kind === 'lease') { const item = ctx.k.items.find(i => i.id === data.itemId); if (item && item.generation === data.generation && item.status === 'leased') { ctx.count('Lease expiries'); queueRequeue(ctx, item); } } queueDispatch(ctx); },
    onResult(ctx, job, slot, result) { const item = ctx.k.items.find(i => i.id === slot.itemId); if (!item || item.generation !== slot.generation || item.status !== 'leased') return;
      if (result.ok) { item.status = 'done'; item.generation++; ctx.count('Acknowledged'); ctx.reply(job, { ok: true }); } else { ctx.count('Failed acknowledgements'); if (result.err === 'timeout') ctx.count('Lease expiries'); queueRequeue(ctx, item); } queueDispatch(ctx);
    },
    onFault(ctx, f, active) { if (f.type !== 'crash' && f.type !== 'outage') return; if (active) { for (const item of ctx.k.items) if (!['done', 'dead-letter'].includes(item.status)) item.status = 'done'; } else if (!ctx.fault.down) queueDispatch(ctx); },
    observe: ctx => ({ detail: { Queued: ctx.k.items.filter(i => i.status === 'ready').length, Leased: ctx.k.items.filter(i => i.status === 'leased').length, 'Dead letters retained': ctx.k.items.filter(i => i.status === 'dead-letter').length } })
  });
  registry.register({ id: 'deadLetter', station: null,
    init: () => ({ items: [] }),
    onRequest(ctx, job) { if (ctx.k.items.length >= ctx.p.capacity) { ctx.reply(job, { ok: false, err: 'rejected' }); return; } const holder = ctx.newJob(ctx.derive(job.msg, {})); if (holder && ctx.hold(holder)) { holder.status = 'dead-letter'; ctx.k.items.push({ jobId: holder.id, msg: holder.msg }); ctx.log('dead-letter-retained', holder.msg.trace, holder); } ctx.reply(job, { ok: true, kb: 0 }); },
    onControl(ctx, c) { if (c.kind !== 'redrive') return false; const edge = ctx.edges('redrive')[0]; if (!edge) throw Error('Connect a redrive output first'); for (const item of ctx.k.items) { const holder = ctx.getJob(item.jobId); if (!holder || holder.status === 'finished') continue; ctx.send(edge, ctx.derive(item.msg, { delivery: 0 })); ctx.reply(holder, { ok: true }); } ctx.k.items = []; return true; },
    observe: ctx => ({ detail: { Retained: ctx.k.items.length } })
  });
});
