// Reference logic for L003 Paginated API. Small enough to read in an interview; tested in pagination.test.mjs.
import {createHmac, timingSafeEqual} from 'node:crypto';

// Sort order: newest first, id breaks ties so the order is total.
export const before = (a, b) => a.createdAt > b.createdAt || (a.createdAt === b.createdAt && a.id > b.id);
const order = (a, b) => (before(a, b) ? -1 : before(b, a) ? 1 : 0);

export function createItemStore(rows = []) {
  const items = new Map(rows.map(r => [r.id, {...r}]));
  const sorted = () => [...items.values()].sort(order);
  return {
    insert(row) { items.set(row.id, {...row}); },
    update(id, patch) { if (items.has(id)) items.set(id, {...items.get(id), ...patch}); },
    delete(id) { items.delete(id); },
    get: id => items.get(id),
    // Baseline: cost grows with offset, and rows shift when anything before the offset changes.
    offsetPage(offset, limit) { return sorted().slice(offset, offset + limit); },
    // Keyset: WHERE (createdAt, id) < (after.createdAt, after.id) ORDER BY createdAt DESC, id DESC LIMIT n + 1.
    keysetPage(after, limit) {
      const rows = sorted().filter(r => !after || before(after, r)).slice(0, limit + 1);
      return {items: rows.slice(0, limit), hasMore: rows.length > limit, last: rows.slice(0, limit).at(-1) || null};
    },
  };
}

// Opaque cursor: the position plus a hash of the query it belongs to, signed so clients cannot forge it.
const b64 = s => Buffer.from(s).toString('base64url');
const sign = (body, secret) => createHmac('sha256', secret).update(body).digest('base64url');
export const queryHash = query => createHmac('sha256', 'q').update(JSON.stringify(query)).digest('base64url').slice(0, 16);
export function encodeCursor(position, query, secret) {
  const body = b64(JSON.stringify({p: position, q: queryHash(query)}));
  return `${body}.${sign(body, secret)}`;
}
export function decodeCursor(token, query, secret) {
  const [body, mac] = String(token).split('.'), expected = sign(body || '', secret);
  if (!mac || mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) throw Error('invalid cursor');
  const {p, q} = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (q !== queryHash(query)) throw Error('cursor belongs to a different query');
  return p;
}

// Sharded keyset: every shard gets the same bound, the merger keeps the first `limit`. The cursor stays one key.
export function mergeShards(shards, after, limit) {
  const merged = shards.flatMap(s => s.keysetPage(after, limit).items).sort(order);
  const items = merged.slice(0, limit);
  return {items, hasMore: merged.length > limit, last: items.at(-1) || null};
}

// Client page loader: one request in flight, results from a superseded query are dropped, ids are deduped.
export function createPageLoader(fetchPage) {
  let state = {query: null, generation: 0, cursor: null, items: [], seen: new Set(), inFlight: null, done: false};
  return {
    reset(query) { state = {query, generation: state.generation + 1, cursor: null, items: [], seen: new Set(), inFlight: null, done: false}; },
    loadMore() {
      if (state.inFlight || state.done) return state.inFlight;
      const generation = state.generation;
      state.inFlight = fetchPage(state.query, state.cursor).then(page => {
        if (generation !== state.generation) return {stale: true};
        for (const item of page.items) if (!state.seen.has(item.id)) { state.seen.add(item.id); state.items.push(item); }
        state.cursor = page.nextCursor; state.done = !page.nextCursor; state.inFlight = null;
        return {stale: false};
      }, error => { if (generation === state.generation) state.inFlight = null; throw error; });
      return state.inFlight;
    },
    // A result session expired: keep what is shown, restart the query, and rely on the seen set to skip repeats.
    restart() { state = {...state, cursor: null, done: false, inFlight: null}; },
    view: () => state.items.map(i => i.id),
  };
}

// Approach B: result sessions. The first request fixes the order; later pages slice the stored ids.
// pointInTime(query) freezes the ranking and returns search(after, n) -> [{id, key}] over that frozen view,
// like a point-in-time reader plus search_after. Rows are still hydrated from the live store.
export function createResultSessions({pointInTime, store, ttlMs, now, chunk = 100}) {
  const sessions = new Map(); let next = 0;
  const live = id => { const s = sessions.get(id); if (!s || now() - s.createdAt > ttlMs) { sessions.delete(id); return null; } return s; };
  return {
    open(query, limit) {
      const id = `s${++next}`;
      sessions.set(id, {search: pointInTime(query), ids: [], seen: new Set(), after: null, exhausted: false, createdAt: now()});
      return this.page(id, 0, limit);
    },
    page(sessionId, offset, limit) {
      const s = live(sessionId); if (!s) return {expired: true};
      while (s.ids.length <= offset + limit && !s.exhausted) {                 // extend one chunk at a time
        const hits = s.search(s.after, chunk); if (hits.length < chunk) s.exhausted = true;
        for (const h of hits) if (!s.seen.has(h.id)) { s.seen.add(h.id); s.ids.push(h.id); }
        if (hits.length) s.after = hits.at(-1).key;
      }
      const ids = s.ids.slice(offset, offset + limit), items = ids.map(id => store.get(id)).filter(Boolean);   // deleted rows drop out
      return {items, removed: ids.length - items.length, next: s.ids.length > offset + limit ? {sessionId, offset: offset + limit} : null};
    },
    size: () => sessions.size,
  };
}
