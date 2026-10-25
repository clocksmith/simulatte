const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const os = require('node:os');
const temporaryRoot = fs.realpathSync(os.tmpdir());
const publicRoutes = require('../public/simulation-routes.js');

const root = path.resolve(__dirname, '..');

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

test('hosting input boundaries separate World and Create while preserving governed shared assets', async () => {
  const { HOSTING_SURFACES, sourceFiles } = await import('../tools/hosting-surface-inputs.mjs');
  const worldFiles = new Set(sourceFiles(path.join(root, 'public'), HOSTING_SURFACES.world.entries, HOSTING_SURFACES.world.excludes));
  const createFiles = new Set(sourceFiles(path.join(root, 'public'), HOSTING_SURFACES.create.entries, HOSTING_SURFACES.create.excludes));
  const firebase = readJson('firebase.json');
  const worldConfig = firebase.hosting.find((entry) => entry.target === 'world');
  const createConfig = firebase.hosting.find((entry) => entry.target === 'create');
  const createHtml = fs.readFileSync(path.join(root, 'public/blank/index.html'), 'utf8');
  const worldHtml = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

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
  assert.equal([...worldFiles].some(file => file.startsWith('blank/')), false);
  assert.match(worldHtml, /href="https:\/\/create\.simulatte\.world\/"/);
  assert.equal(worldFiles.has('simulatte/app/main.js'), true);
  assert.match(createHtml, /<base href="\/blank\/">/);
  assert.equal(createFiles.has('blank/app/main.js'), true);
  assert.equal(createFiles.has('shared/design/simulatte.css'), true);
  assert.equal(createFiles.has('data/simulatte-embedder/model-runtime-lock.json'), true);
  assert.equal(createFiles.has('data/create-phase-run-policy.json'), true, 'Create must ship the execution policy fetched before prompt compilation');
  assert.equal(createFiles.has('data/simulatte-universe/manifest.json'), true);
  assert.equal(createFiles.has('data/simulatte/autonomy-manifest.json'), false);
  assert.equal(createFiles.has('vendor/doppler/package.json'), true);
  assert.equal(createFiles.has('simulatte/app/main.js'), false);
});

test('directory routes do not redirect to their slash-normalized selves', () => {
  const config = readJson('firebase.json').hosting.find((entry) => entry.target === 'world');
  for (const redirect of config.redirects.filter((entry) => entry.source.startsWith('/mandate-2038'))) {
    assert.notEqual(redirect.source.replace(/\/$/, ''), redirect.destination.replace(/\/$/, ''), `redirect loop: ${redirect.source}`);
  }
});

// New standalone HTML must participate in the same release identity and URL cache keys.
test('field entrypoint build stamping is complete and content-idempotent', t => {
  const temporary = fs.mkdtempSync(path.join(temporaryRoot,'simulatte-stamp-'));
  t.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
  fs.mkdirSync(path.join(temporary,'tools'),{recursive:true});
  for (const name of ['stamp-build.mjs', 'hosting-surface-inputs.mjs']) fs.copyFileSync(path.join(root,'tools',name),path.join(temporary,'tools',name));
  for (const entry of ['index.html','blank/index.html','simulatte/field-experiments/index.html','simulatte/distributed-repair/index.html','simulatte/distributed-repair/repair.html','simulatte/system-diagram/index.html']) {
    const file=path.join(temporary,'public',entry);
    fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,'<meta name="simulatte-build" content="initial"><script defer src="./app.js"></script><link rel="stylesheet" href="./app.css">');
  }
  const run=()=>execFileSync(process.execPath,[path.join(temporary,'tools/stamp-build.mjs')],{cwd:temporary,stdio:'pipe'});
  run();
  const first=JSON.parse(fs.readFileSync(path.join(temporary,'public/version.json'),'utf8')).build;
  run();
  assert.equal(JSON.parse(fs.readFileSync(path.join(temporary,'public/version.json'),'utf8')).build,first);
  for(const entry of ['index.html','blank/index.html','simulatte/field-experiments/index.html','simulatte/distributed-repair/index.html','simulatte/distributed-repair/repair.html','simulatte/system-diagram/index.html']) {
    const html=fs.readFileSync(path.join(temporary,'public',entry),'utf8');
    assert.ok(html.includes('content="'+first+'"'));
    assert.ok(html.includes('./app.js?v='+encodeURIComponent(first)));
    assert.ok(html.includes('./app.css?v='+encodeURIComponent(first)));
  }
});

test('World changing renderer scripts revalidate and standalone entries escape old immutable URLs',()=>{
  const world=readJson('firebase.json').hosting.find(h=>h.target==='world');
  for(const source of ['/simulatte/**/*.js','/shared/**/*.js']){
    const rule=world.headers.find(r=>r.source===source);
    assert.equal(rule.headers.find(h=>h.key==='Cache-Control').value,'no-cache');
  }
  for(const entry of ['solar-drive','motorcycle-noise']){
    const html=fs.readFileSync(path.join(root,'public/simulatte',entry,'index.html'),'utf8');
    const scripts=[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(m=>new URL(m[1],'https://simulatte.world/'));
    assert.ok(scripts.length>10);
    for(const url of scripts)assert.ok(url.searchParams.has('v')&&!url.href.includes('surfaces-v27'),`Previously cached entry asset: ${url.pathname}`);
  }
});

function writeFixtureFile(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function snapshot(directory) {
  const rows = {};
  for (const name of fs.readdirSync(directory).sort()) {
    const file = path.join(directory, name);
    const info = fs.lstatSync(file, { bigint: true });
    rows[name] = info.isDirectory() ? snapshot(file) : {
      sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
      mtime: String(info.mtimeNs), inode: String(info.ino),
    };
  }
  return rows;
}

async function packagingFixture(t) {
  const { packageSurfaces } = await import('../tools/package-hosting-surfaces.mjs');
  const { HOSTING_SURFACES, ENTRYPOINTS } = await import('../tools/hosting-surface-inputs.mjs');
  const directory = fs.mkdtempSync(path.join(temporaryRoot, 'simulatte-package-fixture-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const name of ['firebase.json', '.firebaserc']) fs.copyFileSync(path.join(root, name), path.join(directory, name));
  for (const entry of HOSTING_SURFACES.create.entries) {
    if (entry === 'blank') continue;
    const name = path.extname(entry) ? entry : `${entry}/fixture.js`;
    writeFixtureFile(directory, `public/${name}`, `fixture: ${name}`);
  }
  for (const entry of ENTRYPOINTS) writeFixtureFile(directory, `public/${entry}`, '<meta name="simulatte-build" content="initial"><script defer src="./app.js"></script><link rel="stylesheet" href="./app.css">');
  fs.appendFileSync(path.join(directory, 'public/index.html'), '<a href="https://create.simulatte.world/">Create</a>');
  fs.appendFileSync(path.join(directory, 'public/blank/index.html'), '<base href="/blank/"><a href="https://simulatte.world/">World</a>');
  writeFixtureFile(directory, 'public/blank/app.js', 'create-v1');
  writeFixtureFile(directory, 'public/simulatte/only-world.js', 'world-v1');
  writeFixtureFile(directory, 'public/shared/stable.js', 'shared-v1');
  writeFixtureFile(directory, 'public/version.json', JSON.stringify({ build: 'initial' }));
  const outputRoot = path.join(directory, '.firebase-hosting');
  const run = (surfaces = ['world', 'create']) => packageSurfaces({ root: directory, surfaces });
  return { directory, outputRoot, run };
}

test('incremental packaging is byte-identical and never rewrites unchanged snapshots or receipts', async t => {
  const f = await packagingFixture(t);
  const first = f.run();
  assert.equal(fs.readFileSync(path.join(f.outputRoot, 'create/index.html'), 'utf8'), fs.readFileSync(path.join(f.directory, 'public/blank/index.html'), 'utf8'));
  assert.notEqual(fs.statSync(path.join(f.directory, 'public/blank/app.js')).ino, fs.statSync(path.join(f.outputRoot, 'create/blank/app.js')).ino);
  for (const { surface, receipt } of first) {
    assert.equal(receipt.id, `simulatte-${surface}`);
    assert.equal(receipt.schema, 'simulatte.hostingSurface.v1');
    assert.ok(receipt.fileCount > 0);
    assert.match(receipt.inventorySha256, /^[a-f0-9]{64}$/);
    assert.equal(receipt.inventorySha256, inventorySha256(path.join(f.outputRoot, surface)));
  }
  const before = snapshot(f.outputRoot);
  const second = f.run();
  assert.deepEqual(snapshot(f.outputRoot), before);
  assert.deepEqual(second.map(result => result.receipt), first.map(result => result.receipt));
  for (const result of second) {
    assert.equal(result.changed, 0);
    assert.equal(result.removed, 0);
    assert.equal(result.receiptChanged, false);
    assert.equal(result.unchanged, result.receipt.fileCount);
  }
});

test('selected packaging preserves omitted surfaces and unrelated output-root files', async t => {
  const f = await packagingFixture(t);
  f.run(['create']);
  assert.equal(fs.existsSync(path.join(f.outputRoot, 'world')), false);
  f.run();
  writeFixtureFile(f.directory, '.firebase-hosting/keep.txt', 'unrelated');
  const worldBefore = snapshot(path.join(f.outputRoot, 'world'));
  writeFixtureFile(f.directory, 'public/blank/app.js', 'create-v2');
  const result = f.run(['create']);
  assert.deepEqual(result.map(row => row.surface), ['create']);
  assert.equal(result[0].changed, 1);
  assert.deepEqual(snapshot(path.join(f.outputRoot, 'world')), worldBefore);
  assert.equal(fs.readFileSync(path.join(f.outputRoot, 'keep.txt'), 'utf8'), 'unrelated');
  const createBefore = snapshot(path.join(f.outputRoot, 'create'));
  writeFixtureFile(f.directory, 'public/simulatte/only-world.js', 'world-v2');
  f.run(['world']);
  assert.deepEqual(snapshot(path.join(f.outputRoot, 'create')), createBefore);
});

test('selected sync removes deleted and extra files, handles shape changes, and repairs same-size tampering', async t => {
  const f = await packagingFixture(t);
  writeFixtureFile(f.directory, 'public/shared/shape', 'was-file');
  writeFixtureFile(f.directory, 'public/shared/obsolete.js', 'obsolete');
  f.run();
  const worldBefore = snapshot(path.join(f.outputRoot, 'world'));
  fs.unlinkSync(path.join(f.directory, 'public/shared/shape'));
  writeFixtureFile(f.directory, 'public/shared/shape/child.js', 'now-directory');
  fs.unlinkSync(path.join(f.directory, 'public/shared/obsolete.js'));
  writeFixtureFile(f.directory, '.firebase-hosting/create/extra/nested.js', 'stale');
  const stable = path.join(f.outputRoot, 'create/shared/stable.js');
  const oldTime = fs.statSync(stable).mtime;
  fs.writeFileSync(stable, 'tamper-v1');
  fs.utimesSync(stable, oldTime, oldTime);
  const result = f.run(['create'])[0];
  assert.equal(result.changed, 2);
  assert.equal(result.removed, 3);
  assert.equal(fs.existsSync(path.join(f.outputRoot, 'create/extra')), false);
  assert.equal(fs.existsSync(path.join(f.outputRoot, 'create/shared/obsolete.js')), false);
  assert.equal(fs.readFileSync(stable, 'utf8'), 'shared-v1');
  assert.equal(result.receipt.inventorySha256, inventorySha256(path.join(f.outputRoot, 'create')));
  assert.deepEqual(snapshot(path.join(f.outputRoot, 'world')), worldBefore);
  fs.rmSync(path.join(f.directory, 'public/shared/shape'), { recursive: true });
  writeFixtureFile(f.directory, 'public/shared/shape', 'file-again');
  const source = path.join(f.directory, 'public/blank/app.js');
  const sourceTime = fs.statSync(source).mtime;
  fs.writeFileSync(source, 'create-v2');
  fs.utimesSync(source, sourceTime, sourceTime);
  f.run(['create']);
  assert.equal(fs.readFileSync(path.join(f.outputRoot, 'create/blank/app.js'), 'utf8'), 'create-v2');
  assert.equal(fs.readFileSync(path.join(f.outputRoot, 'create/shared/shape'), 'utf8'), 'file-again');
});

test('shared changes do not imply that the omitted surface was prepared', async t => {
  const f = await packagingFixture(t);
  f.run();
  const omitted = snapshot(path.join(f.outputRoot, 'world'));
  writeFixtureFile(f.directory, 'public/shared/stable.js', 'shared-v2');
  f.run(['create']);
  assert.deepEqual(snapshot(path.join(f.outputRoot, 'world')), omitted);
  const results = f.run();
  assert.equal(results.find(row => row.surface === 'world').changed, 1);
  assert.equal(results.find(row => row.surface === 'create').changed, 0);
});

test('source and output symlinks fail before mutating either surface or outside files', async t => {
  const f = await packagingFixture(t);
  f.run();
  const before = snapshot(f.outputRoot);
  const outside = path.join(f.directory, 'outside');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'keep'), 'must remain');
  fs.symlinkSync(outside, path.join(f.directory, 'public/shared/escape'));
  assert.throws(() => f.run(), /Unsupported hosting source entry/);
  fs.unlinkSync(path.join(f.directory, 'public/shared/escape'));
  assert.deepEqual(snapshot(f.outputRoot), before);
  fs.symlinkSync(outside, path.join(f.outputRoot, 'create/escape'));
  assert.throws(() => f.run(), /unsupported entry/);
  fs.unlinkSync(path.join(f.outputRoot, 'create/escape'));
  assert.deepEqual(snapshot(f.outputRoot), before);
  fs.renameSync(path.join(f.outputRoot, 'create'), path.join(f.directory, 'saved-create'));
  fs.symlinkSync(outside, path.join(f.outputRoot, 'create'));
  assert.throws(() => f.run(['create']), /regular directory/);
  fs.unlinkSync(path.join(f.outputRoot, 'create'));
  fs.renameSync(path.join(f.directory, 'saved-create'), path.join(f.outputRoot, 'create'));
  assert.deepEqual(snapshot(f.outputRoot), before);
  assert.equal(fs.readFileSync(path.join(outside, 'keep'), 'utf8'), 'must remain');
});

test('unknown surface and extra CLI arguments fail closed', async () => {
  const { parseSurfaceArgs } = await import('../tools/hosting-surface-inputs.mjs');
  assert.throws(() => parseSurfaceArgs(['--surface=unknown']), /Unknown hosting surface/);
  assert.throws(() => parseSurfaceArgs(['--surface=world', '--surface=create']), /repeated argument/);
  assert.throws(() => parseSurfaceArgs(['--skip-check']), /Unknown/);
});

test('failed synchronization invalidates its receipt, preserves other surfaces, and can be safely retried', async t => {
  const f = await packagingFixture(t);
  f.run();
  const worldBefore = snapshot(path.join(f.outputRoot, 'world'));
  writeFixtureFile(f.directory, 'public/blank/app.js', 'create-v2');
  const rename = fs.renameSync;
  try {
    fs.renameSync = (source, destination) => {
      if (destination === path.join(f.outputRoot, 'create/blank/app.js')) throw new Error('injected rename failure');
      return rename(source, destination);
    };
    assert.throws(() => f.run(['create']), /injected rename failure/);
  } finally { fs.renameSync = rename; }
  assert.equal(fs.existsSync(path.join(f.outputRoot, 'create/hosting-surface.json')), false);
  assert.deepEqual(snapshot(path.join(f.outputRoot, 'world')), worldBefore);
  const repaired = f.run(['create'])[0];
  assert.equal(repaired.receipt.inventorySha256, inventorySha256(path.join(f.outputRoot, 'create')));
  assert.equal(fs.readFileSync(path.join(f.outputRoot, 'create/blank/app.js'), 'utf8'), 'create-v2');
});

test('selected stamps leave other HTML untouched and full preparation restores one exact release identity', async t => {
  const f = await packagingFixture(t);
  const { HOSTING_SURFACES, ENTRYPOINTS } = await import('../tools/hosting-surface-inputs.mjs');
  fs.mkdirSync(path.join(f.directory, 'tools'));
  for (const name of ['stamp-build.mjs', 'hosting-surface-inputs.mjs', 'package-hosting-surfaces.mjs']) fs.copyFileSync(path.join(root, 'tools', name), path.join(f.directory, 'tools', name));
  const stamp = (...args) => execFileSync(process.execPath, ['tools/stamp-build.mjs', ...args], { cwd: f.directory, encoding: 'utf8', stdio: 'pipe' });
  stamp();
  const before = snapshot(path.join(f.directory, 'public'));
  stamp();
  assert.deepEqual(snapshot(path.join(f.directory, 'public')), before, 'no-op stamps must preserve mtimes and inodes, not just bytes');
  f.run();
  const oldWorld = snapshot(path.join(f.outputRoot, 'world'));
  const worldHtml = Object.fromEntries(HOSTING_SURFACES.world.entrypoints.map(entry => [entry, fs.readFileSync(path.join(f.directory, 'public', entry), 'utf8')]));
  writeFixtureFile(f.directory, 'public/blank/app.js', 'create-v2');
  stamp('--surface=create');
  const checked = execFileSync(process.execPath, ['tools/package-hosting-surfaces.mjs', '--check'], { cwd: f.directory, encoding: 'utf8' });
  assert.match(checked, /contracts are valid/);
  for (const [entry, html] of Object.entries(worldHtml)) assert.equal(fs.readFileSync(path.join(f.directory, 'public', entry), 'utf8'), html);
  const packaged = execFileSync(process.execPath, ['tools/package-hosting-surfaces.mjs', '--surface=create'], { cwd: f.directory, encoding: 'utf8' });
  assert.match(packaged, /Not prepared: world/);
  assert.doesNotMatch(packaged, /simulatte-world:/);
  assert.deepEqual(snapshot(path.join(f.outputRoot, 'world')), oldWorld);
  assert.throws(() => f.run(), /not stamped/);
  const selectedBuild = JSON.parse(fs.readFileSync(path.join(f.directory, 'public/version.json'), 'utf8')).build;
  stamp();
  for (const entry of ENTRYPOINTS) assert.ok(fs.readFileSync(path.join(f.directory, 'public', entry), 'utf8').includes(`content="${selectedBuild}"`));
  const results = f.run();
  for (const { surface } of results) assert.equal(JSON.parse(fs.readFileSync(path.join(f.outputRoot, surface, 'version.json'), 'utf8')).build, selectedBuild);
});

test('incremental snapshots detach pre-existing hard links instead of sharing mutable source', async t => {
  const f = await packagingFixture(t);
  f.run();
  const source = path.join(f.directory, 'public/blank/app.js');
  const destination = path.join(f.outputRoot, 'create/blank/app.js');
  fs.unlinkSync(destination);
  fs.linkSync(source, destination);
  assert.equal(fs.statSync(source).ino, fs.statSync(destination).ino);
  assert.equal(f.run(['create'])[0].changed, 1);
  assert.notEqual(fs.statSync(source).ino, fs.statSync(destination).ino);
  fs.writeFileSync(source, 'create-v2');
  assert.equal(fs.readFileSync(destination, 'utf8'), 'create-v1');
});
