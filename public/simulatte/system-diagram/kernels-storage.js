(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const registry = node ? require('./kernel-registry.js') : root.SimulatteSystemDiagramKernels;
  factory(registry);
  if (node) module.exports = registry;
})(globalThis, function (registry) {
  'use strict';
  registry.register({ id: 'objectStore', station: { concurrency: 'concurrency', queueCapacity: 'queueCapacity' },
    onRequest(ctx, job) { ctx.admit(job, ctx.serviceMs(ctx.p.baseMs + job.msg.kb / ctx.p.throughputMBps, ctx.p.serviceDist, ctx.p.serviceCv)); },
    onServed(ctx, job) { if (job.msg.op === 'write') ctx.effect(job.msg.idem, { idempotent: true, windowSec: 0 }); ctx.reply(job, { ok: true, ptype: 'blob', kb: job.msg.kb }); },
    observe: () => ({ detail: { model: 'synthetic per-request base time + size / throughput; no durability or shared storage bandwidth prediction' } })
  });
  registry.register({ id: 'replicatedDb', validateParams(p) { if (p.replication !== 'async') throw Error('replicatedDb supports synthetic async replication only; sync/quorum protocols are not implemented'); }, station: { concurrency: 'connections', queueCapacity: 'queueCapacity' },
    init(ctx) { if (ctx.p.replication !== 'async') throw Error('replicatedDb supports synthetic async replication only; sync/quorum protocols are not implemented'); return { leader: 0, replicas: Array.from({ length: ctx.p.replicas }, () => ({ up: true, values: {} })), latest: {}, sequence: 0, electing: false, generation: 0, staleReads: 0, lostWrites: 0 }; },
    onRequest(ctx, job) {
      if (ctx.k.electing || !ctx.k.replicas[ctx.k.leader]?.up) { ctx.reply(job, { ok: false, err: 'unavailable' }); return; }
      ctx.admit(job, ctx.serviceMs(job.msg.op === 'write' ? ctx.p.writeMs : ctx.p.readMs, ctx.p.serviceDist, ctx.p.serviceCv));
    },
    onServed(ctx, job) {
      const k = ctx.k;
      if (k.electing || !k.replicas[k.leader]?.up) { ctx.reply(job, { ok: false, err: 'unavailable' }); return; }
      const key = `key:${job.msg.key}`;
      if (job.msg.op === 'write') {
        const effect = ctx.effect(job.msg.idem, { idempotent: true, windowSec: 0 });
        if (!effect.suppressed) { const version = ++k.sequence; k.replicas[k.leader].values[key] = version; k.latest[key] = version;
          ctx.wake((ctx.p.replicationLagMs + ctx.p.interReplicaMs) / 1000, { kind: 'replicate', key, version, leader: k.leader, generation: k.generation }); }
        ctx.reply(job, { ok: true, ptype: 'rows', kb: ctx.p.responseKb, fields: { version: k.replicas[k.leader].values[key] || 0, synthetic: true } });
      } else {
        let candidates = k.replicas.map((r, i) => ({ ...r, index: i })).filter(r => r.up && (ctx.p.readFrom !== 'followers' || r.index !== k.leader));
        if (ctx.p.readFrom === 'leader') candidates = candidates.filter(r => r.index === k.leader);
        if (!candidates.length) { ctx.reply(job, { ok: false, err: 'unavailable' }); return; }
        const target = candidates[Math.floor(ctx.rand() * candidates.length)], version = target.values[key] || 0, stale = version < (k.latest[key] || 0);
        if (stale) { k.staleReads++; ctx.count('staleReads', 1); }
        ctx.reply(job, { ok: true, ptype: 'rows', kb: ctx.p.responseKb, fields: { replica: target.index, version, stale, synthetic: true } });
      }
    },
    onWake(ctx, payload) {
      const k = ctx.k;
      if (payload.kind === 'replicate' && payload.generation === k.generation && payload.leader === k.leader) {
        for (const r of k.replicas) if (r.up) r.values[payload.key] = Math.max(r.values[payload.key] || 0, payload.version);
      }
      if (payload.kind === 'elect' && payload.generation === k.generation) {
        const candidates = k.replicas.map((r, i) => ({ r, i, version: Math.max(0, ...Object.values(r.values)) })).filter(x => x.r.up).sort((a, b) => b.version - a.version || a.i - b.i);
        if (!candidates.length) { k.electing = false; return; }
        k.leader = candidates[0].i; k.electing = false;
        for (const [key, version] of Object.entries(k.latest)) if ((k.replicas[k.leader].values[key] || 0) < version) { k.lostWrites++; ctx.count('lostAsyncWrites', 1); }
        ctx.log('leader-elected', `Synthetic leader ${k.leader}; asynchronous unreplicated versions may be lost`);
      }
    },
    onFault(ctx, fault, active) {
      const k = ctx.k;
      if (fault.type === 'failLeader' && active) { k.replicas[k.leader].up = false; k.electing = true; k.generation++; ctx.wake(ctx.p.electionMs / 1000, { kind: 'elect', generation: k.generation }); }
      else if (fault.type === 'failLeader' && !active) { k.replicas.forEach(r => { r.up = true; }); }
      else if (fault.type === 'failReplica') { const index = fault.params?.index || 1; if (index < k.replicas.length && index !== k.leader) k.replicas[index].up = !active; }
    },
    observe: ctx => ({ health: ctx.k.electing ? 'electing' : undefined, detail: { leader: ctx.k.leader, followersOnline: ctx.k.replicas.filter((r, i) => r.up && i !== ctx.k.leader).length, staleReads: ctx.k.staleReads, lostAsyncWrites: ctx.k.lostWrites, replicaVersions: ctx.k.replicas.map(r => Math.max(0, ...Object.values(r.values))), model: 'bounded asynchronous version copies and synthetic election; no quorum or consensus' } })
  });
  function origin(ctx, job) {
    const edge = ctx.edges('origin')[0]; if (!edge) { finishCache(ctx, job, { ok: false, err: 'unavailable' }); return; }
    if (ctx.edge(edge).params.mode === 'async') { finishCache(ctx, job, { ok: false, err: 'invalid' }); return; }
    ctx.call(job, edge, {}, { timeoutMs: ctx.p.callTimeoutMs, retries: 0, slot: 'origin' });
  }
  function finishCache(ctx, job, result) {
    const key = `key:${job.msg.key}`, k = ctx.k;
    if (result.ok && (job.msg.op !== 'write' || ctx.p.writePolicy === 'write-through')) {
      if (Object.keys(k.entries).length >= ctx.p.capacityKeys && !k.entries[key]) { const oldest = Object.keys(k.entries).sort((a, b) => k.entries[a].used - k.entries[b].used || a.localeCompare(b))[0]; delete k.entries[oldest]; k.evictions++; }
      k.entries[key] = { expires: ctx.p.ttlSec ? ctx.t + ctx.p.ttlSec : null, used: ++k.tick, kb: result.msg?.kb ?? job.msg.kb, ptype: result.msg?.ptype || job.msg.ptype };
    }
    const ids = [job.id, ...(k.waiters[key] || [])]; delete k.waiters[key]; delete k.pending[key];
    for (const id of ids) { const item = ctx.getJob(id); if (item) ctx.reply(item, result.ok ? { ok: true, kb: result.msg?.kb ?? job.msg.kb, ptype: result.msg?.ptype || job.msg.ptype } : { ok: false, err: result.err }); }
  }
  registry.register({ id: 'cache', validateParams(p) { if (p.failOpen) throw Error('Cache fail-open crash bypass is not implemented; set failOpen=false'); }, station: { concurrency: 'concurrency', queueCapacity: 'concurrency' },
    init(ctx) { if (ctx.p.failOpen) throw Error('Cache fail-open crash bypass is not implemented; set failOpen=false'); return { entries: {}, pending: {}, waiters: {}, hits: 0, misses: 0, coalesced: 0, evictions: 0, tick: 0 }; },
    onRequest(ctx, job) {
      // Generic crash handling refuses arrivals before this hook, so fail-open is explicitly unsupported.
      if (ctx.p.failOpen && ctx.fault.down) { ctx.reply(job, { ok: false, err: 'down' }); return; }
      ctx.admit(job, ctx.p.hitMs * ctx.fault.slowFactor);
    },
    onServed(ctx, job) {
      const key = `key:${job.msg.key}`, k = ctx.k; ctx.release(job);
      if (job.msg.op === 'write') { delete k.entries[key]; if (ctx.p.writePolicy === 'invalidate') { ctx.reply(job, { ok: true }); return; } origin(ctx, job); return; }
      const entry = k.entries[key];
      if (entry && (entry.expires === null || entry.expires > ctx.t)) { entry.used = ++k.tick; k.hits++; ctx.count('cacheHits', 1); ctx.reply(job, { ok: true, kb: entry.kb, ptype: entry.ptype }); return; }
      delete k.entries[key]; k.misses++; ctx.count('cacheMisses', 1);
      if (ctx.p.coalesceMisses && k.pending[key]) { if (!k.waiters[key]) k.waiters[key] = []; k.waiters[key].push(job.id); k.coalesced++; ctx.count('coalescedMisses', 1); return; }
      k.pending[key] = job.id; origin(ctx, job);
    },
    onResult: (ctx, job, slot, result) => finishCache(ctx, job, result),
    onFault(ctx, fault, active) { if (['crash', 'outage'].includes(fault.type) && active) { ctx.k.entries = {}; ctx.k.pending = {}; ctx.k.waiters = {}; } },
    observe: ctx => ({ detail: { keys: Object.keys(ctx.k.entries).length, hits: ctx.k.hits, misses: ctx.k.misses, coalesced: ctx.k.coalesced, evictions: ctx.k.evictions, model: 'TTL and deterministic exact LRU; generic crash fails closed (failOpen metadata is not implemented)' } })
  });
});
