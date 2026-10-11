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

test('every catalog entry has safe SVG line art and appears in the gallery', async () => {
  const {buildIllustrations} = await import('../tools/simulatte/build-simulation-illustrations.mjs');
  assert.throws(() => buildIllustrations([{path:'/missing',previewAsset:'/simulation-previews/missing.svg'}]), /Unknown illustration/);
  execFileSync(process.execPath, ['tools/simulatte/build-simulation-illustrations.mjs', '--check'], {cwd:root});
  execFileSync(process.execPath, ['tools/sync-simulation-homepage.mjs', '--check'], {cwd:root});
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  const gallery = html.split('id="featured-simulations"')[1].split('</nav>')[0];
  assert.equal((gallery.match(/class="launch-link simulation-preview"/g)||[]).length, catalog.pages.length);
  assert.equal((gallery.match(/<svg /g)||[]).length, catalog.pages.length);
  const launch = html.split('<!-- SIMULATION_CATALOG_START -->')[1].split('<!-- SIMULATION_CATALOG_END -->')[0];
  assert.doesNotMatch(launch, /simulation-catalog|gallery-controls|catalog-entry|aria-roledescription="carousel"/);
  for (const page of catalog.pages) {
    assert.equal(launch.split(`<h2 class="preview-heading">${page.displayName} `).length - 1, 1);
    if (page.limitations) assert.ok(launch.includes(page.limitations));
  }
  assert.doesNotMatch(gallery, /<img|<script|<image|<foreignObject/i);
  const ids = [...gallery.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(new Set(ids).size, ids.length, 'Inline definitions must not collide across illustrations');
  for (const match of gallery.matchAll(/(?:href="#|url\(#)([^"\)]+)/g)) assert.ok(ids.includes(match[1]), 'Every SVG reference resolves');
  for (const page of catalog.pages) {
    const art=fs.readFileSync(path.join(root, 'public', page.previewAsset), 'utf8');
    assert.match(art, /viewBox="0 0 720 680"/);
    assert.doesNotMatch(art, /<(?:script|image|foreignObject)\b|\bon\w+\s*=|(?:href|src)\s*=\s*["'](?!#)/i);
    assert.ok(gallery.includes(`href=".${page.path}" aria-label="Open ${page.displayName}"`));
    assert.ok(gallery.includes(art.trim()));
  }
  assert.match(gallery, /class="launch-bike" transform="translate\(295 310\)"/);
  assert.match(gallery, /<ellipse rx="300" ry="210"/);
});
