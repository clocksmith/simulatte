const assert = require('node:assert/strict');
const test = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const input = require('../public/shared/contracts/input-source.js');
const contract = require('../public/shared/contracts/data-world-spec.js');
const world = require('../public/shared/contracts/world-spec.js');
const motion = require('../public/shared/core/simulation/point-motion.js');
const runs = require('../public/shared/core/simulation/data-run.js');
const pipeline = require('../public/shared/core/pipeline-runner.js');
const view = require('../public/shared/render/point-scene-view.js');
const mapping = { id: 'id', label: null, x: 'x', y: 'y', vx: 'vx', vy: 'vy' };
test('the hexagon homepage keeps simulations visible and data tools optional', () => {
  const html = readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert.match(html, /<section id="simulation-home">/);
  assert.match(html, /class="hex-constellation-container"/);
  assert.equal((html.match(/class="hex-satellite tier-card/g) || []).length, 6);
  assert.match(html, /id="hex-center-create"/);
  assert.match(html, /id="open-data" href="#data"/);
  assert.match(html, /<section id="data-page" class="data-workbench-page" hidden>/);
  assert.doesNotMatch(html, /id="workbench-profiles"/);
  for (const profile of ['gpu-supercluster-v1', 'interstellar-relay-network-v1', 'orbital-transfer-planner-v1',
    'maritime-trade-global-v1', 'subsea-network-global-v1', 'sun-walker-v1', 'food-recall-us-v1']) {
    assert.ok(html.includes(`data-default-profile="${profile}"`));
  }
});
async function fixture(text = 'id,x,y,vx,vy\na,0,2,1,-0.5\nb,4,4,-1,0') {
  return contract.compile(await input.decode(text), { mapping, duration: 4, steps: 4, units: 'meters' });
}

test('landing keyboard activation retains route identity and exposes failed loading for retry', async () => {
  const events = {}, listeners = {}, loaded = [];
  const nodes = Object.fromEntries(['world-tiers-landing-page', 'simulation-home', 'data-page', 'simulation-status'].map(id => [id, {
    hidden: false, dataset: {}, classList: { remove() {} }, addEventListener(name, callback) { listeners[name] = callback; },
  }]));
  const location = { pathname: '/', hash: '' };
  let fail = true;
  const context = { location, document: { getElementById: id => nodes[id], body: { dataset: {} } },
    history: { pushState(_state, _title, url) { location.pathname = url; } },
    SimulatteWorldRuntimeScriptManifest: { profileRuntime: ['profile-runtime.js'] },
    SimulatteWorldRuntimeLoader: { async loadScript(file) { if (fail) throw new Error('offline'); loaded.push(file); } },
    addEventListener(name, callback) { events[name] = callback; },
  };
  vm.runInNewContext(readFileSync(path.join(__dirname, '../public/simulatte/app/workbench-entry.js'), 'utf8'), context);
  assert.equal(nodes['data-page'].hidden, true);
  location.hash = '#data'; events.hashchange();
  assert.equal(nodes['simulation-home'].hidden, true);
  location.hash = ''; events.hashchange();
  const card = { dataset: { tier: 'city', defaultProfile: 'sun-walker-v1' }, click() {
    listeners.click({ target: { closest: () => card }, preventDefault() {}, stopImmediatePropagation() {} });
  } };
  listeners.keydown({ key: 'Enter', target: { closest: () => card }, preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(location.pathname, '/city/sun-walker-v1');
  assert.match(nodes['simulation-status'].textContent, /offline/);
  assert.equal(nodes['simulation-home'].hidden, false);
  fail = false;
  listeners.keydown({ key: ' ', target: { closest: () => card }, preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(loaded, ['profile-runtime.js']);
  assert.equal(nodes['simulation-status'].textContent, '');
});

test('CSV and JSON share typed ingestion, quoted fields, source hashing, and local provenance', async () => {
  const csv = await input.decode('\uFEFFid,label,x,y\r\na,"two, words",1,2\r\nb,"a ""quote""\nand line",3,4');
  assert.equal(csv.rows[0].label, 'two, words');
  assert.equal(csv.rows[1].label, 'a "quote"\nand line');
  assert.equal(csv.source.origin, 'local');
  assert.match(csv.source.sha256, /^[a-f0-9]{64}$/);
  assert.equal((await input.decode(JSON.stringify(csv.rows))).rows[1].label, csv.rows[1].label);
  const legacy = await input.decode(JSON.stringify({ schema: world.LEGACY_SPEC_SCHEMA, name: 'Legacy scene' }));
  assert.equal(legacy.kind, 'legacySpec');
  assert.equal(legacy.spec.schema, world.LEGACY_SPEC_SCHEMA);
  assert.notEqual((await input.decode(' ' + JSON.stringify(csv.rows))).source.sha256, csv.source.sha256);
  for (const text of ['a,a\n1,2', 'a,b\n1', 'a,b\n"bad,2', '[{"x":{}}]', '[null]', '[]', '[{"x":1e999}]', '__proto__,x\n1,2']) {
    await assert.rejects(input.decode(text));
  }
  await assert.rejects(input.decode('a'.repeat(input.MAX_BYTES + 1)), { code: 'input_size_limit' });
});

test('URL acquisition is explicit, bounded, and omits credentials', async () => {
  let called = 0;
  const fetchImpl = async (url, options) => {
    called += 1;
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    return new Response('x,y\n1,2');
  };
  assert.equal((await input.readUrl('https://example.org/points.csv', { fetchImpl })).rows.length, 1);
  await assert.rejects(input.readUrl('https://user:pass@example.org/', { fetchImpl }), { code: 'input_url_invalid' });
  assert.equal(called, 1);
  await assert.rejects(input.readUrl('not a URL', { fetchImpl }), { code: 'input_url_invalid' });
  await assert.rejects(input.readUrl('https://example.org/', { fetchImpl: async () => { throw new TypeError('network'); } }), { code: 'input_network_failed' });
  await assert.rejects(input.readUrl('https://example.org/', { fetchImpl: async () => new Response(new Uint8Array([0xff])) }), { code: 'input_encoding_invalid' });
  await assert.rejects(input.readUrl('https://example.org/', { fetchImpl: async () => new Response('no', { status: 403 }) }), { code: 'input_http_failed' });
  await assert.rejects(input.readUrl('https://example.org/', { fetchImpl: async () => new Response(new Uint8Array(input.MAX_BYTES + 1)) }), { code: 'input_size_limit' });
  const cancel = new AbortController(); cancel.abort();
  await assert.rejects(input.readUrl('https://example.org/', { fetchImpl, signal: cancel.signal }), { code: 'input_cancelled' });
});

test('file and URL ingestion identify exact bytes, retain BOM, and reject malformed UTF-8', async () => {
  const bytes = new TextEncoder().encode('\uFEFFx,y\n1,2');
  const file = await input.readFile(new File([bytes], 'points.csv'));
  const url = await input.readUrl('https://example.org/points.csv', { fetchImpl: async () => new Response(bytes) });
  assert.equal(file.source.byteLength, bytes.byteLength);
  assert.equal(file.source.sha256, await input.sha256(bytes));
  assert.equal(file.source.sha256, url.source.sha256);
  assert.deepEqual(file.rows, url.rows);
  await assert.rejects(input.readFile(new File([new Uint8Array([0xff])], 'bad.csv')), { code: 'input_encoding_invalid' });
});

test('explicit empty CSV records are preserved and refused, not silently dropped', async () => {
  const dataset = await input.decode('x,y\n1,2\n,\n3,4');
  assert.equal(dataset.rows.length, 3);
  assert.throws(() => contract.compile(dataset, { mapping: { id: null, label: null, x: 'x', y: 'y', vx: null, vy: null }, duration: 1, steps: 1, units: 'm' }), /missing value/);
  assert.equal((await input.decode('x,y\n1,2\n\n3,4')).rows.length, 2);
  assert.equal(input.parseCsv('x\n""\n').length, 1);
});

test('data round trip: ingest, prepare, execute, edit, compare, replay, export and verified reimport', async () => {
  const spec = await fixture();
  const badRevision = structuredClone(spec);
  badRevision.authorship.revision = 1000000000;
  assert.throws(() => world.validateWorldSpec(badRevision, { verifyHash: false }), /revision does not match/);
  assert.equal(spec.source.prompt, '');
  assert.equal(spec.authorship.sources[0].authority, 'userOverride');
  const engine = runs.create();
  const first = await engine.run(spec);
  assert.deepEqual(first.frames.at(-1).points, [
    { id: 'a', label: 'a', x: 4, y: 0 }, { id: 'b', label: 'b', x: 0, y: 4 },
  ]);
  const candidate = JSON.parse(world.serializeWorldSpec(spec));
  candidate.objects[0].vx = 2;
  const edited = contract.validate(world.prepareUserEdit(spec, candidate, { rationale: 'Double Alpha velocity' }));
  assert.equal(edited.authorship.revision, 1);
  assert.equal(edited.authorship.patches[0].targetPath, '/objects/0/vx');
  const second = await engine.run(edited);
  assert.equal(second.frames.at(-1).points[0].x, 8);
  assert.equal(runs.compare(first, second).changed, 1);
  const replay = await engine.run(edited);
  assert.equal(runs.compare(second, replay).sameProgram, true);
  assert.equal(runs.compare(second, replay).sameOutput, true);
  const imported = await input.decode(world.serializeWorldSpec(edited));
  assert.equal(imported.kind, 'worldSpec');
  assert.deepEqual((await engine.run(imported.spec)).receipt, replay.receipt);
  assert.equal(replay.receipt.scientificValidation, 'not-performed');
  candidate.contentHash = 'fnv1a32:00000000';
  await assert.rejects(input.decode(JSON.stringify(candidate)), /contentHash/);
  engine.dispose();
});

test('mapping rejects missing cells, duplicate identities, unsupported behavior and resource overflow', async () => {
  await assert.rejects(fixture('id,x,y,vx,vy\na,0,0,,1'), /missing value/);
  await assert.rejects(fixture('id,x,y,vx,vy\na,0,0,1,1\na,1,1,0,0'), /unique/);
  await assert.rejects(fixture('id,x,y,vx,vy\na,0xff,0,1,1'), /decimal/);
  const spec = await fixture();
  for (const mutate of [
    (value) => { value.params.steps = 601; },
    (value) => { value.params.extra = true; },
    (value) => { value.objects[0].mass = 2; },
    (value) => { value.dependencies.assets.push('unloaded'); },
    (value) => { value.params.duration = -1; },
    (value) => { value.objects[0].vx = 1e9; },
  ]) {
    const next = structuredClone(spec); mutate(next);
    await assert.rejects(runs.create().run(world.finalizeWorldSpec(next)));
  }
  assert.throws(() => motion.frame(spec, 1.5), /step_invalid/);
});

test('ordered pipeline validates boundaries, retains failures, and rejects late superseded results', async () => {
  let release;
  const progress = [];
  const runner = pipeline.create({ onProgress: (event) => progress.push(event), yieldTask: async () => {} });
  const blocked = runner.run(1, [{ id: 'wait', run: () => new Promise((resolve) => { release = resolve; }), validate: () => {} }]);
  await new Promise((resolve) => setImmediate(resolve));
  const latest = await runner.run(2, [{ id: 'double', run: (value) => value * 2, validate: (value) => assert.equal(value, 4) }]);
  assert.equal(latest.output, 4);
  release(99);
  await assert.rejects(blocked, { code: 'pipeline_cancelled' });
  assert.equal(progress.filter((event) => event.status === 'completed').length, 1);
  await assert.rejects(runner.run(1, [
    { id: 'first', run: (value) => value, validate: () => {} },
    { id: 'bad', run: (value) => value, validate: () => { throw new Error('invalid_output'); } },
  ]), (error) => error.stageId === 'bad' && error.artifacts[0].output === 1);
  runner.dispose();
  await assert.rejects(runner.run(1, []), /disposed/);
});

test('data startup excludes profile and model runtime, while declared profile dependencies remain available', () => {
  const manifest = require('../public/simulatte/app/world-runtime-script-manifest.js');
  assert.ok(manifest.eager.includes('simulatte/app/data-workbench.js'));
  assert.equal(manifest.eager.some((path) => path.includes('/plugins/') || path.includes('neural-') || path.endsWith('/main.js')), false);
  assert.ok(manifest.profileRuntime.includes('simulatte/app/main.js'));
  assert.equal(new Set([...manifest.eager, ...manifest.profileRuntime]).size, manifest.eager.length + manifest.profileRuntime.length);
});

test('drawing preserves equal coordinate scale on wide and narrow views with stable trajectory bounds', () => {
  const box = view.bounds([{ points: [{ x: 0, y: 0 }, { x: 20, y: 4 }] }]);
  for (const [width, height] of [[800, 400], [300, 600]]) {
    const project = view.projection(box, width, height);
    assert.ok(Math.abs((project({ x: 1, y: 0 }).x - project({ x: 0, y: 0 }).x) - (project({ x: 0, y: 0 }).y - project({ x: 0, y: 1 }).y)) < 1e-10);
  }
});
