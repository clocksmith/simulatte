(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const registry = node ? require('./kernel-registry.js') : root.SimulatteSystemDiagramKernels;
  factory(registry);
  if (node) module.exports = registry;
})(globalThis, function (registry) {
  'use strict';
  // Core kernels: source, service, endpoint, queue, deadLetter, database. They use ctx only.
  const MS = 1000;
  const SOURCE_BACKOFF_MULTIPLIER = 2;
  const SOURCE_IDLE_POLL_SEC = 1;
  const DIURNAL_AMPLITUDE = 0.8;
  const THINNING_MAX_DRAWS = 10000;
  const QUEUE_PARTITION_POLL_SEC = 1;
  const QUEUE_COMPACT_MIN = 64;
  const ALL = 'all';
  const STATION = Object.freeze({ concurrency: 'concurrency', queueCapacity: 'queueCapacity' });
  const failed = (ctx, rate) => rate > 0 && ctx.rand() < rate;
  const isCrash = (ctx, fault, active) => fault.type === 'crash' && active && ctx.fault.down;
  const recovered = (ctx, active) => !active && !ctx.fault.down;

  // ---- source ----
  function rateAt(ctx, t) {
    const p = ctx.p;
    if (p.pattern === 'diurnal') return p.ratePerSec * (1 + DIURNAL_AMPLITUDE * Math.sin(2 * Math.PI * t / p.periodSec));
    if (p.pattern === 'ramp') {
      const end = p.stopSec > 0 ? p.stopSec : ctx.horizonSec, span = end - p.startSec;
      const frac = span > 0 ? Math.min(1, Math.max(0, (t - p.startSec) / span)) : 1;
      return p.ratePerSec + (p.rampToRate - p.ratePerSec) * frac;
    }
    return p.ratePerSec;
  }
  // Non-homogeneous patterns use thinning against their peak rate.
  function nextArrival(ctx, from) {
    const p = ctx.p;
    if (p.pattern === 'constant') return p.ratePerSec > 0 ? from + 1 / p.ratePerSec : null;
    if (p.pattern === 'poisson') return p.ratePerSec > 0 ? from + ctx.exp(1 / p.ratePerSec) : null;
    const peak = p.pattern === 'diurnal' ? p.ratePerSec * (1 + DIURNAL_AMPLITUDE) : Math.max(p.ratePerSec, p.rampToRate);
    if (!(peak > 0)) return null;
    let t = from;
    for (let i = 0; i < THINNING_MAX_DRAWS; i++) {
      t += ctx.exp(1 / peak);
      if (t > ctx.horizonSec || ctx.rand() * peak <= rateAt(ctx, t)) return t;
    }
    return t;
  }
  function scheduleNext(ctx, from) {
    const at = nextArrival(ctx, from);
    if (at === null) ctx.wake(SOURCE_IDLE_POLL_SEC, { kind: 'poll' });
    else ctx.wake(Math.max(0, at - ctx.t), { kind: 'next' });
  }
  function sourceActive(ctx) {
    const p = ctx.p, k = ctx.k;
    if (k.stopped) return false;
    if ((p.stopSec > 0 && ctx.t >= p.stopSec) || (p.maxRequests > 0 && k.generated >= p.maxRequests)) { k.stopped = true; return false; }
    return true;
  }
  function think(ctx, user) { ctx.wake(ctx.exp(ctx.p.thinkMs) / MS, { kind: 'user', user }); }
  function emit(ctx, user) {
    const p = ctx.p, k = ctx.k, edges = ctx.edges('out');
    k.generated++;
    const msg = ctx.message({
      ptype: p.payload, kb: p.requestKb, tokens: p.tokensMean > 0 ? Math.max(1, Math.round(ctx.exp(p.tokensMean))) : 0,
      op: ctx.rand() < p.readFraction ? 'read' : 'write', key: ctx.zipf(p.keySpace, p.zipfS), deadline: p.deadlineMs > 0 ? ctx.t + p.deadlineMs / MS : null,
    });
    ctx.beginRequest(msg);
    if (!edges.length) { ctx.endRequest(msg, { ok: false, err: 'unavailable' }); if (user !== null) think(ctx, user); return; }
    const edge = edges[k.rr % edges.length];
    k.rr = (k.rr + 1) % edges.length;
    const job = ctx.newJob(msg);
    const callId = ctx.call(job, edge.id, {}, { timeoutMs: p.timeoutMs, retries: p.retries, backoffMs: p.retryBackoffMs, multiplier: SOURCE_BACKOFF_MULTIPLIER, jitter: p.retryJitter, idemPerAttempt: !p.idempotencyKeys });
    if (callId === null) {
      ctx.endRequest(job.msg, { ok: true });
      ctx.reply(job, { ok: true });
      if (user !== null) think(ctx, user);
      return;
    }
    if (user !== null) k.users[job.id] = user;
  }
  registry.register({
    id: 'source', station: null,
    init: () => ({ generated: 0, rr: 0, stopped: false, users: {}, restart: [] }),
    start(ctx) {
      const p = ctx.p;
      if (p.pattern === 'closed') for (let u = 0; u < p.users; u++) ctx.wake(p.startSec + ctx.rand() * p.thinkMs / MS, { kind: 'user', user: u });
      else if (p.pattern === 'burst') ctx.wake(p.burstAtSec, { kind: 'burst', i: 0 });
      else if (p.pattern === 'constant') ctx.wake(p.startSec, { kind: 'next' });
      else scheduleNext(ctx, p.startSec);
    },
    onWake(ctx, w) {
      if (w.kind === 'poll') { if (sourceActive(ctx)) scheduleNext(ctx, ctx.t); return; }
      if (!sourceActive(ctx)) return;
      if (w.kind === 'next') { emit(ctx, null); scheduleNext(ctx, ctx.t); }
      else if (w.kind === 'burst') { emit(ctx, null); if (w.i + 1 < ctx.p.burstCount) ctx.wake(ctx.p.burstSpacingMs / MS, { kind: 'burst', i: w.i + 1 }); }
      else if (w.kind === 'user') emit(ctx, w.user);
    },
    onResult(ctx, job, slot, result) {
      const k = ctx.k;
      ctx.endRequest(job.msg, { ok: result.ok, err: result.err });
      ctx.reply(job, result.ok ? { ok: true } : { ok: false, err: result.err });
      if (Object.hasOwn(k.users, job.id)) { const user = k.users[job.id]; delete k.users[job.id]; think(ctx, user); }
    },
    // The engine ends a crashed source's open requests; closed-loop users waiting on them restart on repair.
    onFault(ctx, fault, active) {
      const k = ctx.k;
      if (isCrash(ctx, fault, active)) { k.restart.push(...Object.values(k.users)); k.users = {}; }
      else if (recovered(ctx, active) && k.restart.length) { for (const user of k.restart) think(ctx, user); k.restart = []; }
    },
    observe(ctx) { return { detail: { generated: ctx.k.generated, stopped: ctx.k.stopped } }; },
  });

  // ---- service ----
  function callOptions(p, slot) { return { timeoutMs: p.callTimeoutMs, retries: p.retries, backoffMs: p.retryBackoffMs, multiplier: p.backoffMultiplier, jitter: p.retryJitter, slot }; }
  function forwardPatch(p) { return p.outputPayload === 'inherit' ? {} : { ptype: p.outputPayload }; }
  function finishService(ctx, job, rec) {
    delete ctx.k.jobs[job.id];
    ctx.reply(job, rec.err ? { ok: false, err: rec.err } : { ok: true, kb: ctx.p.responseKb });
  }
  function nextSequential(ctx, job, rec) {
    const p = ctx.p;
    while (rec.i < rec.plan.length) {
      const step = rec.plan[rec.i];
      if (step.a) { ctx.call(job, step.e, forwardPatch(p), { async: true }); rec.i++; continue; }
      if (ctx.call(job, step.e, forwardPatch(p), callOptions(p, rec.i)) !== null) return;
      rec.i++;
    }
    finishService(ctx, job, rec);
  }
  registry.register({
    id: 'service', station: STATION,
    init: () => ({ jobs: {} }),
    onServed(ctx, job) {
      const p = ctx.p;
      if (failed(ctx, p.errorRate)) { ctx.reply(job, { ok: false, err: 'error' }); return; }
      const plan = [];
      for (const edge of ctx.edges('calls')) {
        if (edge.params.probability < 1 && ctx.rand() >= edge.params.probability) continue;
        for (let i = 0; i < edge.params.callsPerRequest; i++) plan.push({ e: edge.id, a: edge.params.mode === 'async' });
      }
      if (!plan.length) { ctx.reply(job, { ok: true, kb: p.responseKb }); return; }
      if (!p.blockingCalls) ctx.release(job);
      const rec = { plan, i: 0, pending: 0, err: null, parallel: p.callMode === 'parallel' };
      ctx.k.jobs[job.id] = rec;
      if (!rec.parallel) { nextSequential(ctx, job, rec); return; }
      plan.forEach((step, i) => {
        if (step.a) ctx.call(job, step.e, forwardPatch(p), { async: true });
        else if (ctx.call(job, step.e, forwardPatch(p), callOptions(p, i)) !== null) rec.pending++;
      });
      if (!rec.pending) finishService(ctx, job, rec);
    },
    onResult(ctx, job, slot, result) {
      const rec = ctx.k.jobs[job.id];
      if (!rec) return;
      if (!result.ok && !rec.err) rec.err = result.err;
      if (rec.parallel) { rec.pending--; if (!rec.pending) finishService(ctx, job, rec); return; }
      if (!result.ok) { finishService(ctx, job, rec); return; }
      rec.i++;
      nextSequential(ctx, job, rec);
    },
    onFault(ctx, fault, active) { if (isCrash(ctx, fault, active)) ctx.k.jobs = {}; },
    observe(ctx) { return { detail: { 'awaiting calls': Object.keys(ctx.k.jobs).length } }; },
  });

  // ---- endpoint ----
  registry.register({
    id: 'endpoint', station: STATION,
    init: () => ({ tokens: null, last: 0, limited: 0 }),
    onRequest(ctx, job) {
      const p = ctx.p, k = ctx.k;
      if (p.rateLimitPerSec > 0) {
        k.tokens = Math.min(p.rateBurst, (k.tokens === null ? p.rateBurst : k.tokens) + (ctx.t - k.last) * p.rateLimitPerSec);
        k.last = ctx.t;
        if (k.tokens < 1) { k.limited++; ctx.reply(job, { ok: false, err: 'rate-limited', kb: 0 }); return; }
        k.tokens -= 1;
      } else { k.tokens = null; k.last = ctx.t; }
      ctx.admit(job);
    },
    onServed(ctx, job) {
      if (failed(ctx, ctx.p.errorRate)) { ctx.reply(job, { ok: false, err: 'error' }); return; }
      ctx.reply(job, { ok: true, kb: ctx.p.responseKb });
    },
    observe(ctx) { return { detail: ctx.p.rateLimitPerSec > 0 ? { 'rate limited': ctx.k.limited } : {} }; },
  });

  // ---- queue: at-least-once leases with visibility timeout, redelivery and dead letters ----
  function subscriptions(ctx) { return ctx.p.mode === 'topic' ? ctx.edges('consumers').map(edge => edge.id) : [ALL]; }
  function makeReady(k, qid) {
    const rec = k.msgs[qid];
    rec.st = 'ready';
    (k.ready[rec.sub] || (k.ready[rec.sub] = [])).push(qid);
  }
  function popReady(k, sub) {
    const list = k.ready[sub];
    if (!list) return null;
    let head = k.heads[sub] || 0, found = null;
    while (head < list.length && found === null) {
      const qid = list[head++], rec = k.msgs[qid];
      if (rec && rec.st === 'ready') found = qid;
    }
    if (head >= QUEUE_COMPACT_MIN && head * 2 >= list.length) { k.ready[sub] = list.slice(head); head = 0; }
    k.heads[sub] = head;
    return found;
  }
  function hasReady(k, sub) {
    const list = k.ready[sub];
    if (!list) return false;
    for (let i = k.heads[sub] || 0; i < list.length; i++) { const rec = k.msgs[list[i]]; if (rec && rec.st === 'ready') return true; }
    return false;
  }
  function deliver(ctx, qid, edge) {
    const k = ctx.k, rec = k.msgs[qid];
    rec.st = 'lease'; rec.d++; rec.e = edge.id;
    k.infl[edge.id] = (k.infl[edge.id] || 0) + 1;
    k.stats.delivered++;
    if (rec.d > 1) k.stats.redeliveries++;
    const callId = ctx.call(null, edge.id, { ...rec.m, delivery: rec.d }, { timeoutMs: ctx.p.visibilityTimeoutMs, retries: 0, slot: qid });
    if (callId === null) { k.infl[edge.id]--; delete k.msgs[qid]; k.size--; k.stats.acked++; }
  }
  function dispatchQueue(ctx) {
    const k = ctx.k, p = ctx.p, all = ctx.edges('consumers');
    const usable = all.filter(edge => ctx.edgeUsable(edge.id));
    const room = edge => (k.infl[edge.id] || 0) < p.prefetch;
    if (p.mode === 'topic') {
      for (const edge of usable) { let qid; while (room(edge) && (qid = popReady(k, edge.id)) !== null) deliver(ctx, qid, edge); }
    } else if (usable.length) {
      for (;;) {
        let pick = -1;
        for (let n = 0; n < usable.length && pick < 0; n++) if (room(usable[(k.rr + n) % usable.length])) pick = (k.rr + n) % usable.length;
        if (pick < 0) break;
        const qid = popReady(k, ALL);
        if (qid === null) break;
        deliver(ctx, qid, usable[pick]);
        k.rr = (pick + 1) % usable.length;
      }
    }
    const blocked = usable.length < all.length && (p.mode === 'topic' ? all.some(edge => !usable.includes(edge) && hasReady(k, edge.id)) : hasReady(k, ALL));
    if (blocked && !k.poll) { k.poll = true; ctx.wake(QUEUE_PARTITION_POLL_SEC, { kind: 'poll' }); }
  }
  function failedDelivery(ctx, qid, rec, delayMs) {
    const k = ctx.k, p = ctx.p;
    rec.r++;
    if (rec.r >= p.maxReceives) { deadLetter(ctx, qid, rec); return; }
    if (delayMs > 0) { rec.st = 'wait'; ctx.wake(delayMs / MS, { kind: 'vis', q: qid }); }
    else makeReady(k, qid);
  }
  function deadLetter(ctx, qid, rec) {
    const k = ctx.k, dlq = ctx.edges('dlq')[0];
    delete k.msgs[qid]; k.size--;
    if (dlq) { ctx.send(dlq.id, { ...rec.m, delivery: rec.d, fields: { ...rec.m.fields, reason: 'max-receives' } }); k.stats.deadLettered++; ctx.log('dead-letter', `message ${rec.m.trace} dead-lettered after ${rec.r} failed deliveries`); }
    else { k.stats.dropped++; ctx.log('dropped', `message ${rec.m.trace} dropped after ${rec.r} failed deliveries (no dead-letter edge)`); }
  }
  registry.register({
    id: 'queue', station: null,
    init: () => ({ seq: 0, size: 0, pending: 0, msgs: {}, ready: {}, heads: {}, infl: {}, rr: 0, poll: false, stats: { enqueued: 0, acked: 0, delivered: 0, redeliveries: 0, expired: 0, deadLettered: 0, dropped: 0, rejected: 0 } }),
    onRequest(ctx, job) {
      const k = ctx.k;
      if (k.size + k.pending >= ctx.p.capacity) { k.stats.rejected++; ctx.reply(job, { ok: false, err: 'rejected', kb: 0 }); return; }
      k.pending++;
      ctx.wake(ctx.p.enqueueMs * ctx.fault.slowFactor / MS, { kind: 'enq', job: job.id });
    },
    onWake(ctx, w) {
      const k = ctx.k;
      if (w.kind === 'enq') {
        k.pending--;
        const job = ctx.job(w.job);
        if (!job) return;
        for (const sub of subscriptions(ctx)) { const qid = `q${++k.seq}`; k.msgs[qid] = { m: { ...job.msg, fields: { ...job.msg.fields } }, sub, r: 0, d: 0, st: 'ready', at: ctx.t, e: null }; k.size++; makeReady(k, qid); }
        k.stats.enqueued++;
        ctx.reply(job, { ok: true, kb: 0 });
      } else if (w.kind === 'vis') {
        const rec = k.msgs[w.q];
        if (rec && rec.st === 'wait') makeReady(k, w.q);
      } else if (w.kind === 'poll') k.poll = false;
      dispatchQueue(ctx);
    },
    onResult(ctx, job, qid, result) {
      const k = ctx.k, rec = k.msgs[qid];
      if (!rec || rec.st !== 'lease') return;
      k.infl[rec.e]--;
      if (result.ok) { delete k.msgs[qid]; k.size--; k.stats.acked++; }
      else if (result.err === 'timeout') { k.stats.expired++; failedDelivery(ctx, qid, rec, 0); }
      else failedDelivery(ctx, qid, rec, ctx.p.retryDelayMs);
      dispatchQueue(ctx);
    },
    // Messages are durable across a crash; leases die with the crashed node and become visible again.
    onFault(ctx, fault, active) {
      const k = ctx.k;
      if (isCrash(ctx, fault, active)) {
        for (const qid of Object.keys(k.msgs)) if (k.msgs[qid].st === 'lease') makeReady(k, qid);
        k.infl = {};
      } else if (recovered(ctx, active)) dispatchQueue(ctx);
    },
    observe(ctx) {
      const k = ctx.k;
      let depth = 0, leased = 0, oldest = 0;
      for (const qid of Object.keys(k.msgs)) {
        const rec = k.msgs[qid];
        if (rec.st === 'lease') leased++;
        else { depth++; oldest = Math.max(oldest, ctx.t - rec.at); }
      }
      return { queue: depth, queueCapacity: ctx.p.capacity, detail: { depth, 'in flight': leased, 'oldest age s': oldest, redeliveries: k.stats.redeliveries, 'lease expiries': k.stats.expired, 'dead-lettered': k.stats.deadLettered, dropped: k.stats.dropped, rejected: k.stats.rejected } };
    },
  });

  // ---- deadLetter ----
  registry.register({
    id: 'deadLetter', station: null,
    init: () => ({ kept: [], count: 0, overflow: 0, redriven: 0 }),
    onRequest(ctx, job) {
      const k = ctx.k;
      k.count++;
      if (k.kept.length < ctx.p.capacity) k.kept.push({ id: job.msg.id, reason: typeof job.msg.fields.reason === 'string' ? job.msg.fields.reason : 'dead-letter', m: job.msg });
      else k.overflow++;
      ctx.reply(job, { ok: true, kb: 0 });
    },
    onControl(ctx, control) {
      if (control.kind !== 'redrive') return false;
      const k = ctx.k, edge = ctx.edges('redrive')[0];
      if (!edge) return false;
      for (const row of k.kept) ctx.send(edge.id, { ...row.m, delivery: 0, fields: { ...row.m.fields, redriven: true } });
      k.redriven += k.kept.length;
      k.kept = [];
      return true;
    },
    observe(ctx) { const k = ctx.k; return { queue: k.kept.length, queueCapacity: ctx.p.capacity, detail: { retained: k.kept.length, 'dead letters': k.count, redriven: k.redriven, overflow: k.overflow } }; },
  });

  // ---- database ----
  registry.register({
    id: 'database', station: { concurrency: 'connections', queueCapacity: 'queueCapacity' },
    init: () => ({ reads: 0, writes: 0, effects: 0, duplicates: 0, suppressed: 0, errors: 0 }),
    onRequest(ctx, job) {
      const p = ctx.p, mean = (job.msg.op === 'write' ? p.writeMs : p.readMs) + p.perKbMs * (Number.isFinite(job.msg.kb) ? job.msg.kb : 0);
      ctx.admit(job, ctx.serviceMs(mean, p.serviceDist, p.serviceCv));
    },
    onServed(ctx, job) {
      const p = ctx.p, k = ctx.k;
      if (failed(ctx, p.errorRate)) { k.errors++; ctx.reply(job, { ok: false, err: 'error' }); return; }
      if (job.msg.op === 'write') {
        k.writes++;
        const result = ctx.effect(job.msg.idem, { idempotent: p.idempotentWrites, windowSec: p.idempotencyWindowSec });
        if (result.suppressed) k.suppressed++;
        else { k.effects++; if (result.duplicate) k.duplicates++; }
      } else k.reads++;
      ctx.reply(job, { ok: true, kb: p.responseKb });
    },
    observe(ctx) { const k = ctx.k; return { detail: { reads: k.reads, writes: k.writes, effects: k.effects, 'duplicate effects': k.duplicates, 'suppressed duplicates': k.suppressed } }; },
  });
});
