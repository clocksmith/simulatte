const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const catalog = require('../public/simulation-routes.js');
const root = path.resolve(__dirname, '..');

test('the discovery catalog covers each registered profile and both standalone experiences once', () => {
  const inventory = JSON.parse(fs.readFileSync(path.join(root, 'public/data/application-profiles/profile-claim-inventory-v1.json')));
  assert.deepEqual(catalog.pages.filter(page => page.profile).map(page => page.profile).sort(), inventory.profileIds);
  assert.equal(catalog.pages.length, 14);
  assert.equal(new Set(catalog.pages.map(page => page.path)).size, 14);
  assert.equal(catalog.pages.filter(page => page.entry).length, 2);
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

test('featured images are captures of the exact simulation routes and the homepage is a catalog projection', () => {
  const receipt = JSON.parse(fs.readFileSync(path.join(root, 'public/simulation-previews/capture-receipt.json')));
  assert.deepEqual(catalog.featured.map(page => page.path).sort(), ['/datacenter', '/motorcycle', '/sunwalker']);
  for (const page of catalog.featured) {
    assert.ok(fs.existsSync(path.join(root, 'public', page.previewAsset)));
    assert.ok(receipt.captures.some(row => row.path === page.path && row.asset === page.previewAsset));
  }
  execFileSync(process.execPath, ['tools/sync-simulation-homepage.mjs', '--check'], { cwd: root });
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  assert.match(html, /href="#all-simulations"/);
  assert.doesNotMatch(html, /launch-bike|launch-waves|launch-city|motorcycle-launch/);
});
