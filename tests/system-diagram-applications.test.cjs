'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const directory = path.resolve(__dirname, '../public/data/system-diagram');
const libraryApi = require('../public/simulatte/system-diagram/class-library.js');
const library = libraryApi.loadSync(directory);
const documents = require('../public/simulatte/system-diagram/diagram.js');
const engine = require('../public/simulatte/system-diagram/engine.js');
const runnerApi = require('../public/simulatte/system-diagram/runner.js');
const kernels = require('../public/simulatte/system-diagram/kernels-all.js');
const config = require('../public/data/system-diagram/config.json');
const baseDeps = { library, config, kernels }, clone = value => structuredClone(value);
const example = id => JSON.parse(fs.readFileSync(path.join(directory, 'examples', id + '.json')));
const params = (d, id, patch) => Object.assign(d.nodes.find(n => n.id === id).params, patch);
function initialize(d, script = null) {
  const original = kernels.get('applicationClient');
  const source = script ? { ...original, init: ctx => ({ ...original.init(ctx), script: clone(script) }) } : original;
  const deps = script ? { ...baseDeps, kernels: { has: id => kernels.has(id), get: id => id === 'applicationClient' ? source : kernels.get(id) } } : baseDeps;
  const compiled = documents.compile(d, library, config), state = engine.initialize(compiled, deps);
  return { compiled, state, deps };
}
function advance(run, time = 15) { engine.advance(run.compiled, run.state, time, run.deps); return { ...run, view: engine.observe(run.compiled, run.state, run.deps) }; }
function execute(d, script = null) { return advance(initialize(d, script)); }
const send = (id = 'one', extra = {}) => ({ action: 'send', commandId: `command-${id}`, userId: 'alice', conversationId: 'conversation-a', messageId: `message-${id}`, content: 'Hello.', ...extra });
const history = (id = 'history', extra = {}) => ({ action: 'history', commandId: id, userId: 'alice', conversationId: 'conversation-a', ...extra });
const task = (id = 'create-task', extra = {}) => ({ action: 'createTask', commandId: id, userId: 'alice', workspaceId: 'workspace-a', projectId: 'project-a', taskId: 'task-new', title: 'Ship the draft', ...extra });
const fault = (id, target, type, atSec = 0, untilSec = 1) => ({ id, atSec, untilSec, target: { kind: 'node', id: target }, type, params: {} });

// Expected records are literal independent oracles, not generated with runtime helpers.
test('chat stores concrete identities, ordered prompt/reply text and reconnect history with tenant denial', () => {
  const { state: s, view } = execute(example('chat-application'));
  assert.equal(view.global.offered, 8); assert.equal(view.global.completed, 7); assert.equal(view.global.failed, 1);
  assert.equal(view.global.effects, 6); assert.equal(view.global.duplicateEffects, 0);
  const rows = s.kernel.conversations.messages;
  assert.deepEqual([...rows].sort((a, b) => a.conversationId.localeCompare(b.conversationId) || a.sequence - b.sequence).map(m => [m.id, m.role, m.content, m.sequence]), [
    ['user:message-one', 'user', 'Explain durable chat.', 1], ['assistant:message-one', 'assistant', 'Synthetic reply: Explain durable chat. Prior messages: 0.', 2],
    ['user:message-two', 'user', 'Why keep messages?', 3], ['assistant:message-two', 'assistant', 'Synthetic reply: Why keep messages? Prior messages: 2.', 4],
    ['user:message-three', 'user', 'Hello from another tenant.', 1], ['assistant:message-three', 'assistant', 'Synthetic reply: Hello from another tenant. Prior messages: 0.', 2]
  ]);
  assert.ok(rows.filter(m => m.conversationId === 'conversation-a').every(m => m.tenantId === 'tenant-a'));
  const results = s.kernel.client.results, during = results.find(r => r.command.commandId === 'history-during-stream');
  assert.deepEqual(during.value.messages.map(m => m.role), ['user']);
  assert.deepEqual(results.find(r => r.command.commandId === 'reconnect-history').value.messages.map(m => m.content), rows.slice(0, 2).map(m => m.content));
  const denied = results.find(r => r.command.commandId === 'denied-history'); assert.equal(denied.ok, false); assert.equal(denied.value.messages, undefined);
  assert.equal(results.filter(r => r.command.commandId === 'prompt-one')[1].value.duplicate, true);
  const access = s.kernel.conversations.audit.filter(row => row.action === 'check'); assert.equal(access.length, 8); assert.equal(access.filter(row => !row.allowed).length, 1);
});

test('chunks traverse real edges and reach the client incrementally before a final durable reply', () => {
  const d = example('chat-application'), run = initialize(d, [send()]); advance(run, .2);
  assert.ok(run.state.kernel.client.chunks.length > 0); assert.equal(run.state.kernel.client.results.length, 0);
  assert.deepEqual(run.state.kernel.conversations.messages.map(m => m.role), ['user']);
  const { state: s } = advance(run);
  const chunks = s.kernel.client.chunks, result = s.kernel.client.results[0], assistant = s.kernel.conversations.messages[1];
  assert.equal(chunks.map(c => c.content).join(''), 'Synthetic reply: Hello. Prior messages: 0.');
  assert.equal(chunks.map(c => c.content).join(''), assistant.content); assert.ok(chunks.every(c => c.atSec < result.atSec));
  assert.deepEqual(chunks.map(c => c.cursor), [0, 12, 24, 36]);
  assert.equal(s.edges['live-chunks'].sent, 4); assert.equal(s.edges['generation-chunks'].sent, 4);
});

test('a partitioned generation edge cannot fabricate a final answer or assistant persistence', () => {
  const d = example('chat-application'); d.faults.push({ ...fault('generation-partition', 'generation-chunks', 'partition', 0, null), target: { kind: 'edge', id: 'generation-chunks' } });
  params(d, 'client', { callTimeoutMs: 7000, retries: 0 }); params(d, 'chat', { callTimeoutMs: 100, retries: 0 });
  const { state: s, view } = execute(d, [send(), history()]);
  assert.equal(view.global.completed, 1); assert.equal(view.global.failed, 1); assert.equal(s.kernel.client.chunks.length, 0);
  assert.deepEqual(s.kernel.conversations.messages.map(m => m.role), ['user']);
  assert.equal(s.kernel.client.results.find(r => r.command.action === 'send').ok, false);
});

test('lost store acknowledgements retry the same message IDs without duplicating writes', () => {
  const d = example('chat-application'); params(d, 'chat', { callTimeoutMs: 200, retries: 3, retryBackoffMs: 20 });
  params(d, 'client', { retries: 0 }); d.faults.push(fault('lost-write-ack', 'conversations', 'dropReplies', .022, .35));
  const { state: s, view } = execute(d, [send()]);
  assert.equal(view.global.completed, 1); assert.equal(view.global.failed, 0); assert.equal(s.kernel.conversations.messages.length, 2);
  assert.ok(s.kernel.conversations.duplicates >= 1); assert.ok(view.global.retries >= 1); assert.equal(view.global.effects, 2); assert.equal(view.global.duplicateEffects, 0);
});

test('generation failure keeps the prompt, exposes partial chunks, and repaired duplicate delivery completes once', () => {
  const d = example('chat-application'); params(d, 'generation', { failAfterChunks: 2 }); params(d, 'chat', { retries: 0 }); params(d, 'client', { retries: 0, intervalMs: 1200 });
  const run = initialize(d, [send(), send()]); advance(run, 1);
  assert.equal(run.state.kernel.client.results[0].ok, false); assert.equal(run.state.kernel.client.chunks.length, 2); assert.equal(run.state.kernel.conversations.messages.length, 1);
  engine.applyControl(run.compiled, run.state, { kind: 'setParams', target: { kind: 'node', id: 'generation' }, params: { failAfterChunks: 0 } }, run.deps);
  const { state: s, view } = advance(run);
  assert.deepEqual(s.kernel.client.results.map(r => r.ok), [false, true]); assert.equal(s.kernel.client.chunks.length, 4);
  assert.equal(s.kernel.conversations.messages.length, 2); assert.equal(s.kernel.conversations.messages[1].content, 'Synthetic reply: Hello. Prior messages: 0.'); assert.equal(view.global.duplicateEffects, 0);
});

test('application crash fences partial work; durable prompt and retried history reconstruct the same answer', () => {
  const d = example('chat-application'); params(d, 'client', { retries: 0, intervalMs: 1200 }); d.faults.push(fault('chat-crash', 'chat', 'crash', .2, .5));
  const { state: s, view } = execute(d, [send(), send(), history()]);
  assert.deepEqual(s.kernel.client.results.map(r => r.ok), [false, true, true]); assert.equal(s.kernel.conversations.messages.length, 2);
  assert.equal(s.kernel.client.results.at(-1).value.messages[1].content, 'Synthetic reply: Hello. Prior messages: 0.'); assert.equal(view.global.duplicateEffects, 0); assert.deepEqual(s.kernel.chat.routes, {});
});

test('conversation-store crash preserves committed messages and rejects work until repair', () => {
  const d = example('chat-application'); params(d, 'client', { retries: 0, intervalMs: 800 }); params(d, 'chat', { retries: 0 });
  d.faults.push(fault('storage-crash', 'conversations', 'crash', .7, 1.1));
  const { state: s } = execute(d, [send(), history('during-down'), history('after-repair')]);
  assert.deepEqual(s.kernel.client.results.map(r => r.ok), [true, false, true]); assert.equal(s.kernel.client.results.at(-1).value.messages.length, 2);
});

test('conflicting duplicate prompt identity is refused without rewriting committed content', () => {
  const { state: s, view } = execute(example('chat-application'), [send(), send('one', { content: 'Different content.' }), history()]);
  assert.deepEqual(s.kernel.client.results.map(r => r.ok), [true, false, true]); assert.equal(s.kernel.conversations.messages[0].content, 'Hello.');
  assert.equal(view.global.effects, 2); assert.match(s.kernel.client.results[1].value.reason, /conflicts/);
});

test('unknown users and foreign conversations are denied before history, writes or generation', () => {
  const { state: s, view } = execute(example('chat-application'), [send('x', { userId: 'unknown' }), send('y', { conversationId: 'conversation-b' })]);
  assert.equal(view.global.failed, 2); assert.equal(s.kernel.conversations.messages.length, 0); assert.equal(s.kernel.generation.chunks, 0); assert.equal(s.kernel.client.chunks.length, 0);
});

test('workspace records enforce viewer/editor/owner, revoke, project scope and tenant isolation', () => {
  const { state: s, view } = execute(example('workspace-access')), store = s.kernel.records, results = s.kernel.client.results;
  assert.equal(view.global.offered, 14); assert.equal(view.global.completed, 9); assert.equal(view.global.failed, 5); assert.equal(view.global.effects, 6); assert.equal(view.global.duplicateEffects, 0);
  assert.deepEqual(results.filter(r => !r.ok).map(r => r.command.commandId), ['read-after-revoke', 'viewer-edit', 'other-tenant', 'foreign-task', 'private-project']);
  assert.deepEqual(store.tasks, [
    { id: 'task-b', projectId: 'project-b', workspaceId: 'workspace-b', title: 'Other tenant task', status: 'open', createdBy: 'bob' },
    { id: 'task-new', workspaceId: 'workspace-a', projectId: 'project-a', title: 'Review release', status: 'complete', createdBy: 'alice' }
  ]);
  assert.equal(store.workspaces[0].version, 4); assert.equal(store.memberships.find(m => m.userId === 'ben').role, 'editor'); assert.equal(store.staleRejected, 2); assert.equal(store.staleAllowed, 0);
  assert.deepEqual(results.at(-1).value.projects.map(p => p.id), ['project-a', 'project-private']); assert.equal(store.duplicates, 1);
});

test('stale-grant experiment changes actual reads and mutations but never tenant/object/private boundaries', () => {
  const d = example('workspace-access'); params(d, 'records', { authorizationMode: 'cached' }); const { state: s, view } = execute(d);
  assert.equal(view.global.completed, 11); assert.equal(view.global.failed, 3); assert.equal(view.global.effects, 7); assert.equal(s.kernel.records.staleAllowed, 2);
  const results = s.kernel.client.results;
  assert.equal(results.find(r => r.command.commandId === 'read-after-revoke').value.task.id, 'task-new');
  assert.equal(results.find(r => r.command.commandId === 'viewer-edit').value.task.status, 'open');
  assert.deepEqual(results.filter(r => !r.ok).map(r => r.command.commandId), ['other-tenant', 'foreign-task', 'private-project']);
});

test('disabling cache or expiring grants removes the stale decision window', () => {
  for (const ttlMs of [0, 50]) {
    const d = example('workspace-access'); params(d, 'records', { authorizationMode: 'cached' }); params(d, 'permissions', { ttlMs });
    const { state: s, view } = execute(d); assert.equal(view.global.completed, 9); assert.equal(view.global.failed, 5); assert.equal(s.kernel.records.staleAllowed, 0); assert.equal(s.kernel.permissions.hits, 0);
  }
});

test('membership writes are owner-only and cannot transfer an owner or cross a tenant', () => {
  const script = [task('ben-grant', { userId: 'ben', action: 'grant', targetUserId: 'ben', role: 'editor' }),
    task('foreign-grant', { action: 'grant', targetUserId: 'bob', role: 'editor' }), task('owner-revoke', { action: 'revoke', targetUserId: 'alice' })];
  const { state: s, view } = execute(example('workspace-access'), script); assert.equal(view.global.failed, 3); assert.equal(view.global.effects, 0); assert.equal(s.kernel.records.memberships.length, 3); assert.equal(s.kernel.records.workspaces[0].version, 1);
});

test('lost workspace mutation acknowledgements do not duplicate tasks, grants or effects', () => {
  const d = example('workspace-access'); params(d, 'workspace', { callTimeoutMs: 80, retries: 3, retryBackoffMs: 20 }); params(d, 'client', { retries: 0 });
  d.faults.push(fault('lost-mutation-ack', 'records', 'dropReplies', .02, .15));
  const { state: s, view } = execute(d, [task()]); assert.equal(view.global.completed, 1); assert.equal(s.kernel.records.tasks.length, 2); assert.equal(view.global.effects, 1); assert.equal(view.global.duplicateEffects, 0); assert.ok(s.kernel.records.duplicates >= 1);
});

test('task and mutation identities reject conflicts while reordered duplicate fields remain idempotent', () => {
  const first = task(), reordered = Object.fromEntries(Object.entries(first).reverse());
  const { state: s, view } = execute(example('workspace-access'), [first, reordered, task('create-task', { title: 'Conflict' }), task('another-command')]);
  assert.deepEqual(s.kernel.client.results.map(r => r.ok), [true, true, false, false]); assert.equal(view.global.effects, 1); assert.equal(s.kernel.records.tasks[1].title, 'Ship the draft');
});

test('record bounds fail explicitly without fabricated durability', () => {
  const d = example('chat-application'); params(d, 'conversations', { maxRecords: 1 }); params(d, 'client', { retries: 0 }); params(d, 'chat', { retries: 0 });
  const { state: s, view } = execute(d, [send()]); assert.equal(view.global.failed, 1); assert.equal(s.kernel.conversations.messages.length, 1); assert.equal(s.kernel.client.results[0].error, 'rejected');
  const workspace = example('workspace-access'); params(workspace, 'records', { maxRecords: 1 });
  const result = execute(workspace, [task()]); assert.equal(result.view.global.failed, 1); assert.equal(result.state.kernel.records.tasks.length, 1);
});

test('application dependency topology rejects async RPCs and mismatched authorization stores', () => {
  const d = example('chat-application'); d.edges.find(e => e.id === 'conversation-operations').params.mode = 'async'; assert.throws(() => initialize(d), /synchronous conversationStore/);
  const w = example('workspace-access'); w.nodes.push({ id: 'other-records', classId: 'workspace-store', label: 'Other', x: 0, y: 0, params: {} }); w.edges.find(e => e.id === 'permission-records').to.nodeId = 'other-records';
  assert.throws(() => initialize(w), /same workspace store/);
});

for (const id of ['chat-application', 'workspace-access']) test(id + ' JSON checkpoint and detached records reproduce uninterrupted state', () => {
  const d = example(id), direct = execute(d), run = initialize(d); advance(run, .25);
  run.state = JSON.parse(JSON.stringify(run.state)); const restored = advance(run);
  assert.deepEqual(restored.state, direct.state); assert.deepEqual(restored.view, direct.view);
  const storeId = id === 'chat-application' ? 'conversations' : 'records', kernelId = id === 'chat-application' ? 'conversationStore' : 'workspaceStore';
  const observed = kernels.get(kernelId).observe({ k: restored.state.kernel[storeId], p: restored.compiled.nodes.find(n => n.id === storeId).params });
  assert.deepEqual(restored.view.nodes[storeId].records, observed.records);
  restored.view.nodes[storeId].records.users[0].id = 'view-mutated';
  observed.records.users[0].id = 'mutated'; assert.equal(restored.state.kernel[storeId].users[0].id, 'alice');
  assert.ok(Object.values(observed.detail).every(v => v === null || typeof v !== 'object'));
});

for (const id of ['chat-application', 'workspace-access']) test(id + ' coordinator checkpoint restore and causal replay match exactly', async () => {
  const runner = await runnerApi.create({ diagram: example(id), ...baseDeps });
  try { runner.advanceTo(.25); const checkpoint = await runner.checkpoint(); runner.advanceTo(15); const expected = runner.view(); await runner.restore(checkpoint); runner.advanceTo(15); assert.deepEqual(runner.view(), expected); assert.equal((await runner.verify()).status, 'match'); }
  finally { await runner.dispose(); }
});


test('simultaneous duplicate prompts deliver one chunk per cursor and persist one message pair', () => {
  const d = example('chat-application'); params(d, 'client', { intervalMs: 1, retries: 0 });
  const { state: s, view } = execute(d, [send(), send()]);
  assert.equal(view.global.completed, 2); assert.equal(view.global.effects, 2); assert.equal(view.global.duplicateEffects, 0);
  assert.equal(s.kernel.conversations.messages.length, 2); assert.equal(s.kernel.client.chunks.length, 4);
  assert.equal(s.kernel.client.chunks.map(c => c.content).join(''), s.kernel.conversations.messages[1].content);
});

test('source crash resumes its finite schedule once and does not lose request accounting', () => {
  const d = example('chat-application'); d.faults.push(fault('client-crash', 'client', 'crash', .15, .8));
  const { state: s, view } = execute(d); assert.equal(s.kernel.client.generated, 8);
  assert.equal(s.kernel.client.completed + s.kernel.client.failed, 8); assert.equal(view.global.offered, 8); assert.equal(view.global.completed + view.global.failed, 8);
  assert.deepEqual(s.kernel.client.outstanding, {}); assert.equal(s.kernel.conversations.messages.length, 6);
});

test('chat topology cannot deliver one client requests to a different client stream', () => {
  const d = example('chat-application'); d.nodes.push({ id: 'other-client', classId: 'application-client', label: 'Other', x: 0, y: 0, params: {} });
  d.edges.find(e => e.id === 'live-chunks').to.nodeId = 'other-client';
  assert.throws(() => initialize(d), /return to the requesting client/);
});


test('accepted streams keep stable chunk framing across retries while live delays remain adjustable', () => {
  const run = initialize(example('chat-application'), [send()]); advance(run, .2);
  assert.throws(() => engine.applyControl(run.compiled, run.state, { kind: 'setParams', target: { kind: 'node', id: 'generation' }, params: { chunkCharacters: 8 } }, run.deps), /immutable/);
  engine.applyControl(run.compiled, run.state, { kind: 'setParams', target: { kind: 'node', id: 'generation' }, params: { chunkDelayMs: 40 } }, run.deps);
  const result = advance(run); assert.equal(result.view.global.completed, 1); assert.deepEqual(result.state.kernel.client.chunks.map(c => c.cursor), [0, 12, 24, 36]);
});


test('user IDs that resemble assistant IDs never masquerade as generated replies', () => {
  const d = example('chat-application'); params(d, 'client', { intervalMs: 1500, retries: 0 });
  const script = [send('one:assistant', { content: 'This is a user prompt, not an answer.' }), send('one', { content: 'Actual request.' }), history()];
  const { state: s, view } = execute(d, script), messages = s.kernel.conversations.messages, results = s.kernel.client.results;
  assert.equal(view.global.completed, 3); assert.equal(view.global.effects, 4); assert.equal(view.global.duplicateEffects, 0);
  assert.deepEqual(messages.map(m => [m.id, m.messageId, m.role, m.replyToMessageId]), [
    ['user:message-one:assistant', 'message-one:assistant', 'user', null],
    ['assistant:message-one:assistant', 'message-one:assistant', 'assistant', 'message-one:assistant'],
    ['user:message-one', 'message-one', 'user', null],
    ['assistant:message-one', 'message-one', 'assistant', 'message-one']
  ]);
  assert.equal(results[1].value.duplicate, false); assert.equal(results[1].value.message.role, 'assistant');
  assert.equal(results[1].value.message.content, 'Synthetic reply: Actual request. Prior messages: 2.');
  assert.equal(messages[2].content, 'Actual request.'); assert.equal(results[2].value.messages.length, 4);
});

test('role prefixes in arbitrary user message IDs remain collision-safe in either delivery order', () => {
  const d = example('chat-application'); params(d, 'client', { intervalMs: 1500, retries: 0 });
  for (const ids of [['message-one', 'message-one:assistant'], ['assistant:message-one', 'message-one'], ['user:message-one', 'message-one']]) {
    const script = ids.map((messageId, i) => send(String(i), { messageId, content: `Prompt ${i}.` })); script.push(clone(script[0]));
    const { state: s, view } = execute(d, script), messages = s.kernel.conversations.messages;
    assert.equal(view.global.completed, 3); assert.equal(view.global.effects, 4); assert.equal(messages.length, 4);
    assert.equal(new Set(messages.map(m => m.id)).size, 4); assert.equal(s.kernel.client.results[2].value.duplicate, true);
    assert.ok(s.kernel.client.results.every(r => r.value.message.role === 'assistant'));
    assert.deepEqual(messages.filter(m => m.role === 'assistant').map(m => m.replyToMessageId), ids);
  }
});

function captureWire(run) {
  const transfers = new Map();
  for (let tick = 1; tick <= 3000; tick++) {
    engine.advance(run.compiled, run.state, tick / 200, run.deps);
    for (const row of Object.values(run.state.network.transfers)) if (!transfers.has(row.id)) transfers.set(row.id, clone(row));
  }
  return { ...run, transfers: [...transfers.values()], view: engine.observe(run.compiled, run.state, run.deps) };
}
const expectedKbit = transfer => Buffer.byteLength(JSON.stringify(transfer.event.m.fields), 'utf8') * 8 / 1000;
function slowWires(d) {
  d.edges.forEach(e => Object.assign(e.params, { bandwidthMbps: .02, latencyMs: 0 }));
  for (const id of d.nodes.filter(n => ['application-client', 'chat-application', 'workspace-application', 'permission-cache'].includes(n.classId)).map(n => n.id)) params(d, id, { callTimeoutMs: 60000, retries: 0 });
  return d;
}

test('actual UTF-8 request, chunk, acknowledgement and final reply bodies consume link bandwidth', () => {
  const d = slowWires(example('chat-application')), run = captureWire(initialize(d, [send('wire', { content: 'Bonjour, café.' })]));
  assert.equal(run.view.global.completed, 1);
  assert.ok(run.transfers.some(t => t.edgeId === 'generation-chunks' && t.dir === 'b' && t.event.m.fields.applicationResult.content.length > 0));
  assert.ok(run.transfers.some(t => t.edgeId === 'live-chunks' && t.dir === 'b' && t.event.m.fields.applicationResult.received));
  assert.ok(run.transfers.some(t => t.edgeId === 'chat-commands' && t.dir === 'b' && t.event.m.fields.applicationResult.message.role === 'assistant'));
  assert.ok(run.transfers.length > 12);
  for (const transfer of run.transfers) {
    assert.ok(transfer.initialKbit > 0, `${transfer.edgeId} ${transfer.dir} cannot be a free payload`);
    assert.ok(Math.abs(transfer.initialKbit - expectedKbit(transfer)) < 1e-10, 'Network counts the full application JSON body in decimal Kbit');
  }
});

test('larger stored histories and multibyte text produce independently predicted longer reply serialization', () => {
  function historyWire(content) {
    const d = example('chat-application'); params(d, 'client', { intervalMs: 3000, callTimeoutMs: 60000, retries: 0 });
    params(d, 'generation', { chunkCharacters: 128, chunkDelayMs: 1 });
    d.edges.forEach(e => Object.assign(e.params, { bandwidthMbps: e.id === 'chat-commands' ? .01 : 1000, latencyMs: 0 }));
    const script = content === null ? [history('wire-history')] : [send('wire', { content }), history('wire-history')];
    const run = captureWire(initialize(d, script));
    assert.equal(run.view.global.completed, script.length);
    const transfer = run.transfers.find(t => t.edgeId === 'chat-commands' && t.dir === 'b' && t.event.m.fields.application.commandId === 'wire-history');
    assert.ok(transfer); const result = run.state.kernel.client.results.find(r => r.command.commandId === 'wire-history');
    const duration = result.atSec - transfer.t0, predicted = expectedKbit(transfer) / (.01 * 1000);
    assert.ok(Math.abs(duration - predicted) < 1e-9, 'Observed reply time equals UTF-8 bytes / configured bandwidth, with no latency');
    return { transfer, duration };
  }
  const empty = historyWire(null), short = historyWire('a'), long = historyWire('a'.repeat(200)), unicode = historyWire('é'.repeat(200));
  assert.ok(empty.duration < short.duration); assert.ok(short.duration < long.duration); assert.ok(long.duration < unicode.duration);
  const body = JSON.stringify(unicode.transfer.event.m.fields);
  assert.ok(Buffer.byteLength(body, 'utf8') > body.length, 'Multibyte text must not be billed as UTF-16 character count');
});

test('permission decisions and denied result envelopes have measured bytes without fabricating records', () => {
  const workspace = captureWire(initialize(slowWires(example('workspace-access')), [task()]));
  assert.equal(workspace.view.global.completed, 1);
  for (const edgeId of ['permission-records', 'permission-checks']) {
    const transfer = workspace.transfers.find(t => t.edgeId === edgeId && t.dir === 'b');
    assert.ok(transfer.event.m.fields.applicationResult.allowed); assert.ok(transfer.initialKbit > 0); assert.ok(Math.abs(transfer.initialKbit - expectedKbit(transfer)) < 1e-10);
  }
  const denied = captureWire(initialize(slowWires(example('chat-application')), [history('denied-wire', { userId: 'bob' })]));
  assert.equal(denied.view.global.failed, 1); assert.equal(denied.state.kernel.conversations.messages.length, 0);
  const transfer = denied.transfers.find(t => t.edgeId === 'chat-commands' && t.dir === 'b');
  assert.equal(transfer.event.ok, false); assert.equal(transfer.event.m.fields.applicationResult.messages, undefined);
  assert.equal(transfer.event.m.fields.applicationResult.reason, 'Conversation access denied'); assert.ok(transfer.initialKbit > 0);
  assert.ok(Math.abs(transfer.initialKbit - expectedKbit(transfer)) < 1e-10);
});
