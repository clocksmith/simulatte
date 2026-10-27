// Reference logic for L009 Threaded comments and voting. Small enough to read in an interview; tested in comments.test.mjs.

// Tree storage: materialized path. A subtree is one prefix range; ORDER BY path is depth-first order.
export function createCommentStore() {
  const rows = new Map(), childCount = new Map();
  return {
    add({postId, parentId = null, id, body, createdAt = 0}) {
      const parent = parentId ? rows.get(parentId) : null, siblings = (childCount.get(parentId || postId) || 0) + 1;
      childCount.set(parentId || postId, siblings);
      const path = `${parent ? `${parent.path}.` : ''}${String(siblings).padStart(4, '0')}`;
      const row = {id, postId, parentId, path, depth: parent ? parent.depth + 1 : 0, body, createdAt, up: 0, down: 0};
      rows.set(id, row); return row;
    },
    get: id => rows.get(id),
    thread: postId => [...rows.values()].filter(r => r.postId === postId).sort((a, b) => (a.path < b.path ? -1 : 1)),
    subtree(id) { const root = rows.get(id); return [...rows.values()].filter(r => r.postId === root.postId && (r.path === root.path || r.path.startsWith(`${root.path}.`))).sort((a, b) => (a.path < b.path ? -1 : 1)); },
    applyCounts(id, up, down) { const r = rows.get(id); r.up += up; r.down += down; },
  };
}

// Ranking. "best" = lower bound of the Wilson interval on the upvote ratio; "top" = up - down.
export function wilson(up, down, z = 1.96) {
  const n = up + down; if (!n) return 0;
  const p = up / n; return (p + z * z / (2 * n) - z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n)) / (1 + z * z / n);
}
export const rankers = {best: c => wilson(c.up, c.down), top: c => c.up - c.down, new: c => c.createdAt};

// Assemble a nested thread from flat rows; cut wide levels and deep branches into "more" stubs.
export function buildTree(rows, {sort = 'best', perLevel = 10, maxDepth = 5} = {}) {
  const children = new Map(); for (const r of rows) { const k = r.parentId || 'root'; if (!children.has(k)) children.set(k, []); children.get(k).push(r); }
  const score = rankers[sort], size = id => (children.get(id) || []).reduce((n, c) => n + 1 + size(c.id), 0);
  const level = (parentKey, depth) => {
    const kids = (children.get(parentKey) || []).slice().sort((a, b) => score(b) - score(a) || (a.path < b.path ? -1 : 1));
    const shown = kids.slice(0, perLevel).map(c => depth >= maxDepth && (children.get(c.id) || []).length
      ? {id: c.id, score: c.up - c.down, replies: [], more: {parentId: c.id, count: size(c.id)}}
      : {id: c.id, score: c.up - c.down, replies: level(c.id, depth + 1)});
    if (kids.length > perLevel) shown.push({more: {parentId: parentKey, count: kids.slice(perLevel).reduce((n, c) => n + 1 + size(c.id), 0)}});
    return shown;
  };
  return level('root', 0);
}

// Votes: one current value per (user, comment). Changing a vote emits only the difference.
export function createVoteStore() {
  const votes = new Map(); let next = 0;
  return {
    vote(userId, commentId, value) {
      if (![-1, 0, 1].includes(value)) throw Error('vote must be -1, 0 or 1');
      const k = `${userId}|${commentId}`, old = votes.get(k) || 0; if (old === value) return null;   // retry or no-op
      votes.set(k, value);
      return {eventId: `e${++next}`, commentId, up: (value === 1) - (old === 1), down: (value === -1) - (old === -1)};
    },
    // Read-time aggregation: the score is derived from current votes, never stored.
    score(commentId) { let up = 0, down = 0; for (const [k, v] of votes) if (k.endsWith(`|${commentId}`)) { up += v === 1; down += v === -1; } return {up, down}; },
  };
}

// Write-time aggregation: deltas are summed per comment and applied once per flush; redelivered events are ignored.
export function createVoteAggregator(applyCounts) {
  const pending = new Map(), seen = new Set(); let writes = 0;            // seen: bounded by the queue's redelivery window in production
  return {
    consume(e) { if (!e || seen.has(e.eventId)) return; seen.add(e.eventId); const p = pending.get(e.commentId) || {up: 0, down: 0}; p.up += e.up; p.down += e.down; pending.set(e.commentId, p); },
    flush() { const changed = [...pending.keys()]; for (const [id, d] of pending) { applyCounts(id, d.up, d.down); writes++; } pending.clear(); return changed; },
    writes: () => writes,
  };
}

// Client vote button: optimistic, one request in flight, the last intent wins.
export function createVoteButton({score, myVote = 0, send}) {
  const s = {score, myVote, confirmed: myVote, inFlight: null, queued: null};
  const flush = () => {
    if (s.inFlight || s.queued === null) return s.inFlight; const value = s.queued; s.queued = null;
    if (value === s.confirmed) return null;                                  // the user returned to the confirmed vote
    s.inFlight = send(value).then(() => { s.confirmed = value; }, () => { if (s.queued === null) { s.score += s.confirmed - s.myVote; s.myVote = s.confirmed; } })
      .finally(() => { s.inFlight = null; flush(); });
    return s.inFlight;
  };
  return {
    click(value) { const next = s.myVote === value ? 0 : value; s.score += next - s.myVote; s.myVote = next; s.queued = next === s.confirmed && !s.inFlight ? null : next; return flush(); },
    view: () => ({score: s.score, myVote: s.myVote}),
    settled: async () => { while (s.inFlight) await s.inFlight; },
  };
}

// Live score updates carry a version per comment; older or duplicate updates are ignored.
export function applyScoreUpdate(view, {commentId, score, version}) {
  const cur = view.get(commentId); if (cur && cur.version >= version) return false;
  view.set(commentId, {score, version}); return true;
}

// Read-time approach: one snapshot build per key at a time; concurrent readers share it.
export function createSnapshotCache({build, ttlMs, now}) {
  const entries = new Map(), building = new Map(); let builds = 0;
  const etag = value => `"${[...JSON.stringify(value)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261).toString(16)}"`;
  const rebuild = key => {
    if (!building.has(key)) building.set(key, Promise.resolve().then(() => { builds++; return build(key); }).then(value => { const e = {value, etag: etag(value), at: now()}; entries.set(key, e); return e; }).finally(() => building.delete(key)));
    return building.get(key);
  };
  return {
    async get(key, ifNoneMatch) {
      let e = entries.get(key);
      if (!e) e = await rebuild(key);
      else if (now() - e.at > ttlMs) rebuild(key).catch(() => {});        // serve stale while one rebuild runs
      return e.etag === ifNoneMatch ? {status: 304, etag: e.etag} : {status: 200, etag: e.etag, body: e.value, asOf: e.at};
    },
    builds: () => builds,
  };
}
