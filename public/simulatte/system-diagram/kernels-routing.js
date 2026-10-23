(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const registry = node ? require('./kernel-registry.js') : root.SimulatteSystemDiagramKernels;
  factory(registry);
  if (node) module.exports = registry;
})(globalThis, function (registry) {
  'use strict';
  // Routing and recovery kernels: loadBalancer, rateLimiter, circuitBreaker, retry, fallback.
  // Every kernel reads parameters through ctx.p on each use and keeps JSON-safe state in ctx.k.
  const MS = 1000;
  const WINDOW_BUCKETS = 10;
  const TOKEN_EPSILON = 1e-9;
  const FNV_OFFSET = 2166136261;
  const FNV_PRIME = 16777619;
  // Client errors are the caller's fault: they never count against a dependency and are never retried.
  const NON_RETRYABLE = Object.freeze(['invalid', 'hop-limit']);
  const isDependencyFailure = result => !result.ok && !NON_RETRYABLE.includes(result.err);

  function hashKey(value) {
    let h = FNV_OFFSET;
    const text = String(value);
    for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, FNV_PRIME); }
    return h >>> 0;
  }

  // Reply to the caller with the downstream outcome, preserving payload shape and kernel fields.
  function passThrough(ctx, job, result, extraFields) {
    const msg = result.msg || {};
    const fields = { ...(msg.fields || {}), ...(extraFields || {}) };
    if (result.ok) {
      const out = { ok: true, fields };
      if (Number.isFinite(msg.kb)) out.kb = msg.kb;
      if (msg.ptype) out.ptype = msg.ptype;
      if (Number.isFinite(msg.tokens)) out.tokens = msg.tokens;
      ctx.reply(job, out);
    } else ctx.reply(job, { ok: false, err: result.err || 'error', fields });
  }

  function firstEdge(ctx, portId) { const list = ctx.edges(portId); return list.length ? list[0] : null; }

  // Send a request downstream. The core returns no call id for async edges, which never report
  // back, so the kernel acknowledges at once; otherwise onResult receives the outcome.
  function forward(ctx, job, edge, timeoutMs, slot) {
    if (ctx.call(job, edge.id, {}, { timeoutMs, retries: 0, slot }) !== null) return true;
    ctx.reply(job, { ok: true });
    return false;
  }

  // Rolling window of time buckets; the bucket width follows the live window parameter.
  function rollAdd(win, t, windowSec, key, n) {
    const width = windowSec / WINDOW_BUCKETS;
    const cutoff = t - windowSec;
    while (win.length && win[0].end <= cutoff) win.shift();
    let last = win[win.length - 1];
    if (!last || t >= last.end) {
      let start = Math.floor(t / width) * width;
      if (start + width <= t) start += width;
      last = { end: start + width };
      win.push(last);
    }
    last[key] = (last[key] || 0) + (n === undefined ? 1 : n);
  }
  function rollSum(win, t, windowSec, key) {
    const cutoff = t - windowSec;
    let sum = 0;
    for (const bucket of win) if (bucket.end > cutoff) sum += bucket[key] || 0;
    return sum;
  }

  function bucketRefill(bucket, t, ratePerSec, burst) {
    bucket.tokens = Math.min(burst, bucket.tokens + Math.max(0, t - bucket.last) * ratePerSec);
    bucket.last = t;
  }
  function bucketTake(bucket) {
    if (bucket.tokens < 1 - TOKEN_EPSILON) return false;
    bucket.tokens = Math.max(0, bucket.tokens - 1);
    return true;
  }

  // ---------------------------------------------------------------- loadBalancer
  // The station models connections: a worker is held from routing until the backend reply.
  function lbBackend(k, edgeId) {
    if (!k.backends[edgeId]) k.backends[edgeId] = { out: 0, errs: 0, ejectedUntil: null, sent: 0, failed: 0, ejections: 0, gen: 0 };
    return k.backends[edgeId];
  }
  function lbUsable(ctx, edge) {
    const b = lbBackend(ctx.k, edge.id);
    return ctx.edgeUsable(edge.id) && (b.ejectedUntil === null || ctx.t >= b.ejectedUntil);
  }
  function lbPick(ctx, msg, tried) {
    const all = ctx.edges('backends');
    const usable = all.filter(edge => lbUsable(ctx, edge));
    if (!usable.length) return { edge: null, reason: 'none' };
    const fresh = usable.filter(edge => !tried.includes(edge.id));
    if (!fresh.length) return { edge: null, reason: 'exhausted' };
    const k = ctx.k, strategy = ctx.p.strategy;
    if (strategy === 'random') return { edge: fresh[Math.floor(ctx.rand() * fresh.length) % fresh.length] };
    if (strategy === 'hash') {
      const key = msg.key !== undefined && msg.key !== null ? msg.key : msg.trace;
      const start = hashKey(key) % all.length;
      for (let i = 0; i < all.length; i += 1) {
        const edge = all[(start + i) % all.length];
        if (fresh.includes(edge)) return { edge };
      }
    }
    if (strategy === 'least-outstanding') {
      // Ties rotate with the round-robin cursor so equal backends share load.
      const offset = k.cursor % fresh.length;
      let best = null;
      for (let i = 0; i < fresh.length; i += 1) {
        const edge = fresh[(offset + i) % fresh.length];
        if (!best || lbBackend(k, edge.id).out < lbBackend(k, best.id).out) best = edge;
      }
      k.cursor += 1;
      return { edge: best };
    }
    for (let i = 0; i < all.length; i += 1) {
      const edge = all[(k.cursor + i) % all.length];
      if (fresh.includes(edge)) { k.cursor = (k.cursor + i + 1) % all.length; return { edge }; }
    }
    return { edge: fresh[0] };
  }
  function lbDispatch(ctx, job, tried, attempt, lastErr) {
    const choice = lbPick(ctx, job.msg, tried);
    if (!choice.edge) {
      if (choice.reason === 'none') ctx.k.unavailable += 1;
      ctx.reply(job, { ok: false, err: lastErr || 'unavailable' });
      return;
    }
    const b = lbBackend(ctx.k, choice.edge.id);
    b.sent += 1;
    if (attempt > 1) ctx.k.retries += 1;
    const waits = forward(ctx, job, choice.edge, ctx.p.callTimeoutMs, { b: choice.edge.id, tried: [...tried, choice.edge.id], n: attempt });
    if (waits) b.out += 1;
  }
  function lbEject(ctx, edgeId, b) {
    b.ejectedUntil = ctx.t + ctx.p.ejectSec;
    b.ejections += 1;
    b.gen += 1;
    ctx.k.ejections += 1;
    ctx.log('eject', `Ejected backend ${edgeId} after ${b.errs} consecutive errors for ${ctx.p.ejectSec} s`);
    ctx.wake(ctx.p.ejectSec, { kind: 'readmit', edgeId, gen: b.gen });
  }

  registry.register({
    id: 'loadBalancer',
    station: { concurrency: 'concurrency', queueCapacity: 'queueCapacity' },
    init: () => ({ cursor: 0, backends: {}, bucket: null, rateLimited: 0, unavailable: 0, retries: 0, ejections: 0 }),
    onRequest(ctx, job) {
      const p = ctx.p, k = ctx.k;
      if (p.rateLimitPerSec > 0) {
        if (!k.bucket) k.bucket = { tokens: p.rateBurst, last: ctx.t };
        bucketRefill(k.bucket, ctx.t, p.rateLimitPerSec, p.rateBurst);
        if (!bucketTake(k.bucket)) {
          k.rateLimited += 1;
          ctx.reply(job, { ok: false, err: 'rate-limited' });
          return;
        }
      }
      ctx.admit(job, ctx.serviceMs(p.serviceMs, 'constant', 0));
    },
    onServed(ctx, job) { lbDispatch(ctx, job, [], 1, null); },
    onResult(ctx, job, slot, result) {
      const p = ctx.p, b = lbBackend(ctx.k, slot.b);
      b.out = Math.max(0, b.out - 1);
      if (result.ok || !isDependencyFailure(result)) {
        if (result.ok) b.errs = 0;
        passThrough(ctx, job, result);
        return;
      }
      b.errs += 1;
      b.failed += 1;
      if (p.healthChecks && b.errs >= p.ejectAfterErrors && (b.ejectedUntil === null || ctx.t >= b.ejectedUntil)) lbEject(ctx, slot.b, b);
      if (slot.n <= p.retries) lbDispatch(ctx, job, slot.tried, slot.n + 1, result.err);
      else passThrough(ctx, job, result);
    },
    onWake(ctx, payload) {
      if (payload.kind !== 'readmit') return;
      const b = lbBackend(ctx.k, payload.edgeId);
      if (b.gen !== payload.gen) return;
      b.ejectedUntil = null;
      b.errs = 0;
      ctx.log('readmit', `Readmitted backend ${payload.edgeId}`);
    },
    onFault(ctx) {
      if (!ctx.fault.down) return;
      for (const b of Object.values(ctx.k.backends)) b.out = 0;
    },
    observe(ctx) {
      const k = ctx.k, all = ctx.edges('backends');
      const usable = all.filter(edge => ctx.edgeUsable(edge.id) && !(k.backends[edge.id] && k.backends[edge.id].ejectedUntil !== null && ctx.t < k.backends[edge.id].ejectedUntil));
      const detail = { Strategy: ctx.p.strategy, 'Healthy backends': `${usable.length}/${all.length}`, Ejections: k.ejections, Retries: k.retries, Unavailable: k.unavailable };
      if (ctx.p.rateLimitPerSec > 0) detail['Rate limited'] = k.rateLimited;
      for (const edge of all) {
        const b = k.backends[edge.id];
        if (!b) continue;
        const ejected = b.ejectedUntil !== null && ctx.t < b.ejectedUntil;
        detail[`Backend ${edge.id}`] = `${b.sent} sent, ${b.out} open${ejected ? ', ejected' : ''}`;
      }
      return usable.length < all.length ? { health: 'degraded', detail } : { detail };
    },
  });

  // ---------------------------------------------------------------- rateLimiter
  // Token bucket; queued work waits in kernel state and drains as tokens refill via ctx.wake.
  function rlRefill(ctx) {
    const k = ctx.k, p = ctx.p;
    if (!k.bucket) k.bucket = { tokens: p.burst, last: ctx.t };
    bucketRefill(k.bucket, ctx.t, p.ratePerSec, p.burst);
  }
  function rlForward(ctx, job) {
    ctx.k.admitted += 1;
    forward(ctx, job, firstEdge(ctx, 'out'), ctx.p.callTimeoutMs, { kind: 'admitted' });
  }
  function rlScheduleDrain(ctx) {
    const k = ctx.k;
    if (k.drainAt !== null || !k.queue.length) return;
    const delay = Math.max(0, (1 - k.bucket.tokens) / ctx.p.ratePerSec);
    k.drainAt = ctx.t + delay;
    ctx.wake(delay, { kind: 'drain', epoch: k.epoch });
  }

  registry.register({
    id: 'rateLimiter',
    station: null,
    init: () => ({ bucket: null, queue: [], drainAt: null, epoch: 0, admitted: 0, rateLimited: 0, queuedTotal: 0, maxQueued: 0 }),
    onRequest(ctx, job) {
      const k = ctx.k, p = ctx.p;
      rlRefill(ctx);
      if (!k.queue.length && bucketTake(k.bucket)) { rlForward(ctx, job); return; }
      if (p.overflow === 'queue' && k.queue.length < p.queueCapacity) {
        k.queue.push(job);
        k.queuedTotal += 1;
        k.maxQueued = Math.max(k.maxQueued, k.queue.length);
        rlScheduleDrain(ctx);
        return;
      }
      k.rateLimited += 1;
      ctx.reply(job, { ok: false, err: 'rate-limited' });
    },
    onResult(ctx, job, slot, result) { passThrough(ctx, job, result); },
    onWake(ctx, payload) {
      const k = ctx.k;
      if (payload.kind !== 'drain' || payload.epoch !== k.epoch) return;
      k.drainAt = null;
      rlRefill(ctx);
      while (k.queue.length && bucketTake(k.bucket)) rlForward(ctx, k.queue.shift());
      rlScheduleDrain(ctx);
    },
    onFault(ctx) {
      // A crash resets in-flight work in the core, which includes the queued jobs held here.
      if (!ctx.fault.down) return;
      const k = ctx.k;
      k.queue = [];
      k.drainAt = null;
      k.epoch += 1;
    },
    observe(ctx) {
      const k = ctx.k, p = ctx.p;
      const tokens = k.bucket ? Math.min(p.burst, k.bucket.tokens + Math.max(0, ctx.t - k.bucket.last) * p.ratePerSec) : p.burst;
      const detail = { Tokens: Math.floor(tokens), Admitted: k.admitted, 'Rate limited': k.rateLimited };
      if (p.overflow === 'queue') { detail.Queued = k.queue.length; detail['Peak queued'] = k.maxQueued; }
      return { detail };
    },
  });

  // ---------------------------------------------------------------- circuitBreaker
  // closed -> open when the rolling failure fraction over at least minRequests reaches the threshold;
  // open -> half-open after openSec; half-open admits halfOpenProbes probes: all succeed -> closed, any fails -> open.
  function cbOpen(ctx, reason) {
    const k = ctx.k;
    k.state = 'open';
    k.gen += 1;
    k.opens += 1;
    k.probesSent = 0;
    k.probesOk = 0;
    ctx.log('circuit-open', `Circuit opened: ${reason}`);
    ctx.wake(ctx.p.openSec, { kind: 'half-open', gen: k.gen });
  }
  function cbClose(ctx) {
    const k = ctx.k;
    k.state = 'closed';
    k.gen += 1;
    k.win = [];
    ctx.log('circuit-close', 'Circuit closed after successful probes');
  }
  function cbShortCircuit(ctx, job) {
    const k = ctx.k;
    k.shortCircuited += 1;
    const fb = firstEdge(ctx, 'fallback');
    if (fb && ctx.edgeUsable(fb.id)) { k.fallbackCalls += 1; forward(ctx, job, fb, ctx.p.callTimeoutMs, { kind: 'fallback' }); return; }
    ctx.reply(job, { ok: false, err: 'circuit-open' });
  }

  registry.register({
    id: 'circuitBreaker',
    station: null,
    init: () => ({ state: 'closed', gen: 0, win: [], probesSent: 0, probesOk: 0, opens: 0, shortCircuited: 0, fallbackCalls: 0 }),
    onRequest(ctx, job) {
      const k = ctx.k, p = ctx.p, protectedEdge = firstEdge(ctx, 'protected');
      if (k.state === 'open') { cbShortCircuit(ctx, job); return; }
      if (k.state === 'half-open') {
        if (k.probesSent >= p.halfOpenProbes) { cbShortCircuit(ctx, job); return; }
        k.probesSent += 1;
        forward(ctx, job, protectedEdge, p.callTimeoutMs, { kind: 'probe', gen: k.gen });
        return;
      }
      forward(ctx, job, protectedEdge, p.callTimeoutMs, { kind: 'closed', gen: k.gen });
    },
    onResult(ctx, job, slot, result) {
      const k = ctx.k, p = ctx.p;
      if (slot.kind === 'fallback') { passThrough(ctx, job, result, { degraded: true }); return; }
      const failed = isDependencyFailure(result);
      if (slot.gen === k.gen && slot.kind === 'probe' && k.state === 'half-open') {
        if (failed) cbOpen(ctx, `half-open probe failed with ${result.err}`);
        else { k.probesOk += 1; if (k.probesOk >= p.halfOpenProbes) cbClose(ctx); }
      } else if (slot.gen === k.gen && slot.kind === 'closed' && k.state === 'closed') {
        rollAdd(k.win, ctx.t, p.windowSec, failed ? 'fail' : 'ok');
        const fails = rollSum(k.win, ctx.t, p.windowSec, 'fail');
        const total = fails + rollSum(k.win, ctx.t, p.windowSec, 'ok');
        if (total >= p.minRequests && fails / total >= p.failureThreshold) cbOpen(ctx, `${fails}/${total} failures in ${p.windowSec} s`);
      }
      passThrough(ctx, job, result);
    },
    onWake(ctx, payload) {
      const k = ctx.k;
      if (payload.kind !== 'half-open' || payload.gen !== k.gen || k.state !== 'open') return;
      k.state = 'half-open';
      k.gen += 1;
      k.probesSent = 0;
      k.probesOk = 0;
      ctx.log('circuit-half-open', 'Circuit half-open: probing the protected dependency');
    },
    observe(ctx) {
      const k = ctx.k, p = ctx.p;
      const fails = rollSum(k.win, ctx.t, p.windowSec, 'fail');
      const total = fails + rollSum(k.win, ctx.t, p.windowSec, 'ok');
      const detail = { State: k.state, 'Window failures': `${fails}/${total}`, Opens: k.opens, 'Short-circuited': k.shortCircuited };
      if (firstEdge(ctx, 'fallback')) detail['Fallback calls'] = k.fallbackCalls;
      if (k.state === 'open') return { health: 'open', detail };
      if (k.state === 'half-open') return { health: 'degraded', detail };
      return { detail };
    },
  });

  // ---------------------------------------------------------------- retry
  // Attempts are explicit so the rolling retry budget can veto each retry:
  // retries in the window may not exceed retryBudget times the requests in the window.
  function retryAttempt(ctx, job, n) {
    forward(ctx, job, firstEdge(ctx, 'target'), ctx.p.attemptTimeoutMs, { n, epoch: ctx.k.epoch });
  }
  function deadlineOf(msg) { return Number.isFinite(msg.deadline) && msg.deadline > 0 ? msg.deadline : null; }

  registry.register({
    id: 'retry',
    station: null,
    init: () => ({ win: [], epoch: 0, requests: 0, retries: 0, budgetExhausted: 0, gaveUp: 0, recovered: 0 }),
    onRequest(ctx, job) {
      const k = ctx.k;
      k.requests += 1;
      rollAdd(k.win, ctx.t, ctx.p.budgetWindowSec, 'req');
      retryAttempt(ctx, job, 1);
    },
    onResult(ctx, job, slot, result) {
      const k = ctx.k, p = ctx.p;
      if (result.ok) { if (slot.n > 1) k.recovered += 1; passThrough(ctx, job, result); return; }
      if (!isDependencyFailure(result) || slot.n >= p.maxAttempts) {
        if (slot.n >= p.maxAttempts) k.gaveUp += 1;
        passThrough(ctx, job, result);
        return;
      }
      const retriesInWindow = rollSum(k.win, ctx.t, p.budgetWindowSec, 'retry');
      const requestsInWindow = rollSum(k.win, ctx.t, p.budgetWindowSec, 'req');
      if (retriesInWindow + 1 > p.retryBudget * requestsInWindow) {
        k.budgetExhausted += 1;
        passThrough(ctx, job, result);
        return;
      }
      const ceilingMs = p.backoffMs * Math.pow(p.backoffMultiplier, slot.n - 1);
      const delaySec = (p.retryJitter ? ctx.rand() * ceilingMs : ceilingMs) / MS;
      const deadline = deadlineOf(job.msg);
      if (deadline !== null && ctx.t + delaySec >= deadline) { k.gaveUp += 1; passThrough(ctx, job, result); return; }
      rollAdd(k.win, ctx.t, p.budgetWindowSec, 'retry');
      k.retries += 1;
      ctx.wake(delaySec, { kind: 'retry', job, n: slot.n + 1, epoch: k.epoch });
    },
    onWake(ctx, payload) {
      if (payload.kind !== 'retry' || payload.epoch !== ctx.k.epoch) return;
      retryAttempt(ctx, payload.job, payload.n);
    },
    onFault(ctx) { if (ctx.fault.down) ctx.k.epoch += 1; },
    observe(ctx) {
      const k = ctx.k, p = ctx.p;
      const req = rollSum(k.win, ctx.t, p.budgetWindowSec, 'req'), ret = rollSum(k.win, ctx.t, p.budgetWindowSec, 'retry');
      return { detail: { Requests: k.requests, Retries: k.retries, 'Budget exhausted': k.budgetExhausted, 'Gave up': k.gaveUp, Recovered: k.recovered, 'Window retry ratio': req ? Number((ret / req).toFixed(3)) : 0 } };
    },
  });

  // ---------------------------------------------------------------- fallback
  // per-request: primary, then fallback on failure (fields.degraded).
  // sticky-failover: requests follow the active side; detectAfterFailures consecutive primary
  // failures switch to the fallback, and failbackSec later traffic returns to the primary.
  function fbSwitch(ctx, to, reason) {
    const k = ctx.k;
    k.active = to;
    k.gen += 1;
    k.switches += 1;
    k.fails = 0;
    ctx.log(to === 'fallback' ? 'failover' : 'failback', `Switched to ${to}: ${reason}`);
    if (to === 'fallback') ctx.wake(ctx.p.failbackSec, { kind: 'failback', gen: k.gen });
  }

  registry.register({
    id: 'fallback',
    station: null,
    init: () => ({ active: 'primary', gen: 0, fails: 0, switches: 0, degraded: 0, primaryFailures: 0 }),
    onRequest(ctx, job) {
      const k = ctx.k, p = ctx.p;
      if (p.mode === 'sticky-failover' && k.active === 'fallback') {
        forward(ctx, job, firstEdge(ctx, 'fallback'), p.fallbackTimeoutMs, { leg: 'fallback', gen: k.gen });
        return;
      }
      forward(ctx, job, firstEdge(ctx, 'primary'), p.primaryTimeoutMs, { leg: 'primary', gen: k.gen });
    },
    onResult(ctx, job, slot, result) {
      const k = ctx.k, p = ctx.p;
      if (slot.leg === 'fallback') {
        if (result.ok) k.degraded += 1;
        passThrough(ctx, job, result, result.ok ? { degraded: true } : undefined);
        return;
      }
      const failed = isDependencyFailure(result);
      if (failed) k.primaryFailures += 1;
      if (p.mode === 'per-request') {
        if (failed) forward(ctx, job, firstEdge(ctx, 'fallback'), p.fallbackTimeoutMs, { leg: 'fallback', gen: k.gen });
        else passThrough(ctx, job, result);
        return;
      }
      if (slot.gen === k.gen && k.active === 'primary') {
        if (failed) { k.fails += 1; if (k.fails >= p.detectAfterFailures) fbSwitch(ctx, 'fallback', `${k.fails} consecutive primary failures`); }
        else if (result.ok) k.fails = 0;
      }
      passThrough(ctx, job, result);
    },
    onWake(ctx, payload) {
      const k = ctx.k;
      if (payload.kind !== 'failback' || payload.gen !== k.gen || k.active !== 'fallback') return;
      fbSwitch(ctx, 'primary', `fail back after ${ctx.p.failbackSec} s`);
    },
    observe(ctx) {
      const k = ctx.k, p = ctx.p;
      const detail = { Mode: p.mode, 'Primary failures': k.primaryFailures, 'Degraded replies': k.degraded };
      if (p.mode === 'sticky-failover') { detail.Active = k.active; detail.Switches = k.switches; }
      return p.mode === 'sticky-failover' && k.active === 'fallback' ? { health: 'degraded', detail } : { detail };
    },
  });
});
