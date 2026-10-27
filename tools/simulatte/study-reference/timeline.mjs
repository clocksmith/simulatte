// Reference logic for L011 Social timeline. Small enough to read in an interview; tested in timeline.test.mjs.

// Newest first; id breaks ties so the order is total. Cursors are the last (ts, id) shown.
const newer = (a, b) => a.ts > b.ts || (a.ts === b.ts && a.id > b.id);
const order = (a, b) => (newer(a, b) ? -1 : newer(b, a) ? 1 : 0);
const after = cursor => t => !cursor || newer(cursor, t);

export function createGraph() {
  const followers = new Map(), following = new Map(), set = (m, k) => { if (!m.has(k)) m.set(k, new Set()); return m.get(k); };
  return {
    follow(user, author) { set(following, user).add(author); set(followers, author).add(user); },
    followers: author => [...(followers.get(author) || [])],
    following: user => [...(following.get(user) || [])],
    followerCount: author => (followers.get(author) || new Set()).size,
  };
}

// Posting is idempotent per (author, clientId), so a retried POST returns the same tweet.
export function createTweetStore() {
  const tweets = new Map(), byClient = new Map(), byAuthor = new Map(); let seq = 0;
  return {
    post({author, clientId, text, ts}) {
      const k = `${author}|${clientId}`; if (byClient.has(k)) return tweets.get(byClient.get(k));
      const tweet = {id: `t${String(++seq).padStart(5, '0')}`, author, clientId, text, ts};   // clientId is only shown to the author
      tweets.set(tweet.id, tweet); byClient.set(k, tweet.id);
      if (!byAuthor.has(author)) byAuthor.set(author, []); byAuthor.get(author).push(tweet); return tweet;
    },
    get: id => tweets.get(id),
    delete(id) { const t = tweets.get(id); if (t) { tweets.delete(id); byAuthor.set(t.author, byAuthor.get(t.author).filter(x => x.id !== id)); } },
    recentBy: (author, limit, cursor) => (byAuthor.get(author) || []).filter(after(cursor)).sort(order).slice(0, limit),
  };
}

// Pull (fan-out on read): k-way merge of each followee's recent posts after the cursor.
export function readPull({graph, tweets}, user, {limit = 20, cursor = null} = {}) {
  const merged = graph.following(user).flatMap(a => tweets.recentBy(a, limit, cursor)).sort(order);
  const items = merged.slice(0, limit); return {items, cursor: items.at(-1) ? {ts: items.at(-1).ts, id: items.at(-1).id} : null};
}

// Push (fan-out on write) with a celebrity cut-off: big accounts are merged at read time instead.
export function createTimelines({graph, tweets, cap = 800, celebrity = Infinity}) {
  const lines = new Map(); let writes = 0;
  const insert = (user, entry) => {
    const line = lines.get(user) || []; if (line.some(e => e.id === entry.id)) return;
    line.push(entry); line.sort(order); if (line.length > cap) line.length = cap; lines.set(user, line); writes++;
  };
  const isCelebrity = author => graph.followerCount(author) >= celebrity;
  return {
    onPost(tweet) { if (isCelebrity(tweet.author)) return; for (const f of graph.followers(tweet.author)) insert(f, {id: tweet.id, ts: tweet.ts}); },
    // Rebuild for a user whose timeline was evicted: the same entries fan-out would have written.
    rebuild(user) { lines.delete(user); for (const a of graph.following(user)) if (!isCelebrity(a)) for (const t of tweets.recentBy(a, cap)) insert(user, {id: t.id, ts: t.ts}); },
    evict(user) { lines.delete(user); },
    has: user => lines.has(user),
    read(user, {limit = 20, cursor = null} = {}) {
      if (!lines.has(user)) this.rebuild(user);
      const celebs = graph.following(user).filter(isCelebrity).flatMap(a => tweets.recentBy(a, limit, cursor).map(t => ({id: t.id, ts: t.ts})));
      const seen = new Set(), merged = [...lines.get(user).filter(after(cursor)), ...celebs].sort(order).filter(e => !seen.has(e.id) && seen.add(e.id));
      const page = merged.slice(0, limit), items = page.map(e => tweets.get(e.id)).filter(Boolean);          // deleted tweets drop out
      return {items, cursor: page.at(-1) ? {ts: page.at(-1).ts, id: page.at(-1).id} : null};
    },
    size: user => (lines.get(user) || []).length,
    writes: () => writes,
  };
}

// Client feed: pages append below, live items wait above until shown, own posts appear at once.
export function createFeed() {
  const shown = new Map(), waiting = new Map(), own = new Map();
  return {
    appendPage(items) { for (const t of items) if (!shown.has(t.id)) shown.set(t.id, t); },
    live(t) {                                                                                       // returns the "N new posts" count
      if (own.has(t.clientId)) this.confirmed(t.clientId, t); else if (!shown.has(t.id)) waiting.set(t.id, t);
      return waiting.size;
    },
    showNew() { for (const [id, t] of waiting) shown.set(id, t); waiting.clear(); },
    compose(clientId, text, ts) { own.set(clientId, {clientId, text, ts, pending: true}); },
    confirmed(clientId, tweet) { own.delete(clientId); shown.set(tweet.id, tweet); waiting.delete(tweet.id); },
    view: () => [...[...own.values()].map(o => ({...o, id: `local:${o.clientId}`})), ...[...shown.values()].sort(order)],
    waiting: () => waiting.size,
  };
}
