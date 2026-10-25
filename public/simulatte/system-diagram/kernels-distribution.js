(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const registry = node ? require('./kernel-registry.js') : root.SimulatteSystemDiagramKernels;
  factory(registry, node ? require('./protocol-routing.js') : root.SimulatteSystemDiagramProtocolRouting);
  if (node) module.exports = registry;
})(globalThis, function (registry, routing) {
  'use strict';
  const MS = 1000, KIB_PER_MIB = 1024, KIB_PER_GIB = 1048576, REQUEST_KIB = 0.25;
  const BYTES_PER_KIB = 1024, BYTES_PER_KB = 1000;
  const toKB = kib => kib * BYTES_PER_KIB / BYTES_PER_KB;
  const toKiB = kb => kb * BYTES_PER_KB / BYTES_PER_KIB;
  const STATION = Object.freeze({ concurrency: 'concurrency', queueCapacity: 'queueCapacity' });
  const clone = value => JSON.parse(JSON.stringify(value));
  const own = (map, key) => Object.hasOwn(map, key) ? map[key] : null;
  const fail = (ctx, job, err = 'invalid', fields = {}) => ctx.reply(job, { ok: false, err, kb: 0, fields });
  function synchronous(node, compiled, ports) {
    for (const e of compiled.edges.filter(e => e.from === node.id && ports.includes(e.fromPort))) if (e.params.mode !== 'sync') throw Error(`${node.id}.${e.fromPort} requires synchronous delivery receipts`);
  }
  function service(ctx, job, ms) { if (ctx.p.errorRate > 0 && ctx.rand() < ctx.p.errorRate) { fail(ctx, job, 'error'); return false; } return ctx.admit(job, ms); }
  function firstEdge(ctx, port, index = 0) { const edges = ctx.edges(port); return edges.length ? edges[index % edges.length] : null; }
  function end(ctx, job, ok, err) { const r = ok ? { ok: true } : { ok: false, err: err || 'unavailable' }; ctx.endRequest(job.msg, r); ctx.reply(job, r); }
  function hash(value) { let h = 2166136261; for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
  function segmentKey(v) { return `asset-${v.assetId}:segment-${v.segment}`; }
  function segmentValid(v) { return v && Number.isInteger(v.assetId) && v.assetId >= 0 && Number.isInteger(v.segment) && v.segment >= 0 && Number.isFinite(v.segmentKiB) && v.segmentKiB > 0 && Number.isInteger(v.viewers) && v.viewers > 0 && v.viewers <= 1000000 && typeof v.cohortId === 'string'; }
  function contentId(v) { return `${segmentKey(v)}:${v.segmentKiB}KiB`; }
  function delivered(v, fields) { return fields?.videoSegment?.contentId === contentId(v) && fields.videoSegment.assetId === v.assetId && fields.videoSegment.segment === v.segment && fields.videoSegment.segmentKiB === v.segmentKiB; }
  function videoReply(ctx, job, v, viewers, source) { ctx.reply(job, { ok: true, ptype: 'blob', kb: toKB(viewers * v.segmentKiB), fields: { videoSegment: { assetId: v.assetId, segment: v.segment, segmentKiB: v.segmentKiB, contentId: contentId(v) }, servedViewers: viewers, source } }); }

  // One request represents a cohort downloading the same exact segment. Its bytes are multiplied
  // by viewers; playback waits for the cohort's last delivery, a conservative aggregation assumption.
  function viewerFetch(ctx, cohort) {
    const p = ctx.p, k = ctx.k;
    if (cohort.done || cohort.active || ctx.fault.down || !ctx.k.manifestReady) return;
    const v = { assetId: p.assetId, segment: cohort.segment, segmentKiB: p.segmentKiB, viewers: cohort.viewers, cohortId: cohort.id };
    const msg = ctx.message({ ptype: 'blob', kb: toKB(REQUEST_KIB), op: 'read', key: segmentKey(v), fields: { video: v, synthetic: true } });
    ctx.beginRequest(msg); const job = ctx.newJob(msg); cohort.active = job.id; k.requests[job.id] = { cohort: cohort.index, remaining: cohort.viewers };
    const peer = p.peerAssistance ? firstEdge(ctx, 'peers', cohort.index) : null;
    if (peer) ctx.call(job, peer.id, {}, { timeoutMs: p.peerTimeoutMs, retries: 0, slot: 'peer' });
    else viewerCdn(ctx, job);
  }
  function viewerCdn(ctx, job) {
    const r = ctx.k.requests[job.id], edge = firstEdge(ctx, 'cdn', r.cohort);
    ctx.k.cdnRequested += r.remaining;
    if (!edge) { viewerFinish(ctx, job, false, 'unavailable'); return; }
    ctx.call(job, edge.id, { fields: { video: { ...job.msg.fields.video, viewers: r.remaining } } }, { timeoutMs: ctx.p.timeoutMs, retries: ctx.p.retries, backoffMs: ctx.p.retryBackoffMs, slot: 'cdn' });
  }
  function viewerFinish(ctx, job, ok, err) {
    const k = ctx.k, r = k.requests[job.id], c = k.cohorts[r.cohort]; delete k.requests[job.id]; c.active = null;
    if (!ok) { c.done = true; c.failed = true; k.failedViewers += c.viewers; end(ctx, job, false, err); return; }
    const p = ctx.p;
    if (c.playAt === null) { c.playAt = ctx.t; c.startupSec = ctx.t - c.startedAt; k.startedViewers += c.viewers; k.startupViewerSec += c.startupSec * c.viewers; }
    else { const due = c.playAt + c.segment * p.segmentDurationSec + c.rebufferSec, stall = Math.max(0, ctx.t - due); c.rebufferSec += stall; k.rebufferViewerSec += stall * c.viewers; }
    k.deliveredSegments += c.viewers; c.segment++;
    if (p.peerAssistance) {
      const edge = firstEdge(ctx, 'peers', c.index);
      if (edge) ctx.send(edge.id, ctx.derive(job.msg, { kb: toKB(REQUEST_KIB), op: 'write', fields: { videoSeed: { ...job.msg.fields.video, contentId: contentId(job.msg.fields.video) } } }));
    }
    end(ctx, job, true);
    if (c.segment >= p.segments) { c.done = true; k.completedViewers += c.viewers; return; }
    const nextAt = c.playAt + Math.max(0, c.segment - p.prefetchSegments) * p.segmentDurationSec + c.rebufferSec;
    ctx.wake(Math.max(0, nextAt - ctx.t), { kind: 'segment', index: c.index, epoch: k.epoch });
  }
  registry.register({ id: 'videoViewers', station: null, immutableParams: ['viewers', 'cohorts', 'assetId', 'segments', 'segmentKiB', 'segmentDurationSec', 'startSec', 'startSpreadSec', 'requiresManifest'],
    validateTopology(node, compiled) { synchronous(node, compiled, ['cdn', 'peers', 'manifest']); if (node.params.requiresManifest && !node.out.manifest.length) throw Error(`${node.id}: required manifest authority is not connected`); if (node.out.manifest?.length) routing.resolveTargets(node, compiled, 'manifest', { kernels: ['videoManifest'], targetPort: 'in' }); },
    init(ctx) {
      const count = Math.min(ctx.p.cohorts, ctx.p.viewers);
      return { manifestReady: !ctx.edges('manifest').length, manifestJob: null, epoch: 0, requests: {}, cohorts: Array.from({ length: count }, (_, i) => ({ id: `${ctx.nodeId}:cohort-${i}`, index: i, viewers: Math.floor(ctx.p.viewers / count) + (i < ctx.p.viewers % count ? 1 : 0), segment: 0, active: null, done: false, failed: false, startedAt: ctx.p.startSec + i * ctx.p.startSpreadSec / Math.max(1, count - 1), playAt: null, startupSec: null, rebufferSec: 0 })), deliveredSegments: 0, startedViewers: 0, completedViewers: 0, failedViewers: 0, startupViewerSec: 0, rebufferViewerSec: 0, peerKiB: 0, cdnKiB: 0, cdnRequested: 0, peerFallbackViewers: 0 };
    },
    start(ctx) {
      const edge = firstEdge(ctx, 'manifest');
      if (edge) { const msg = ctx.message({ ptype: 'json', kb: toKB(REQUEST_KIB), op: 'read', fields: { videoManifest: { assetId: ctx.p.assetId } } }); const job = ctx.newJob(msg); ctx.k.manifestJob = job.id; ctx.call(job, edge.id, {}, { timeoutMs: ctx.p.timeoutMs, retries: ctx.p.retries, backoffMs: ctx.p.retryBackoffMs, slot: 'manifest' }); }
      else for (const c of ctx.k.cohorts) ctx.wake(c.startedAt, { kind: 'segment', index: c.index, epoch: ctx.k.epoch });
    },
    onWake(ctx, w) { if (w.kind === 'segment' && w.epoch === ctx.k.epoch) viewerFetch(ctx, ctx.k.cohorts[w.index]); },
    onResult(ctx, job, slot, result) {
      if (slot === 'manifest') {
        const m = result.msg?.fields?.videoManifest;
        const valid = result.ok && m?.assetId === ctx.p.assetId && m.segments >= ctx.p.segments && m.segmentKiB === ctx.p.segmentKiB && m.segmentDurationSec === ctx.p.segmentDurationSec;
        ctx.k.manifestReady = Boolean(valid); ctx.k.manifestJob = null; ctx.reply(job, { ok: Boolean(valid), ...(valid ? {} : { err: result.err || 'invalid' }) });
        if (valid) for (const c of ctx.k.cohorts) ctx.wake(Math.max(0, c.startedAt - ctx.t), { kind: 'segment', index: c.index, epoch: ctx.k.epoch });
        else { ctx.k.failedViewers = ctx.p.viewers; for (const c of ctx.k.cohorts) { c.failed = true; c.done = true; } }
        return;
      }
      const r = ctx.k.requests[job.id]; if (!r) return; const v = job.msg.fields.video, fields = result.msg?.fields;
      const served = result.ok && delivered(v, fields) && Number.isInteger(fields.servedViewers) && fields.servedViewers >= 0 && fields.servedViewers <= r.remaining && result.msg.kb === toKB(fields.servedViewers * v.segmentKiB) ? fields.servedViewers : 0;
      if (slot === 'peer') {
        r.remaining -= served; ctx.k.peerKiB += served * v.segmentKiB;
        if (r.remaining) { ctx.k.peerFallbackViewers += r.remaining; viewerCdn(ctx, job); } else viewerFinish(ctx, job, true);
      } else if (slot === 'cdn') {
        if (served !== r.remaining) { viewerFinish(ctx, job, false, result.err || 'invalid'); return; }
        ctx.k.cdnKiB += served * v.segmentKiB; viewerFinish(ctx, job, true);
      }
    },
    onFault(ctx, f, active) {
      if (f.type !== 'crash') return;
      if (active) { ctx.k.epoch++; for (const c of ctx.k.cohorts) c.active = null; ctx.k.requests = {}; }
      else if (!ctx.fault.down) {
        if (!ctx.k.manifestReady) {
          const edge = firstEdge(ctx, 'manifest'); if (!edge) return;
          const msg = ctx.message({ ptype: 'json', kb: toKB(REQUEST_KIB), op: 'read', fields: { videoManifest: { assetId: ctx.p.assetId } } }); const job = ctx.newJob(msg); ctx.k.manifestJob = job.id;
          ctx.call(job, edge.id, {}, { timeoutMs: ctx.p.timeoutMs, retries: ctx.p.retries, backoffMs: ctx.p.retryBackoffMs, slot: 'manifest' });
        } else for (const c of ctx.k.cohorts) if (!c.done) ctx.wake(Math.max(0, c.startedAt - ctx.t), { kind: 'segment', index: c.index, epoch: ctx.k.epoch });
      }
    },
    observe(ctx) { const k = ctx.k; return { detail: { viewers: ctx.p.viewers, cohorts: k.cohorts.length, 'completed viewers': k.completedViewers, 'failed viewers': k.failedViewers, 'segment deliveries': k.deliveredSegments, 'manifest ready': k.manifestReady, 'mean startup s': k.startedViewers ? k.startupViewerSec / k.startedViewers : 0, 'rebuffer viewer s': k.rebufferViewerSec, 'CDN KiB': k.cdnKiB, 'peer KiB': k.peerKiB, 'peer fallback viewers': k.peerFallbackViewers, model: 'Synthetic aggregate cohorts; playback waits for every member, not actual video or WebRTC' }, records: { cohorts: clone(k.cohorts) } }; }
  });

  registry.register({ id: 'videoOrigin', station: STATION, immutableParams: ['assetId', 'segments', 'segmentKiB'], init: () => ({ segments: 0, originKiB: 0 }),
    onRequest(ctx, job) { const v = job.msg.fields?.video; if (!segmentValid(v) || v.assetId !== ctx.p.assetId || v.segment >= ctx.p.segments || v.segmentKiB !== ctx.p.segmentKiB) { fail(ctx, job); return; } service(ctx, job); },
    onServed(ctx, job) { const v = job.msg.fields.video; ctx.k.segments++; ctx.k.originKiB += v.segmentKiB * v.viewers; ctx.cost(v.segmentKiB * v.viewers / KIB_PER_GIB * ctx.p.egressUsdPerGiB); videoReply(ctx, job, v, v.viewers, 'origin'); },
    observe: ctx => ({ detail: { 'origin segment reads': ctx.k.segments, 'origin KiB': ctx.k.originKiB, asset: `asset-${ctx.p.assetId}`, model: 'Authored fixed-size segment identities and synthetic origin service' } })
  });
  function cacheDrop(ctx, key) { if (own(ctx.k.cache, key)) { ctx.releaseRetained(`segment:${key}`); delete ctx.k.cache[key]; } }
  function cachePut(ctx, job, v) {
    const k = ctx.k, key = segmentKey(v); cacheDrop(ctx, key);
    while (Object.keys(k.cache).length >= ctx.p.cacheSegments) { const oldest = Object.entries(k.cache).sort((a, b) => a[1].usedAt - b[1].usedAt || a[0].localeCompare(b[0]))[0]; cacheDrop(ctx, oldest[0]); k.evictions++; }
    if (ctx.retain(`segment:${key}`, ctx.derive(job.msg, { kb: toKB(v.segmentKiB), fields: { videoSegment: { ...v, contentId: contentId(v) } } }), { kind: 'cached-segment', detail: `${key}: reusable origin segment` })) k.cache[key] = { ...v, usedAt: ctx.t, storedAt: ctx.t };
  }
  function cacheFinish(ctx, key, result) {
    const pending = ctx.k.pending[key]; if (!pending) return; delete ctx.k.pending[key];
    const leader = ctx.job(pending.jobs[0]); const valid = result.ok && delivered(pending.video, result.msg?.fields) && result.msg.fields.servedViewers === 1 && result.msg.kb === toKB(pending.video.segmentKiB);
    if (valid && leader) { ctx.k.originKiB += pending.video.segmentKiB; cachePut(ctx, leader, pending.video); }
    for (const id of pending.jobs) { const job = ctx.job(id); if (!job) continue; const v = job.msg.fields.video; if (valid) { ctx.k.deliveredKiB += v.segmentKiB * v.viewers; ctx.cost(v.segmentKiB * v.viewers / KIB_PER_GIB * ctx.p.egressUsdPerGiB); videoReply(ctx, job, v, v.viewers, 'cdn'); } else fail(ctx, job, result.err || 'invalid'); }
  }
  registry.register({ id: 'videoCdn', station: STATION,
    validateTopology(node, compiled) { synchronous(node, compiled, ['origin']); },
    init: () => ({ cache: {}, pending: {}, hits: 0, misses: 0, coalesced: 0, evictions: 0, originKiB: 0, deliveredKiB: 0 }),
    onRequest(ctx, job) { if (!segmentValid(job.msg.fields?.video)) { fail(ctx, job); return; } service(ctx, job); },
    onServed(ctx, job) {
      const v = job.msg.fields.video, k = ctx.k, key = segmentKey(v); ctx.release(job); let cached = own(k.cache, key);
      if (cached && (cached.segmentKiB !== v.segmentKiB || ctx.t - cached.storedAt >= ctx.p.cacheTtlSec)) { cacheDrop(ctx, key); cached = null; }
      if (cached) { k.hits++; cached.usedAt = ctx.t; k.deliveredKiB += v.segmentKiB * v.viewers; ctx.cost(v.segmentKiB * v.viewers / KIB_PER_GIB * ctx.p.egressUsdPerGiB); videoReply(ctx, job, v, v.viewers, 'cdn-cache'); return; }
      k.misses++; const pending = own(k.pending, key);
      if (pending) { if (pending.video.segmentKiB !== v.segmentKiB) { fail(ctx, job); return; } pending.jobs.push(job.id); k.coalesced++; return; }
      const edge = firstEdge(ctx, 'origin'); if (!edge) { fail(ctx, job, 'unavailable'); return; }
      k.pending[key] = { jobs: [job.id], video: clone(v) };
      ctx.call(job, edge.id, { fields: { video: { ...v, viewers: 1 } } }, { timeoutMs: ctx.p.timeoutMs, retries: ctx.p.retries, backoffMs: ctx.p.retryBackoffMs, slot: key });
    },
    onResult(ctx, job, key, result) { cacheFinish(ctx, key, result); },
    onFault(ctx, f, active) { if (f.type === 'crash' && active) { for (const key of Object.keys(ctx.k.cache)) cacheDrop(ctx, key); ctx.k.pending = {}; } },
    observe(ctx) { const k = ctx.k; return { detail: { 'cache hits': k.hits, 'cache misses': k.misses, 'coalesced misses': k.coalesced, 'cached segments': Object.keys(k.cache).length, evictions: k.evictions, 'origin KiB': k.originKiB, 'CDN KiB': k.deliveredKiB }, records: { segments: clone(Object.entries(k.cache).map(([id, v]) => ({ id, assetId: v.assetId, segment: v.segment, segmentKiB: v.segmentKiB, storedAt: v.storedAt, usedAt: v.usedAt }))) } }; }
  });

  // Peers are bounded cohorts, not thousands of graph nodes. Actual downloaded identities seed
  // availability. Per-cohort upload budgets are shared across all segments in each explicit window.
  function peerBudget(ctx) {
    const k = ctx.k, window = Math.floor(ctx.t / ctx.p.uploadWindowSec);
    if (window !== k.window) { k.window = window; k.uploaded = {}; }
  }
  registry.register({ id: 'videoPeers', station: STATION,
    init: () => ({ segments: {}, cohorts: {}, uploaded: {}, window: -1, seeded: 0, peerKiB: 0, relayKiB: 0, unavailable: 0, churned: 0, epoch: 0 }),
    start(ctx) { ctx.wake(ctx.p.churnIntervalSec, { kind: 'churn', epoch: ctx.k.epoch }); },
    onRequest(ctx, job) { const v = job.msg.fields?.videoSeed || job.msg.fields?.video; if (!segmentValid(v)) { fail(ctx, job); return; } service(ctx, job); },
    onServed(ctx, job) {
      const k = ctx.k, p = ctx.p, seed = job.msg.fields.videoSeed, v = seed || job.msg.fields.video, key = segmentKey(v); peerBudget(ctx);
      if (seed) {
        if (seed.contentId !== contentId(seed)) { fail(ctx, job); return; }
        if (!own(k.cohorts, v.cohortId) && Object.keys(k.cohorts).length >= p.maxCohorts) { fail(ctx, job, 'rejected'); return; }
        if (!own(k.segments, key) && Object.keys(k.segments).length >= p.maxSegments) { const oldest = Object.keys(k.segments)[0]; delete k.segments[oldest]; }
        const holders = own(k.segments, key) || (k.segments[key] = { segment: v.segment, assetId: v.assetId, segmentKiB: v.segmentKiB, holders: {} });
        if (holders.segmentKiB !== v.segmentKiB) { fail(ctx, job); return; }
        if (!own(k.cohorts, v.cohortId)) k.cohorts[v.cohortId] = { id: v.cohortId, viewers: v.viewers, online: Math.floor(v.viewers * p.availabilityFraction) };
        holders.holders[v.cohortId] = true; k.seeded++; ctx.reply(job, { ok: true, kb: 0 }); return;
      }
      const holders = own(k.segments, key); let remaining = v.viewers, served = 0;
      if (holders?.segmentKiB === v.segmentKiB) for (const cohortId of Object.keys(holders.holders).sort()) {
        if (cohortId === v.cohortId) continue;
        const cohort = own(k.cohorts, cohortId); if (!cohort) continue;
        const limit = cohort.online * p.uploadKiBpsPerPeer * p.uploadWindowSec;
        const bytes = Math.max(0, limit - (own(k.uploaded, cohortId) || 0));
        const n = Math.min(remaining, Math.floor(bytes / v.segmentKiB)); k.uploaded[cohortId] = (own(k.uploaded, cohortId) || 0) + n * v.segmentKiB; served += n; remaining -= n;
        if (!remaining) break;
      }
      k.unavailable += remaining; k.peerKiB += served * v.segmentKiB; const relay = served * v.segmentKiB * p.relayFraction; k.relayKiB += relay; ctx.cost(relay / KIB_PER_GIB * p.relayUsdPerGiB);
      videoReply(ctx, job, v, served, 'peer');
    },
    onWake(ctx, w) {
      if (w.kind !== 'churn' || w.epoch !== ctx.k.epoch) return;
      for (const c of Object.values(ctx.k.cohorts)) { const lost = Math.min(c.online, Math.floor(c.online * ctx.p.churnFraction)); c.online -= lost; ctx.k.churned += lost; }
      ctx.wake(ctx.p.churnIntervalSec, w);
    },
    onFault(ctx, f, active) { if (f.type !== 'crash') return; if (active) { ctx.k.segments = {}; ctx.k.cohorts = {}; ctx.k.uploaded = {}; ctx.k.epoch++; } else if (!ctx.fault.down) ctx.wake(ctx.p.churnIntervalSec, { kind: 'churn', epoch: ctx.k.epoch }); },
    observe(ctx) { const k = ctx.k; return { detail: { 'peer KiB': k.peerKiB, 'relay KiB': k.relayKiB, 'unserved viewer requests': k.unavailable, 'online peer members': Object.values(k.cohorts).reduce((n, c) => n + c.online, 0), 'churned peers': k.churned, 'known segments': Object.keys(k.segments).length, model: 'Synthetic availability, upload-window budgets and relay fraction; no signaling, ICE, NAT or WebRTC transport' }, records: { peers: clone(Object.values(k.cohorts)), segments: clone(Object.entries(k.segments).map(([id, s]) => ({ id, assetId: s.assetId, segment: s.segment, holders: Object.keys(s.holders).length }))) } }; }
  });

  // Spark-style records are generated inputs, not precomputed outcomes. Executors map real URL
  // strings into partitioned counts; reducers must retrieve every shuffle block via drawn edges.
  function blockKey(jobId, map, partition) { return `${jobId}:map-${map}:reduce-${partition}`; }
  function blockValid(b) { return b && typeof b.jobId === 'string' && b.jobId.length <= 90 && Number.isInteger(b.map) && b.map >= 0 && b.map < 64 && Number.isInteger(b.partition) && b.partition >= 0 && b.partition < 64 && b.id === blockKey(b.jobId, b.map, b.partition) && typeof b.executor === 'string' && (b.storage === undefined || typeof b.storage === 'string') && Number.isInteger(b.epoch) && b.epoch >= 0 && Number.isFinite(b.kb) && b.kb >= 0 && Number.isInteger(b.records) && b.records >= 0 && b.records <= 20000; }
  function countsRows(counts) { return Object.keys(counts).sort().map(url => ({ url, count: counts[url] })); }
  function rowsValid(rows) { return Array.isArray(rows) && rows.length <= 20000 && rows.every(r => r && typeof r.url === 'string' && /^\/url-\d+$/.test(r.url) && Number.isInteger(r.count) && r.count > 0); }
  function recordCount(rows) { return rows.reduce((n, r) => n + r.count, 0); }
  function driverInit(ctx) {
    const p = ctx.p, inputs = ctx.node.out.input?.length ? [] : Array.from({ length: p.mapPartitions }, (_, i) => ({ id: `map-${i}`, index: i, records: [] }));
    const hot = Math.floor(p.recordCount * p.hotFraction);
    for (let i = 0; inputs.length && i < p.recordCount; i++) { const key = p.keyCount === 1 || i < hot ? 0 : 1 + (i - hot) % (p.keyCount - 1); inputs[i % p.mapPartitions].records.push(`/url-${key}`); }
    return { inputs, jobId: `${ctx.nodeId}:job-1`, job: null, phase: 'waiting', epoch: 0, cursor: 0, maps: {}, reduces: {}, active: 0, retries: 0, recomputed: 0, fetchFailures: 0, shuffleKiB: 0, spillKiB: 0, startedAt: null, completedAt: null, output: [], blockedUntil: {}, tasks: {}, stages: [{ id: 'map', dependsOn: [], state: 'waiting' }, { id: 'shuffle', dependsOn: ['map'], state: 'waiting' }, { id: 'reduce', dependsOn: ['shuffle'], dependencyScope: 'per-reduce-partition', state: 'waiting' }] };
  }
  function driverDone(ctx, ok, err) {
    const k = ctx.k; if (['completed', 'failed'].includes(k.phase)) return; k.phase = ok ? 'completed' : 'failed'; k.completedAt = ctx.t;
    if (!ok) for (const stage of k.stages) if (stage.state !== 'completed') stage.state = 'failed';
    const job = k.job && ctx.job(k.job); if (job) { if (ok) ctx.effect(k.jobId, { idempotent: true }); end(ctx, job, ok, err); } k.job = null;
  }
  function driverOutput(ctx) {
    const k = ctx.k; k.output = countsRows(Object.values(k.reduces).reduce((counts, result) => { for (const r of result.rows) counts[r.url] = (own(counts, r.url) || 0) + r.count; return counts; }, {}));
    k.stages[1].state = 'completed'; k.stages[2].state = 'completed'; k.stages[1].completedAt = Math.max(...Object.values(k.reduces).map(r => r.shuffleFinishedAt)); k.stages[2].completedAt = ctx.t;
    const job = ctx.job(k.job), edges = ctx.edges('output'); k.phase = 'output'; k.outputPending = edges.length;
    if (!edges.length) { driverDone(ctx, true); return; }
    for (const edge of edges) if (ctx.call(job, edge.id, { ptype: 'rows', op: 'write', kb: toKB(k.output.length * ctx.p.recordKiB), fields: { sparkResult: { jobId: k.jobId, urlCounts: clone(k.output), totalRecords: recordCount(k.output) } } }, { timeoutMs: ctx.p.taskTimeoutMs, retries: 0, slot: { kind: 'output' } }) === null) { driverDone(ctx, false, 'unavailable'); return; }
  }
  function driverPump(ctx) {
    const k = ctx.k, p = ctx.p;
    if (!['map', 'shuffle-reduce'].includes(k.phase) || ctx.fault.down) return;
    const map = k.phase === 'map', total = map ? p.mapPartitions : p.reducePartitions, done = map ? k.maps : k.reduces;
    if (Object.keys(done).length === total && k.active === 0) {
      if (!map) { driverOutput(ctx); return; }
      k.phase = 'shuffle-reduce'; k.stages[0].state = 'completed'; k.stages[0].completedAt = ctx.t;
      k.stages[1].state = 'running'; k.stages[1].startedAt = ctx.t; k.stages[2].state = 'scheduled'; k.stages[2].startedAt = null; driverPump(ctx); return;
    }
    for (let i = 0; i < total && k.active < p.parallelTasks; i++) {
      const id = `${map ? 'map' : 'reduce'}-${i}`, task = own(k.tasks, id) || (k.tasks[id] = { id, kind: map ? 'map' : 'reduce', index: i, attempts: 0, state: 'waiting', executor: null, records: map ? k.inputs[i].records.length : null });
      if (own(done, String(i)) || task.state === 'running') continue;
      if (task.attempts >= p.maxAttempts) { driverDone(ctx, false, 'unavailable'); return; }
      const stageEdges = ctx.edges(map ? 'maps' : 'reduces'), edges = stageEdges.length ? stageEdges : ctx.edges('executors'); let edge = null;
      for (let j = 0; j < edges.length; j++) { const e = edges[(k.cursor + j) % edges.length]; if (ctx.edgeUsable(e.id) && (own(k.blockedUntil, e.to) || 0) <= ctx.t) { edge = e; k.cursor = (k.cursor + j + 1) % edges.length; break; } }
      if (!edge) { ctx.wake(p.retryBackoffMs / MS, { kind: 'pump', epoch: k.epoch }); return; }
      task.attempts++; if (task.attempts > 1) k.retries++; task.state = 'running'; task.executor = edge.to; task.startedAt = ctx.t; k.active++;
      const spark = map ? { kind: 'map', jobId: k.jobId, map: i, records: k.inputs[i].records, reducePartitions: p.reducePartitions, recordKiB: p.recordKiB } : { kind: 'reduce', jobId: k.jobId, partition: i, blocks: Object.values(k.maps).map(m => m.blocks[i]), recordKiB: p.recordKiB };
      ctx.call(ctx.job(k.job), edge.id, { ptype: 'task', kb: toKB(map ? spark.records.length * p.recordKiB : REQUEST_KIB), fields: { spark } }, { timeoutMs: p.taskTimeoutMs, retries: 0, retryOf: task.attempts - 1, slot: { kind: map ? 'map' : 'reduce', index: i, epoch: k.epoch, executor: edge.to } });
    }
  }
  registry.register({ id: 'sparkDriver', station: null, immutableParams: ['recordCount', 'keyCount', 'hotFraction', 'mapPartitions', 'reducePartitions', 'recordKiB', 'startSec', 'inputMode'],
    validateTopology(node, compiled) {
      synchronous(node, compiled, ['executors', 'maps', 'reduces', 'input', 'output']);
      const nodes = new Map(compiled.nodes.map(n => [n.id, n]));
      for (const e of compiled.edges.filter(e => e.from === node.id && ['executors', 'maps', 'reduces'].includes(e.fromPort))) if (nodes.get(e.to)?.kernel !== 'sparkExecutor' || e.toPort !== 'tasks') throw Error(`${node.id}: executor edges must target a Spark executor tasks port`);
      if (!node.out.executors.length && (!node.out.maps.length || !node.out.reduces.length)) throw Error(`${node.id}: connect map and reduce CPU pools or shared executors`);
      if (node.params.inputMode === 'external' && !node.out.input.length) throw Error(`${node.id}: external input authority is not connected`);
      if (node.out.input.length) routing.resolveTargets(node, compiled, 'input', { kernels: ['sparkInput'], targetPort: 'in' });
    },
    init: driverInit,
    start(ctx) { ctx.wake(ctx.p.startSec, { kind: 'start', epoch: ctx.k.epoch }); },
    onWake(ctx, w) {
      const k = ctx.k; if (w.epoch !== k.epoch) return;
      if (w.kind === 'start' && k.phase === 'waiting') { const msg = ctx.message({ ptype: 'task', kb: toKB(REQUEST_KIB), fields: { sparkJob: k.jobId, synthetic: true } }); ctx.beginRequest(msg); k.job = ctx.newJob(msg).id; k.phase = 'map'; k.startedAt = ctx.t; k.stages[0].state = 'running'; k.stages[0].startedAt = ctx.t;
        const input = firstEdge(ctx, 'input'); if (input) { k.phase = 'input'; ctx.call(ctx.job(k.job), input.id, { ptype: 'task', fields: { spark: { kind: 'input', mapPartitions: ctx.p.mapPartitions } } }, { timeoutMs: ctx.p.taskTimeoutMs, retries: 0, slot: { kind: 'input' } }); }
      }
      driverPump(ctx);
    },
    onResult(ctx, job, slot, result) {
      const k = ctx.k; if (['failed', 'completed'].includes(k.phase)) return;
      if (slot.kind === 'input') {
        const rows = result.msg?.fields?.sparkInput;
        if (!result.ok || !Array.isArray(rows) || rows.length !== ctx.p.mapPartitions || rows.some((r, i) => !r || typeof r !== 'object' || r.index !== i || !Array.isArray(r.records) || r.records.some(url => !/^\/url-\d+$/.test(url))) || rows.reduce((n, r) => n + r.records.length, 0) !== ctx.p.recordCount) { driverDone(ctx, false, result.err || 'invalid'); return; }
        k.inputs = clone(rows); k.phase = 'map'; driverPump(ctx); return;
      }
      if (slot.kind === 'output') { if (!result.ok) driverDone(ctx, false, result.err); else if (--k.outputPending === 0) driverDone(ctx, true); return; }
      if (slot.epoch !== k.epoch) return;
      const id = `${slot.kind}-${slot.index}`, task = k.tasks[id]; task.state = result.ok ? 'completed' : 'waiting'; task.completedAt = ctx.t; k.active--;
      const value = result.msg?.fields?.sparkResult;
      if (result.ok && value?.jobId === k.jobId && value.kind === slot.kind && value.index === slot.index) {
        if (slot.kind === 'map' && Array.isArray(value.blocks) && value.blocks.length === ctx.p.reducePartitions && value.executor === slot.executor && value.blocks.every((b, i) => blockValid(b) && b.jobId === k.jobId && b.executor === slot.executor && b.map === slot.index && b.partition === i && b.kb === toKB(b.records * ctx.p.recordKiB)) && value.blocks.reduce((n, b) => n + b.records, 0) === k.inputs[slot.index].records.length) k.maps[slot.index] = clone(value);
        else if (slot.kind === 'reduce' && value.executor === slot.executor && ['shuffleKiB', 'spillKiB', 'shuffleFinishedAt', 'reduceStartedAt'].every(key => Number.isFinite(value[key]) && value[key] >= 0) && value.shuffleFinishedAt <= value.reduceStartedAt && value.reduceStartedAt <= ctx.t && rowsValid(value.rows) && value.rows.every(r => hash(r.url) % ctx.p.reducePartitions === slot.index) && recordCount(value.rows) === Object.values(k.maps).reduce((n, m) => n + m.blocks[slot.index].records, 0)) { k.reduces[slot.index] = clone(value); task.records = recordCount(value.rows); k.stages[2].state = 'running'; k.stages[2].startedAt = k.stages[2].startedAt === null ? value.reduceStartedAt : Math.min(k.stages[2].startedAt, value.reduceStartedAt); k.shuffleKiB += value.shuffleKiB; k.spillKiB += value.spillKiB; }
        else { driverDone(ctx, false, 'invalid'); return; }
      } else {
        const missing = result.msg?.fields?.missingMaps;
        if (slot.kind === 'reduce' && Array.isArray(missing) && missing.length) {
          k.fetchFailures++; k.epoch++; k.active = 0; k.reduces = {}; k.phase = 'map';
          for (const t of Object.values(k.tasks)) if (t.kind === 'reduce' || t.state === 'running') t.state = 'waiting';
          for (const i of missing) if (Number.isInteger(i) && i >= 0 && i < ctx.p.mapPartitions) { const previous = k.maps[i]; if (previous) k.blockedUntil[previous.executor] = ctx.t + ctx.p.retryBackoffMs / MS; delete k.maps[i]; k.tasks[`map-${i}`].state = 'waiting'; k.recomputed++; }
          k.stages[0].state = 'running'; k.stages[1].state = 'waiting'; k.stages[2].state = 'waiting';
          ctx.log('spark-recompute', `Missing shuffle blocks require map partitions ${missing.join(', ')} again`);
        } else { if (result.ok) { driverDone(ctx, false, 'invalid'); return; } k.blockedUntil[slot.executor] = ctx.t + ctx.p.retryBackoffMs / MS; }
        ctx.wake(ctx.p.retryBackoffMs / MS, { kind: 'pump', epoch: k.epoch });
      }
      driverPump(ctx);
    },
    onFault(ctx, f, active) { if (f.type === 'crash' && active && !['completed', 'failed'].includes(ctx.k.phase)) { ctx.k.epoch++; driverDone(ctx, false, 'down'); } },
    observe(ctx) { const k = ctx.k; return { detail: { state: k.phase, 'input records': ctx.p.recordCount, 'completed map partitions': Object.keys(k.maps).length, 'completed reduce partitions': Object.keys(k.reduces).length, 'task retries': k.retries, 'recomputed map partitions': k.recomputed, 'shuffle fetch failures': k.fetchFailures, 'shuffle KiB': k.shuffleKiB, 'reduce spill KiB': k.spillKiB, 'output records counted': recordCount(k.output), model: 'Synthetic Spark-style URL count stages, receipt-bound shuffle and lineage recomputation; not Apache Spark execution' }, records: { stages: clone(k.stages), tasks: clone(Object.values(k.tasks)), output: clone(k.output), partitions: k.inputs.map(i => ({ id: i.id, records: i.records.length })) } }; }
  });

  function executorSpill(ctx, job, kb) {
    const resident = Math.min(kb, ctx.p.taskBufferMiB * KIB_PER_MIB), spill = kb - resident;
    if (!ctx.resizeMemory(job, resident / KIB_PER_MIB)) return null;
    ctx.k.spillKiB += spill; return spill;
  }
  function executorRemoveBlock(ctx, key) { const old = own(ctx.k.blocks, key); if (old) { ctx.releaseRetained(key); ctx.k.residentKiB -= old.residentKiB; delete ctx.k.blocks[key]; } }
  function executorExternalMap(ctx, job, task, buckets, edge) {
    const row = ctx.k.writing[job.id] = { pending: buckets.length, result: { kind: 'map', jobId: task.jobId, index: task.map, executor: ctx.nodeId, blocks: [] } };
    ctx.release(job); scheduleCleanup(ctx);
    buckets.forEach((counts, partition) => {
      const rows = countsRows(counts), records = recordCount(rows), descriptor = { id: blockKey(task.jobId, task.map, partition), jobId: task.jobId, map: task.map, partition, executor: ctx.nodeId, epoch: ctx.k.epoch, kb: toKB(records * task.recordKiB), records };
      ctx.call(job, edge.id, { ptype: 'rows', kb: descriptor.kb, fields: { spark: { kind: 'store', block: { ...descriptor, rows } } } }, { timeoutMs: ctx.p.shuffleTimeoutMs, retries: 0, slot: { kind: 'store', partition } });
    });
  }
  function executorMap(ctx, job, task) {
    const k = ctx.k, buckets = Array.from({ length: task.reducePartitions }, () => ({}));
    for (const url of task.records) { const b = buckets[hash(url) % task.reducePartitions]; b[url] = (own(b, url) || 0) + 1; }
    const store = firstEdge(ctx, 'storage'); if (store) { executorExternalMap(ctx, job, task, buckets, store); return; }
    const descriptors = []; let shuffleSpillKiB = 0;
    for (let i = 0; i < buckets.length; i++) {
      const key = blockKey(task.jobId, task.map, i); executorRemoveBlock(ctx, key);
      if (Object.keys(k.blocks).length >= ctx.p.maxBlocks) { fail(ctx, job, 'rejected'); return; }
      const rows = countsRows(buckets[i]), records = recordCount(rows), kb = records * task.recordKiB, residentKiB = Math.min(kb, Math.max(0, ctx.p.shuffleBufferMiB * KIB_PER_MIB - k.residentKiB));
      const descriptor = { id: key, jobId: task.jobId, map: task.map, partition: i, executor: ctx.nodeId, epoch: k.epoch, kb: toKB(kb), records };
      if (!ctx.retain(key, ctx.derive(job.msg, { kb: toKB(residentKiB), fields: { sparkBlock: descriptor } }), { kind: 'spark-shuffle-block', detail: `${key}: ${records} mapped records; ${kb - residentKiB} KiB synthetic disk spill` })) { fail(ctx, job, 'rejected'); return; }
      k.blocks[key] = { ...descriptor, rows, residentKiB, spilledKiB: kb - residentKiB }; k.residentKiB += residentKiB; shuffleSpillKiB += kb - residentKiB; descriptors.push(descriptor);
    }
    const result = { kind: 'map', jobId: task.jobId, index: task.map, executor: ctx.nodeId, blocks: descriptors };
    if (shuffleSpillKiB > 0) { k.pendingMaps[job.id] = result; scheduleCleanup(ctx); k.spillKiB += shuffleSpillKiB; ctx.admit(job, ctx.serviceMs(shuffleSpillKiB / (ctx.p.spillMiBps * KIB_PER_MIB) * MS, 'constant', 0)); }
    else { k.maps++; ctx.reply(job, { ok: true, kb: toKB(REQUEST_KIB), fields: { sparkResult: result } }); }
  }
  function fetchBlock(ctx, descriptor) { if (!blockValid(descriptor)) return null; const b = own(ctx.k.blocks, descriptor.id); return b && b.ready !== false && b.kb === descriptor.kb && b.records === descriptor.records && b.epoch === descriptor.epoch && b.jobId === descriptor.jobId && b.map === descriptor.map && b.partition === descriptor.partition && b.executor === descriptor.executor && b.storage === descriptor.storage ? b : null; }
  function reducerFail(ctx, job, missing) { delete ctx.k.reducing[job.id]; fail(ctx, job, 'unavailable', { missingMaps: missing }); }
  function reducerAccept(ctx, row, block) { for (const r of block.rows) row.counts[r.url] = (own(row.counts, r.url) || 0) + r.count; row.records += recordCount(block.rows); row.received++; }
  function reducerPump(ctx, job) {
    const row = ctx.k.reducing[job.id]; if (!row) return;
    while (row.next < row.blocks.length && row.active < ctx.p.shuffleConcurrency) {
      const block = row.blocks[row.next++];
      if (!block.storage && block.executor === ctx.nodeId) { const local = fetchBlock(ctx, block); if (!local) { reducerFail(ctx, job, [block.map]); return; } reducerAccept(ctx, row, local); row.localReadKiB += local.spilledKiB; continue; }
      const edge = ctx.edges('shuffle').find(e => e.to === (block.storage || block.executor));
      if (!edge) { reducerFail(ctx, job, [block.map]); return; }
      row.active++;
      ctx.call(job, edge.id, { ptype: 'rows', kb: toKB(REQUEST_KIB), fields: { spark: { kind: 'fetch', block } } }, { timeoutMs: ctx.p.shuffleTimeoutMs, retries: 0, slot: { kind: 'fetch', id: block.id, map: block.map } });
    }
    if (row.received !== row.blocks.length || row.active) return;
    const kb = row.records * row.recordKiB, spill = executorSpill(ctx, job, kb);
    if (spill === null) { delete ctx.k.reducing[job.id]; fail(ctx, job, 'rejected'); return; } row.spillKiB = spill;
    row.reduceMs = row.records * ctx.p.reduceRecordMs + 2 * spill / (ctx.p.spillMiBps * KIB_PER_MIB) * MS;
    row.phase = row.localReadKiB > 0 ? 'local-read' : 'reduce';
    if (row.phase === 'reduce') row.shuffleFinishedAt = ctx.t;
    const ms = row.phase === 'local-read' ? row.localReadKiB / (ctx.p.spillMiBps * KIB_PER_MIB) * MS : row.reduceMs;
    if (!service(ctx, job, ctx.serviceMs(ms, 'constant', 0))) delete ctx.k.reducing[job.id];
  }
  function sweepExecutor(ctx) {
    for (const map of [ctx.k.pendingMaps, ctx.k.reducing, ctx.k.writing]) for (const id of Object.keys(map)) if (!ctx.job(id)) delete map[id];
    ctx.k.cleanupScheduled = false;
    if (Object.keys(ctx.k.pendingMaps).length || Object.keys(ctx.k.reducing).length || Object.keys(ctx.k.writing).length) { ctx.k.cleanupScheduled = true; ctx.wake(ctx.p.shuffleTimeoutMs / MS, { kind: 'cleanup', epoch: ctx.k.epoch }); }
  }
  function scheduleCleanup(ctx) { if (!ctx.k.cleanupScheduled) { ctx.k.cleanupScheduled = true; ctx.wake(ctx.p.shuffleTimeoutMs / MS, { kind: 'cleanup', epoch: ctx.k.epoch }); } }
  registry.register({ id: 'sparkExecutor', station: STATION, immutableParams: ['taskRole', 'shuffleMode'],
    validateTopology(node, compiled) { synchronous(node, compiled, ['shuffle', 'storage']); const nodes = new Map(compiled.nodes.map(n => [n.id, n])); for (const e of compiled.edges.filter(e => e.from === node.id && e.fromPort === 'shuffle')) if (!['sparkExecutor', 'sparkBlockStore'].includes(nodes.get(e.to)?.kernel) || e.toPort !== 'blocks') throw Error(`${node.id}: shuffle links must target executor or shuffle storage blocks ports`); if (node.params.shuffleMode === 'external' && !node.out.storage.length) throw Error(`${node.id}: external shuffle storage is not connected`); if (node.out.storage.length) routing.resolveTargets(node, compiled, 'storage', { kernels: ['sparkBlockStore'], targetPort: 'blocks' }); },
    init: () => ({ epoch: 0, blocks: {}, reducing: {}, pendingMaps: {}, writing: {}, cleanupScheduled: false, residentKiB: 0, maps: 0, reduces: 0, fetches: 0, shuffleKiB: 0, spillKiB: 0, lostBlocks: 0 }),
    onRequest(ctx, job) {
      const t = job.msg.fields?.spark, port = job.from ? ctx.edge(job.from.edgeId).toPort : null;
      if (t && ['map', 'reduce'].includes(t.kind) && ctx.p.taskRole !== 'shared' && ctx.p.taskRole !== t.kind) { fail(ctx, job); return; }
      if (!t || (t.kind === 'fetch' ? port !== 'blocks' : port !== 'tasks')) { fail(ctx, job); return; }
      let ms = ctx.p.serviceMs;
      if (t.kind === 'map') {
        if (!Array.isArray(t.records) || t.records.length > 20000 || t.records.some(url => typeof url !== 'string' || !/^\/url-\d+$/.test(url)) || !Number.isInteger(t.reducePartitions) || t.reducePartitions < 1 || t.reducePartitions > 64 || !Number.isFinite(t.recordKiB) || t.recordKiB <= 0 || typeof t.jobId !== 'string' || !Number.isInteger(t.map)) { fail(ctx, job); return; }
        const spill = executorSpill(ctx, job, t.records.length * t.recordKiB); if (spill === null) { fail(ctx, job, 'rejected'); return; }
        ms += t.records.length * ctx.p.mapRecordMs + 2 * spill / (ctx.p.spillMiBps * KIB_PER_MIB) * MS;
      } else if (t.kind === 'fetch') {
        const block = t.block && fetchBlock(ctx, t.block); if (!block) { fail(ctx, job, 'unavailable', { missingMaps: t.block ? [t.block.map] : [] }); return; }
        ms += block.spilledKiB / (ctx.p.spillMiBps * KIB_PER_MIB) * MS;
      } else if (t.kind === 'reduce') {
        if (!Array.isArray(t.blocks) || !t.blocks.length || t.blocks.length > 64 || t.blocks.some(b => !blockValid(b) || b.jobId !== t.jobId || b.partition !== t.partition) || new Set(t.blocks.map(b => b.map)).size !== t.blocks.length || !Number.isFinite(t.recordKiB) || t.recordKiB <= 0) { fail(ctx, job); return; }
      } else { fail(ctx, job); return; }
      service(ctx, job, ctx.serviceMs(ms, 'constant', 0));
    },
    onServed(ctx, job) {
      const t = job.msg.fields.spark, k = ctx.k;
      if (t.kind === 'map') { const pending = own(k.pendingMaps, job.id); if (pending) { delete k.pendingMaps[job.id]; k.maps++; ctx.reply(job, { ok: true, kb: toKB(REQUEST_KIB), fields: { sparkResult: pending } }); } else executorMap(ctx, job, t); return; }
      if (t.kind === 'fetch') {
        const b = fetchBlock(ctx, t.block); if (!b) { fail(ctx, job, 'unavailable', { missingMaps: [t.block.map] }); return; }
        k.fetches++; k.shuffleKiB += toKiB(b.kb); ctx.reply(job, { ok: true, ptype: 'rows', kb: b.kb, fields: { sparkBlock: { ...t.block, rows: clone(b.rows) } } }); return;
      }
      const row = k.reducing[job.id];
      if (row?.phase === 'local-read') { row.phase = 'reduce'; row.shuffleFinishedAt = ctx.t; if (!service(ctx, job, ctx.serviceMs(row.reduceMs, 'constant', 0))) delete k.reducing[job.id]; return; }
      if (row?.phase === 'reduce') {
        k.reduces++; delete k.reducing[job.id]; const rows = countsRows(row.counts);
        ctx.reply(job, { ok: true, ptype: 'rows', kb: toKB(rows.length * t.recordKiB), fields: { sparkResult: { kind: 'reduce', jobId: t.jobId, index: t.partition, executor: ctx.nodeId, rows, shuffleKiB: row.shuffleKiB, spillKiB: row.spillKiB, shuffleFinishedAt: row.shuffleFinishedAt, reduceStartedAt: row.shuffleFinishedAt } } }); return;
      }
      k.reducing[job.id] = { blocks: clone(t.blocks), next: 0, active: 0, received: 0, records: 0, counts: {}, phase: 'shuffle', recordKiB: t.recordKiB, shuffleKiB: 0, spillKiB: 0, localReadKiB: 0, shuffleFinishedAt: null };
      scheduleCleanup(ctx); ctx.release(job); reducerPump(ctx, job);
    },
    onResult(ctx, job, slot, result) {
      if (slot.kind === 'store') {
        const pending = ctx.k.writing[job.id]; if (!pending) return;
        const block = result.msg?.fields?.sparkBlock;
        if (!result.ok || !blockValid(block) || block.executor !== ctx.nodeId || block.partition !== slot.partition || typeof block.storage !== 'string') { delete ctx.k.writing[job.id]; fail(ctx, job, result.err || 'invalid'); return; }
        pending.result.blocks[slot.partition] = clone(block);
        if (!--pending.pending) { delete ctx.k.writing[job.id]; ctx.k.maps++; ctx.reply(job, { ok: true, kb: toKB(REQUEST_KIB), fields: { sparkResult: pending.result } }); }
        return;
      }
      const row = ctx.k.reducing[job.id]; if (!row || slot.kind !== 'fetch') return; row.active--;
      const b = result.msg?.fields?.sparkBlock, expected = row.blocks.find(block => block.id === slot.id);
      if (!result.ok || !blockValid(b) || !expected || ['id', 'jobId', 'map', 'partition', 'executor', 'storage', 'epoch', 'records', 'kb'].some(key => b[key] !== expected[key]) || !rowsValid(b.rows) || recordCount(b.rows) !== b.records || result.msg.kb !== expected.kb) { reducerFail(ctx, job, [slot.map]); return; }
      reducerAccept(ctx, row, b); row.shuffleKiB += toKiB(b.kb); reducerPump(ctx, job);
    },
    onWake(ctx, w) { if (w.kind === 'cleanup' && w.epoch === ctx.k.epoch) sweepExecutor(ctx); },
    onFault(ctx, f, active) { if (f.type === 'crash' && active) { ctx.k.cleanupScheduled = false; ctx.k.epoch++; ctx.k.lostBlocks += Object.keys(ctx.k.blocks).length; for (const key of Object.keys(ctx.k.blocks)) executorRemoveBlock(ctx, key); ctx.k.reducing = {}; ctx.k.pendingMaps = {}; ctx.k.writing = {}; } },
    observe(ctx) { const k = ctx.k; return { detail: { 'map tasks': k.maps, 'reduce tasks': k.reduces, 'shuffle fetches': k.fetches, 'shuffle KiB served': k.shuffleKiB, 'task spill KiB': k.spillKiB, 'shuffle resident KiB': k.residentKiB, 'shuffle disk KiB': Object.values(k.blocks).reduce((n, b) => n + b.spilledKiB, 0), 'lost shuffle blocks': k.lostBlocks, model: ctx.edges('storage').length ? 'Stage CPU with independent drawn shuffle storage; CPU crash does not erase remote blocks' : 'Executor-local synthetic RAM/disk shuffle; crashes lose blocks and trigger lineage recomputation' }, records: { blocks: clone(Object.values(k.blocks).map(({ rows, ...b }) => b)), reductions: clone(Object.entries(k.reducing).map(([id, r]) => ({ id, phase: r.phase, received: r.received, required: r.blocks.length, records: r.records }))) } }; }
  });
  registry.register({ id: 'videoManifest', station: STATION, immutableParams: ['assetId', 'segments', 'segmentKiB', 'segmentDurationSec'],
    init: () => ({ reads: 0 }), onRequest(ctx, job) { if (job.msg.fields?.videoManifest?.assetId !== ctx.p.assetId) { fail(ctx, job); return; } service(ctx, job); },
    onServed(ctx, job) { ctx.k.reads++; const { assetId, segments, segmentKiB, segmentDurationSec } = ctx.p; ctx.reply(job, { ok: true, ptype: 'json', kb: 0.5, fields: { videoManifest: { assetId, segments, segmentKiB, segmentDurationSec } } }); },
    observe: ctx => ({ detail: { 'manifest reads': ctx.k.reads, 'asset ID': ctx.p.assetId, segments: ctx.p.segments, model: 'Authored playback manifest, not encoding or DRM' } })
  });
  registry.register({ id: 'sparkInput', station: STATION, immutableParams: ['recordCount', 'keyCount', 'hotFraction', 'mapPartitions'],
    init: ctx => ({ inputs: driverInit(ctx).inputs, reads: 0 }), onRequest(ctx, job) { const t = job.msg.fields?.spark; if (t?.kind !== 'input' || t.mapPartitions !== ctx.p.mapPartitions) { fail(ctx, job); return; } service(ctx, job); },
    onServed(ctx, job) { ctx.k.reads++; ctx.reply(job, { ok: true, ptype: 'rows', kb: toKB(ctx.p.recordCount * ctx.p.recordKiB), fields: { sparkInput: clone(ctx.k.inputs) } }); },
    observe: ctx => ({ detail: { 'dataset reads': ctx.k.reads, records: ctx.p.recordCount, 'input partitions': ctx.k.inputs.length }, records: { partitions: ctx.k.inputs.map(r => ({ id: r.id, records: r.records.length })) } })
  });
  registry.register({ id: 'sparkBlockStore', station: STATION,
    init: () => ({ epoch: 0, blocks: {}, pendingStores: {}, residentKiB: 0, writes: 0, fetches: 0, lostBlocks: 0, spillKiB: 0 }),
    onRequest(ctx, job) {
      const t = job.msg.fields?.spark, b = t?.block;
      if (!['store', 'fetch'].includes(t?.kind) || !blockValid(b)) { fail(ctx, job); return; }
      if (t.kind === 'store' && (!rowsValid(b.rows) || recordCount(b.rows) !== b.records)) { fail(ctx, job); return; }
      if (t.kind === 'fetch' && (!fetchBlock(ctx, b) || b.storage !== ctx.nodeId)) { fail(ctx, job, 'unavailable', { missingMaps: [b.map] }); return; }
      const spill = t.kind === 'store' ? 0 : fetchBlock(ctx, b).spilledKiB;
      service(ctx, job, ctx.serviceMs(ctx.p.serviceMs + spill / (ctx.p.spillMiBps * KIB_PER_MIB) * MS, 'constant', 0));
    },
    onServed(ctx, job) {
      const t = job.msg.fields.spark, b = t.block, k = ctx.k;
      if (t.kind === 'fetch') { const stored = fetchBlock(ctx, b); if (!stored) { fail(ctx, job, 'unavailable', { missingMaps: [b.map] }); return; } k.fetches++; ctx.reply(job, { ok: true, ptype: 'rows', kb: b.kb, fields: { sparkBlock: { ...b, rows: clone(stored.rows) } } }); return; }
      if (own(k.pendingStores, job.id)) {
        delete k.pendingStores[job.id]; const stored = own(k.blocks, b.id);
        if (!stored || stored.writeJob !== job.id) { fail(ctx, job, 'unavailable'); return; }
        stored.ready = true; k.writes++; const { rows, residentKiB, spilledKiB, ready, writeJob, ...descriptor } = stored;
        ctx.reply(job, { ok: true, ptype: 'rows', kb: toKB(REQUEST_KIB), fields: { sparkBlock: descriptor } }); return;
      }
      if (own(k.blocks, b.id)?.ready === false) { fail(ctx, job, 'rejected'); return; }
      executorRemoveBlock(ctx, b.id);
      if (Object.keys(k.blocks).length >= ctx.p.maxBlocks) { fail(ctx, job, 'rejected'); return; }
      const residentKiB = Math.min(toKiB(b.kb), Math.max(0, ctx.p.shuffleBufferMiB * KIB_PER_MIB - k.residentKiB));
      const stored = { ...clone(b), storage: ctx.nodeId, epoch: k.epoch, residentKiB, spilledKiB: toKiB(b.kb) - residentKiB, ready: false, writeJob: job.id };
      if (!ctx.retain(b.id, ctx.derive(job.msg, { kb: toKB(residentKiB) }), { kind: 'spark-shuffle-block', detail: `${b.id}: independent shuffle storage` })) { fail(ctx, job, 'rejected'); return; }
      k.blocks[b.id] = stored; k.residentKiB += residentKiB; k.spillKiB += stored.spilledKiB;
      if (stored.spilledKiB > 0) { k.pendingStores[job.id] = b.id; if (!ctx.admit(job, ctx.serviceMs(stored.spilledKiB / (ctx.p.spillMiBps * KIB_PER_MIB) * MS, 'constant', 0))) { delete k.pendingStores[job.id]; executorRemoveBlock(ctx, b.id); } return; }
      stored.ready = true; k.writes++;
      const { rows, residentKiB: memory, spilledKiB, ready, writeJob, ...descriptor } = stored; ctx.reply(job, { ok: true, ptype: 'rows', kb: toKB(REQUEST_KIB), fields: { sparkBlock: descriptor } });
    },
    onFault(ctx, f, active) { if (['crash', 'outage'].includes(f.type) && active) { ctx.k.epoch++; ctx.k.pendingStores = {}; ctx.k.lostBlocks += Object.keys(ctx.k.blocks).length; for (const key of Object.keys(ctx.k.blocks)) executorRemoveBlock(ctx, key); } },
    observe: ctx => ({ detail: { 'stored blocks': Object.keys(ctx.k.blocks).length, 'block writes': ctx.k.writes, 'block fetches': ctx.k.fetches, 'lost shuffle blocks': ctx.k.lostBlocks, 'shuffle resident KiB': ctx.k.residentKiB, 'spill KiB': ctx.k.spillKiB }, records: { blocks: Object.values(ctx.k.blocks).map(({ rows, ...b }) => clone(b)) } })
  });

});
