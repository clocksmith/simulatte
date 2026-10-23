const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const libraryApi = require('../public/simulatte/system-diagram/class-library.js');
const docApi = require('../public/simulatte/system-diagram/diagram.js');
const kernels = require('../public/simulatte/system-diagram/kernels-all.js');
const engine = require('../public/simulatte/system-diagram/engine.js');
const config = require('../public/data/system-diagram/config.json');
const library = libraryApi.loadSync(path.join(root, 'public/data/system-diagram'));
const deps = { library, config, kernels };

// nodes: [id, classId, params]; edges: [from, fromPort, to, toPort, params]
function diagram(nodes, edges, { seed = 11, horizonSec = 60, faults = [] } = {}) {
  return {
    schema: docApi.SCHEMA, id: 'c2', name: 'C2', seed, run: { horizonSec },
    classes: [],
    nodes: nodes.map(([id, classId, params = {}], i) => ({ id, classId, label: id, x: i * 200, y: 0, params })),
    edges: edges.map(([from, fromPort, to, toPort, params = {}], i) => ({ id: `e${i}`, from: { nodeId: from, portId: fromPort }, to: { nodeId: to, portId: toPort }, params })),
    groups: [], notes: [], faults, view: { x: 0, y: 0, zoom: 1 },
  };
}

function run(doc, untilSec) {
  const compiled = docApi.compile(doc, library, config);
  const state = engine.advance(compiled, engine.initialize(compiled, deps), untilSec, deps);
  return { compiled, state, view: engine.observe(compiled, state, deps), metrics: engine.metrics(compiled, state, deps) };
}

const failedBy = (view, code) => (view.global.failedBy && view.global.failedBy[code]) || 0;

const steady = { pattern: 'constant', timeoutMs: 600000, retries: 0 };

test('batching raises batch worker throughput over one-item batches', () => {
  const completed = maxBatch => run(diagram(
    [['users', 'web-client', { ...steady, ratePerSec: 200 }], ['gpu', 'gpu-worker', { workers: 1, maxBatch, batchWindowMs: 5, batchBaseMs: 20, perItemMs: 1, queueCapacity: 100000 }]],
    [['users', 'out', 'gpu', 'in']],
  ), 20).view.global.completed;
  const single = completed(1), batched = completed(32);
  assert.ok(single > 0);
  assert.ok(single < 20 * 60, `one-item batches cap near 1/21ms: ${single}`);
  assert.ok(batched > 3 * single, `batched ${batched} vs single ${single}`);
});

test('LLM latency grows with concurrent sequences (processor sharing)', () => {
  const latency = ratePerSec => run(diagram(
    [['users', 'nl-input', { ...steady, ratePerSec, tokensMean: 100 }], ['llm', 'llm', { maxBatch: 64, batchSlowdown: 0.2, outputTokensMean: 50, decodeMsPerToken: 20, ttftMs: 100 }]],
    [['users', 'out', 'llm', 'in']],
  ), 60).view.global.latency.p50;
  const light = latency(0.2), heavy = latency(10);
  assert.ok(light > 500 && light < 3000, `light load p50 ${light}`);
  assert.ok(heavy > 2 * light, `heavy p50 ${heavy} vs light ${light}`);
});

test('LLM token quota answers excess prompts with rate-limited errors and cost accrues', () => {
  const { view } = run(diagram(
    [['users', 'nl-input', { ...steady, ratePerSec: 2, tokensMean: 200 }], ['api', 'hosted-llm-api', { tokensPerMinute: 3000, outputTokensMean: 100, decodeMsPerToken: 5 }]],
    [['users', 'out', 'api', 'in']],
  ), 60);
  assert.ok(failedBy(view, 'rate-limited') > 0, JSON.stringify(view.global.failedBy));
  assert.ok(view.global.completed > 0);
  assert.ok(view.global.cost > 0);
  assert.ok(view.nodes.api.detail['rate limited'] > 0);
});

test('LLM context overflow fails with invalid', () => {
  const { view } = run(diagram(
    [['users', 'nl-input', { ...steady, ratePerSec: 1, tokensMean: 5000 }], ['llm', 'llm', { contextWindow: 100 }]],
    [['users', 'out', 'llm', 'in']],
  ), 10);
  assert.ok(failedBy(view, 'invalid') > 0);
  assert.equal(view.global.completed, 0);
});

const ragNodes = (extra = {}) => [
  ['users', 'nl-input', { ...steady, ratePerSec: 2, ...extra }],
  ['rag', 'rag-retriever', {}],
  ['embed', 'embedder', {}],
  ['index', 'vector-index', {}],
  ['rerank', 'reranker', {}],
  ['gen', 'llm', { outputTokensMean: 100 }],
];
const ragEdges = [
  ['users', 'out', 'rag', 'in'], ['rag', 'embed', 'embed', 'in'], ['rag', 'search', 'index', 'in'],
  ['rag', 'rerank', 'rerank', 'in'], ['rag', 'generate', 'gen', 'in'],
];

test('RAG chain embeds, searches, reranks and generates with plausible latency', () => {
  const { view } = run(diagram(ragNodes(), ragEdges), 40);
  const g = view.global;
  assert.ok(g.completed > 30, `completed ${g.completed}`);
  assert.equal(g.failed, 0, JSON.stringify(g.failedBy));
  // generation dominates: ttft 200 ms + prefill of ~3k tokens + ~100 tokens at 20 ms
  assert.ok(g.latency.p50 > 1000 && g.latency.p50 < 10000, `p50 ${g.latency.p50}`);
  assert.ok(view.nodes.index.detail.queries >= g.completed);
  assert.ok(view.nodes.rerank.detail.reranked >= g.completed);
  assert.ok(view.nodes.rag.detail['generate ms'] > view.nodes.rag.detail['search ms']);
  assert.ok(view.nodes.gen.arrivals >= g.completed);
});

test('RAG step failures fail the request with that step error', () => {
  const doc = diagram(ragNodes(), ragEdges, { faults: [{ id: 'f1', atSec: 0, untilSec: null, target: { kind: 'node', id: 'embed' }, type: 'crash', params: {} }] });
  const { view } = run(doc, 10);
  assert.equal(view.global.completed, 0);
  assert.ok(failedBy(view, 'down') > 0, JSON.stringify(view.global.failedBy));
  assert.equal(view.nodes.gen.arrivals, 0);
});

const structured = (schemaFailureRate, maxRepairs) => run(diagram(
  [['users', 'nl-input', { ...steady, ratePerSec: 2 }], ['shape', 'structured-response', { maxRepairs }], ['gen', 'structured-llm', { schemaFailureRate, outputTokensMean: 20, decodeMsPerToken: 5 }]],
  [['users', 'out', 'shape', 'in'], ['shape', 'generate', 'gen', 'in']],
), 30).view;

test('structured response repairs invalid generator output', () => {
  const view = structured(0.5, 4);
  assert.ok(view.nodes.shape.detail.repairs > 0);
  assert.ok(view.global.completed > 5 * Math.max(1, failedBy(view, 'invalid')), JSON.stringify(view.global));
});

test('structured response fails with invalid after maxRepairs', () => {
  const view = structured(1, 2);
  assert.equal(view.global.completed, 0);
  assert.ok(failedBy(view, 'invalid') > 0);
  const requests = view.nodes.shape.detail.invalid;
  assert.ok(view.nodes.gen.arrivals >= 3 * requests && view.nodes.gen.arrivals <= 3 * (requests + 2), `arrivals ${view.nodes.gen.arrivals} for ${requests}`);
});

test('structured response without a generator parses directly', () => {
  const { view } = run(diagram(
    [['users', 'unstructured-feed', { ...steady, ratePerSec: 20 }], ['parse', 'doc-parser', { parseFailureRate: 0.25 }]],
    [['users', 'out', 'parse', 'in']],
  ), 20);
  const invalid = failedBy(view, 'invalid');
  assert.ok(invalid > 0 && invalid < view.global.completed);
});

test('chunker fans documents out into an embedder and vector index that grows by every chunk', () => {
  const { view } = run(diagram(
    [['feed', 'unstructured-feed', { ...steady, pattern: 'burst', burstCount: 4, burstAtSec: 0, tokensMean: 2000 }],
      ['chunk', 'chunker', { chunkTokens: 500, overlapTokens: 100 }], ['embed', 'embedder', {}], ['index', 'vector-index', { vectors: 0 }]],
    [['feed', 'out', 'chunk', 'in'], ['chunk', 'chunks', 'embed', 'in', { order: 0 }], ['chunk', 'chunks', 'index', 'in', { order: 1 }]],
  ), 30);
  const chunks = view.nodes.chunk.detail.chunks;
  assert.equal(view.nodes.chunk.detail.documents, 4);
  assert.ok(chunks > 4, `chunks ${chunks}`);
  assert.equal(view.nodes.index.detail.upserts, chunks);
  assert.equal(view.nodes.index.detail.vectors, chunks);
  assert.equal(view.nodes.embed.detail.embedded, chunks);
  assert.equal(view.global.completed, 4);
});

test('cron with overlap skip skips runs while the previous run is active', () => {
  const cron = overlap => run(diagram(
    [['cron', 'cron-scheduler', { everySec: 1, overlap, jobsPerFire: 2 }], ['work', 'worker', { concurrency: 1, serviceMs: 1500, serviceDist: 'constant', callTimeoutMs: 60000 }]],
    [['cron', 'out', 'work', 'in']],
  ), 20).view;
  const skip = cron('skip'), allow = cron('allow');
  assert.ok(skip.nodes.cron.detail['skipped runs'] > 5, JSON.stringify(skip.nodes.cron.detail));
  assert.ok(allow.nodes.cron.detail.runs > skip.nodes.cron.detail.runs);
  assert.ok(allow.global.offered > skip.global.offered);
  assert.equal(skip.global.failed, 0);
});

test('crawler keeps per-domain politeness and backs off a rate-limited website', () => {
  const crawl = (params, site) => run(diagram(
    [['crawl', 'crawler', { seedUrls: 50, linksPerPage: 4, duplicateRate: 0.5, retries: 0, ...params }], ['site', 'website', { serviceMs: 50, ...site }], ['sink', 'data-warehouse', { serviceMs: 1 }]],
    [['crawl', 'fetch', 'site', 'in'], ['crawl', 'documents', 'sink', 'in', { mode: 'async' }]],
  ), 20).view;
  const polite = crawl({ domains: 2, politenessMs: 1000, fetchConcurrency: 8 }, { rateLimitPerSec: 0 });
  assert.ok(polite.nodes.site.arrivals <= 2 * 21, `arrivals ${polite.nodes.site.arrivals}`);
  assert.ok(polite.nodes.crawl.detail['pages fetched'] > 20);
  assert.equal(polite.nodes.sink.arrivals, polite.nodes.crawl.detail['pages fetched']);
  const pushy = crawl({ domains: 10, politenessMs: 50, fetchConcurrency: 16 }, { rateLimitPerSec: 5, rateBurst: 5 });
  assert.ok(pushy.nodes.crawl.detail.throttled > 0);
  assert.ok(failedBy(pushy, 'rate-limited') > 0);
  assert.ok(pushy.nodes.site.arrivals < 20 * 16 * 10, 'throttled domains back off');
  assert.ok(pushy.nodes.crawl.detail['duplicates skipped'] > 0);
  assert.ok(pushy.nodes.sink.arrivals > 0);
});

test('AI and source kernels replay deterministically through faults, steps and JSON clones', () => {
  const fault = (id, atSec, untilSec, nodeId, type, params = {}) => ({ id, atSec, untilSec, target: { kind: 'node', id: nodeId }, type, params });
  const doc = diagram(ragNodes({ pattern: 'poisson' }).concat([
    ['cron', 'cron-scheduler', { everySec: 2, jitterMs: 300, overlap: 'skip' }], ['crawl', 'crawler', { domains: 3, politenessMs: 200 }], ['site', 'website', {}],
    ['gpu', 'gpu-worker', {}], ['chunk', 'chunker', {}], ['shape', 'structured-response', {}], ['agent', 'agent-llm', { outputTokensMean: 40 }],
  ]), ragEdges.concat([
    ['cron', 'out', 'gpu', 'in'], ['gpu', 'calls', 'shape', 'in'], ['shape', 'generate', 'agent', 'in'], ['agent', 'tools', 'site', 'in'],
    ['crawl', 'fetch', 'site', 'in'], ['crawl', 'documents', 'chunk', 'in', { mode: 'async' }], ['chunk', 'chunks', 'embed', 'in'], ['chunk', 'chunks', 'index', 'in'],
  ]), { seed: 5, faults: [
    fault('f1', 4, 8, 'gen', 'slow', { factor: 3 }), fault('f2', 9, 10.5, 'embed', 'crash'), fault('f3', 6, 9, 'crawl', 'crash'),
    fault('f4', 3, 12, 'rerank', 'errors', { rate: 0.3 }), fault('f5', 5, 7, 'cron', 'crash'), fault('f6', 2, 6, 'gpu', 'slow', { factor: 4 }), fault('f7', 11, 12, 'agent', 'crash'),
  ] });
  const a = run(doc, 20), b = run(doc, 20);
  assert.equal(a.view.error, null);
  assert.ok(a.view.global.completed > 0 && a.view.global.failed > 0);
  assert.deepEqual(a.metrics, b.metrics);
  const compiled = docApi.compile(doc, library, config);
  let s = engine.initialize(compiled, deps);
  for (const t of [3.3, 7, 9.75, 12.25]) s = JSON.parse(JSON.stringify(engine.advance(compiled, s, t, deps)));
  s = engine.advance(compiled, s, 20, deps);
  assert.deepEqual(engine.metrics(compiled, s, deps), a.metrics);
  assert.notDeepEqual(run({ ...doc, seed: 6 }, 20).metrics, a.metrics);
});
