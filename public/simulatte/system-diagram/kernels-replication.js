(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const registry = node ? require('./kernel-registry.js') : root.SimulatteSystemDiagramKernels;
  factory(registry);
  if (node) module.exports = registry;
})(globalThis, function (registry) {
  'use strict';
  // Fixed designated leader and individually authored followers. This is not an election or consensus protocol.
  const MS = 1000;
  const identity = msg => JSON.stringify([msg.key, msg.idem]);
  const content = msg => JSON.stringify([msg.key, msg.ptype, msg.kb, msg.tokens, msg.op, msg.fields]);
  const available = ctx => !ctx.fault.down && ctx.t >= ctx.k.readyAt;
  function reply(ctx, row, ok) {
    for (const id of row.waiters.splice(0)) { const job = ctx.job(id); if (job) ctx.reply(job, ok ? { ok: true, kb: 0, fields: { replicaReceipts: Object.keys(row.acks).length + 1, version: row.seq } } : { ok: false, err: 'unavailable' }); }
  }
  function progress(ctx, row) {
    const receipts = Object.keys(row.acks).length + 1;
    if (receipts >= ctx.p.writeQuorum) reply(ctx, row, true);
    const pending = row.edges.filter(id => row.acks[id] !== true);
    if (!pending.length) { if (row.retained) ctx.releaseRetained(row.retainedKey); row.retained = false; row.done = true; row.msg = null; return; }
    const exhausted = pending.every(id => row.inflight[id] !== true && row.attempts[id] >= ctx.p.maxAttempts);
    if (exhausted) { row.exhausted = true; reply(ctx, row, false); ctx.log('replication-exhausted', `${row.id}: unacknowledged copies remain in bounded outbox`); }
  }
  function pump(ctx, row) {
    if (!available(ctx) || row.done || row.exhausted) return;
    for (const edge of row.edges) {
      if (row.acks[edge] === true || row.inflight[edge] === true || row.attempts[edge] >= ctx.p.maxAttempts) continue;
      // Async edges deliberately provide no receipt, so they cannot satisfy an acknowledgement quorum.
      if (ctx.edge(edge).params.mode === 'async') { row.attempts[edge] = ctx.p.maxAttempts; continue; }
      row.attempts[edge]++; row.inflight[edge] = true;
      ctx.call(null, edge, row.msg, { timeoutMs: ctx.p.timeoutMs, retries: 0, slot: { id: row.id, edge, generation: ctx.k.generation } });
    }
    progress(ctx, row);
  }
  function receive(ctx, job, envelope) {
    const k = ctx.k, key = JSON.stringify([job.msg.key]), incoming = job.from ? ctx.edge(job.from.edgeId) : null;
    const routed = incoming && incoming.to === ctx.nodeId && incoming.toPort === 'replica' && incoming.fromPort === 'replicate' && incoming.from === envelope.leader && job.from.nodeId === incoming.from;
    if (!routed) { ctx.count('replication-route-rejected'); ctx.reply(job, { ok: false, err: 'unavailable' }); return; }
    if (ctx.p.role !== 'follower' || typeof envelope.leader !== 'string' || !Number.isInteger(envelope.epoch) || envelope.epoch < 1 || !Number.isInteger(envelope.seq) || envelope.seq < 1) { ctx.reply(job, { ok: false, err: 'unavailable' }); return; }
    const previous = k.versions[key], leaderEpoch = k.epochs[JSON.stringify([envelope.leader])] || 0;
    if (envelope.epoch < leaderEpoch || (previous && previous.leader !== envelope.leader)) { k.stale++; ctx.reply(job, { ok: false, err: 'unavailable' }); return; }
    k.epochs[JSON.stringify([envelope.leader])] = envelope.epoch;
    if (!previous || previous.epoch < envelope.epoch || (previous.epoch === envelope.epoch && previous.seq < envelope.seq)) {
      if (!previous && Object.keys(k.versions).length >= ctx.p.maxRecords) { ctx.reply(job, { ok: false, err: 'rejected' }); return; }
      k.versions[key] = { leader: envelope.leader, epoch: envelope.epoch, seq: envelope.seq };
      ctx.count('replica-applies'); k.applied++;
    } else k.duplicates++;
    ctx.reply(job, { ok: true, kb: 0, fields: { version: k.versions[key].seq, replicaNode: ctx.nodeId } });
  }
  function validateTopology(node, compiled) {
    const outgoing = compiled.edges.filter(e => e.from === node.id && e.fromPort === 'replicate');
    const incoming = compiled.edges.filter(e => e.to === node.id && e.toPort === 'replica');
    const peers = new Map(compiled.nodes.map(n => [n.id, n]));
    if (node.params.role === 'follower' && outgoing.length) throw Error(`Replica ${node.id}: followers cannot replicate or form cycles`);
    if (node.params.role === 'leader' && incoming.length) throw Error(`Replica ${node.id}: designated leaders cannot receive replication`);
    const targets = new Set();
    for (const edge of outgoing) {
      const target = peers.get(edge.to);
      if (edge.params.mode === 'async') throw Error(`Replica ${node.id}: acknowledgement protocol requires sync replication edges`);
      if (!target || target.kernel !== 'linkedReplica' || target.params.role !== 'follower' || edge.toPort !== 'replica') throw Error(`Replica ${node.id}: replicate links must target a linked follower replica port`);
      if (targets.has(target.id)) throw Error(`Replica ${node.id}: duplicate follower ${target.id} cannot count twice`);
      targets.add(target.id);
    }
    const leaders = new Set();
    for (const edge of incoming) {
      const source = peers.get(edge.from);
      if (!source || source.kernel !== 'linkedReplica' || source.params.role !== 'leader' || edge.fromPort !== 'replicate') throw Error(`Replica ${node.id}: replica input requires a designated linked leader`);
      leaders.add(source.id);
    }
    if (leaders.size > 1) throw Error(`Replica ${node.id}: multiple designated leaders are unsupported`);
    if (node.params.role === 'leader' && node.params.writeQuorum > targets.size + 1) throw Error(`Replica ${node.id}: write quorum exceeds distinct linked replicas`);
  }
  registry.register({
    id: 'linkedReplica', immutableParams: ['role'], validateTopology, station: { concurrency: 'concurrency', queueCapacity: 'queueCapacity' },
    init: () => ({ generation: 0, epoch: 1, seq: 0, readyAt: 0, rows: {}, signatures: {}, versions: {}, epochs: {}, applied: 0, duplicates: 0, stale: 0, writes: 0, reads: 0 }),
    onRequest(ctx, job) { if (!available(ctx)) { ctx.reply(job, { ok: false, err: 'unavailable' }); return; } ctx.admit(job, ctx.serviceMs(ctx.p.applyMs, 'constant', 0)); },
    onServed(ctx, job) {
      ctx.release(job);
      const envelope = job.msg.fields?.linkedReplication;
      if (envelope) { receive(ctx, job, envelope); return; }
      if (job.msg.op === 'read') { ctx.k.reads++; ctx.reply(job, { ok: true, kb: 0, fields: { version: ctx.k.versions[JSON.stringify([job.msg.key])] || null, consistency: 'local-version' } }); return; }
      if (ctx.p.role !== 'leader') { ctx.reply(job, { ok: false, err: 'unavailable' }); return; }
      const k = ctx.k, id = identity(job.msg), idem = JSON.stringify([job.msg.idem]), signature = content(job.msg);
      if (Object.hasOwn(k.signatures, idem) && k.signatures[idem] !== signature) { ctx.count('idempotency-conflicts'); ctx.reply(job, { ok: false, err: 'rejected' }); return; }
      let row = k.rows[id];
      if (row) { k.duplicates++; ctx.effect(job.msg.idem, { idempotent: true }); row.waiters.push(job.id); progress(ctx, row); return; }
      if (Object.keys(k.rows).length >= ctx.p.maxRecords) { ctx.reply(job, { ok: false, err: 'rejected' }); return; }
      const linked = ctx.edges('replicate'), targets = new Set(linked.map(e => e.to));
      if (targets.size !== linked.length || linked.some(e => e.to === ctx.nodeId || e.params.mode === 'async')) { ctx.reply(job, { ok: false, err: 'unavailable' }); return; }
      const edges = linked.map(e => e.id);
      if (ctx.p.writeQuorum > edges.length + 1) { ctx.reply(job, { ok: false, err: 'unavailable' }); return; }
      const seq = ++k.seq, msg = ctx.derive(job.msg, { ptype: 'rows', fields: { ...job.msg.fields, linkedReplication: { leader: ctx.nodeId, epoch: k.epoch, seq } } });
      const retainedKey = `outbox:${seq}`;
      if (edges.length && !ctx.retain(retainedKey, msg, { kind: 'replication-outbox', detail: 'Authored follower receipts pending; local commit does not imply replicated durability' })) { ctx.reply(job, { ok: false, err: 'rejected' }); return; }
      row = { id, seq, retainedKey, edges, msg, retained: edges.length > 0, attempts: {}, inflight: {}, acks: {}, waiters: [job.id], done: false, exhausted: false };
      for (const edge of edges) row.attempts[edge] = 0;
      k.rows[id] = row; k.signatures[idem] = signature; k.writes++; k.versions[JSON.stringify([job.msg.key])] = { leader: ctx.nodeId, epoch: k.epoch, seq };
      ctx.effect(job.msg.idem, { idempotent: true }); pump(ctx, row);
    },
    onResult(ctx, job, slot, result) {
      if (!slot || slot.generation !== ctx.k.generation) return;
      const row = ctx.k.rows[slot.id]; if (!row || row.done) return;
      row.inflight[slot.edge] = false;
      if (result.ok) row.acks[slot.edge] = true;
      progress(ctx, row);
      if (!row.done && !row.exhausted && !result.ok) ctx.wake(ctx.p.retryIntervalMs / MS, { kind: 'retry', id: row.id, generation: ctx.k.generation });
    },
    onWake(ctx, wake) {
      if (wake.generation !== ctx.k.generation) return;
      if (wake.kind === 'recovered') { ctx.log('replica-recovered', 'Fixed designated role resumes; no leader election'); for (const row of Object.values(ctx.k.rows)) pump(ctx, row); }
      if (wake.kind === 'retry') { const row = ctx.k.rows[wake.id]; if (row) pump(ctx, row); }
    },
    onParams(ctx, changed) {
      // A changed quorum applies to already committed writes immediately; no retry budget is silently reset.
      for (const row of Object.values(ctx.k.rows)) {
        const resume = changed.includes('maxAttempts') && row.exhausted && row.edges.some(edge => row.acks[edge] !== true && row.attempts[edge] < ctx.p.maxAttempts);
        if (resume) row.exhausted = false;
        progress(ctx, row); if (resume) pump(ctx, row);
      }
    },
    onFault(ctx, fault, active) {
      if (!['crash', 'outage'].includes(fault.type)) return;
      if (active && ctx.fault.down) { ctx.k.generation++; ctx.k.readyAt = ctx.horizonSec + ctx.p.recoveryMs / MS; for (const row of Object.values(ctx.k.rows)) { row.inflight = {}; row.waiters = []; } }
      else if (!active && !ctx.fault.down) { ctx.k.readyAt = ctx.t + ctx.p.recoveryMs / MS; ctx.wake(ctx.p.recoveryMs / MS, { kind: 'recovered', generation: ctx.k.generation }); }
    },
    observe(ctx) {
      const rows = Object.values(ctx.k.rows), pending = rows.filter(r => !r.done);
      return { health: !available(ctx) ? 'degraded' : pending.some(r => r.exhausted) ? 'degraded' : 'ok', detail: { Role: ctx.p.role, 'Local writes': ctx.k.writes, 'Applied copies': ctx.k.applied, 'Duplicate deliveries': ctx.k.duplicates, 'Stale epochs rejected': ctx.k.stale, 'Pending replication': pending.length, 'Exhausted outbox': pending.filter(r => r.exhausted).length, 'Write quorum': ctx.p.writeQuorum, 'Stored keys': Object.keys(ctx.k.versions).length, Assumption: 'Fixed designated leader; per-key versions; no consensus or split-brain safety' } };
    },
  });
});
