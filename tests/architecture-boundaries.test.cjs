const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('city bootstrap delegates interface behavior through a named dependency object', () => {
  const main = read('public/simulatte/app/main.js');
  const cityInterface = require('../public/simulatte/app/city-interface.js');
  assert.doesNotMatch(main, /function wireCameraControls|function wireInterfaceControls|function updateButtons/);
  assert.match(main, /factory\(Object\.freeze\(\{/);
  assert.equal(typeof cityInterface.wireCameraControls, 'function');
  assert.equal(typeof cityInterface.wireInterfaceControls, 'function');
  assert.equal(typeof cityInterface.updateButtons, 'function');
});

test('application loaders share the governed load context', () => {
  const cityLoader = read('public/simulatte/platform/bootstrap/application-loader.js');
  const tierLoader = read('public/simulatte/platform/bootstrap/tier-application-loader.js');
  const context = require('../public/simulatte/platform/bootstrap/application-load-context.js');
  assert.match(cityLoader, /application-load-context\.js/);
  assert.match(tierLoader, /application-load-context\.js/);
  assert.equal(typeof context.createDataServices, 'function');
  assert.equal(typeof context.createLoadError, 'function');
});

test('tier visualizer delegates drawing and local data access', () => {
  const visualizer = read('public/simulatte/app/multi-tier-visualizer.js');
  const renderers = require('../public/simulatte/app/tier-renderers.js');
  const dataLoader = require('../public/simulatte/app/tier-data-loader.js');
  assert.doesNotMatch(visualizer, /(^|[^\w.])fetch\(/m);
  assert.doesNotMatch(visualizer, /raw\.githubusercontent\.com|remote fallback/i);
  assert.match(visualizer, /tierRenderers\.drawSolarSystem\(this\)/);
  assert.match(visualizer, /this\.lifecycle\.abort\(\)/);
  assert.equal(typeof renderers.drawWorld, 'function');
  assert.equal(typeof dataLoader.createTierDataLoader, 'function');
});

test('tier visualizer uses one pointer-capture orbit path for mouse and touch', () => {
  const visualizer = read('public/simulatte/app/multi-tier-visualizer.js');
  assert.match(visualizer, /'pointerdown'/);
  assert.match(visualizer, /'pointermove'/);
  assert.match(visualizer, /'pointerup'/);
  assert.match(visualizer, /'pointercancel'/);
  assert.match(visualizer, /setPointerCapture/);
  assert.match(visualizer, /touchAction = 'none'/);
  assert.doesNotMatch(visualizer, /'mousedown'|'mousemove'|'mouseup'/);
});

test('browser smoke lanes share one CDP client', () => {
  const browserSmoke = read('tools/simulatte/run-browser-smoke.mjs');
  const tierSmoke = read('tools/simulatte/run-tier-browser-smoke.mjs');
  assert.match(browserSmoke, /from '\.\/browser-harness\.mjs'/);
  assert.match(tierSmoke, /from '\.\/browser-harness\.mjs'/);
  assert.doesNotMatch(browserSmoke, /class CdpClient/);
  assert.doesNotMatch(tierSmoke, /class CdpClient/);
  assert.match(tierSmoke, /getElementById\('runtime-status'\)/);
  assert.doesNotMatch(tierSmoke, /document\.body\s*\?\s*document\.body\.innerText/);
});

test('completed TODO trackers stay removed', () => {
  for (const name of ['TODO_PLUGINS.md', 'TODO_PLUGINS_IMPLEMENTATION.md', 'TODO_SIMULATTE.md']) {
    assert.equal(fs.existsSync(path.join(ROOT, name)), false, `${name} must not return`);
  }
});

test('datacenter visualizer loads the canonical tier world model', () => {
  const visualizer = read('public/simulatte/app/multi-tier-visualizer.js');
  const worldModel = JSON.parse(read('public/data/simulatte/worlds/datacenter-supercluster-v1.json'));
  assert.match(visualizer, /loadTierCache\('\.\.\/worlds\/datacenter-supercluster-v1\.json'/);
  assert.equal(worldModel.id, 'datacenter-supercluster-v1');
  assert.equal(worldModel.tier, 'datacenter');
});

test('profile program exact replay uses the run controller replay boundary', () => {
  const boot = read('public/simulatte/app/world-tiers-boot.js');
  assert.match(boot, /replay:async\(\)=>\{await runController\.replay\(\)/);
  assert.doesNotMatch(boot, /replay:async\(\)=>\{await runController\.seek\(/);
});

test('world landing keeps Create at the canonical center of the mobile honeycomb', () => {
  const html = read('public/index.html');
  const css = read('public/world-tiers.css');
  assert.match(html, /id="hex-center-create"[^>]+href="https:\/\/create\.simulatte\.world\/"|href="https:\/\/create\.simulatte\.world\/"[^>]+id="hex-center-create"/);
  assert.match(css, /\.hex-hub\s*\{\s*left: 30%;\s*top: 33\.333333%;/);
  assert.match(css, /\.pos-top-right\s*\{\s*left: 60%;\s*top: 16\.666667%;/);
  assert.match(css, /\.pos-bottom-left\s*\{\s*left: 0;\s*top: 50%;/);
});
