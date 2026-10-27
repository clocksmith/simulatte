import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatServer, createChatClient, createInboxServer} from './chat.mjs';

const ids = () => { let i = 0; return () => `c${++i}`; };

test('chat.idempotent-send: retrying a send after a lost reply never creates a second message', () => {
  const server = createChatServer(), request = {conversationId: 'k', clientMsgId: 'x1', senderId: 'ana', body: 'hi'};
  const first = server.send(request), retry = server.send(request);
  assert.deepEqual([first.seq, retry.seq, retry.duplicate], [1, 1, true]);
  assert.equal(server.history('k', 0).messages.length, 1);
});

test('chat.ordering: concurrent senders get one gap-free sequence per conversation', () => {
  const server = createChatServer();
  for (let i = 0; i < 20; i++) server.send({conversationId: i % 2 ? 'a' : 'b', clientMsgId: `m${i}`, senderId: i % 3 ? 'ana' : 'bo', body: String(i)});
  for (const conv of ['a', 'b']) assert.deepEqual(server.history(conv, 0).messages.map(m => m.seq), Array.from({length: 10}, (_, i) => i + 1));
});

test('chat.optimistic: a composed message shows as sending and is replaced, not duplicated, when confirmed', () => {
  const client = createChatClient({senderId: 'ana', newId: ids()}), server = createChatServer();
  const request = client.compose('k', 'hello');
  assert.deepEqual(client.view('k').map(m => m.status), ['sending']);
  const {seq} = server.send(request);
  client.receive({...request, seq});
  assert.deepEqual(client.view('k').map(m => [m.seq, m.status]), [[1, 'sent']]);
});

test('chat.out-of-order: pushes are buffered until the gap fills and duplicates are dropped', () => {
  const client = createChatClient({senderId: 'bo', newId: ids()}), m = seq => ({conversationId: 'k', seq, clientMsgId: `s${seq}`, senderId: 'ana', body: String(seq)});
  assert.equal(client.receive(m(2)).gap, true);
  assert.deepEqual(client.view('k'), []);
  assert.equal(client.receive(m(1)).ack, 2);
  assert.equal(client.receive(m(2)).duplicate, true);
  assert.deepEqual(client.view('k').map(x => x.seq), [1, 2]);
});

test('chat.reconnect: replaying history after lastSeq delivers every missed message exactly once', () => {
  const server = createChatServer(), client = createChatClient({senderId: 'bo', newId: ids()});
  for (let i = 1; i <= 3; i++) { const {seq} = server.send({conversationId: 'k', clientMsgId: `a${i}`, senderId: 'ana', body: ''}); client.receive(server.history('k', seq - 1, 1).messages[0]); }
  for (let i = 4; i <= 7; i++) server.send({conversationId: 'k', clientMsgId: `a${i}`, senderId: 'ana', body: ''});   // missed while offline
  for (const {conversationId, afterSeq} of client.resumeRequests()) for (const message of server.history(conversationId, afterSeq).messages) client.receive(message);
  client.receive(server.history('k', 6, 1).messages[0]);                                              // late live push of 7
  assert.deepEqual(client.view('k').map(x => x.seq), [1, 2, 3, 4, 5, 6, 7]);
});

test('chat.cursor: acknowledgements only move forward', () => {
  const server = createChatServer();
  assert.equal(server.ack('phone', 'k', 5), 5); assert.equal(server.ack('phone', 'k', 3), 5);
});

test('chat.inbox-sync: repeated or lost syncs return each message once per recipient', () => {
  const server = createInboxServer(); server.join('k', 'ana'); server.join('k', 'bo');
  server.send({conversationId: 'k', clientMsgId: 'x', senderId: 'ana', body: 'a'}); server.send({conversationId: 'k', clientMsgId: 'x', senderId: 'ana', body: 'a'});
  server.send({conversationId: 'k', clientMsgId: 'y', senderId: 'ana', body: 'b'});
  const first = server.sync('bo', 0), lostThenRetried = server.sync('bo', 0);
  assert.deepEqual(first, lostThenRetried);
  assert.deepEqual(first.entries.map(m => m.seq), [1, 2]);
  assert.deepEqual(server.sync('bo', first.token).entries, []);
});

test('chat.inbox-own-message: a send whose reply was lost is confirmed by sync and shown once', () => {
  const server = createInboxServer(), client = createChatClient({senderId: 'ana', newId: ids()}); server.join('k', 'ana');
  const request = client.compose('k', 'hi'); server.send(request);                 // reply lost
  server.send(request);                                                           // outbox retry
  for (const m of server.sync('ana', 0).entries) client.receive(m);
  assert.deepEqual(client.view('k').map(m => [m.seq, m.status, m.body]), [[1, 'sent', 'hi']]);
});
