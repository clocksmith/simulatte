// Reference logic for L013 Flash sale inventory reservation. Small enough to read in an interview; tested in flashsale.test.mjs.

// Approach A: one stock authority with conditional decrement, reservations with expiry, idempotency keys.
// Reservation states: held → payment_pending → paid, or held/payment_pending → released. Late payment on a released hold → refund.
export function createInventory({stock, perUser = Infinity}) {
  const s = {available: stock, reservations: new Map(), byKey: new Map(), perUserHeld: new Map()}; let next = 0;
  const holds = user => s.perUserHeld.get(user) || 0;
  const release = r => { if (r.status !== 'held' && r.status !== 'payment_pending') return false; r.status = 'released'; s.available += r.qty; s.perUserHeld.set(r.user, holds(r.user) - r.qty); return true; };
  return {
    // One atomic step in the database: UPDATE stock SET available = available - qty WHERE sku = ? AND available >= qty
    reserve({key, user, qty = 1, now, ttlMs}) {
      if (s.byKey.has(key)) return s.reservations.get(s.byKey.get(key));                    // retried submission
      if (holds(user) + qty > perUser) return {status: 'limit'};
      if (s.available < qty) return {status: 'sold_out'};
      s.available -= qty; const r = {id: `r${++next}`, key, user, qty, status: 'held', expiresAt: now + ttlMs};
      s.reservations.set(r.id, r); s.byKey.set(key, r.id); s.perUserHeld.set(user, holds(user) + qty); return r;
    },
    startPayment(id) { const r = s.reservations.get(id); if (r?.status === 'held') r.status = 'payment_pending'; return r?.status; },
    paymentSucceeded(id) {
      const r = s.reservations.get(id); if (!r) return 'unknown';
      if (r.status === 'held' || r.status === 'payment_pending') { r.status = 'paid'; return 'paid'; }
      return r.status === 'paid' ? 'paid' : (r.status = 'refund', 'refund');                  // paid after release: give the money back
    },
    paymentFailed(id) { const r = s.reservations.get(id); return r && release(r) ? 'released' : r?.status; },
    // Expiry never releases a payment whose outcome is unknown; the reconciler asks the PSP first.
    sweep(now) { const out = []; for (const r of s.reservations.values()) if (r.status === 'held' && r.expiresAt <= now && release(r)) out.push(r.id); return out; },
    pendingOlderThan: cutoff => [...s.reservations.values()].filter(r => r.status === 'payment_pending' && r.expiresAt <= cutoff).map(r => r.id),
    get: id => s.reservations.get(id),
    counts() { const c = {available: s.available, held: 0, payment_pending: 0, paid: 0}; for (const r of s.reservations.values()) if (r.status in c) c[r.status] += r.qty; return c; },
  };
}

// The race that conditional decrement prevents: every request reads stock, then every request writes.
export function naiveReserveAll(stock, requests) {
  const reads = requests.map(() => stock), granted = reads.filter(seen => seen > 0).length;
  return {granted, oversold: Math.max(0, granted - stock)};
}

// Webhooks arrive at least once and out of order; apply each event id once, and never move a final state backwards.
export function createWebhookHandler(inventory) {
  const seen = new Set();
  return event => {
    if (seen.has(event.eventId)) return 'duplicate'; seen.add(event.eventId);
    return event.status === 'succeeded' ? inventory.paymentSucceeded(event.reservationId) : inventory.paymentFailed(event.reservationId);
  };
}

// Hot SKU: split stock into buckets. Try a random bucket, then the rest; sold out only when every bucket is empty.
export function createBucketedStock({stock, buckets, pick = () => 0}) {
  const b = Array.from({length: buckets}, (_, i) => Math.floor(stock / buckets) + (i < stock % buckets ? 1 : 0)); let probes = 0;
  return {
    take() { const start = pick(buckets); for (let i = 0; i < buckets; i++) { const k = (start + i) % buckets; probes++; if (b[k] > 0) { b[k]--; return k; } } return -1; },
    give(k) { b[k]++; },
    total: () => b.reduce((x, y) => x + y, 0),
    probes: () => probes,
  };
}

// Waiting room: admit a fixed number per tick in arrival order; admission tokens are single-use.
export function createWaitingRoom({perTick}) {
  const queue = [], admitted = new Set(), used = new Set();
  return {
    join(user) { queue.push(user); return queue.length; },
    tick() { const batch = queue.splice(0, perTick); for (const u of batch) admitted.add(`tok:${u}`); return batch.length; },
    redeem(token) { if (!admitted.has(token) || used.has(token)) return false; used.add(token); return true; },
    waiting: () => queue.length,
  };
}

// Approach B: one actor per SKU applies commands from an ordered log. State is deterministic, so a
// snapshot plus the commands after its offset rebuilds it exactly.
export function createSkuActor({stock}) {
  let s = {offset: 0, available: stock, reservations: {}, outcomes: {}, next: 0};
  const apply = cmd => {
    if (s.outcomes[cmd.cmdId]) return s.outcomes[cmd.cmdId];                                  // producer retry
    const r = s.reservations[cmd.reservationId]; let out;
    if (cmd.type === 'reserve') out = s.available >= cmd.qty ? (s.available -= cmd.qty, s.reservations[`r${++s.next}`] = {qty: cmd.qty, status: 'held'}, {status: 'held', reservationId: `r${s.next}`}) : {status: 'sold_out'};
    else if (!r) out = {status: 'unknown'};
    else if (cmd.type === 'confirm') out = {status: r.status === 'held' ? (r.status = 'paid') : r.status === 'paid' ? 'paid' : 'refund'};
    else if (cmd.type === 'expire' || cmd.type === 'fail') out = {status: r.status === 'held' ? (s.available += r.qty, r.status = 'released') : r.status};
    s.outcomes[cmd.cmdId] = out; return out;
  };
  return {
    consume(cmd) { s.offset++; return apply(cmd); },
    snapshot: () => JSON.parse(JSON.stringify(s)),
    restore(snap) { s = JSON.parse(JSON.stringify(snap)); },
    offset: () => s.offset,
    outcome: cmdId => s.outcomes[cmdId] || {status: 'pending'},
    state: () => ({available: s.available, held: Object.values(s.reservations).filter(r => r.status === 'held').reduce((n, r) => n + r.qty, 0)}),
  };
}
