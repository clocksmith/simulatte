(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const registry = node ? require('./kernel-registry.js') : root.SimulatteSystemDiagramKernels;
  factory(registry);
  if (node) module.exports = registry;
})(globalThis, function (registry) {
  'use strict';
  function complete(ctx, job, ok, err) { ctx.endRequest(job.msg, { ok, err }); ctx.reply(job, { ok, err }); }
  function fireCron(ctx) {
    const k = ctx.k, p = ctx.p;
    if (p.stopSec && ctx.t >= p.stopSec) return;
    if (!ctx.fault.down && (p.overlap === 'allow' || k.active === 0)) {
      k.fires++; ctx.count('fires', 1);
      for (let i = 0; i < p.jobsPerFire; i++) {
        const msg = ctx.message({ ptype: p.payload, kb: p.requestKb, tokens: 0, key: k.issued, op: 'write', fields: { scheduler: ctx.nodeId, fire: k.fires } });
        const job = ctx.newJob(msg), edges = ctx.edges('out'); if (!job) return; k.issued++; k.active++; ctx.beginRequest(msg);
        job.data.cronLeft = edges.length; job.data.cronError = null;
        if (!edges.length) { k.active--; complete(ctx, job, false, 'unavailable'); }
        else {
          for (const edge of edges) {
            const async = ctx.edge(edge).params.mode === 'async';
            ctx.call(job, edge, {}, { timeoutMs: p.timeoutMs, retries: p.retries, backoffMs: p.retryBackoffMs, multiplier: 2, jitter: false, slot: 'job' });
            if (async) cronResult(ctx, job, 'job', { ok: true });
          }
        }
      }
    } else if (!ctx.fault.down) { k.skipped++; ctx.count('skippedOverlaps', 1); }
    ctx.wake(p.everySec + ctx.rand() * p.jitterMs / 1000, { kind: 'cron' });
  }
  function cronResult(ctx, job, slot, result) {
    if (!result.ok) job.data.cronError ||= result.err;
    if (--job.data.cronLeft === 0) { ctx.k.active--; complete(ctx, job, !job.data.cronError, job.data.cronError); }
  }
  registry.register({ id: 'cron', station: null,
    init: () => ({ active: 0, fires: 0, skipped: 0, issued: 0 }),
    start: ctx => ctx.wake(ctx.p.offsetSec, { kind: 'cron' }),
    onWake(ctx, payload) { if (payload.kind === 'cron') fireCron(ctx); },
    onResult: cronResult,
    onFault(ctx, fault, active) { if (['crash', 'outage'].includes(fault.type) && active) ctx.k.active = 0; },
    observe: ctx => ({ detail: { fires: ctx.k.fires, issued: ctx.k.issued, active: ctx.k.active, skippedOverlaps: ctx.k.skipped, model: 'finite-horizon synthetic interval scheduler; no host cron execution' } })
  });
  function scheduleCrawl(ctx, delay = 0) { if (!ctx.k.pumpScheduled) { ctx.k.pumpScheduled = true; ctx.wake(Math.max(delay, 1e-6), { kind: 'crawl', generation: ctx.k.generation }); } }
  function enqueueUrl(ctx, id) {
    const k = ctx.k; if (k.seen[`url:${id}`]) { k.duplicates++; return; }
    if (k.discovered >= ctx.p.maxPages) return;
    k.seen[`url:${id}`] = true; k.frontier.push({ id, domain: id % ctx.p.domains }); k.discovered++;
  }
  function pumpCrawl(ctx) {
    const k = ctx.k, p = ctx.p;
    if (ctx.fault.down || (p.stopSec && ctx.t >= p.stopSec)) return;
    while (k.active < p.fetchConcurrency && k.frontier.length && k.fetched + k.active < p.maxPages) {
      const index = k.frontier.findIndex(url => (k.nextDomain[url.domain] || 0) <= ctx.t);
      if (index < 0) { scheduleCrawl(ctx, Math.max(1e-6, Math.min(...k.frontier.map(url => k.nextDomain[url.domain] || 0)) - ctx.t)); return; }
      const url = k.frontier.splice(index, 1)[0], edges = ctx.edges('fetch'); k.nextDomain[url.domain] = ctx.t + p.politenessMs / 1000 * ctx.fault.slowFactor;
      const msg = ctx.message({ ptype: 'http', kb: 1, tokens: 0, key: url.id, op: 'read', fields: { urlId: url.id, domain: url.domain, synthetic: true } }), job = ctx.newJob(msg);
      if (!job) return; ctx.beginRequest(msg); k.active++;
      if (!edges.length) { k.active--; complete(ctx, job, false, 'unavailable'); continue; }
      const edge = edges[url.domain % edges.length];
      if (ctx.edge(edge).params.mode === 'async') { k.active--; complete(ctx, job, false, 'invalid'); ctx.log('unsupported-async-fetch', 'Crawler fetch requires a reply; use a sync fetch edge'); continue; }
      ctx.call(job, edge, {}, { timeoutMs: p.timeoutMs, retries: p.retries, backoffMs: p.retryBackoffMs, multiplier: 2, jitter: true, slot: 'fetch' });
    }
  }
  registry.register({ id: 'crawler', station: null,
    init: () => ({ frontier: [], seen: {}, nextDomain: {}, nextUrl: 0, discovered: 0, duplicates: 0, fetched: 0, active: 0, failed: 0, pumpScheduled: false, generation: 0 }),
    start(ctx) { for (let i = 0; i < Math.min(ctx.p.seedUrls, ctx.p.maxPages); i++) enqueueUrl(ctx, ctx.k.nextUrl++); scheduleCrawl(ctx); },
    onWake(ctx, payload) { if (payload.kind === 'crawl' && payload.generation === ctx.k.generation) { ctx.k.pumpScheduled = false; pumpCrawl(ctx); } },
    onResult(ctx, job, slot, result) {
      const k = ctx.k, p = ctx.p;
      if (slot === 'fetch') {
        k.active--; if (!result.ok) { k.failed++; complete(ctx, job, false, result.err); scheduleCrawl(ctx); return; }
        k.fetched++; ctx.count('fetchedPages', 1);
        const links = Math.min(p.maxPages, ctx.poisson(p.linksPerPage));
        for (let i = 0; i < links; i++) { const duplicate = ctx.rand() < p.duplicateRate; enqueueUrl(ctx, duplicate && k.nextUrl ? Math.floor(ctx.rand() * k.nextUrl) : k.nextUrl++); }
        const edges = ctx.edges('documents'), kb = p.pageKbMean, patch = { ptype: 'document', kb, tokens: Math.round(kb * 250), op: 'write', fields: { ...job.msg.fields, provenance: `${ctx.nodeId}/synthetic-url-${job.msg.key}` } };
        job.data.documentsLeft = edges.length; job.data.documentError = null;
        if (!edges.length) complete(ctx, job, true);
        else for (const edge of edges) { ctx.call(job, edge, patch, { timeoutMs: p.timeoutMs, retries: p.retries, backoffMs: p.retryBackoffMs, slot: 'document' }); if (ctx.edge(edge).params.mode === 'async') documentResult(ctx, job, { ok: true }); }
        scheduleCrawl(ctx);
      } else documentResult(ctx, job, result);
    },
    onFault(ctx, fault, active) { if (['crash', 'outage'].includes(fault.type)) { ctx.k.generation++; ctx.k.pumpScheduled = false; if (active) ctx.k.active = 0; else scheduleCrawl(ctx); } },
    observe: ctx => ({ detail: { frontier: ctx.k.frontier.length, fetchedPages: ctx.k.fetched, activeFetches: ctx.k.active, duplicates: ctx.k.duplicates, discovered: ctx.k.discovered, failed: ctx.k.failed, model: 'bounded synthetic URL identities, per-domain delay and provenance; no live scraping' } })
  });
  function documentResult(ctx, job, result) { if (!result.ok) job.data.documentError ||= result.err; if (--job.data.documentsLeft === 0) complete(ctx, job, !job.data.documentError, job.data.documentError); }
});
