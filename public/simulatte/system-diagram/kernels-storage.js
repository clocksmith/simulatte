(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const registry = node ? require('./kernel-registry.js') : root.SimulatteSystemDiagramKernels;
  factory(registry, node ? require('./protocol-routing.js') : root.SimulatteSystemDiagramProtocolRouting);
  if (node) module.exports = registry;
})(globalThis, function (registry, protocol) {
  'use strict';
  // Storage kernels: replicatedDb, cache, objectStore. Parameters are read through ctx.p on
  // every use; kernel state in ctx.k is JSON-safe and all randomness comes from the node stream.
  const MS = 1000;
  const KB_PER_MB = 1024;
  const ACK_KB = 0.1;
  const LRU_SAMPLE = 5;
  const REPLICATION_LOG_LIMIT = 50000;
  // Each follower's async lag drifts smoothly between writes, so consecutive writes see similar
  // delays instead of independent draws whose running maximum would inflate the ordered stream.
  const LAG_SMOOTHING = 0.9;
  const sampleMs = (ctx, meanMs) => (meanMs > 0 ? ctx.exp(meanMs) : 0);
  const keyOf = msg => String(msg.key === undefined || msg.key === null ? '' : msg.key);
  const isWrite = msg => msg.op === 'write';

  // ---------------------------------------------------------------- replicatedDb
  // One node holds a leader and followers in replica slots 0..replicas-1; slot 0 starts as leader.
  // Writes append to an ordered replication log; each follower applies entries in log order at
  // sampled times, so the follower with the highest applied sequence holds a prefix superset.
  // Fully applied entries are pruned, so the log only holds writes still replicating.
  function dbReplica(t, lagMs) { return { up: true, faults: 0, tail: t, catchUpUntil: t, lagMs }; }
  function dbLagMs(ctx, replica) {
    const mean = ctx.p.replicationLagMs;
    if (!Number.isFinite(replica.lagMs)) replica.lagMs = mean;
    replica.lagMs = LAG_SMOOTHING * replica.lagMs + (1 - LAG_SMOOTHING) * sampleMs(ctx, mean);
    return replica.lagMs;
  }
  // Initial replicas start in sync; replicas added by a live parameter change must catch up first.
  function dbEnsure(ctx) {
    const k = ctx.k, n = ctx.p.replicas, initial = k.replicas.length === 0;
    while (k.replicas.length < n) {
      const replica = dbReplica(ctx.t, ctx.p.replicationLagMs);
      if (!initial) replica.catchUpUntil = ctx.t + sampleMs(ctx, ctx.p.replicationLagMs) / MS;
      k.replicas.push(replica);
    }
    if (k.leader !== null && k.leader >= n) {
      const next = dbUpSlots(ctx).find(r => r < n);
      k.leader = next === undefined ? null : next;
      k.epoch += 1;
      ctx.log('leader', k.leader === null ? 'Leader slot removed; no replica available' : `Leader slot removed; replica ${k.leader} leads`);
    }
  }
  function dbUpSlots(ctx) {
    const out = [];
    for (let r = 0; r < Math.min(ctx.p.replicas, ctx.k.replicas.length); r += 1) if (ctx.k.replicas[r].up) out.push(r);
    return out;
  }
  function dbLeaderReady(ctx) { const k = ctx.k; return k.leader !== null && !k.electing && k.replicas[k.leader].up; }
  function dbFindEntry(log, seq) {
    let lo = 0, hi = log.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (log[mid].seq === seq) return log[mid];
      if (log[mid].seq < seq) lo = mid + 1; else hi = mid - 1;
    }
    return null;
  }
  function dbHasLatest(ctx, r, key, t) {
    const k = ctx.k, seq = k.latest[key];
    if (seq === undefined) return true;
    const entry = dbFindEntry(k.log, seq);
    if (!entry) return true;
    const at = entry.applied[r];
    return at !== null && at !== undefined && at <= t;
  }
  function dbPrune(ctx) {
    const k = ctx.k, replicas = Array.from({ length: ctx.p.replicas }, (_, r) => r);
    while (k.log.length) {
      const entry = k.log[0];
      if (!replicas.every(r => entry.applied[r] !== null && entry.applied[r] !== undefined && entry.applied[r] <= ctx.t)) break;
      k.log.shift();
      if (k.latest[entry.key] === entry.seq) delete k.latest[entry.key];
    }
  }
  // Freshness is judged against the latest acknowledged write: missing an in-flight write is not stale.
  function dbRebuildLatest(k) {
    k.latest = {};
    for (const entry of k.log) if (entry.acked) k.latest[entry.key] = entry.seq;
  }
  function dbAck(k, entry) {
    entry.acked = true;
    if (!(k.latest[entry.key] > entry.seq)) k.latest[entry.key] = entry.seq;
  }
  // Followers that can serve reads: up, not the leader and caught up after a restart.
  function dbReadableFollowers(ctx) {
    const k = ctx.k;
    return dbUpSlots(ctx).filter(r => r !== k.leader && ctx.t >= k.replicas[r].catchUpUntil);
  }
  function dbSample(ctx, list, count) {
    const pool = list.slice(), out = [];
    while (out.length < count && pool.length) out.push(pool.splice(Math.floor(ctx.rand() * pool.length) % pool.length, 1)[0]);
    return out;
  }
  function dbReadSet(ctx) {
    const k = ctx.k, p = ctx.p, R = p.readQuorum, followers = dbReadableFollowers(ctx);
    const leaderReady = dbLeaderReady(ctx);
    if (p.readFrom === 'leader' || (p.readFrom === 'followers' && p.replicas === 1)) {
      if (!leaderReady || followers.length < R - 1) return null;
      return [k.leader, ...dbSample(ctx, followers, R - 1)];
    }
    const pool = p.readFrom === 'any' && leaderReady ? [k.leader, ...followers] : followers;
    return pool.length >= R ? dbSample(ctx, pool, R) : null;
  }
  function dbWriteBlocked(ctx) {
    const k = ctx.k, p = ctx.p;
    if (!dbLeaderReady(ctx)) return k.electing ? 'electing' : 'no leader';
    const up = dbUpSlots(ctx).length;
    if (p.replication === 'sync' && up < p.replicas) return 'sync replication needs every replica';
    if (p.replication === 'quorum' && (p.writeQuorum > p.replicas || up < p.writeQuorum)) return `write quorum ${p.writeQuorum} not reachable`;
    return null;
  }
  function dbUnavailable(ctx, job) {
    ctx.k.unavailable += 1;
    ctx.reply(job, { ok: false, err: 'unavailable' });
  }
  function dbWrite(ctx, job) {
    const k = ctx.k, p = ctx.p, t = ctx.t, n = p.replicas;
    const applied = new Array(n).fill(null), waits = [];
    applied[k.leader] = t;
    for (const r of dbUpSlots(ctx)) {
      if (r === k.leader) continue;
      const replica = k.replicas[r];
      const delayMs = p.replication === 'async' ? dbLagMs(ctx, replica) : sampleMs(ctx, p.interReplicaMs);
      const at = Math.max(t + delayMs / MS, replica.tail, replica.catchUpUntil);
      replica.tail = at;
      applied[r] = at;
      waits.push(at - t);
    }
    k.seq += 1;
    const key = keyOf(job.msg);
    if (k.log.length >= REPLICATION_LOG_LIMIT) {
      const dropped = k.log.shift();
      if (k.latest[dropped.key] === dropped.seq) delete k.latest[dropped.key];
      k.logOverflow += 1;
    }
    const entry = { seq: k.seq, key, t, applied, acked: false };
    k.log.push(entry);
    k.writes += 1;
    ctx.effect(job.msg.idem, { idempotent: false });
    waits.sort((a, b) => a - b);
    let waitSec = 0;
    if (p.replication === 'sync') waitSec = waits.length ? waits[waits.length - 1] : 0;
    else if (p.replication === 'quorum' && p.writeQuorum > 1) waitSec = waits[p.writeQuorum - 2];
    if (waitSec > 0) { ctx.wake(waitSec, { kind: 'ack', job, seq: entry.seq, epoch: k.epoch, crash: k.crashEpoch }); return; }
    dbAck(k, entry);
    ctx.reply(job, { ok: true, kb: ACK_KB });
  }
  function dbRead(ctx, job, set) {
    const k = ctx.k, p = ctx.p, key = keyOf(job.msg);
    const fresh = set.some(r => dbHasLatest(ctx, r, key, ctx.t));
    k.reads += 1;
    if (!fresh) k.staleReads += 1;
    const fields = fresh ? {} : { stale: true };
    let waitMs = 0;
    for (let i = 1; i < set.length; i += 1) waitMs = Math.max(waitMs, sampleMs(ctx, p.interReplicaMs));
    if (waitMs > 0) { ctx.wake(waitMs / MS, { kind: 'read', job, fields, crash: k.crashEpoch }); return; }
    ctx.reply(job, { ok: true, kb: p.responseKb, fields });
  }
  // Promote the up follower with the highest sequence applied before the leader failed.
  // Writes the new leader never received are lost; surviving writes re-replicate from it.
  function dbPromote(ctx) {
    const k = ctx.k, failT = k.failT;
    const candidates = dbUpSlots(ctx);
    if (!candidates.length) { k.leader = null; ctx.log('election-stalled', 'No replica available to promote; writes unavailable'); return; }
    const highest = r => { let best = 0; for (const e of k.log) if (e.applied[r] !== null && e.applied[r] !== undefined && e.applied[r] <= failT) best = e.seq; return best; };
    let winner = candidates[0], winnerSeq = highest(winner);
    for (const r of candidates.slice(1)) { const s = highest(r); if (s > winnerSeq) { winner = r; winnerSeq = s; } }
    const kept = [];
    let lost = 0, lostUnacked = 0;
    for (const e of k.log) {
      const at = e.applied[winner];
      if (at === null || at === undefined || at > failT) { if (e.acked) lost += 1; else lostUnacked += 1; continue; }
      kept.push(e);
    }
    k.log = kept;
    dbRebuildLatest(k);
    k.leader = winner;
    k.epoch += 1;
    k.lostWrites += lost;
    k.lostUnacked += lostUnacked;
    for (const r of candidates) {
      if (r === winner) continue;
      const replica = k.replicas[r];
      for (const e of k.log) {
        const at = e.applied[r];
        if (at === null || at === undefined || at > failT) {
          replica.tail = Math.max(ctx.t + sampleMs(ctx, ctx.p.replicationLagMs) / MS, replica.tail);
          e.applied[r] = replica.tail;
        }
      }
    }
    for (const e of k.log) e.applied[winner] = Math.min(e.applied[winner], ctx.t);
    k.replicas[winner].tail = ctx.t;
    ctx.log('leader-promoted', `Replica ${winner} promoted to leader; ${lost} acknowledged write${lost === 1 ? '' : 's'} lost, ${lostUnacked} unacknowledged discarded`);
  }
  function dbFailSlot(ctx, slot, reason) {
    const k = ctx.k;
    if (slot >= ctx.p.replicas || slot >= k.replicas.length) { ctx.log('replica-missing', `No replica slot ${slot}; fault ignored`); return false; }
    const replica = k.replicas[slot];
    replica.faults += 1;
    if (!replica.up) return true;
    replica.up = false;
    // A scheduled application is not a durable copy when its target goes down.
    // Retain the log row until recovery actually catches this replica up.
    for (const e of k.log) if (e.applied[slot] !== null && e.applied[slot] > ctx.t) e.applied[slot] = null;
    if (slot === k.leader && !k.electing) {
      // Replication from the failed leader stops: entries not yet applied on a follower never arrive.
      for (const e of k.log) for (let r = 0; r < e.applied.length; r += 1) if (r !== slot && e.applied[r] !== null && e.applied[r] > ctx.t) e.applied[r] = null;
      for (const other of k.replicas) other.tail = Math.min(other.tail, ctx.t);
      k.leader = null;
      k.failT = ctx.t;
      k.epoch += 1;
      k.elections += 1;
      k.electionGen += 1;
      k.electing = { until: ctx.t + ctx.p.electionMs / MS };
      ctx.log('leader-failed', `Leader replica ${slot} failed (${reason}); election for ${ctx.p.electionMs} ms`);
      ctx.wake(ctx.p.electionMs / MS, { kind: 'elect', gen: k.electionGen });
    } else ctx.log('replica-down', `Replica ${slot} down (${reason})`);
    return true;
  }
  function dbRecoverSlot(ctx, slot) {
    const k = ctx.k, replica = k.replicas[slot];
    if (!replica) return;
    replica.faults = Math.max(0, replica.faults - 1);
    if (replica.faults > 0 || replica.up) return;
    replica.up = true;
    replica.catchUpUntil = ctx.t + sampleMs(ctx, ctx.p.replicationLagMs) / MS;
    replica.tail = Math.max(replica.tail, replica.catchUpUntil);
    for (const e of k.log) if (e.applied[slot] === null || e.applied[slot] === undefined) e.applied[slot] = replica.catchUpUntil;
    ctx.log('replica-up', `Replica ${slot} rejoined; catching up`);
    if (k.leader === null && !k.electing) dbPromote(ctx);
  }

  registry.register({
    id: 'replicatedDb',
    station: { concurrency: 'connections', queueCapacity: 'queueCapacity' },
    init: () => ({ replicas: [], leader: 0, electing: null, electionGen: 0, failT: 0, crashT: 0, epoch: 0, crashEpoch: 0, down: false, seq: 0, log: [], latest: {}, downBy: { failLeader: [], failReplica: [] }, reads: 0, writes: 0, staleReads: 0, lostWrites: 0, lostUnacked: 0, unavailable: 0, elections: 0, logOverflow: 0 }),
    start(ctx) { dbEnsure(ctx); },
    onRequest(ctx, job) {
      dbEnsure(ctx);
      const p = ctx.p;
      if (isWrite(job.msg) ? dbWriteBlocked(ctx) : !dbReadSet(ctx)) { dbUnavailable(ctx, job); return; }
      ctx.admit(job, ctx.serviceMs(isWrite(job.msg) ? p.writeMs : p.readMs, p.serviceDist, p.serviceCv));
    },
    onServed(ctx, job) {
      dbEnsure(ctx);
      dbPrune(ctx);
      if (ctx.p.errorRate > 0 && ctx.rand() < ctx.p.errorRate) { ctx.reply(job, { ok: false, err: 'error' }); return; }
      if (isWrite(job.msg)) {
        if (dbWriteBlocked(ctx)) { dbUnavailable(ctx, job); return; }
        dbWrite(ctx, job);
        return;
      }
      const set = dbReadSet(ctx);
      if (!set) { dbUnavailable(ctx, job); return; }
      dbRead(ctx, job, set);
    },
    onWake(ctx, payload) {
      const k = ctx.k;
      if (payload.kind === 'elect') {
        if (payload.gen !== k.electionGen || !k.electing) return;
        k.electing = null;
        dbPromote(ctx);
        return;
      }
      if (payload.crash !== k.crashEpoch) return;
      if (payload.kind === 'ack') {
        // A leadership change while waiting for acks leaves the outcome unknown to the client.
        if (payload.epoch !== k.epoch) { dbUnavailable(ctx, payload.job); return; }
        const entry = dbFindEntry(k.log, payload.seq);
        if (entry) dbAck(k, entry);
        ctx.reply(payload.job, { ok: true, kb: ACK_KB });
      } else if (payload.kind === 'read') ctx.reply(payload.job, { ok: true, kb: ctx.p.responseKb, fields: payload.fields });
    },
    onFault(ctx, fault, active) {
      const k = ctx.k;
      dbEnsure(ctx);
      if (ctx.fault.down !== k.down) {
        k.down = ctx.fault.down;
        k.crashEpoch += 1;
        if (k.down) { k.crashT = ctx.t; ctx.log('cluster-down', 'Cluster down'); }
        else {
          // Storage is durable: replicas restart with their data and followers catch up.
          for (const r of dbUpSlots(ctx)) {
            if (r === k.leader) continue;
            const replica = k.replicas[r];
            replica.catchUpUntil = ctx.t + sampleMs(ctx, ctx.p.replicationLagMs) / MS;
            replica.tail = Math.max(replica.tail, replica.catchUpUntil);
            for (const e of k.log) if (e.applied[r] === null || e.applied[r] === undefined || e.applied[r] > k.crashT) e.applied[r] = replica.catchUpUntil;
          }
          ctx.log('cluster-up', 'Cluster restarted; followers catching up');
        }
      }
      if (fault.type === 'failLeader') {
        if (active) {
          const slot = k.leader;
          if (slot === null || k.electing) { k.downBy.failLeader.push(null); ctx.log('leader-failed', 'Leader failure ignored: no current leader'); return; }
          dbFailSlot(ctx, slot, 'failLeader');
          k.downBy.failLeader.push(slot);
        } else {
          const slot = k.downBy.failLeader.shift();
          if (slot !== null && slot !== undefined) dbRecoverSlot(ctx, slot);
        }
      } else if (fault.type === 'failReplica') {
        const slot = fault.params && Number.isInteger(fault.params.index) ? fault.params.index : 1;
        if (active) k.downBy.failReplica.push(dbFailSlot(ctx, slot, 'failReplica') ? slot : null);
        else {
          const index = k.downBy.failReplica.indexOf(slot);
          if (index >= 0) { k.downBy.failReplica.splice(index, 1); dbRecoverSlot(ctx, slot); }
        }
      }
    },
    observe(ctx) {
      const k = ctx.k, p = ctx.p, n = Math.min(p.replicas, k.replicas.length);
      let up = 0;
      const detail = { Leader: k.electing ? 'electing' : k.leader === null ? 'none' : `replica ${k.leader}`, Replication: p.replication };
      for (let r = 0; r < n; r += 1) {
        const replica = k.replicas[r];
        if (replica.up) up += 1;
        let state;
        if (!replica.up) state = 'down';
        else if (r === k.leader) state = 'leader';
        else if (ctx.t < replica.catchUpUntil) state = 'catching up';
        else {
          let lagMs = 0;
          for (const e of k.log) { const at = e.applied[r]; if (at === null || at === undefined || at > ctx.t) { lagMs = (ctx.t - e.t) * MS; break; } }
          state = `up, lag ${Math.round(lagMs)} ms`;
        }
        detail[`Replica ${r}`] = state;
      }
      detail['Replicas up'] = `${up}/${p.replicas}`;
      detail['Replication backlog'] = k.log.length;
      detail['Stale reads'] = k.staleReads;
      detail['Lost writes'] = k.lostWrites;
      detail['Discarded unacknowledged writes'] = k.lostUnacked;
      detail.Unavailable = k.unavailable;
      detail.Elections = k.elections;
      if (k.logOverflow) detail['Untracked writes'] = k.logOverflow;
      if (k.electing) return { health: 'electing', detail };
      if (!k.down && (k.leader === null || up < p.replicas)) return { health: 'degraded', detail };
      return { detail };
    },
  });

  // ---------------------------------------------------------------- cache
  // Keyed entries with TTL and sampled-LRU eviction. Misses release their worker and call the
  // origin; with coalescing, concurrent misses for a key wait on the first origin call.
  // A crash flushes contents. While crashed, failOpen lets the core forward arrivals straight to
  // the origin (declared bypass); otherwise callers see 'down'. Either way the cache restarts cold.
  function cacheDelete(k, key) {
    if (!k.entries[key]) return;
    delete k.entries[key];
    const pos = k.index[key], last = k.keys.pop();
    if (last !== key) { k.keys[pos] = last; k.index[last] = pos; }
    delete k.index[key];
  }
  function cacheEvict(ctx) {
    const k = ctx.k;
    let victim = null;
    for (let i = 0; i < LRU_SAMPLE && k.keys.length; i += 1) {
      const key = k.keys[Math.floor(ctx.rand() * k.keys.length) % k.keys.length];
      if (victim === null || k.entries[key].used < k.entries[victim].used) victim = key;
    }
    if (victim !== null) { cacheDelete(k, victim); k.evictions += 1; }
  }
  function cacheFill(ctx, key, kb) {
    const k = ctx.k, p = ctx.p;
    if (!k.entries[key]) {
      while (k.keys.length >= p.capacityKeys) cacheEvict(ctx);
      k.index[key] = k.keys.length;
      k.keys.push(key);
    }
    k.entries[key] = { exp: p.ttlSec > 0 ? ctx.t + p.ttlSec : null, used: ctx.t, kb: Number.isFinite(kb) ? kb : null };
  }
  function cacheLookup(ctx, key) {
    const k = ctx.k, entry = k.entries[key];
    if (!entry) return null;
    if (entry.exp !== null && ctx.t >= entry.exp) { cacheDelete(k, key); k.expirations += 1; return null; }
    entry.used = ctx.t;
    return entry;
  }
  function cacheOriginCall(ctx, job, slot) {
    const origin = ctx.edges('origin')[0];
    ctx.release(job);
    ctx.k.originCalls += 1;
    ctx.call(job, origin.id, {}, { timeoutMs: ctx.p.callTimeoutMs, retries: 0, slot: { ...slot, epoch: ctx.k.epoch } });
  }
  const cacheReplyResult = (ctx, job, result, extra) => protocol.passThrough(ctx, job, result, result.ok ? extra : undefined);

  registry.register({
    id: 'cache',
    station: { concurrency: 'concurrency', queueCapacity: 'queueCapacity' },
    bypass: { port: 'origin', param: 'failOpen' },
    init: () => ({ entries: {}, keys: [], index: {}, inflight: {}, epoch: 0, hits: 0, misses: 0, evictions: 0, expirations: 0, coalesced: 0, originCalls: 0, flushes: 0, writes: 0, protocolBypasses: 0 }),
    onRequest(ctx, job) { ctx.admit(job, ctx.serviceMs(ctx.p.hitMs, 'constant', 0)); },
    onServed(ctx, job) {
      const k = ctx.k, p = ctx.p, key = keyOf(job.msg), hasOrigin = ctx.edges('origin').length > 0;
      if (protocol.hasProtocol(job.msg)) {
        k.protocolBypasses++;
        if (isWrite(job.msg)) k.writes++;
        if (!hasOrigin) { ctx.reply(job, { ok: false, err: 'unavailable' }); return; }
        cacheOriginCall(ctx, job, { kind: 'protocol' });
        return;
      }
      if (isWrite(job.msg)) {
        k.writes += 1;
        if (!hasOrigin) { cacheFill(ctx, key, job.msg.kb); ctx.reply(job, { ok: true, kb: ACK_KB }); return; }
        if (p.writePolicy === 'invalidate') cacheDelete(k, key);
        cacheOriginCall(ctx, job, { kind: 'write', key });
        return;
      }
      const entry = cacheLookup(ctx, key);
      if (entry) {
        k.hits += 1;
        const out = { ok: true, fields: { cache: 'hit' } };
        if (entry.kb !== null) out.kb = entry.kb;
        ctx.reply(job, out);
        return;
      }
      k.misses += 1;
      if (!hasOrigin) { ctx.reply(job, { ok: true, fields: { cache: 'miss' } }); return; }
      if (p.coalesceMisses && k.inflight[key]) {
        k.inflight[key].push(job);
        k.coalesced += 1;
        ctx.release(job);
        return;
      }
      if (p.coalesceMisses) k.inflight[key] = [];
      cacheOriginCall(ctx, job, { kind: 'fill', key });
    },
    onResult(ctx, job, slot, result) {
      const k = ctx.k;
      if (slot.epoch !== k.epoch) return;
      if (slot.kind === 'protocol') { cacheReplyResult(ctx, job, result); return; }
      if (slot.kind === 'write') {
        if (result.ok && ctx.p.writePolicy === 'write-through') cacheFill(ctx, slot.key, job.msg.kb);
        cacheReplyResult(ctx, job, result);
        return;
      }
      if (result.ok) cacheFill(ctx, slot.key, result.msg ? result.msg.kb : null);
      cacheReplyResult(ctx, job, result, { cache: 'miss' });
      const waiters = k.inflight[slot.key];
      if (!waiters) return;
      delete k.inflight[slot.key];
      for (const waiter of waiters) cacheReplyResult(ctx, waiter, result, { cache: 'coalesced' });
    },
    onFault(ctx) {
      const k = ctx.k;
      if (!ctx.fault.down || (!k.keys.length && !Object.keys(k.inflight).length)) return;
      // The core resets in-flight work on crash, including coalesced waiters held here.
      k.entries = {};
      k.keys = [];
      k.index = {};
      k.inflight = {};
      k.epoch += 1;
      k.flushes += 1;
      ctx.log('cache-flush', 'Cache crashed; contents flushed');
    },
    observe(ctx) {
      const k = ctx.k, lookups = k.hits + k.misses;
      return { detail: { 'Hit ratio': lookups ? Number((k.hits / lookups).toFixed(3)) : 0, Size: `${k.keys.length}/${ctx.p.capacityKeys}`, Hits: k.hits, Misses: k.misses, Evictions: k.evictions, Expirations: k.expirations, Coalesced: k.coalesced, 'Origin calls': k.originCalls, 'Protocol bypasses': k.protocolBypasses, Flushes: k.flushes } };
    },
  });

  // ---------------------------------------------------------------- objectStore
  // Station whose service time is first-byte time plus object size over per-request throughput.
  registry.register({
    id: 'objectStore',
    station: { concurrency: 'concurrency', queueCapacity: 'queueCapacity' },
    init: () => ({ reads: 0, writes: 0, bytesKb: 0 }),
    onRequest(ctx, job) {
      const p = ctx.p, kb = Number.isFinite(job.msg.kb) ? job.msg.kb : 0;
      const meanMs = p.baseMs + (kb / KB_PER_MB / p.throughputMBps) * MS;
      ctx.admit(job, ctx.serviceMs(meanMs, p.serviceDist, p.serviceCv));
    },
    onServed(ctx, job) {
      const k = ctx.k, p = ctx.p, kb = Number.isFinite(job.msg.kb) ? job.msg.kb : 0;
      if (p.errorRate > 0 && ctx.rand() < p.errorRate) { ctx.reply(job, { ok: false, err: 'error' }); return; }
      k.bytesKb += kb;
      if (isWrite(job.msg)) {
        k.writes += 1;
        ctx.effect(job.msg.idem, { idempotent: false });
        ctx.reply(job, { ok: true, kb: ACK_KB });
        return;
      }
      k.reads += 1;
      ctx.reply(job, { ok: true, kb });
    },
    observe(ctx) {
      const k = ctx.k;
      return { detail: { Reads: k.reads, Writes: k.writes, 'Transferred MB': Number((k.bytesKb / KB_PER_MB).toFixed(2)) } };
    },
  });
});
