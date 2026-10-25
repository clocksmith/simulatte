'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const directory = path.resolve(__dirname, '../public/data/system-diagram');
const library = require('../public/simulatte/system-diagram/class-library.js').loadSync(directory);
const diagrams = require('../public/simulatte/system-diagram/diagram.js');
const engine = require('../public/simulatte/system-diagram/engine.js');
const kernels = require('../public/simulatte/system-diagram/kernels-all.js');
const protocol = require('../public/simulatte/system-diagram/protocol-routing.js');
const config = require('../public/data/system-diagram/config.json');
const clone = structuredClone;
const example = id => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/system-diagram', `${id}.json`)));
const patch = (d, id, p) => Object.assign(d.nodes.find(n => n.id === id).params, p);
const add = (d, id, classId, params = {}) => d.nodes.push({ id, classId, label: id, x: 0, y: 0, params });
const connect = (d, id, from, fromPort, to, toPort = 'in', params = {}) => d.edges.push({ id, from: { nodeId: from, portId: fromPort }, to: { nodeId: to, portId: toPort }, params: { latencyMs: 0, bandwidthMbps: 1000, ...params } });
function insert(d, edgeId, id, classId, port, params = {}) {
  add(d, id, classId, params); const edge = d.edges.find(e => e.id === edgeId), old = clone(edge.to);
  edge.to = { nodeId: id, portId: 'in' }; connect(d, `${edgeId}-${id}`, id, port, old.nodeId, old.portId);
}
function init(d, script) {
  const source = kernels.get('applicationClient');
  const deps = { library, config, kernels: { has: kernels.has, get: id => id === 'applicationClient' ? { ...source, init: ctx => ({ ...source.init(ctx), ...(script ? { script: clone(script) } : {}) }) } : kernels.get(id) } };
  const compiled = diagrams.compile(d, library, config), state = engine.initialize(compiled, deps);
  return { compiled, state, deps };
}
function advance(run, time = 15) { engine.advance(run.compiled, run.state, time, run.deps); return { ...run, view: engine.observe(run.compiled, run.state, run.deps) }; }
const send = (id = 'one') => ({ action: 'send', commandId: `send-${id}`, userId: 'alice', conversationId: 'conversation-a', messageId: `message-${id}`, content: 'A real record.' });
const history = (id = 'history', userId = 'alice') => ({ action: 'history', commandId: id, userId, conversationId: 'conversation-a' });
const task = () => ({ action: 'createTask', commandId: 'task-one', userId: 'alice', workspaceId: 'workspace-a', projectId: 'project-a', taskId: 'task-new', title: 'Concrete task' });
const crash = (id, atSec = 0, untilSec = 1) => ({ id: `${id}-crash`, atSec, untilSec, type: 'crash', target: { kind: 'node', id }, params: {} });

test('application requests, chunks and errors survive real generic routing chains', () => {
  const d = example('chat-application');
  insert(d, 'chat-commands', 'lb', 'load-balancer', 'backends', { callTimeoutMs: 8000 });
  insert(d, 'chat-commands-lb', 'gateway', 'web-server', 'calls', { serviceMs: 1, serviceDist: 'constant', callTimeoutMs: 8000 });
  insert(d, 'conversation-operations', 'byte-cache', 'cache', 'origin', { writePolicy: 'write-through' });
  insert(d, 'generation-chunks', 'limiter', 'rate-limiter', 'out', { ratePerSec: 100, burst: 100 });
  insert(d, 'live-chunks', 'chunk-retry', 'retry-policy', 'target');
  patch(d, 'client', { intervalMs: 2000 });
  const run = advance(init(d, [send(), history('other-tenant', 'bob'), history(), send('two'), history('after-write')]));
  assert.equal(run.view.global.completed, 4); assert.equal(run.view.global.failed, 1);
  assert.equal(run.state.kernel.conversations.messages.length, 4); assert.equal(run.view.global.effects, 4);
  const results = run.state.kernel.client.results;
  assert.equal(results[1].value.reason, 'Conversation access denied'); assert.equal(results[1].error, 'invalid');
  assert.equal(results.at(-1).value.messages.length, 4); assert.equal(run.state.kernel['byte-cache'].hits, 0);
  assert.equal(run.state.kernel['byte-cache'].keys.length, 0); assert.ok(run.state.kernel['byte-cache'].protocolBypasses > 10);
  assert.ok(run.state.edges['chat-commands-lb'].sent > 0); assert.ok(run.state.edges['generation-chunks-limiter'].sent > 0);
  assert.deepEqual(run.state.kernel.client.chunks.filter(c => c.messageId === 'assistant:message-one').map(c => c.content).join(''), run.state.kernel.conversations.messages[1].content);
});

test('load balanced application replicas share only a validated authoritative store', () => {
  const d = example('chat-application');
  insert(d, 'chat-commands', 'lb', 'load-balancer', 'backends', { callTimeoutMs: 8000 });
  add(d, 'chat-two', 'chat-application'); connect(d, 'backend-two', 'lb', 'backends', 'chat-two');
  connect(d, 'store-two', 'chat-two', 'store', 'conversations'); connect(d, 'generate-two', 'chat-two', 'generate', 'generation'); connect(d, 'chunks-two', 'chat-two', 'chunks', 'client');
  patch(d, 'client', { intervalMs: 2000 });
  const run = advance(init(d, [send(), send()]));
  assert.equal(run.view.global.completed, 2); assert.equal(run.view.global.effects, 2);
  assert.equal(run.state.kernel.client.results[1].value.duplicate, true);
  assert.equal(run.state.kernel.lb.backends['chat-commands-lb'].sent, 1); assert.equal(run.state.kernel.lb.backends['backend-two'].sent, 1);
});

test('routing rejects unreachable, async, probabilistic, type-changing, cyclic and mismatched protocol paths', () => {
  const variants = [
    d => { insert(d, 'chat-commands', 'queue', 'task-queue', 'consumers'); },
    d => { insert(d, 'chat-commands', 'relay', 'rate-limiter', 'out'); d.edges.find(e => e.id === 'chat-commands-relay').params.mode = 'async'; },
    d => { insert(d, 'chat-commands', 'relay', 'web-server', 'calls'); d.edges.find(e => e.id === 'chat-commands-relay').params.probability = .5; },
    d => { insert(d, 'chat-commands', 'relay', 'web-server', 'calls'); d.edges.find(e => e.id === 'chat-commands-relay').params.callsPerRequest = 2; },
    d => { insert(d, 'chat-commands', 'relay', 'web-server', 'calls', { outputPayload: 'json' }); },
    d => { insert(d, 'chat-commands', 'relay', 'web-server', 'calls'); insert(d, 'chat-commands-relay', 'relay-two', 'web-server', 'calls'); d.edges.find(e => e.id === 'chat-commands-relay-relay-two').to.nodeId = 'relay'; },
    d => { insert(d, 'chat-commands', 'relay', 'load-balancer', 'backends'); add(d, 'wrong', 'third-party-api'); connect(d, 'wrong-backend', 'relay', 'backends', 'wrong'); }
  ];
  for (const mutate of variants) { const d = example('chat-application'); mutate(d); assert.throws(() => init(d), /route|cycle|classId|requires/); }
});

test('live edits cannot invalidate an accepted protocol route', () => {
  const d = example('chat-application'); insert(d, 'chat-commands', 'gateway', 'web-server', 'calls');
  const run = init(d, [history()]);
  for (const control of [
    { target: { kind: 'node', id: 'gateway' }, params: { outputPayload: 'text' } },
    { target: { kind: 'edge', id: 'chat-commands-gateway' }, params: { mode: 'async' } },
    { target: { kind: 'edge', id: 'chat-commands-gateway' }, params: { op: 'write' } }
  ]) assert.throws(() => engine.applyControl(run.compiled, run.state, { kind: 'setParams', ...control }, run.deps), /inherit|sync/);
  assert.equal(advance(run).view.global.completed, 1);
});

test('workspace authorization resolves the actual store through independent generic routes', () => {
  const d = example('workspace-access');
  insert(d, 'permission-checks', 'permission-lb', 'load-balancer', 'backends');
  insert(d, 'permission-records', 'authority-retry', 'retry-policy', 'target');
  const operationEdge = d.edges.find(e => e.from.nodeId === 'workspace' && e.from.portId === 'store').id;
  insert(d, operationEdge, 'record-cache', 'cache', 'origin');
  const run = advance(init(d)); assert.equal(run.view.global.completed, 9); assert.equal(run.view.global.failed, 5);
  add(d, 'foreign-records', 'workspace-store'); d.edges.find(e => e.id === 'permission-records-authority-retry').to.nodeId = 'foreign-records';
  assert.throws(() => init(d), /same workspace store/);
});

test('error envelopes retain exact semantic bytes through gateways and crashed cache bypass', () => {
  const d = example('chat-application');
  insert(d, 'chat-commands', 'gateway', 'web-server', 'calls', { callTimeoutMs: 60000 });
  insert(d, 'conversation-operations', 'byte-cache', 'cache', 'origin', { failOpen: true });
  d.faults.push(crash('byte-cache', 0, null));
  for (const e of d.edges) Object.assign(e.params, { bandwidthMbps: .05, latencyMs: 0 });
  patch(d, 'client', { callTimeoutMs: 60000, retries: 0 }); patch(d, 'chat', { callTimeoutMs: 60000, retries: 0 });
  const run = init(d, [history('denied', 'bob')]), transfers = new Map();
  for (let t = .01; t < 15; t += .01) { advance(run, t); for (const v of Object.values(run.state.network.transfers)) transfers.set(v.id, clone(v)); }
  assert.equal(run.state.kernel.client.results[0].value.reason, 'Conversation access denied');
  const errors = [...transfers.values()].filter(t => t.dir === 'b' && t.event.ok === false);
  assert.equal(errors.length, 4);
  for (const t of errors) { assert.equal(t.event.m.ptype, 'json'); assert.equal(t.event.m.fields.applicationResult.reason, 'Conversation access denied'); assert.ok(Math.abs(t.initialKbit - Buffer.byteLength(JSON.stringify(t.event.m.fields)) * 8 / 1000) < 1e-9); }
});

test('generic router exhaustion preserves the final downstream error record', () => {
  const result = { ok: false, err: 'error', msg: { ptype: 'json', kb: 3, tokens: 7, fields: { applicationResult: { reason: 'Precise failure' } } } };
  let output;
  const ctx = { k: { backends: { b: { out: 1, errs: 0, ejectedUntil: null } }, unavailable: 0 }, p: { retries: 1, healthChecks: false }, t: 0,
    edges: () => [{ id: 'b' }], edgeUsable: () => true, reply: (job, out) => { output = out; } };
  kernels.get('loadBalancer').onResult(ctx, { id: 'job' }, { b: 'b', n: 1, tried: ['b'] }, result);
  assert.deepEqual(output, { ok: false, err: 'error', ptype: 'json', kb: 3, tokens: 7, fields: result.msg.fields });
});

function splitChat() {
  const d = example('chat-application'); add(d, 'session', 'chat-stream-session');
  for (const id of ['generation-chunks', 'live-chunks']) d.edges.find(e => e.id === id).from.nodeId = 'session';
  connect(d, 'stream-session', 'chat', 'stream', 'session'); connect(d, 'session-records', 'session', 'store', 'conversations');
  return d;
}
test('separate chat session owns actual cursor delivery and commits only acknowledged content', () => {
  const d = splitChat(), run = init(d, [send()]); advance(run, .2);
  assert.equal(run.state.kernel.chat.chunks, 0); assert.ok(run.state.kernel.session.chunks > 0);
  assert.equal(run.state.kernel.conversations.messages.length, 1); assert.equal(run.state.kernel.client.results.length, 0);
  const checkpoint = clone(run.state); advance(run); const expected = clone(run.state);
  run.state = checkpoint; advance(run); assert.deepEqual(run.state, expected);
  assert.equal(run.view?.global?.failed || 0, 0); assert.equal(run.state.kernel.session.completed, 1); assert.equal(run.state.kernel.chat.completed, 1);
  assert.equal(run.state.kernel.client.chunks.map(c => c.content).join(''), run.state.kernel.conversations.messages[1].content);
  const other = clone(d); add(other, 'other-store', 'conversation-store'); other.edges.find(e => e.id === 'session-records').to.nodeId = 'other-store';
  assert.throws(() => init(other), /same conversation store/);
});

function workspaceEvents() {
  const d = example('workspace-access');
  add(d, 'events', 'task-queue', { enqueueMs: 1, visibilityTimeoutMs: 100, retryDelayMs: 10, maxReceives: 5 });
  add(d, 'journal', 'workspace-journal', { serviceMs: 500, concurrency: 4 });
  connect(d, 'publish', 'workspace', 'events', 'events'); connect(d, 'consume', 'events', 'consumers', 'journal');
  return d;
}
test('workspace mutation enqueue is not journal application, and redelivery applies once', () => {
  const d = workspaceEvents(); patch(d, 'client', { intervalMs: 2000 });
  const run = init(d, [task(), task()]); advance(run, .1);
  assert.equal(run.state.kernel.client.results[0].value.activity.state, 'queued'); assert.equal(run.state.kernel.journal.events.length, 0);
  const checkpoint = clone(run.state); advance(run); const direct = clone(run.state); run.state = checkpoint; advance(run);
  assert.deepEqual(run.state, direct); assert.equal(run.state.kernel.journal.events.length, 1); assert.ok(run.state.kernel.events.stats.redeliveries > 0);
  assert.ok(run.state.kernel.journal.duplicates > 0); assert.equal(run.state.kernel.records.tasks.length, 2);
  assert.equal(run.state.g.effects, 2); assert.equal(run.state.g.duplicateEffects, 0);
  const event = run.state.kernel.journal.events[0].event;
  assert.equal(event.action, 'createTask'); assert.equal(event.userId, 'alice'); assert.equal(event.result.task.title, 'Concrete task');
});

test('journal enqueue failure does not undo or falsely fail a committed workspace mutation', () => {
  const d = workspaceEvents(); d.faults.push(crash('events', 0, null)); patch(d, 'workspace', { callTimeoutMs: 50, retries: 0 });
  const run = advance(init(d, [task()]));
  assert.equal(run.view.global.completed, 1); assert.equal(run.state.kernel.records.tasks.length, 2); assert.equal(run.state.kernel.journal.events.length, 0);
  assert.equal(run.state.kernel.client.results[0].value.activity.state, 'failed'); assert.equal(run.state.kernel.workspace.activityFailed, 1);
});

test('route helper handles optional ports and unique terminal nodes without graph shortcuts', () => {
  const d = example('chat-application'), compiled = diagrams.compile(d, library, config), node = compiled.nodes.find(n => n.id === 'chat');
  assert.deepEqual(protocol.resolveTargets(node, compiled, 'stream', { min: 0 }), []);
  assert.deepEqual(protocol.resolveTargets(node, compiled, 'store', { kernels: ['conversationStore'], singleTarget: true }).map(n => n.id), ['conversations']);
});

function splitAuthority(d = splitChat()) {
  add(d, 'access', 'conversation-access'); connect(d, 'access-check', 'chat', 'access', 'access'); connect(d, 'storage-authority', 'conversations', 'authority', 'access');
  return d;
}
test('split conversation authority owns policy while message storage rechecks every operation', () => {
  const d = splitAuthority(); patch(d, 'client', { intervalMs: 2000 });
  const run = advance(init(d, [send(), history('denied', 'bob'), history()]));
  assert.equal(run.view.global.completed, 2); assert.equal(run.view.global.failed, 1);
  assert.equal(run.state.kernel.access.users.length, 2); assert.equal(run.state.kernel.access.conversations.length, 2);
  assert.deepEqual(run.state.kernel.conversations.users, []); assert.deepEqual(run.state.kernel.conversations.conversations, []);
  assert.equal(run.state.kernel.conversations.messages.length, 2); assert.ok(run.state.kernel.access.allowed > 3);
  assert.equal(run.state.kernel.access.denied, 1); assert.equal(run.state.kernel.client.results[1].value.reason, 'Conversation access denied');
  const other = clone(d); add(other, 'other-access', 'conversation-access'); other.edges.find(e => e.id === 'access-check').to.nodeId = 'other-access';
  assert.throws(() => init(other), /same conversation authority/);
});

test('earlier gateway authorization cannot bypass changed canonical policy at storage', () => {
  const d = splitAuthority(); patch(d, 'access', { serviceMs: 1 });
  const run = init(d, [send()]); advance(run, .009);
  assert.equal(run.state.kernel.access.allowed, 1, 'The application has already received its initial allow decision');
  run.state.kernel.access.conversations[0].ownerId = 'bob';
  advance(run); assert.equal(run.state.kernel.client.results[0].ok, false);
  assert.equal(run.state.kernel.conversations.messages.length, 0); assert.equal(run.state.kernel.generation.chunks, 0);
  assert.ok(run.state.kernel.access.denied > 0);
});

test('routing replicas cannot fork durable histories or change duplicate chunk framing', () => {
  const d = example('chat-application'); insert(d, 'chat-commands', 'lb', 'load-balancer', 'backends');
  add(d, 'chat-two', 'chat-application'); add(d, 'other-store', 'conversation-store');
  connect(d, 'backend-two', 'lb', 'backends', 'chat-two'); connect(d, 'store-two', 'chat-two', 'store', 'other-store');
  connect(d, 'generator-two', 'chat-two', 'generate', 'generation'); connect(d, 'chunks-two', 'chat-two', 'chunks', 'client');
  assert.throws(() => init(d), /same authoritative store/);
  d.edges.find(e => e.id === 'store-two').to.nodeId = 'conversations';
  add(d, 'different-frame', 'synthetic-stream', { chunkCharacters: 8 }); d.edges.find(e => e.id === 'generator-two').to.nodeId = 'different-frame';
  assert.throws(() => init(d), /stable chunk framing/);
});

test('stream-session crash resumes from the durable prompt without duplicate chunks or effects', () => {
  const d = splitAuthority(); d.faults.push(crash('session', .16, .7)); patch(d, 'chat', { retries: 3, retryBackoffMs: 300 }); patch(d, 'client', { retries: 0, callTimeoutMs: 10000 });
  const run = advance(init(d, [send()]));
  assert.equal(run.view.global.completed, 1); assert.equal(run.state.kernel.conversations.messages.length, 2);
  assert.equal(run.view.global.effects, 2); assert.equal(run.view.global.duplicateEffects, 0);
  const chunks = run.state.kernel.client.chunks;
  assert.equal(new Set(chunks.map(c => c.cursor)).size, chunks.length);
  assert.equal(chunks.map(c => c.content).join(''), run.state.kernel.conversations.messages[1].content);
});

test('application admission limits change actual completions without losing request accounting', () => {
  const d = example('chat-application'); patch(d, 'client', { intervalMs: 100, retries: 0 });
  insert(d, 'chat-commands', 'limiter', 'rate-limiter', 'out', { ratePerSec: 1, burst: 1, overflow: 'reject' });
  const run = advance(init(d, [history('one'), history('two'), history('three'), history('four')]));
  assert.equal(run.view.global.offered, 4); assert.equal(run.view.global.completed, 1); assert.equal(run.view.global.failed, 3);
  assert.equal(run.state.kernel.limiter.rateLimited, 3); assert.equal(run.view.global.effects, 0);
  assert.deepEqual(run.state.kernel.client.results.filter(r => !r.ok).map(r => r.error), ['rate-limited', 'rate-limited', 'rate-limited']);
});

test('journal consumer rejection dead-letters the actual event after bounded deliveries', () => {
  const d = workspaceEvents(); patch(d, 'journal', { serviceMs: 1, maxRecords: 1 }); patch(d, 'events', { maxReceives: 2 });
  add(d, 'dead-events', 'dead-letter-queue'); connect(d, 'dead-letter-events', 'events', 'dlq', 'dead-events');
  const second = { ...task(), commandId: 'task-two', taskId: 'task-next' };
  const run = advance(init(d, [task(), second]));
  assert.equal(run.view.global.completed, 2); assert.equal(run.state.kernel.workspace.activityQueued, 2);
  assert.equal(run.state.kernel.journal.events.length, 1); assert.equal(run.state.kernel.events.stats.deadLettered, 1);
  assert.equal(run.state.kernel['dead-events'].kept.length, 1);
  assert.equal(run.state.kernel['dead-events'].kept[0].m.fields.workspaceEvent.commandId, 'task-two');
  assert.equal(run.state.kernel.records.tasks.length, 3); assert.equal(run.view.global.effects, 3);
});

function diamondRoute(layers = 60) {
  const nodes = [{ id: 'source', kernel: 'applicationClient', params: {} }, { id: 'entry', kernel: 'loadBalancer', params: {} }, { id: 'terminal', kernel: 'chatApplication', params: {} }], edges = [];
  const link = (from, to) => edges.push({ id: `edge-${from}-${to}`, from, fromPort: from === 'source' ? 'out' : 'backends', to, toPort: 'in', params: { mode: 'sync', probability: 1, callsPerRequest: 1, op: 'inherit' } });
  link('source', 'entry'); let previous = ['entry'];
  for (let i = 0; i < layers; i++) {
    const current = [`left-${i}`, `right-${i}`];
    for (const id of current) nodes.push({ id, kernel: 'loadBalancer', params: {} });
    for (const from of previous) for (const to of current) link(from, to);
    previous = current;
  }
  for (const from of previous) link(from, 'terminal');
  return { nodes, edges };
}

test('repeated diamond routes inspect each edge once rather than enumerate exponentially many paths', () => {
  const compiled = diamondRoute(), budget = compiled.edges.length * 2; let inspections = 0;
  assert.ok(compiled.nodes.length <= 250); assert.ok(compiled.edges.length <= 1000);
  for (const edge of compiled.edges) Object.defineProperty(edge.params, 'mode', { get() {
    assert.ok(++inspections <= budget, 'Shared relay tails must be memoized, not re-enumerated per path'); return 'sync';
  } });
  assert.deepEqual(protocol.resolveEdgeTargets(compiled.edges[0], compiled, { kernels: ['chatApplication'], targetPort: 'in' }).map(n => n.id), ['terminal']);
  assert.equal(inspections, compiled.edges.length, 'Every incoming edge is still validated exactly once');
});

test('memoized shared tails never bypass validation of a later incompatible incoming edge', () => {
  for (const [key, value] of [['mode', 'async'], ['probability', .5], ['callsPerRequest', 2], ['op', 'write'], ['toPort', 'wrong']]) {
    const compiled = diamondRoute(4), edge = compiled.edges.find(e => e.from === 'right-0' && e.to === 'left-1');
    if (key === 'toPort') edge.toPort = value; else edge.params[key] = value;
    assert.throws(() => protocol.resolveEdgeTargets(compiled.edges[0], compiled, { kernels: ['chatApplication'], targetPort: 'in' }), /sync links|probability|inherit|receive on in/);
  }
});

test('shared-tail traversal still detects cycles and validates every terminal port', () => {
  const cyclic = diamondRoute(4); cyclic.edges.find(e => e.from === 'right-3').to = 'entry';
  assert.throws(() => protocol.resolveEdgeTargets(cyclic.edges[0], cyclic, { kernels: ['chatApplication'], targetPort: 'in' }), /routing cycle/);
  const wrongTerminal = diamondRoute(4); wrongTerminal.edges.find(e => e.from === 'right-3').toPort = 'wrong';
  assert.throws(() => protocol.resolveEdgeTargets(wrongTerminal.edges[0], wrongTerminal, { kernels: ['chatApplication'], targetPort: 'in' }), /terminal must receive on in/);
});

test('required external authority cannot silently become a seeded legacy policy after edge removal', () => {
  const d = splitAuthority(); patch(d, 'conversations', { requireExternalAuthority: true });
  const run = init(d, [history()]);
  assert.deepEqual(run.state.kernel.conversations.users, []);
  assert.throws(() => engine.applyControl(run.compiled, run.state, { kind: 'setParams', target: { kind: 'node', id: 'conversations' }, params: { requireExternalAuthority: false } }, run.deps), /immutable/);
  assert.equal(advance(run).view.global.completed, 1);
  d.edges = d.edges.filter(e => !['access-check', 'storage-authority'].includes(e.id));
  assert.throws(() => init(d), /conversations.authority requires exactly 1/);
});
