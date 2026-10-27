import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommentStore, buildTree, wilson, createVoteStore, createVoteAggregator, createVoteButton, applyScoreUpdate, createSnapshotCache} from './comments.mjs';

const sample = () => {
  const s = createCommentStore();
  s.add({postId: 'p', id: 'a'}); s.add({postId: 'p', id: 'b'});
  s.add({postId: 'p', parentId: 'a', id: 'a1'}); s.add({postId: 'p', parentId: 'a1', id: 'a1x'}); s.add({postId: 'p', parentId: 'a', id: 'a2'});
  return s;
};

test('comments.tree-path: a subtree is one prefix range and path order is depth-first', () => {
  const s = sample();
  assert.deepEqual(s.thread('p').map(r => r.id), ['a', 'a1', 'a1x', 'a2', 'b']);
  assert.deepEqual(s.subtree('a1').map(r => r.id), ['a1', 'a1x']);
  assert.equal(s.get('a1x').path, '0001.0001.0001');
});

test('comments.tree-build: levels are ranked and wide or deep branches become "more" stubs with counts', () => {
  const s = sample(); s.applyCounts('a2', 10, 0); s.applyCounts('a1', 1, 3);
  const tree = buildTree(s.thread('p'), {sort: 'top', perLevel: 1, maxDepth: 1});
  assert.equal(tree[0].id, 'a'); assert.deepEqual(tree[1].more, {parentId: 'root', count: 1});
  assert.equal(tree[0].replies[0].id, 'a2'); assert.deepEqual(tree[0].replies[1].more, {parentId: 'a', count: 2});
});

test('comments.best-ranking: "best" prefers confident ratios over raw totals', () => {
  assert.ok(wilson(5, 0) > wilson(50, 45));
  assert.ok(wilson(100, 5) > wilson(5, 0));
  assert.equal(wilson(0, 0), 0);
});

test('comments.vote-idempotent: one current vote per user; retries are no-ops and changes emit the difference', () => {
  const v = createVoteStore();
  assert.deepEqual(v.vote('u', 'c', 1), {eventId: 'e1', commentId: 'c', up: 1, down: 0});
  assert.equal(v.vote('u', 'c', 1), null);
  assert.deepEqual(v.vote('u', 'c', -1), {eventId: 'e2', commentId: 'c', up: -1, down: 1});
  assert.deepEqual(v.vote('u', 'c', 0), {eventId: 'e3', commentId: 'c', up: 0, down: -1});
  assert.deepEqual(v.score('c'), {up: 0, down: 0});
});

test('comments.batched-deltas: a vote storm on one comment becomes one counter write per flush', () => {
  const s = sample(), v = createVoteStore(), agg = createVoteAggregator(s.applyCounts);
  for (let i = 0; i < 1000; i++) agg.consume(v.vote(`u${i}`, 'a', i % 4 ? 1 : -1));
  for (let i = 0; i < 100; i++) agg.consume(v.vote(`u${i}`, 'a', 1));        // 25 of these flip from -1 to +1
  assert.deepEqual(agg.flush(), ['a']); assert.equal(agg.writes(), 1);
  const {up, down} = s.get('a'); assert.deepEqual({up, down}, v.score('a'));
});

test('comments.delta-redelivery: redelivered vote events are not counted twice', () => {
  const s = sample(), v = createVoteStore(), agg = createVoteAggregator(s.applyCounts), e = v.vote('u', 'b', 1);
  agg.consume(e); agg.consume(e); agg.flush();
  assert.equal(s.get('b').up, 1);
});

test('comments.optimistic-vote: the score moves at once and reverts if the server rejects', async () => {
  const button = createVoteButton({score: 10, send: () => Promise.reject(Error('503'))});
  const pending = button.click(1); assert.deepEqual(button.view(), {score: 11, myVote: 1});
  await pending.catch(() => {}); await button.settled();
  assert.deepEqual(button.view(), {score: 10, myVote: 0});
});

test('comments.vote-coalesce: rapid clicks send at most one request in flight and the last intent wins', async () => {
  const sent = [], gates = []; const button = createVoteButton({score: 0, send: v => { sent.push(v); return new Promise(r => gates.push(r)); }});
  button.click(1); button.click(-1); button.click(-1); button.click(1);    // up, down, clear, up
  assert.deepEqual(sent, [1]);
  gates[0](); await new Promise(r => setTimeout(r)); await button.settled();
  assert.deepEqual(sent, [1]);                                             // final intent equals the confirmed vote: nothing more to send
  assert.deepEqual(button.view(), {score: 1, myVote: 1});
  button.click(-1); gates[1]?.(); await new Promise(r => setTimeout(r));
  assert.deepEqual(sent, [1, -1]); assert.deepEqual(button.view(), {score: -1, myVote: -1});
});

test('comments.score-versions: live updates apply only when newer', () => {
  const view = new Map();
  assert.equal(applyScoreUpdate(view, {commentId: 'c', score: 5, version: 2}), true);
  assert.equal(applyScoreUpdate(view, {commentId: 'c', score: 3, version: 1}), false);
  assert.equal(applyScoreUpdate(view, {commentId: 'c', score: 5, version: 2}), false);
  assert.equal(view.get('c').score, 5);
});

test('comments.read-time-score: the derived score always equals the sum of current votes', () => {
  const v = createVoteStore(), truth = new Map();
  for (let i = 0; i < 500; i++) { const u = `u${i % 37}`, value = [1, -1, 0][(i * 7) % 3]; v.vote(u, 'c', value); truth.set(u, value); }
  const vals = [...truth.values()];
  assert.deepEqual(v.score('c'), {up: vals.filter(x => x === 1).length, down: vals.filter(x => x === -1).length});
});

test('comments.single-flight: concurrent misses and stale reads trigger one build at a time', async () => {
  let clock = 0, release; const cache = createSnapshotCache({ttlMs: 5000, now: () => clock, build: () => new Promise(r => { release = r; })});
  const readers = Array.from({length: 50}, () => cache.get('p:best'));
  await new Promise(r => setTimeout(r)); release({thread: 1}); const results = await Promise.all(readers);
  assert.equal(cache.builds(), 1); assert.ok(results.every(r => r.status === 200));
  clock = 9000; const stale = await Promise.all(Array.from({length: 20}, () => cache.get('p:best')));
  assert.ok(stale.every(r => r.body.thread === 1)); await new Promise(r => setTimeout(r)); assert.equal(cache.builds(), 2);
});

test('comments.etag-poll: polling an unchanged snapshot returns 304', async () => {
  let thread = {n: 1}, clock = 0; const cache = createSnapshotCache({ttlMs: 1000, now: () => clock, build: async () => thread});
  const first = await cache.get('p'); assert.equal((await cache.get('p', first.etag)).status, 304);
  thread = {n: 2}; clock = 2000; await cache.get('p'); await new Promise(r => setTimeout(r));   // stale read triggers a rebuild
  const again = await cache.get('p', first.etag); assert.equal(again.status, 200); assert.equal(again.body.n, 2);
});
