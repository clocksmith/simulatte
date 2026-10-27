import test from 'node:test';
import assert from 'node:assert/strict';
import {createInventory, naiveReserveAll, createWebhookHandler, createBucketedStock, createWaitingRoom, createSkuActor} from './flashsale.mjs';

const TTL = 600000;
const conserved = (inv, stock) => { const c = inv.counts(); assert.equal(c.available + c.held + c.payment_pending + c.paid, stock); assert.ok(c.available >= 0); };

test('flash.naive-oversell: read-then-write lets every concurrent buyer see stock', () => {
  assert.deepEqual(naiveReserveAll(100, Array(5000).fill(0)), {granted: 5000, oversold: 4900});
});

test('flash.atomic-reserve: conditional decrement grants exactly the stock and never goes negative', () => {
  const inv = createInventory({stock: 100}); let granted = 0;
  for (let i = 0; i < 5000; i++) if (inv.reserve({key: `k${i}`, user: `u${i}`, now: 0, ttlMs: TTL}).status === 'held') granted++;
  assert.equal(granted, 100); conserved(inv, 100); assert.equal(inv.counts().available, 0);
});

test('flash.idempotent-checkout: a retried submission with the same key returns the same reservation', () => {
  const inv = createInventory({stock: 5}), a = inv.reserve({key: 'k', user: 'u', now: 0, ttlMs: TTL}), b = inv.reserve({key: 'k', user: 'u', now: 1, ttlMs: TTL});
  assert.equal(a.id, b.id); assert.equal(inv.counts().available, 4);
});

test('flash.per-user-limit: one buyer cannot hold more than the limit across keys', () => {
  const inv = createInventory({stock: 10, perUser: 2});
  const out = [1, 2, 3].map(i => inv.reserve({key: `k${i}`, user: 'u', now: 0, ttlMs: TTL}).status);
  assert.deepEqual(out, ['held', 'held', 'limit']);
});

test('flash.webhook-dedupe: duplicate and late contradicting webhooks do not change a final state', () => {
  const inv = createInventory({stock: 1}), hook = createWebhookHandler(inv), r = inv.reserve({key: 'k', user: 'u', now: 0, ttlMs: TTL});
  inv.startPayment(r.id);
  assert.equal(hook({eventId: 'e1', reservationId: r.id, status: 'succeeded'}), 'paid');
  assert.equal(hook({eventId: 'e1', reservationId: r.id, status: 'succeeded'}), 'duplicate');
  assert.equal(hook({eventId: 'e0', reservationId: r.id, status: 'failed'}), 'paid');        // older failure arrives late
  conserved(inv, 1); assert.equal(inv.counts().paid, 1);
});

test('flash.expiry-returns-stock: expired holds return stock, and a payment after release becomes a refund', () => {
  const inv = createInventory({stock: 2}), a = inv.reserve({key: 'a', user: 'u1', now: 0, ttlMs: 1000}), b = inv.reserve({key: 'b', user: 'u2', now: 0, ttlMs: 1000});
  inv.startPayment(b.id);
  assert.deepEqual(inv.sweep(1000), [a.id]); assert.equal(inv.counts().available, 1);
  assert.equal(inv.paymentSucceeded(a.id), 'refund'); conserved(inv, 2);
});

test('flash.unknown-not-released: the sweeper leaves payment-pending holds for the reconciler', () => {
  const inv = createInventory({stock: 1}), r = inv.reserve({key: 'k', user: 'u', now: 0, ttlMs: 1000}); inv.startPayment(r.id);
  assert.deepEqual(inv.sweep(5000), []); assert.deepEqual(inv.pendingOlderThan(5000), [r.id]);
  assert.equal(inv.paymentFailed(r.id), 'released'); assert.equal(inv.counts().available, 1);   // reconciler learned the PSP declined
});

test('flash.invariant: random interleavings of reserve, pay, fail, sweep and retries conserve stock', () => {
  let seed = 7; const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const inv = createInventory({stock: 50, perUser: 3}), hook = createWebhookHandler(inv), ids = [];
  for (let step = 0; step < 4000; step++) {
    const op = rnd(6), now = step * 10;
    if (op <= 1) { const r = inv.reserve({key: `k${rnd(400)}`, user: `u${rnd(60)}`, now, ttlMs: 2000}); if (r.id) ids.push(r.id); }
    else if (op === 2 && ids.length) inv.startPayment(ids[rnd(ids.length)]);
    else if (op === 3 && ids.length) hook({eventId: `e${rnd(3000)}`, reservationId: ids[rnd(ids.length)], status: rnd(2) ? 'succeeded' : 'failed'});
    else if (op === 4) inv.sweep(now);
    else if (ids.length) inv.paymentFailed(ids[rnd(ids.length)]);
    conserved(inv, 50);
  }
});

test('flash.bucket-no-oversell: bucketed stock grants exactly the total and drains every bucket before sold out', () => {
  let seed = 1; const stock = createBucketedStock({stock: 103, buckets: 8, pick: n => (seed = (seed * 31 + 7) % 997) % n});
  let granted = 0; for (let i = 0; i < 2000; i++) if (stock.take() >= 0) granted++;
  assert.equal(granted, 103); assert.equal(stock.total(), 0);
});

test('flash.admission-rate: the waiting room admits a fixed number per tick and tokens work once', () => {
  const room = createWaitingRoom({perTick: 100}); for (let i = 0; i < 1000; i++) room.join(`u${i}`);
  assert.deepEqual([room.tick(), room.tick(), room.waiting()], [100, 100, 800]);
  assert.equal(room.redeem('tok:u5'), true); assert.equal(room.redeem('tok:u5'), false); assert.equal(room.redeem('tok:u500'), false);
});

const reserves = n => Array.from({length: n}, (_, i) => ({cmdId: `c${i}`, type: 'reserve', qty: 1}));

test('flash.actor-no-oversell: one actor applying an ordered log grants exactly the stock', () => {
  const actor = createSkuActor({stock: 50}), out = reserves(1000).map(c => actor.consume(c));
  assert.equal(out.filter(o => o.status === 'held').length, 50); assert.equal(actor.state().available, 0);
});

test('flash.actor-dedupe: a command written twice by a retrying producer is applied once', () => {
  const actor = createSkuActor({stock: 5}), cmd = {cmdId: 'c1', type: 'reserve', qty: 2};
  const a = actor.consume(cmd), b = actor.consume(cmd);
  assert.deepEqual(a, b); assert.equal(actor.state().available, 3);
});

test('flash.actor-replay: snapshot plus the commands after its offset rebuilds the same state', () => {
  const log = [...reserves(30), {cmdId: 'x1', type: 'confirm', reservationId: 'r3'}, {cmdId: 'x2', type: 'expire', reservationId: 'r4'}, ...reserves(40).map(c => ({...c, cmdId: `d${c.cmdId}`}))];
  const full = createSkuActor({stock: 25}); log.forEach(c => full.consume(c));
  const part = createSkuActor({stock: 25}); log.slice(0, 31).forEach(c => part.consume(c)); const snap = part.snapshot();
  const restored = createSkuActor({stock: 0}); restored.restore(snap); log.slice(snap.offset).forEach(c => restored.consume(c));
  assert.deepEqual(restored.snapshot(), full.snapshot());
});

test('flash.actor-expiry-race: the log order decides between payment and expiry', () => {
  const a = createSkuActor({stock: 1}); a.consume({cmdId: 'r', type: 'reserve', qty: 1});
  assert.equal(a.consume({cmdId: 'p', type: 'confirm', reservationId: 'r1'}).status, 'paid');
  assert.equal(a.consume({cmdId: 'e', type: 'expire', reservationId: 'r1'}).status, 'paid');
  const b = createSkuActor({stock: 1}); b.consume({cmdId: 'r', type: 'reserve', qty: 1});
  assert.equal(b.consume({cmdId: 'e', type: 'expire', reservationId: 'r1'}).status, 'released');
  assert.equal(b.consume({cmdId: 'p', type: 'confirm', reservationId: 'r1'}).status, 'refund');
  assert.equal(b.state().available, 1);
});
