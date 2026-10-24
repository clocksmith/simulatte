(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const registry = node ? require('./kernel-registry.js') : root.SimulatteSystemDiagramKernels;
  factory(registry);
  if (node) module.exports = registry;
})(globalThis, function (registry) {
  'use strict';
  // Scheduled and crawling sources: cron and crawler. Each creates logical requests through
  // beginRequest/endRequest, owns one job per request (finished with ctx.reply), uses only ctx
  // timers and the node RNG stream, and keeps job ids, never job objects, in kernel state.
  // On crash the engine replies 'down' to the jobs and ends their requests; the kernels drop
  // their records, fence old timers by epoch and resume on repair.

  const MS_PER_SEC = 1000;
  const BACKOFF_MULTIPLIER = 2;          // job and fetch retry backoff growth
  const FETCH_REQUEST_KB = 0.5;          // HTTP GET request size, also the smallest page
  const TOKENS_PER_KB = 256;             // fetched page text density (4 bytes per token)
  const THROTTLE_BACKOFF_FACTOR = 2;     // per-domain delay growth after each rate-limited reply
  const THROTTLE_MAX_FACTOR = 64;        // cap on the throttle delay as a multiple of its base
  const THROTTLE_MIN_MS = 1000;          // throttle delay base when politenessMs is shorter
  const TIME_EPSILON_SEC = 1e-9;
  const READ_PAYLOADS = Object.freeze(['query', 'embedding']);

  const ms = value => value / MS_PER_SEC;
  const isCrash = (ctx, fault, active) => fault.type === 'crash' && active && ctx.fault.down;

  function retryOptions(p, slot) {
    return { timeoutMs: p.timeoutMs, retries: p.retries, backoffMs: p.retryBackoffMs, multiplier: BACKOFF_MULTIPLIER, jitter: true, slot };
  }

  function finish(ctx, job, ok, err) {
    ctx.endRequest(job.msg, ok ? { ok: true } : { ok: false, err });
    ctx.reply(job, ok ? { ok: true } : { ok: false, err });
  }

  // Round-robin over the port's edges, skipping partitioned edges while another is usable.
  function nextEdge(ctx, portId) {
    const edges = ctx.edges(portId), k = ctx.k;
    if (!edges.length) return null;
    for (let i = 0; i < edges.length; i += 1) {
      const edge = edges[(k.rr + i) % edges.length];
      if (ctx.edgeUsable(edge.id)) { k.rr = (k.rr + i + 1) % edges.length; return edge; }
    }
    const edge = edges[k.rr % edges.length];
    k.rr = (k.rr + 1) % edges.length;
    return edge;
  }

  // ---- Cron ----
  // Nominal runs at offsetSec + n * everySec (everySec read at each tick). A run starts after a
  // uniform delay in [0, jitterMs] and fires jobsPerFire logical requests, each sent on the next
  // 'out' edge round-robin with timeoutMs, retries and retryBackoffMs. overlap 'skip' skips a run
  // while any job of an earlier run is outstanding and counts it. Runs at or after stopSec (> 0)
  // never fire. Runs whose nominal time passes while crashed are counted as missed.

  function cronFire(ctx, run) {
    const p = ctx.p, k = ctx.k;
    if (p.overlap === 'skip' && k.outstanding > 0) { k.skipped += 1; ctx.log('cron', `run ${run} skipped: previous run still active`); return; }
    k.runs += 1;
    for (let i = 0; i < p.jobsPerFire; i += 1) {
      const msg = ctx.message({ ptype: p.payload, kb: p.requestKb, op: READ_PAYLOADS.includes(p.payload) ? 'read' : 'write' });
      ctx.beginRequest(msg);
      k.fired += 1;
      const edge = nextEdge(ctx, 'out');
      if (!edge) { k.failed += 1; ctx.endRequest(msg, { ok: false, err: 'unavailable' }); continue; }
      const job = ctx.newJob(msg);
      if (ctx.call(job, edge.id, {}, retryOptions(p, 'job')) === null) { k.succeeded += 1; finish(ctx, job, true); continue; }
      k.jobs[job.id] = run;
      k.outstanding += 1;
    }
  }

  registry.register({
    id: 'cron',
    station: null,
    init: () => ({ nextRun: 0, nextAt: 0, runs: 0, skipped: 0, missed: 0, fired: 0, succeeded: 0, failed: 0, outstanding: 0, jobs: {}, rr: 0, epoch: 0, stopped: false }),
    start(ctx) {
      ctx.k.nextAt = ctx.p.offsetSec;
      ctx.wake(ctx.p.offsetSec, { kind: 'tick', run: 0 });
    },
    onWake(ctx, payload) {
      const p = ctx.p, k = ctx.k;
      if (payload.kind === 'fire') { if (payload.epoch === k.epoch) cronFire(ctx, payload.run); return; }
      if (payload.kind !== 'tick' || payload.run !== k.nextRun || k.stopped) return;
      // A tick parked while crashed arrives at repair time: skip the runs that were missed.
      const late = ctx.t > k.nextAt + TIME_EPSILON_SEC;
      const run = k.nextRun;
      while (k.nextAt <= ctx.t + TIME_EPSILON_SEC) {
        if (p.stopSec > 0 && k.nextAt >= p.stopSec) { k.stopped = true; return; }
        if (late) k.missed += 1;
        k.nextAt += p.everySec;
        k.nextRun += 1;
      }
      ctx.wake(k.nextAt - ctx.t, { kind: 'tick', run: k.nextRun });
      if (late) return;
      if (p.jitterMs > 0) ctx.wake(ms(ctx.rand() * p.jitterMs), { kind: 'fire', run, epoch: k.epoch });
      else cronFire(ctx, run);
    },
    onResult(ctx, job, slot, result) {
      const k = ctx.k;
      if (!Object.hasOwn(k.jobs, job.id)) return;
      delete k.jobs[job.id];
      k.outstanding -= 1;
      if (result.ok) k.succeeded += 1; else k.failed += 1;
      finish(ctx, job, result.ok, result.err);
    },
    onFault(ctx, fault, active) {
      const k = ctx.k;
      if (!isCrash(ctx, fault, active)) return;
      k.failed += k.outstanding;
      k.epoch += 1; k.jobs = {}; k.outstanding = 0;
    },
    observe(ctx) {
      const k = ctx.k;
      const detail = { runs: k.runs, jobs: k.fired, outstanding: k.outstanding, succeeded: k.succeeded, failed: k.failed };
      if (ctx.p.overlap === 'skip') detail['skipped runs'] = k.skipped;
      if (k.missed) detail['missed runs'] = k.missed;
      if (k.stopped) detail.state = 'stopped';
      return { detail };
    },
  });

  // ---- Crawler ----
  // The frontier counts unfetched URLs per domain; seedUrls (at most maxPages) are spread
  // round-robin across domains. At most fetchConcurrency fetches are in flight, at most one per
  // domain, and a domain waits politenessMs (times the slow factor) after each fetch. A
  // 'rate-limited' result puts the URL back and sets that domain's delay to
  // max(politenessMs, THROTTLE_MIN_MS) * THROTTLE_BACKOFF_FACTOR^n (capped); success resets it.
  // Each fetched page discovers poisson(linksPerPage) links; each is already seen with
  // probability duplicateRate, otherwise it joins a random domain while known pages < maxPages.
  // Each page is one logical request: a fetch on the next 'fetch' edge (timeoutMs, retries,
  // retryBackoffMs), then a document (kb ~ exponential(pageKbMean)) on every 'documents' edge.
  // Sync document edges are awaited before the request ends; async edges fire and forget.
  // No fetch starts at or after stopSec (> 0).

  function crawlerInit(ctx) {
    const p = ctx.p;
    const frontier = new Array(p.domains).fill(0);
    const known = Math.min(p.seedUrls, p.maxPages);
    for (let i = 0; i < known; i += 1) frontier[i % p.domains] += 1;
    return { frontier, nextAllowed: new Array(p.domains).fill(0), throttle: new Array(p.domains).fill(0), busy: new Array(p.domains).fill(false),
      known, fetchSequence: 0, throttleRetries: new Array(p.domains).fill(0), throttleExhausted: 0, inFlight: 0, fetches: {}, docs: {}, cursor: 0, rr: 0, wakeAt: null, wakeGen: 0, epoch: 0,
      fetched: 0, duplicates: 0, discovered: 0, throttled: 0, failed: 0, documents: 0, documentFailures: 0, stopped: false };
  }

  function crawlerPump(ctx) {
    const p = ctx.p, k = ctx.k;
    if (ctx.fault.down || k.stopped) return;
    if (p.stopSec > 0 && ctx.t >= p.stopSec) { k.stopped = true; return; }
    if (!ctx.edges('fetch').length) return;
    const domains = k.frontier.length;
    let earliest = Infinity;
    for (let scanned = 0; scanned < domains && k.inFlight < p.fetchConcurrency; scanned += 1) {
      const d = (k.cursor + scanned) % domains;
      if (!k.frontier[d] || k.busy[d]) continue;
      if (k.nextAllowed[d] > ctx.t + TIME_EPSILON_SEC) { earliest = Math.min(earliest, k.nextAllowed[d]); continue; }
      crawlerFetch(ctx, d);
    }
    k.cursor = (k.cursor + 1) % domains;
    if (k.inFlight < p.fetchConcurrency && earliest < Infinity && earliest !== k.wakeAt) {
      k.wakeAt = earliest;
      k.wakeGen += 1;
      ctx.wake(Math.max(0, earliest - ctx.t), { kind: 'pump', gen: k.wakeGen, epoch: k.epoch });
    }
  }

  function crawlerFetch(ctx, d) {
    const k = ctx.k, edge = nextEdge(ctx, 'fetch');
    k.frontier[d] -= 1;
    k.busy[d] = true;
    k.inFlight += 1;
    const fetchId = `${ctx.nodeId}:synthetic-fetch-${++k.fetchSequence}`;
    const msg = ctx.message({ ptype: 'http', kb: FETCH_REQUEST_KB, op: 'read', key: `domain-${d}`, fields: { synthetic: true, originId: `domain-${d}`, fetchId, provenance: [{ sourceNodeId: ctx.nodeId, originId: `domain-${d}`, fetchId }] } });
    ctx.beginRequest(msg);
    const job = ctx.newJob(msg);
    k.fetches[job.id] = d;
    if (ctx.call(job, edge.id, {}, retryOptions(ctx.p, 'fetch')) === null) {
      // An async fetch edge returns no page: the URL is spent without a document.
      delete k.fetches[job.id];
      crawlerFetched(ctx, job, d, { ok: false, err: 'unavailable' });
    }
  }

  function crawlerDiscover(ctx) {
    const p = ctx.p, k = ctx.k, links = ctx.poisson(p.linksPerPage);
    for (let i = 0; i < links; i += 1) {
      if (ctx.rand() < p.duplicateRate) { k.duplicates += 1; continue; }
      const d = Math.min(k.frontier.length - 1, Math.floor(ctx.rand() * k.frontier.length));
      if (k.known >= p.maxPages) continue;
      k.known += 1;
      k.discovered += 1;
      k.frontier[d] += 1;
    }
  }

  function crawlerEmit(ctx, job) {
    const k = ctx.k, p = ctx.p;
    const kb = Math.max(FETCH_REQUEST_KB, ctx.exp(p.pageKbMean));
    const patch = { ptype: 'document', op: 'write', kb, tokens: Math.round(kb * TOKENS_PER_KB), fields: { ...job.msg.fields, fetchedAtSec: ctx.t } };
    let pending = 0;
    ctx.edges('documents').forEach((edge, i) => {
      k.documents += 1;
      if (ctx.call(job, edge.id, patch, { timeoutMs: p.timeoutMs, retries: 0, slot: `doc:${i}` }) !== null) pending += 1;
    });
    if (!pending) { finish(ctx, job, true); return; }
    k.docs[job.id] = { pending, err: null };
  }

  function crawlerFetched(ctx, job, d, result) {
    const p = ctx.p, k = ctx.k;
    k.inFlight -= 1;
    k.busy[d] = false;
    if (result.ok) {
      k.fetched += 1;
      k.throttle[d] = 0; k.throttleRetries[d] = 0;
      k.nextAllowed[d] = ctx.t + ms(p.politenessMs) * ctx.fault.slowFactor;
      crawlerDiscover(ctx);
      crawlerEmit(ctx, job);
      return;
    }
    if (result.err === 'rate-limited') {
      const base = Math.max(p.politenessMs, THROTTLE_MIN_MS);
      k.throttled += 1;
      if (k.throttleRetries[d] < p.maxThrottleRetries) { k.frontier[d] += 1; k.throttleRetries[d]++; } else { k.throttleExhausted++; k.failed++; ctx.log('crawler-retry-exhausted', `Rate-limit redrive budget exhausted for domain-${d}`); }
      k.throttle[d] = Math.min(base * THROTTLE_MAX_FACTOR, (k.throttle[d] || base) * THROTTLE_BACKOFF_FACTOR);
      k.nextAllowed[d] = ctx.t + ms(k.throttle[d]) * ctx.fault.slowFactor;
    } else {
      k.failed += 1;
      k.nextAllowed[d] = ctx.t + ms(p.politenessMs) * ctx.fault.slowFactor;
    }
    finish(ctx, job, false, result.err);
  }

  registry.register({
    id: 'crawler',
    station: null,
    init: ctx => crawlerInit(ctx),
    start: ctx => crawlerPump(ctx),
    onWake(ctx, payload) {
      const k = ctx.k;
      if (payload.kind !== 'pump' || payload.epoch !== k.epoch || payload.gen !== k.wakeGen) return;
      k.wakeAt = null;
      crawlerPump(ctx);
    },
    onResult(ctx, job, slot, result) {
      const k = ctx.k;
      if (slot === 'fetch') {
        if (!Object.hasOwn(k.fetches, job.id)) return;
        const d = k.fetches[job.id];
        delete k.fetches[job.id];
        crawlerFetched(ctx, job, d, result);
        crawlerPump(ctx);
        return;
      }
      const doc = k.docs[job.id];
      if (!doc) return;
      doc.pending -= 1;
      if (!result.ok && !doc.err) { doc.err = result.err; k.documentFailures += 1; }
      if (doc.pending > 0) return;
      delete k.docs[job.id];
      finish(ctx, job, !doc.err, doc.err);
    },
    onFault(ctx, fault, active) {
      const k = ctx.k;
      if (isCrash(ctx, fault, active)) {
        for (const id of Object.keys(k.fetches)) { const d = k.fetches[id]; k.frontier[d] += 1; k.busy[d] = false; }
        k.epoch += 1; k.wakeAt = null; k.fetches = {}; k.docs = {}; k.inFlight = 0;
        return;
      }
      if (!ctx.fault.down) crawlerPump(ctx);
    },
    observe(ctx) {
      const k = ctx.k;
      const frontier = k.frontier.reduce((a, b) => a + b, 0);
      const detail = { frontier, 'pages fetched': k.fetched, 'in flight': `${k.inFlight}/${ctx.p.fetchConcurrency}`, 'duplicates skipped': k.duplicates, throttled: k.throttled, documents: k.documents };
      if (k.failed) detail['failed fetches'] = k.failed;
      if (k.throttleExhausted) detail['rate-limit budget exhausted'] = k.throttleExhausted;
      if (k.documentFailures) detail['failed documents'] = k.documentFailures;
      if (k.stopped) detail.state = 'stopped';
      else if (!frontier && !k.inFlight) detail.state = 'done';
      return { busy: k.inFlight, capacity: ctx.p.fetchConcurrency, detail };
    },
  });
});
