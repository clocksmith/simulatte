const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

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
  assert.deepEqual(worldConfig.redirects, [{
    source: '/blank{,/**}',
    destination: 'https://create.simulatte.world',
    type: 301,
  }]);
  assert.equal(fs.existsSync(path.join(worldRoot, 'blank')), false);
  assert.doesNotMatch(worldHtml, /href="https:\/\/create\.simulatte\.world\/"/);
  assert.equal(fs.existsSync(path.join(worldRoot, 'simulatte', 'app', 'main.js')), true);
  assert.equal(createHtml, sourceBlankHtml);
  assert.match(createHtml, /<base href="\/blank\/">/);
  assert.equal(fs.existsSync(path.join(createRoot, 'blank', 'app', 'main.js')), true);
  assert.equal(fs.existsSync(path.join(createRoot, 'shared', 'design', 'simulatte.css')), true);
  assert.equal(fs.existsSync(path.join(createRoot, 'data', 'simulatte-embedder', 'model-runtime-lock.json')), true);
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
    /^npm run restore:doppler:development && npm run stamp:build && npm run check:deploy && npm run package:hosting$/,
  );
});
