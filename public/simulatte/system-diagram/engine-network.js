(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./engine-observability.js') : root.SimulatteSystemDiagramObservability);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulatteSystemDiagramNetwork = api;
})(globalThis, function (observability) {
  'use strict';
  const EPS = 1e-9;
  function initialize(s) { s.network = { sequence: 0, transfers: {}, deliveredKbit: 0, droppedKbit: 0, offeredKbit: 0, serializedKbit: 0, discardedUnserializedKbit: 0 }; return s; }
  function rows(R, edgeId) { return Object.values(R.s.network.transfers).filter(t => t.edgeId === edgeId); }
  function integrate(R, list) { for (const t of list) { const elapsed = Math.max(0, R.s.t - t.lastAt); if (t.phase === 'serializing') { const work = Math.min(t.remainingKbit, elapsed * t.rateKbitSec); t.remainingKbit = Math.max(0, t.remainingKbit - work); R.s.network.serializedKbit += work; } else if (t.phase === 'propagating') t.remainingLatencyMs = Math.max(0, t.remainingLatencyMs - elapsed * 1000); t.lastAt = R.s.t; } }
  function latency(p, f, t) { return p.latencyMs + f.addLatencyMs + t.jitterDraw * p.jitterMs; }
  function drop(R, t, reason, ops) {
    const es = R.s.edges[t.edgeId]; if (reason === 'partition') es.dropped++; else es.lost++; es.errors++; ops.error(es);
    R.s.live.transit--; R.s.network.droppedKbit += t.initialKbit; R.s.network.discardedUnserializedKbit += t.remainingKbit; delete R.s.network.transfers[t.id];
    observability.note(R, 'network-dropped', { nodeId: t.event.n, message: t.event.m, detail: `${t.edgeId}: ${reason}; ${t.remainingKbit} Kbit unfinished` });
  }
  function recalculate(R, edgeId, ops, changedLatency = false) {
    const list = rows(R, edgeId); integrate(R, list); const p = ops.params(edgeId), f = ops.fault(edgeId);
    if (f.partition) { for (const t of list) drop(R, t, 'partition', ops); return; }
    for (const t of list) if (t.phase === 'propagating' && changedLatency) { const next = latency(p, f, t); t.remainingLatencyMs = t.totalLatencyMs > 0 ? t.remainingLatencyMs * next / t.totalLatencyMs : next; t.totalLatencyMs = next; }
    const channels = new Map();
    for (const t of list) if (t.phase !== 'propagating') { const key = p.duplex === 'shared' ? 'both' : t.dir; if (!channels.has(key)) channels.set(key, []); channels.get(key).push(t); }
    for (const channel of channels.values()) {
      channel.sort((a, b) => a.sequence - b.sequence); const selected = p.bandwidthSharing === 'fair' ? channel : channel.slice(0, 1);
      for (const t of channel) { t.rateKbitSec = selected.includes(t) ? p.bandwidthMbps * 1000 / selected.length : 0; t.phase = t.rateKbitSec > 0 ? 'serializing' : 'queued'; }
    }
    for (const t of list) {
      t.generation++; t.lastAt = R.s.t;
      if (t.phase === 'propagating') ops.schedule(R.s.t + t.remainingLatencyMs / 1000, { k: 'net', x: t.id, g: t.generation });
      else if (t.rateKbitSec > 0) ops.schedule(R.s.t + t.remainingKbit / t.rateKbitSec, { k: 'net', x: t.id, g: t.generation });
    }
  }
  function transmit(R, edgeId, dir, event, kb, ops) {
    const f = ops.fault(edgeId); if (f.partition) { R.s.edges[edgeId].dropped++; observability.note(R, 'network-dropped', { nodeId: event.n, message: event.m, detail: `${edgeId}: partition before transfer` }); return false; }
    const existing = rows(R, edgeId); integrate(R, existing); const p = ops.params(edgeId), sequence = ++R.s.network.sequence;
    const transfer = { id: `transfer-${sequence}`, sequence, edgeId, dir, event: { ...event, e: edgeId, t0: R.s.t }, t0: R.s.t, lastAt: R.s.t, initialKbit: Math.max(0, kb) * 8,
      remainingKbit: Math.max(0, kb) * 8, rateKbitSec: 0, jitterDraw: ops.rand(edgeId), lossDraw: ops.rand(edgeId), remainingLatencyMs: 0, totalLatencyMs: 0, generation: 0, phase: 'queued' };
    transfer.totalLatencyMs = latency(p, f, transfer); R.s.network.transfers[transfer.id] = transfer; R.s.network.offeredKbit += transfer.initialKbit; R.s.live.transit++;
    observability.note(R, 'network-enqueued', { nodeId: event.n, message: event.m, detail: `${edgeId}: ${transfer.initialKbit} Kbit; ${p.bandwidthSharing}; ${p.duplex} duplex` });
    recalculate(R, edgeId, ops); return true;
  }
  function process(R, ev, ops) {
    const t = R.s.network.transfers[ev.x]; if (!t || t.generation !== ev.g) return;
    integrate(R, rows(R, t.edgeId));
    if (t.phase === 'serializing') {
      t.remainingKbit = 0; t.phase = 'propagating'; const p = ops.params(t.edgeId), f = ops.fault(t.edgeId); t.totalLatencyMs = latency(p, f, t); t.remainingLatencyMs = t.totalLatencyMs;
      observability.note(R, 'network-serialized', { nodeId: t.event.n, message: t.event.m, detail: `${t.edgeId}; propagation ${t.totalLatencyMs} ms` });
      recalculate(R, t.edgeId, ops); return;
    }
    if (t.phase !== 'propagating') return;
    const p = ops.params(t.edgeId), f = ops.fault(t.edgeId), loss = 1 - (1 - p.lossRate) * (1 - f.lossRate);
    if (f.partition || t.lossDraw < loss) { drop(R, t, f.partition ? 'partition' : 'loss', ops); recalculate(R, t.edgeId, ops); return; }
    delete R.s.network.transfers[t.id]; R.s.network.deliveredKbit += t.initialKbit;
    observability.note(R, 'network-delivered', { nodeId: t.event.n, message: t.event.m, detail: `${t.edgeId}; ${t.initialKbit} Kbit` }); ops.schedule(R.s.t, t.event);
  }
  function update(R, edgeId, ops) { recalculate(R, edgeId, ops, true); }
  function view(s) { return Object.values(s.network.transfers).map(t => ({ id: t.id, edgeId: t.edgeId, kind: t.dir === 'f' ? 'req' : 'res', t0: t.t0,
    t1: t.phase === 'propagating' ? s.t + Math.max(0, t.remainingLatencyMs - (s.t - t.lastAt) * 1000) / 1000 : t.rateKbitSec > 0 ? s.t + Math.max(0, t.remainingKbit - (s.t - t.lastAt) * t.rateKbitSec) / t.rateKbitSec + t.totalLatencyMs / 1000 : null,
    ptype: t.event.m.ptype, ok: t.event.k === 'arr' ? true : t.event.ok, phase: t.phase, remainingKbit: Math.max(0, t.remainingKbit - (t.phase === 'serializing' ? (s.t - t.lastAt) * t.rateKbitSec : 0)), rateKbitSec: t.rateKbitSec, generation: t.generation })); }
  function reconcile(s) { const pendingWork = Object.values(s.network.transfers).reduce((sum, t) => sum + t.remainingKbit, 0), tolerance = 1e-6 + s.network.offeredKbit * 1e-10; if (Math.abs(s.network.offeredKbit - s.network.serializedKbit - s.network.discardedUnserializedKbit - pendingWork) > tolerance) throw Error('Network serialized work does not reconcile'); const active = Object.values(s.network.transfers).reduce((sum, t) => sum + t.initialKbit, 0); if (Math.abs(s.network.offeredKbit - s.network.deliveredKbit - s.network.droppedKbit - active) > 1e-5) throw Error('Network transfer byte ledger does not reconcile'); return true; }
  return Object.freeze({ initialize, transmit, process, update, view, reconcile });
});
