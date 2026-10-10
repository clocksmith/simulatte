const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const publicRoutes = require('../public/simulation-routes.js');

const root = path.resolve(__dirname, '..');
const outputRoot = path.join(root, '.firebase-hosting');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function inventorySha256(surfaceRoot) {
  const rows = [];
  function walk(directory, relativeDirectory = '') {
    for (const name of fs.readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const relative = relativeDirectory ? `${relativeDirectory}/${name}` : name;
      const info = fs.statSync(absolute);
      if (info.isDirectory()) walk(absolute, relative);
      else if (relative !== 'hosting-surface.json') {
        rows.push({
          path: relative,
          bytes: info.size,
          sha256: crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex'),
        });
      }
    }
  }
  walk(surfaceRoot);
  const content = rows.map((row) => `${row.path}\0${row.bytes}\0${row.sha256}`).join('\n');
  return crypto.createHash('sha256').update(content).digest('hex');
}

test('hosting targets separate World and Create while preserving governed shared assets', () => {
  execFileSync(process.execPath, ['tools/package-hosting-surfaces.mjs'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const firebase = readJson('firebase.json');
  const worldConfig = firebase.hosting.find((entry) => entry.target === 'world');
  const createConfig = firebase.hosting.find((entry) => entry.target === 'create');
  const worldRoot = path.join(outputRoot, 'world');
  const createRoot = path.join(outputRoot, 'create');
  const createHtml = fs.readFileSync(path.join(createRoot, 'index.html'), 'utf8');
  const worldHtml = fs.readFileSync(path.join(worldRoot, 'index.html'), 'utf8');
  const sourceBlankHtml = fs.readFileSync(path.join(root, 'public', 'blank', 'index.html'), 'utf8');

  assert.equal(worldConfig.public, '.firebase-hosting/world');
  assert.equal(createConfig.public, '.firebase-hosting/create');
  assert.deepEqual(worldConfig.redirects.filter((row) => row.source.startsWith('/blank')), [{
    source: '/blank{,/**}',
    destination: 'https://create.simulatte.world',
    type: 301,
  }]);
  for (const page of publicRoutes.pages) {
    for (const source of [`${page.path}/`, ...page.legacy]) {
      assert.deepEqual(worldConfig.redirects.find((row) => row.source === source), {
        source,
        destination: page.path,
        type: 301,
      });
    }
  }
  assert.equal(new Set(worldConfig.redirects.map((row) => row.source)).size, worldConfig.redirects.length);
  assert.equal(fs.existsSync(path.join(worldRoot, 'blank')), false);
  assert.match(worldHtml, /href="https:\/\/create\.simulatte\.world\/"/);
  assert.equal(fs.existsSync(path.join(worldRoot, 'simulatte', 'app', 'main.js')), true);
  assert.equal(createHtml, sourceBlankHtml);
  assert.match(createHtml, /<base href="\/blank\/">/);
  assert.equal(fs.existsSync(path.join(createRoot, 'blank', 'app', 'main.js')), true);
  assert.equal(fs.existsSync(path.join(createRoot, 'shared', 'design', 'simulatte.css')), true);
  assert.equal(fs.existsSync(path.join(createRoot, 'data', 'simulatte-embedder', 'model-runtime-lock.json')), true);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(createRoot, 'data', 'create-phase-run-policy.json'), 'utf8')),
    readJson('public/data/create-phase-run-policy.json'),
    'Create must ship the execution policy fetched before prompt compilation'
  );
  assert.equal(fs.existsSync(path.join(createRoot, 'data', 'simulatte-universe', 'manifest.json')), true);
  assert.equal(fs.existsSync(path.join(createRoot, 'data', 'simulatte', 'autonomy-manifest.json')), false);
  assert.equal(fs.existsSync(path.join(createRoot, 'vendor', 'doppler', 'package.json')), true);
  assert.equal(fs.existsSync(path.join(createRoot, 'simulatte', 'app', 'main.js')), false);
  assert.notEqual(
    fs.statSync(path.join(root, 'public', 'blank', 'app', 'main.js')).ino,
    fs.statSync(path.join(createRoot, 'blank', 'app', 'main.js')).ino,
    'packaged files must be snapshots rather than hard links to mutable sources'
  );

  const worldReceipt = readJson('.firebase-hosting/world/hosting-surface.json');
  const createReceipt = readJson('.firebase-hosting/create/hosting-surface.json');
  assert.equal(worldReceipt.id, 'simulatte-world');
  assert.equal(createReceipt.id, 'simulatte-create');
  assert.ok(worldReceipt.fileCount > 0);
  assert.ok(createReceipt.fileCount > 0);
  assert.match(worldReceipt.inventorySha256, /^[a-f0-9]{64}$/);
  assert.match(createReceipt.inventorySha256, /^[a-f0-9]{64}$/);
  assert.equal(worldReceipt.inventorySha256, inventorySha256(worldRoot));
  assert.equal(createReceipt.inventorySha256, inventorySha256(createRoot));
});

test('release and hosting validation run against the stamped build identity', () => {
  const scripts = readJson('package.json').scripts;
  assert.match(scripts['release:audit'], /^npm run stamp:build && npm run check:deploy/);
  assert.match(
    scripts['prepare:hosting'],
    /^npm run check:doppler:development && npm run stamp:build && npm run check:deploy && npm run package:hosting$/,
  );
});


test('directory routes do not redirect to their slash-normalized selves', () => {
  const config = readJson('firebase.json').hosting.find((entry) => entry.target === 'world');
  for (const redirect of config.redirects.filter((entry) => entry.source.startsWith('/mandate-2038'))) {
    assert.notEqual(redirect.source.replace(/\/$/, ''), redirect.destination.replace(/\/$/, ''), `redirect loop: ${redirect.source}`);
  }
});

// New standalone HTML must participate in the same release identity and URL cache keys.
test('field entrypoint build stamping is complete and content-idempotent', t => {
  const temporary = fs.mkdtempSync(path.join(require('node:os').tmpdir(),'simulatte-stamp-'));
  t.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
  fs.mkdirSync(path.join(temporary,'tools'),{recursive:true});
  fs.copyFileSync(path.join(root,'tools/stamp-build.mjs'),path.join(temporary,'tools/stamp-build.mjs'));
  for (const entry of ['index.html','blank/index.html','simulatte/field-experiments/index.html']) {
    const file=path.join(temporary,'public',entry);
    fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,'<meta name="simulatte-build" content="initial"><script defer src="./app.js"></script><link rel="stylesheet" href="./app.css">');
  }
  const run=()=>execFileSync(process.execPath,[path.join(temporary,'tools/stamp-build.mjs')],{cwd:temporary,stdio:'pipe'});
  run();
  const first=JSON.parse(fs.readFileSync(path.join(temporary,'public/version.json'),'utf8')).build;
  run();
  assert.equal(JSON.parse(fs.readFileSync(path.join(temporary,'public/version.json'),'utf8')).build,first);
  for(const entry of ['index.html','blank/index.html','simulatte/field-experiments/index.html']) {
    const html=fs.readFileSync(path.join(temporary,'public',entry),'utf8');
    assert.ok(html.includes('content="'+first+'"'));
    assert.ok(html.includes('./app.js?v='+encodeURIComponent(first)));
    assert.ok(html.includes('./app.css?v='+encodeURIComponent(first)));
  }
});
