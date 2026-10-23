const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const libraryApi = require('../public/simulatte/system-diagram/class-library.js');
const library = libraryApi.loadSync(path.join(__dirname, '../public/data/system-diagram'));
require('../public/simulatte/system-diagram/kernels-ai.js');
require('../public/simulatte/system-diagram/kernels-storage.js');
require('../public/simulatte/system-diagram/kernels-sources.js');
const registry = require('../public/simulatte/system-diagram/kernel-registry.js');
function fixture(id, overrides = {}, ports = {}) {
  let seq = 0;
  const kernel = registry.get(id), jobs = new Map(), effects = new Set(), holds = new Set(), counts = {};
  const ctx = { t: 0, nodeId: id, p: { ...Object.fromEntries(Object.entries(library.kernels[id].params).map(([k, s]) => [k, s.default])), ...overrides }, fault: { slowFactor: 1, down: false }, calls: [], wakes: [], admissions: [], replies: [], costs: [], ended: [], begun: [],
    rand: () => .5, poisson: n => Math.round(n), serviceMs: mean => mean,
    edges: port => ports[port] || [], edge: id => ({ id, params: { mode: 'sync' } }),
    getJob: id => { const j = jobs.get(id); return j && j.status !== 'finished' ? j : null; }, jobs: () => [...jobs.values()].filter(j => j.status !== 'finished'),
    hold(job) { holds.add(job.id); return true; },
    admit(job, ms) { holds.add(job.id); job.status = 'serving'; ctx.admissions.push({ job, ms }); return true; },
    release(job) { holds.delete(job.id); job.status = 'waiting'; },
    reply(job, result) { holds.delete(job.id); job.status = 'finished'; ctx.replies.push({ job, result }); },
    call(job, edgeId, patch, options) { ctx.calls.push({ job, edgeId, patch, options }); },
    wake(delay, payload) { ctx.wakes.push({ delay, payload }); },
    count(key, n) { counts[key] = (counts[key] || 0) + n; }, latency() {}, log() {}, cost(value) { ctx.costs.push(value); },
    effect(key, { idempotent }) { const duplicate = effects.has(key); effects.add(key); return { duplicate, suppressed: idempotent && duplicate }; },
    message(fields) { return { id: `message-${++seq}`, trace: `trace-${seq}`, idem: `trace-${seq}`, ptype: 'text', kb: 1, tokens: 5, key: 1, op: 'read', fields: {}, ...fields }; },
    derive: (msg, patch) => ({ ...msg, ...patch }),
    newJob(msg) { const job = { id: `job-${++seq}`, msg, data: {}, status: 'new' }; jobs.set(job.id, job); return job; },
    beginRequest(msg) { ctx.begun.push(msg); }, endRequest(msg, result) { ctx.ended.push({ msg, result }); }
  };
  ctx.k = kernel.init?.(ctx) || {};
  return { ctx, kernel, holds, counts, job: patch => ctx.newJob(ctx.message(patch)), served: job => kernel.onServed(ctx, job), result: (job, slot, result) => kernel.onResult(ctx, job, slot, { msg: job.msg, ...result }) };
}

test('registered class kernels are execution capabilities; unimplemented AI metadata stays unregistered', () => {
  for (const id of ['batchWorker','llm','retriever','structuredResponse','cron','crawler','replicatedDb','cache','objectStore']) assert.ok(registry.has(id), id);
  for (const id of ['embedder','vectorIndex','reranker','chunker']) { assert.ok(library.kernels[id]); assert.equal(registry.has(id), false); }
  assert.throws(() => fixture('replicatedDb', { replication: 'quorum' }), /not implemented/);
  assert.throws(() => registry.get('replicatedDb').validateParams({ replication: 'sync' }), /not implemented/);
  assert.throws(() => fixture('cache', { failOpen: true }), /not implemented/);
});

test('GPU batching groups work, retains each request memory and drains partial window without zero-time polling', () => {
  const f = fixture('batchWorker', { maxBatch: 4, workers: 1, batchBaseMs: 10, perItemMs: 2 });
  const jobs = Array.from({ length: 6 }, () => f.job()); jobs.forEach(j => f.kernel.onRequest(f.ctx, j));
  assert.equal(f.ctx.admissions.length, 1); assert.equal(f.ctx.admissions[0].ms, 18); assert.equal(f.holds.size, 6);
  f.kernel.onWake(f.ctx, f.ctx.wakes[0].payload);
  f.served(jobs[0]); assert.equal(f.ctx.replies.length, 4); assert.equal(f.ctx.admissions.length, 2); assert.equal(f.ctx.admissions[1].ms, 14);
  f.served(jobs[4]); assert.equal(f.ctx.replies.length, 6); assert.equal(f.holds.size, 0); assert.equal(f.ctx.k.running, 0);
  assert.ok(f.ctx.wakes.filter(w => w.payload.kind === 'batch').length <= 1);
});

test('LLM synthetic timing, context window, quota, structured schema flags and costs use authored parameters', () => {
  const f = fixture('llm', { ttftMs: 10, decodeMsPerToken: 2, outputTokensMean: 10, structuredOutput: true, schemaFailureRate: 1, tokensPerMinute: 30, contextWindow: 100 });
  const a = f.job({ tokens: 5 }); f.kernel.onRequest(f.ctx, a); assert.ok(f.ctx.admissions[0].ms >= 30); f.served(a);
  assert.equal(f.ctx.replies[0].result.ptype, 'json'); assert.equal(f.ctx.replies[0].result.fields.invalid, true); assert.ok(f.ctx.costs[0] > 0);
  const b = f.job({ tokens: 20 }); f.kernel.onRequest(f.ctx, b); assert.equal(f.ctx.replies.at(-1).result.err, 'rate-limited');
  const c = f.job({ tokens: 100 }); f.kernel.onRequest(f.ctx, c); assert.equal(f.ctx.replies.at(-1).result.err, 'invalid');
});

test('RAG orchestrates typed registered adapters in declared step order and propagates dependency errors', () => {
  const f = fixture('retriever', {}, { embed: ['e'], search: ['s'], generate: ['g'] }), job = f.job();
  f.kernel.onRequest(f.ctx, job); f.served(job); assert.equal(f.ctx.calls.at(-1).patch.ptype, 'text');
  f.result(job, 'embed', { ok: true }); assert.equal(f.ctx.calls.at(-1).edgeId, 's'); assert.equal(f.ctx.calls.at(-1).patch.ptype, 'embedding');
  f.result(job, 'search', { ok: true }); assert.equal(f.ctx.calls.at(-1).edgeId, 'g'); assert.equal(f.ctx.calls.at(-1).patch.tokens, 5 + 400 + 8*300);
  f.result(job, 'generate', { ok: false, err: 'timeout' }); assert.equal(f.ctx.replies.at(-1).result.err, 'timeout');
});

test('structured response rejects invalid synthetic output after its finite repair budget', () => {
  const f = fixture('structuredResponse', { maxRepairs: 2 }, { generate: ['g'] }), job = f.job();
  f.kernel.onRequest(f.ctx, job); f.served(job);
  for (let n = 0; n < 3; n++) f.result(job, 'generate', { ok: true, msg: { ...job.msg, fields: { invalid: true } } });
  assert.equal(f.ctx.calls.length, 3); assert.equal(f.counts.repairs, 2); assert.equal(f.ctx.replies.at(-1).result.err, 'invalid');
});

test('asynchronous replicas show stale reads before lag and explicit election loss of unreplicated writes', () => {
  const f = fixture('replicatedDb', { replicas: 3, readFrom: 'followers' });
  const write = f.job({ op: 'write', key: 7 }); f.kernel.onRequest(f.ctx, write); f.served(write);
  const read = f.job({ op: 'read', key: 7 }); f.kernel.onRequest(f.ctx, read); f.served(read); assert.equal(f.ctx.replies.at(-1).result.fields.stale, true);
  f.kernel.onFault(f.ctx, { type: 'failLeader' }, true); const unavailable = f.job(); f.kernel.onRequest(f.ctx, unavailable); assert.equal(f.ctx.replies.at(-1).result.err, 'unavailable');
  const election = f.ctx.wakes.find(w => w.payload.kind === 'elect'); f.kernel.onWake(f.ctx, election.payload); assert.equal(f.ctx.k.leader, 1); assert.equal(f.ctx.k.lostWrites, 1);
  const oldCopy = f.ctx.wakes.find(w => w.payload.kind === 'replicate'); f.kernel.onWake(f.ctx, oldCopy.payload); assert.equal(Object.keys(f.ctx.k.replicas[1].values).length, 0, 'old leader copy fenced');
});

test('cache coalesces same-key misses and expires TTL entries; object-store size changes actual service time', () => {
  const f = fixture('cache', { coalesceMisses: true, ttlSec: 1 }, { origin: ['origin'] });
  const a = f.job(), b = f.job(); f.kernel.onRequest(f.ctx, a); f.served(a); f.kernel.onRequest(f.ctx, b); f.served(b);
  assert.equal(f.ctx.calls.length, 1); f.result(a, 'origin', { ok: true, msg: { kb: 3, ptype: 'json' } }); assert.equal(f.ctx.replies.length, 2);
  const hit = f.job(); f.kernel.onRequest(f.ctx, hit); f.served(hit); assert.equal(f.ctx.k.hits, 1);
  f.ctx.t = 2; const miss = f.job(); f.kernel.onRequest(f.ctx, miss); f.served(miss); assert.equal(f.ctx.calls.length, 2);
  const store = fixture('objectStore', { baseMs: 20, throughputMBps: 10 }); const j = store.job({ kb: 100, op: 'write' }); store.kernel.onRequest(store.ctx, j); assert.equal(store.ctx.admissions[0].ms, 30); store.served(j); assert.equal(store.ctx.replies[0].result.ptype, 'blob');
});

test('cron skips overlapping schedules and closes every logical job on final response', () => {
  const f = fixture('cron', { overlap: 'skip', jobsPerFire: 1 }, { out: ['out'] }); f.kernel.start(f.ctx); f.kernel.onWake(f.ctx, { kind: 'cron' });
  assert.equal(f.ctx.begun.length, 1); f.kernel.onWake(f.ctx, { kind: 'cron' }); assert.equal(f.ctx.k.skipped, 1);
  const job = f.ctx.calls[0].job; f.result(job, 'job', { ok: true }); assert.equal(f.ctx.ended.length, 1); assert.equal(f.ctx.k.active, 0);
});

test('crawler uses per-domain budgets, bounded discovery and document provenance with no external access', () => {
  const f = fixture('crawler', { seedUrls: 3, maxPages: 4, domains: 1, fetchConcurrency: 3, politenessMs: 100, linksPerPage: 1, duplicateRate: 1 }, { fetch: ['website'], documents: ['sink'] });
  f.kernel.start(f.ctx); f.kernel.onWake(f.ctx, f.ctx.wakes[0].payload); assert.equal(f.ctx.calls.length, 1, 'domain delay prevents simultaneous same-domain fetches');
  const job = f.ctx.calls[0].job; f.result(job, 'fetch', { ok: true }); assert.equal(f.ctx.k.duplicates, 1); assert.ok(f.ctx.k.discovered <= 4);
  const document = f.ctx.calls.at(-1); assert.equal(document.patch.ptype, 'document'); assert.match(document.patch.fields.provenance, /synthetic-url/);
  f.result(job, 'document', { ok: true }); assert.equal(f.ctx.ended.length, 1);
});

const documentApi = require('../public/simulatte/system-diagram/diagram.js');
const engineApi = require('../public/simulatte/system-diagram/engine.js');
const config = require('../public/data/system-diagram/config.json');
require('../public/simulatte/system-diagram/kernels-core.js');
function runExample(id, edit = () => {}) {
  const diagram = structuredClone(require(`../public/data/system-diagram/examples/${id}.json`)); edit(diagram);
  const compiled = documentApi.compile(diagram, library, config), deps = { library, config, kernels: registry };
  return { diagram, compiled, deps, state: engineApi.initialize(compiled, deps) };
}
for (const id of ['web-service','rag-assistant','crawler-pipeline']) test(`canonical ${id} composition executes actual connected kernels and exact checkpoint continuation`, () => {
  const a = runExample(id), b = runExample(id);
  engineApi.advance(a.compiled, a.state, 30, a.deps);
  engineApi.advance(b.compiled, b.state, 2.7, b.deps); const restored = JSON.parse(JSON.stringify(b.state));
  engineApi.advance(b.compiled, restored, 30, b.deps); assert.deepEqual(restored, a.state, 'serialized event/RNG/resource state continues exactly');
  const view = engineApi.observe(a.compiled, a.state, a.deps); assert.equal(view.error, null); assert.ok(view.global.offered > 0); assert.ok(view.global.completed > 0);
  assert.equal(view.global.offered, view.global.completed + view.global.failed + view.global.inFlight);
  assert.ok(view.attempts.length > view.global.offered);
  assert.equal(view.global.memoryMiB, Object.values(a.state.nodes).reduce((sum,n) => sum + n.memoryMiB,0));
  assert.ok(view.requests.every(r => r.attempts > 0));
  if (id === 'rag-assistant') { for (const name of ['gpu','rag','embed-timing','candidates','generator','validation']) assert.ok(view.nodes[name].served > 0, name); assert.ok(view.global.cost > 0); assert.equal(view.global.memoryMiB,0); }
  if (id === 'crawler-pipeline') { assert.ok(view.nodes.crawler.detail.fetchedPages > 0); assert.ok(view.nodes.schedule.detail.issued > 0); assert.ok(view.nodes.records.served > 0); assert.ok(view.nodes.archive.served > 0); assert.ok(view.attempts.some(a => a.msg.fields.provenance)); }
  if (id === 'web-service') { assert.ok(view.nodes.queue.detail.Deliveries > 0); assert.ok(view.nodes.results.served > 0); assert.ok(view.nodes.cache.detail.hits > 0); }
  const first = view.requests[0], info = engineApi.inspect(a.compiled, a.state, first.id, a.deps); assert.ok(info.history.length > 2); assert.ok(info.history.some(row => row.causes.length));
});

test('removing a RAG executable dependency changes outcomes rather than leaving decorative topology', () => {
  const full = runExample('rag-assistant'), missing = runExample('rag-assistant', d => { d.edges = d.edges.filter(e => e.id !== 'embedding'); });
  engineApi.advance(full.compiled, full.state, 30, full.deps); engineApi.advance(missing.compiled, missing.state, 30, missing.deps);
  const a = engineApi.observe(full.compiled, full.state, full.deps), b = engineApi.observe(missing.compiled, missing.state, missing.deps);
  assert.ok(a.global.completed > 0); assert.equal(b.global.completed,0); assert.ok(b.global.failed > 0); assert.equal(b.nodes['embed-timing'].arrivals,0);
});

test('a failed GPU batch releases every retained member and does not strand sibling requests', () => {
  const a = runExample('rag-assistant', d => {
    d.nodes.find(n => n.id === 'questions').params = { pattern:'burst',burstAtSec:0,burstCount:6,burstSpacingMs:0,maxRequests:6,payload:'text',timeoutMs:1000,retries:0,tokensMean:5 };
    Object.assign(d.nodes.find(n => n.id === 'gpu').params, { maxBatch:4,batchWindowMs:5,batchBaseMs:20,perItemMs:1,errorRate:1 });
  });
  engineApi.advance(a.compiled, a.state,30,a.deps); const view=engineApi.observe(a.compiled,a.state,a.deps);
  assert.equal(view.error,null);assert.equal(view.global.completed,0);assert.equal(view.global.failed,6);assert.equal(view.global.memoryMiB,0);assert.equal(view.nodes.gpu.detail.activeBatches,0);assert.equal(view.nodes.gpu.detail.waiting,0);
});
