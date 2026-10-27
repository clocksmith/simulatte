// Reference logic for L004 Chat. Small enough to read in an interview; tested in chat.test.mjs.

// Server: per-conversation sequence, idempotent on (conversationId, clientMsgId).
export function createChatServer() {
  const conversations = new Map(), cursors = new Map(), listeners = new Set();
  const log = conv => { if (!conversations.has(conv)) conversations.set(conv, {next: 1, messages: [], byClientId: new Map()}); return conversations.get(conv); };
  return {
    send({conversationId, clientMsgId, senderId, body}) {
      const c = log(conversationId), existing = c.byClientId.get(clientMsgId);
      if (existing) return {seq: existing.seq, duplicate: true};             // retry after a lost reply
      const message = {conversationId, seq: c.next++, clientMsgId, senderId, body};
      c.messages.push(message); c.byClientId.set(clientMsgId, message);      // one transaction in a real store
      for (const listener of listeners) listener(message);                    // publish only after commit
      return {seq: message.seq, duplicate: false};
    },
    history(conversationId, afterSeq, limit = 50) {
      const page = log(conversationId).messages.filter(m => m.seq > afterSeq).slice(0, limit);
      return {messages: page, nextAfter: page.length ? page.at(-1).seq : afterSeq};
    },
    ack(deviceId, conversationId, seq) { const k = `${deviceId}|${conversationId}`; cursors.set(k, Math.max(cursors.get(k) || 0, seq)); return cursors.get(k); },
    cursor: (deviceId, conversationId) => cursors.get(`${deviceId}|${conversationId}`) || 0,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

// Client: optimistic outbox plus an ordered, duplicate-free view per conversation.
export function createChatClient({senderId, newId}) {
  const conversations = new Map();
  const state = conv => { if (!conversations.has(conv)) conversations.set(conv, {lastSeq: 0, applied: new Map(), buffer: new Map(), pending: new Map()}); return conversations.get(conv); };
  function apply(s, m) {
    s.applied.set(m.seq, m); s.pending.delete(m.clientMsgId);                // own message confirmed by push or by reply
    while (s.buffer.has(s.lastSeq + 1)) { const next = s.buffer.get(s.lastSeq + 1); s.buffer.delete(next.seq); s.applied.set(next.seq, next); s.pending.delete(next.clientMsgId); s.lastSeq++; }
  }
  return {
    compose(conversationId, body) {
      const s = state(conversationId), clientMsgId = newId();
      s.pending.set(clientMsgId, {conversationId, clientMsgId, senderId, body, status: 'sending'});
      return {conversationId, clientMsgId, senderId, body};                     // the request; retries resend it unchanged
    },
    onSendFailed(conversationId, clientMsgId, retryable) { const p = state(conversationId).pending.get(clientMsgId); if (p) p.status = retryable ? 'sending' : 'failed'; },
    // Pushes and history pages both arrive here; the result says whether a gap needs a history fetch.
    receive(m) {
      const s = state(m.conversationId);
      if (m.seq <= s.lastSeq || s.buffer.has(m.seq)) return {duplicate: true, gap: s.buffer.size > 0};
      if (m.seq === s.lastSeq + 1) { s.lastSeq++; apply(s, m); } else s.buffer.set(m.seq, m);
      return {duplicate: false, gap: s.buffer.size > 0, ack: s.lastSeq};
    },
    resumeRequests: () => [...conversations].map(([conversationId, s]) => ({conversationId, afterSeq: s.lastSeq})),
    view(conversationId) {
      const s = state(conversationId), confirmed = [...s.applied.values()].sort((a, b) => a.seq - b.seq);
      const confirmedIds = new Set(confirmed.map(m => m.clientMsgId));
      return [...confirmed.map(m => ({...m, status: 'sent'})), ...[...s.pending.values()].filter(p => !confirmedIds.has(p.clientMsgId))];
    },
  };
}

// Approach B: fan-out on write into per-user inboxes, read with a sync token.
export function createInboxServer() {
  const inboxes = new Map(), members = new Map(), sequencer = createChatServer();
  const inbox = user => { if (!inboxes.has(user)) inboxes.set(user, []); return inboxes.get(user); };
  return {
    join(conversationId, userId) { if (!members.has(conversationId)) members.set(conversationId, new Set()); members.get(conversationId).add(userId); },
    send(request) {
      const result = sequencer.send(request);
      if (!result.duplicate) {
        const message = sequencer.history(request.conversationId, result.seq - 1, 1).messages[0];
        for (const user of members.get(request.conversationId) || []) inbox(user).push(message);   // token = inbox position
      }
      return result;
    },
    // A lost response is safe: syncing again with the same token returns the same entries.
    sync(userId, token = 0, limit = 100) { const entries = inbox(userId).slice(token, token + limit); return {entries, token: token + entries.length}; },
  };
}
