import test from 'node:test';
import assert from 'node:assert/strict';
import {createItemStore, encodeCursor, decodeCursor, mergeShards, createPageLoader, createResultSessions} from './pagination.mjs';

const rows = n => Array.from({length: n}, (_, i) => ({id: `i${String(i + 1).padStart(2, '0')}`, createdAt: 100 + i, body: ''}));
const ids = list => list.map(r => r.id);
const SECRET = 'test-secret', QUERY = {sort: 'new', filter: 'all'};

test('pagination.offset-shift: with OFFSET, an insert between requests repeats a row on the next page', () => {
  const store = createItemStore(rows(6)), first = store.offsetPage(0, 3);
  store.insert({id: 'new', createdAt: 999});
  assert.equal(store.offsetPage(3, 3)[0].id, first.at(-1).id);
});

test('pagination.keyset-stable: inserts and deletes between pages never repeat or skip rows that existed throughout', () => {
  const store = createItemStore(rows(8)), seen = [];
  let page = store.keysetPage(null, 3); seen.push(...ids(page.items));
  store.insert({id: 'new', createdAt: 999}); store.delete('i08'); store.delete('i04');
  while (page.hasMore) { page = store.keysetPage(page.last, 3); seen.push(...ids(page.items)); }
  assert.deepEqual(seen, ['i08', 'i07', 'i06', 'i05', 'i03', 'i02', 'i01']);
});

test('pagination.limit-plus-one: hasMore is exact without counting the table', () => {
  const store = createItemStore(rows(6));
  assert.equal(store.keysetPage(null, 6).hasMore, false);
  assert.equal(store.keysetPage(null, 5).hasMore, true);
  const ties = createItemStore([{id: 'a', createdAt: 1}, {id: 'b', createdAt: 1}, {id: 'c', createdAt: 1}]);
  const p1 = ties.keysetPage(null, 2), p2 = ties.keysetPage(p1.last, 2);
  assert.deepEqual([...ids(p1.items), ...ids(p2.items)], ['c', 'b', 'a']);       // id breaks timestamp ties
});

test('pagination.cursor-tamper: a forged or edited cursor is rejected', () => {
  const token = encodeCursor({createdAt: 105, id: 'i06'}, QUERY, SECRET);
  assert.deepEqual(decodeCursor(token, QUERY, SECRET), {createdAt: 105, id: 'i06'});
  const [body, mac] = token.split('.'), edited = Buffer.from(JSON.stringify({p: {createdAt: 1, id: 'x'}, q: JSON.parse(Buffer.from(body, 'base64url')).q})).toString('base64url');
  assert.throws(() => decodeCursor(`${edited}.${mac}`, QUERY, SECRET), /invalid cursor/);
});

test('pagination.cursor-binds-query: a cursor cannot be replayed against a different filter or sort', () => {
  const token = encodeCursor({createdAt: 105, id: 'i06'}, QUERY, SECRET);
  assert.throws(() => decodeCursor(token, {...QUERY, filter: 'mine'}, SECRET), /different query/);
});

test('pagination.shard-merge: the same keyset bound on every shard reproduces single-node pages', () => {
  const all = rows(11), single = createItemStore(all), shards = [0, 1, 2].map(k => createItemStore(all.filter((_, i) => i % 3 === k)));
  let a = single.keysetPage(null, 4), b = mergeShards(shards, null, 4), pages = 1;
  for (;;) {
    assert.deepEqual(ids(b.items), ids(a.items)); assert.equal(b.hasMore, a.hasMore);
    if (!a.hasMore) break; a = single.keysetPage(a.last, 4); b = mergeShards(shards, b.last, 4); pages++;
  }
  assert.equal(pages, 3);
});

test('pagination.client-dedupe: repeated scroll events send one request per page', async () => {
  let calls = 0; const loader = createPageLoader(async () => { calls++; return {items: [{id: 'a'}], nextCursor: null}; });
  loader.reset(QUERY); await Promise.all([loader.loadMore(), loader.loadMore(), loader.loadMore()]);
  await loader.loadMore();                                                         // done: no further requests
  assert.equal(calls, 1); assert.deepEqual(loader.view(), ['a']);
});

test('pagination.stale-response: a response for a superseded filter is dropped', async () => {
  const pending = []; const loader = createPageLoader(q => new Promise(r => pending.push(() => r({items: [{id: q.filter}], nextCursor: null}))));
  loader.reset({filter: 'old'}); const old = loader.loadMore();
  loader.reset({filter: 'new'}); const fresh = loader.loadMore();
  pending[1](); await fresh; pending[0](); assert.deepEqual(await old, {stale: true});
  assert.deepEqual(loader.view(), ['new']);
});

// Approach B fixtures: rank by score, newest id breaks ties.
const scored = () => createItemStore([['a', 9], ['b', 8], ['c', 7], ['d', 6], ['e', 5], ['f', 4]].map(([id, score]) => ({id, score, createdAt: 0, body: id})));
const pointInTime = store => () => {
  const frozen = [...'abcdef'].map(id => store.get(id)).filter(Boolean).map(r => ({id: r.id, key: [r.score, r.id]}))
    .sort((x, y) => y.key[0] - x.key[0] || (y.key[1] > x.key[1] ? 1 : -1));
  return (after, n) => frozen.filter(h => !after || h.key[0] < after[0] || (h.key[0] === after[0] && h.key[1] < after[1])).slice(0, n);
};

test('pagination.snapshot-stable: re-ranking during a session never repeats or skips results', () => {
  const store = scored(), sessions = createResultSessions({pointInTime: pointInTime(store), store, ttlMs: 60000, now: () => 0, chunk: 2});
  const p1 = sessions.open(QUERY, 3); store.update('f', {score: 99}); store.update('a', {score: 0});   // f was not fetched yet
  const p2 = sessions.page(p1.next.sessionId, p1.next.offset, 3);
  assert.deepEqual([...ids(p1.items), ...ids(p2.items)], ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.equal(p2.next, null);
});

test('pagination.hydrate-deleted: pages show current row values and drop deleted rows with a count', () => {
  const store = scored(), sessions = createResultSessions({pointInTime: pointInTime(store), store, ttlMs: 60000, now: () => 0, chunk: 10});
  const p1 = sessions.open(QUERY, 3); store.delete('e'); store.update('d', {body: 'edited'});
  const p2 = sessions.page(p1.next.sessionId, 3, 3);
  assert.deepEqual(p2.items.map(r => r.body), ['edited', 'f']); assert.equal(p2.removed, 1);
});

test('pagination.session-expired-reanchor: after a session expires the client restarts without showing repeats', async () => {
  let clock = 0; const store = scored(), sessions = createResultSessions({pointInTime: pointInTime(store), store, ttlMs: 1000, now: () => clock, chunk: 2});
  const fetchPage = async (query, cursor) => {
    const page = cursor ? sessions.page(cursor.sessionId, cursor.offset, 2) : sessions.open(query, 2);
    if (page.expired) throw Object.assign(Error('session expired'), {status: 410});
    return {items: page.items, nextCursor: page.next};
  };
  const loader = createPageLoader(fetchPage); loader.reset(QUERY);
  await loader.loadMore(); clock = 5000;
  await assert.rejects(loader.loadMore(), /expired/);
  loader.restart(); await loader.loadMore(); await loader.loadMore(); await loader.loadMore();
  assert.deepEqual(loader.view(), ['a', 'b', 'c', 'd', 'e', 'f']);
});
