const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const build = 'a'.repeat(40) + '-' + 'b'.repeat(12);
async function fixture(t, surface = 'world') {
  const { verifyHostingSurface } = await import('../tools/hosting-release-checks.mjs');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'simulatte-release-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const prefix = surface === 'create' ? 'blank/' : '';
  const html = `<meta name="simulatte-build" content="${build}"><base href="/${prefix}"><script defer src="main.js?v=${build}"></script><link rel="stylesheet" href="style.css">`;
  const files = { 'index.html': html, 'version.json': JSON.stringify({ build }),
    'hosting-surface.json': JSON.stringify({ schema: 'simulatte.hostingSurface.v1', id: `simulatte-${surface}`, inventorySha256: 'c'.repeat(64) }),
    [prefix + 'main.js']: 'globalThis.started = true;', [prefix + 'style.css']: 'body { color: black; }' };
  const remote = new Map();
  for (const [name, text] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(directory, name)), { recursive: true }); await fs.writeFile(path.join(directory, name), text);
    remote.set('/' + name, { text, type: name.endsWith('.json') ? 'application/json' : name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html' });
  }
  remote.set('/', remote.get('/index.html'));
  const verify = () => verifyHostingSurface({ surface, expectedBuild: build, baseUrl: 'https://fixture.test/', packageRoot: directory,
    fetchImpl: async url => { const item = remote.get(new URL(url).pathname); return new Response(item?.text || '', { status: item ? 200 : 404, headers: { 'content-type': item?.type || 'text/plain' } }); } });
  return { directory, remote, verify, prefix };
}

for (const surface of ['world', 'create']) test(`binds ${surface} entrypoint, base URL, assets and package to the exact build`, async t => {
  const f = await fixture(t, surface); const report = await f.verify(); assert.equal(report.pass, true); assert.equal(report.assets.length, 2);
});
test('rejects the wrong content build even when its source SHA matches', async t => {
  const f = await fixture(t); f.remote.get('/version.json').text = JSON.stringify({ build: build.slice(0, 41) + 'd'.repeat(12) });
  assert.equal((await f.verify()).pass, false);
});
test('rejects successful HTML fallback responses for missing scripts', async t => {
  const f = await fixture(t); f.remote.set('/main.js', f.remote.get('/'));
  const report = await f.verify(); assert.equal(report.pass, false); assert.match(report.assets.find(a => a.kind === 'script').error, /content type/);
});
test('rejects stale bytes behind a correctly stamped script URL', async t => {
  const f = await fixture(t); f.remote.get('/main.js').text = 'globalThis.started = false;';
  assert.equal((await f.verify()).pass, false);
});
test('rejects a deferred script missing its build stamp', async t => {
  const f = await fixture(t); const html = f.remote.get('/').text.replace(`main.js?v=${build}`, 'main.js');
  f.remote.get('/').text = html; await fs.writeFile(path.join(f.directory, 'index.html'), html);
  const report = await f.verify(); assert.equal(report.pass, false); assert.match(report.assets.find(a => a.kind === 'script').error, /stamp/);
});
test('rejects the wrong surface and an old package inventory', async t => {
  const f = await fixture(t); const receipt = f.remote.get('/hosting-surface.json');
  const data = JSON.parse(receipt.text); receipt.text = JSON.stringify({ ...data, id: 'simulatte-create' });
  assert.equal((await f.verify()).pass, false);
  receipt.text = JSON.stringify({ ...data, inventorySha256: 'd'.repeat(64) });
  assert.equal((await f.verify()).pass, false);
});
test('does not accept missing styles or a packaged build different from the release', async t => {
  const f = await fixture(t); f.remote.delete('/style.css'); assert.equal((await f.verify()).pass, false);
  await fs.writeFile(path.join(f.directory, 'version.json'), JSON.stringify({ build: 'old' }));
  assert.match((await f.verify()).errors[0], /Packaged build/);
});

test('production deployment commands require live verification and previews do not probe production', async () => {
  const { scripts } = JSON.parse(await fs.readFile(path.join(__dirname, '../package.json'), 'utf8'));
  for (const name of ['deploy:hosting', 'deploy:hosting:d4da', 'deploy:hosting:personal']) assert.match(scripts[name], /&& npm run verify:live$/);
  for (const surface of ['world', 'create']) assert.match(scripts['deploy:hosting:' + surface], new RegExp('&& npm run verify:live -- --surface=' + surface + '$'));
  for (const [name, command] of Object.entries(scripts)) if (name.startsWith('deploy:preview')) assert.doesNotMatch(command, /verify:live/);
});
