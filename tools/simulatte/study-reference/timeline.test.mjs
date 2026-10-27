import test from 'node:test';
import assert from 'node:assert/strict';
import {createGraph, createTweetStore, readPull, createTimelines, createFeed} from './timeline.mjs';

// 30 users; u0 is followed by everyone (a celebrity at threshold 20); each user follows u0 and 3 neighbours.
function world({celebrity = Infinity, cap = 800} = {}) {
  const graph = createGraph(), tweets = createTweetStore();
  for (let i = 1; i < 30; i++) { graph.follow(`u${i}`, 'u0'); for (const d of [1, 2, 3]) graph.follow(`u${i}`, `u${(i + d) % 30 || 1}`); }
  const timelines = createTimelines({graph, tweets, cap, celebrity});
  let clock = 0; const post = (author, text = '') => { const t = tweets.post({author, clientId: `${author}-${clock}`, text, ts: ++clock}); timelines.onPost(t); return t; };
  return {graph, tweets, timelines, post};
}
const ids = page => page.items.map(t => t.id);
const drain = read => { const out = []; let cursor = null; for (;;) { const p = read(cursor); out.push(...ids(p)); if (p.items.length < 5) return out; cursor = p.cursor; } };

test('timeline.idempotent-post: a retried post with the same clientId returns the same tweet', () => {
  const tweets = createTweetStore(), a = tweets.post({author: 'x', clientId: 'c1', ts: 1}), b = tweets.post({author: 'x', clientId: 'c1', ts: 2});
  assert.equal(a.id, b.id); assert.equal(tweets.recentBy('x', 10).length, 1);
});

test('timeline.fanout-write: a post lands at the head of every follower timeline', () => {
  const w = world(), t = w.post('u5');
  for (const f of w.graph.followers('u5')) assert.equal(w.timelines.read(f, {limit: 1}).items[0].id, t.id);
});

test('timeline.bounded: timelines keep only the newest cap entries', () => {
  const w = world({cap: 10}); for (let i = 0; i < 40; i++) w.post(`u${1 + (i % 29)}`);
  for (let i = 1; i < 30; i++) assert.ok(w.timelines.size(`u${i}`) <= 10);
});

test('timeline.rebuild-on-miss: rebuilding an evicted timeline matches what fan-out wrote', () => {
  const w = world(); for (let i = 0; i < 60; i++) w.post(`u${i % 30}`);
  const before = drain(c => w.timelines.read('u7', {limit: 5, cursor: c}));
  w.timelines.evict('u7'); assert.equal(w.timelines.has('u7'), false);
  assert.deepEqual(drain(c => w.timelines.read('u7', {limit: 5, cursor: c})), before);
});

test('timeline.hybrid-merge: skipping fan-out for celebrities and merging at read equals the pure pull timeline', () => {
  const w = world({celebrity: 20}); for (let i = 0; i < 90; i++) w.post(`u${i % 30}`);
  for (const user of ['u3', 'u11', 'u29']) assert.deepEqual(drain(c => w.timelines.read(user, {limit: 5, cursor: c})), drain(c => readPull(w, user, {limit: 5, cursor: c})));
});

test('timeline.celebrity-writes: one celebrity post costs zero timeline writes in hybrid mode', () => {
  const pure = world(), hybrid = world({celebrity: 20});
  pure.post('u0'); hybrid.post('u0');
  assert.deepEqual([pure.timelines.writes(), hybrid.timelines.writes()], [29, 0]);
});

test('timeline.hydrate-deleted: a deleted tweet disappears from timelines that still hold its id', () => {
  const w = world(), t = w.post('u5'); w.tweets.delete(t.id);
  assert.ok(!ids(w.timelines.read('u4')).includes(t.id));
});

test('timeline.pull-merge: the pull timeline is the newest posts across everyone followed', () => {
  const w = world(); for (let i = 0; i < 50; i++) w.post(`u${i % 30}`);
  const followed = new Set(w.graph.following('u2')), page = readPull(w, 'u2', {limit: 8});
  const expected = Array.from({length: 50}, (_, i) => w.tweets.get(`t${String(i + 1).padStart(5, '0')}`)).filter(t => followed.has(t.author)).reverse().slice(0, 8);
  assert.deepEqual(ids(page), expected.map(t => t.id));
});

test('timeline.pull-cursor: posts published between pages never repeat or shift older pages', () => {
  const w = world(); for (let i = 0; i < 120; i++) w.post(`u${i % 30}`);       // u9 follows 4 authors: 16 posts
  const first = readPull(w, 'u9', {limit: 4}); for (let i = 0; i < 10; i++) w.post('u10');
  const second = readPull(w, 'u9', {limit: 4, cursor: first.cursor});
  assert.equal(new Set([...ids(first), ...ids(second)]).size, 8);
  assert.ok(second.items.every(t => t.ts < first.items.at(-1).ts));
});

test('timeline.client-merge: live posts wait above the list, pages append below, and nothing shows twice', () => {
  const feed = createFeed(), t = (id, ts) => ({id, ts, author: 'a'});
  feed.appendPage([t('t3', 3), t('t2', 2)]); feed.appendPage([t('t2', 2), t('t1', 1)]);
  assert.equal(feed.live(t('t4', 4)), 1); assert.equal(feed.live(t('t3', 3)), 1);
  assert.deepEqual(feed.view().map(x => x.id), ['t3', 't2', 't1']);
  feed.showNew(); assert.deepEqual(feed.view().map(x => x.id), ['t4', 't3', 't2', 't1']);
});

test('timeline.read-your-writes: an own post shows at once and is replaced, not duplicated, when it comes back', () => {
  const feed = createFeed(), tweets = createTweetStore();
  feed.compose('c9', 'hello', 5); assert.equal(feed.view()[0].pending, true);
  const saved = tweets.post({author: 'me', clientId: 'c9', text: 'hello', ts: 5});
  feed.live(saved); feed.confirmed('c9', saved);                                   // push and POST reply, either order
  assert.deepEqual(feed.view().map(x => x.id), [saved.id]); assert.equal(feed.waiting(), 0);
});
