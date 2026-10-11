const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const catalog = require('../public/simulation-routes.js');
const root = path.resolve(__dirname, '..');

test('the discovery catalog covers each registered profile and standalone experiences once', () => {
  const inventory = JSON.parse(fs.readFileSync(path.join(root, 'public/data/application-profiles/profile-claim-inventory-v1.json')));
  assert.deepEqual(catalog.pages.filter(page => page.profile).map(page => page.profile).sort(), inventory.profileIds);
  assert.equal(catalog.pages.length, 17);
  assert.equal(new Set(catalog.pages.map(page => page.path)).size, 17);
  assert.equal(catalog.pages.filter(page => page.entry).length, 5);
  for (const page of catalog.pages) {
    assert.ok(page.displayName && page.description);
    assert.ok(['available', 'experimental', 'in-development'].includes(page.readiness));
    assert.equal(catalog.forPath(page.path), page);
    if (page.profile) assert.equal(catalog.forSelection(page.tier, page.profile), page);
    if (page.readiness === 'available') assert.ok(page.evidence.length, 'Available requires evidence');
    if (page.readiness === 'experimental') assert.ok(page.limitations, 'Experimental requires concrete limits');
    for (const evidence of page.evidence) assert.ok(fs.existsSync(path.join(root, evidence)));
  }
});

test('homepage previews follow the featured catalog with bound simulation captures', () => {
  const receipt = JSON.parse(fs.readFileSync(path.join(root, 'public/simulation-previews/capture-receipt.json')));
  assert.deepEqual(catalog.featured.map(page => page.path).sort(), ['/datacenter', '/interstellar', '/motorcycle', '/sunwalker']);
  const { createHash } = require('node:crypto');
  for (const page of catalog.featured) {
    assert.ok(page.previewAsset, 'Featured experience requires its own preview');
    const bytes = fs.readFileSync(path.join(root, 'public', page.previewAsset));
    const capture = receipt.captures.find(row => row.path === page.path && row.asset === page.previewAsset);
    assert.ok(capture, 'Preview must come from the corresponding simulation');
    assert.equal(capture.sha256, createHash('sha256').update(bytes).digest('hex'));
  }
  execFileSync(process.execPath, ['tools/sync-simulation-homepage.mjs', '--check'], { cwd: root });
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  assert.match(html, /href="#all-simulations"/);
  assert.doesNotMatch(html, /launch-bike|launch-waves|launch-city/);
  for (const page of catalog.featured) {
    assert.ok(html.includes(`href=".${page.path}" aria-label="Open ${page.displayName}"`));
    assert.ok(html.includes(`src=".${page.previewAsset}"`));
  }
});

test('a failed preview recapture preserves existing images and their receipt', () => {
  const script = `
    const vm = require('node:vm');
    const fs = require('node:fs');
    const { pathToFileURL } = require('node:url');
    const writes = [];
    let navigations = 0, closed = false;
    const client = {
      once: () => Promise.resolve(),
      async send(method) {
        if (method === 'Page.navigate' && ++navigations === 2) throw Error('capture failed');
        if (method === 'Page.captureScreenshot') return { data: Buffer.from('image').toString('base64') };
        return { result: { value: { ready: true, phase: 'running', x: 0, y: 0, width: 1200, height: 800, scale: 1 } } };
      }
    };
    const context = vm.createContext({ Buffer, URL, console: { log() {} },
      setTimeout: callback => { callback(); },
    });
    const tool = new vm.SourceTextModule(fs.readFileSync('tools/simulatte/capture-featured-previews.mjs', 'utf8'), {
      context, identifier: pathToFileURL(require('node:path').resolve('tools/simulatte/capture-featured-previews.mjs')).href,
      initializeImportMeta: meta => { meta.url = tool.identifier; }
    });
    const imports = {
      'node:fs/promises': { default: { mkdir: async () => {}, writeFile: async (...args) => writes.push(args) } },
      'node:crypto': { default: require('node:crypto') },
      'node:module': { createRequire: require('node:module').createRequire },
      'node:url': { fileURLToPath: require('node:url').fileURLToPath },
      './browser-session.mjs': { openBrowserAudit: async () => ({ client,
        host: { baseUrl: 'http://simulatte.test/' }, close: async () => { closed = true; } }) },
      './runtime-audit-sources.mjs': { sourceReceipt: async () => ({ head: 'fixture' }) }
    };
    (async () => {
      await tool.link(specifier => {
        const values = imports[specifier];
        return new vm.SyntheticModule(Object.keys(values), function () {
          for (const [key, value] of Object.entries(values)) this.setExport(key, value);
        }, { context });
      });
      await require('node:assert/strict').rejects(tool.evaluate(), /capture failed/);
      require('node:assert/strict').equal(navigations, 2);
      require('node:assert/strict').equal(closed, true);
      require('node:assert/strict').deepEqual(writes, []);
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `;
  execFileSync(process.execPath, ['--experimental-vm-modules', '-e', script], { cwd: root, stdio: 'pipe' });
});
