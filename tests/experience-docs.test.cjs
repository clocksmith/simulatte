const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const DOCS_DIRECTORY = path.join(ROOT, 'docs/simulatte/experiences');
const EXPERIENCE_FILES = Object.freeze([
  'asteroid-defense.md',
  'cable-trader.md',
  'exoplanet-survey.md',
  'food-recall.md',
  'grid-resilience.md',
  'interstellar-relay-network.md',
  'maritime-trade.md',
  'neighborhood-bulk-pool.md',
  'orbital-transfer-planner.md',
  'safety-explorer.md',
  'subsea-network.md',
  'sun-walker.md',
]);
const REQUIRED_HEADINGS = Object.freeze([
  '## Status',
  '## What is it?',
  '## What does it actually do?',
  '## What can the user control?',
  '## What does the user see?',
  '## What is real, derived, modeled, or simulated?',
  '## How does the simulation work?',
  '## How do comparison and playback work?',
  '## What can and cannot be claimed?',
  '## What is verified?',
  '## Where is it implemented?',
]);

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function section(markdown, heading) {
  const start = markdown.indexOf(`${heading}\n`);
  assert.notEqual(start, -1, `missing heading ${heading}`);
  const contentStart = start + heading.length + 1;
  const next = markdown.indexOf('\n## ', contentStart);
  return markdown.slice(contentStart, next === -1 ? markdown.length : next);
}

function bulletCount(value) {
  return value.split('\n').filter((line) => line.startsWith('- ')).length;
}

test('canonical experience documents use one ordered question-led contract', () => {
  for (const filename of EXPERIENCE_FILES) {
    const markdown = read(`docs/simulatte/experiences/${filename}`);
    let previous = -1;
    for (const heading of REQUIRED_HEADINGS) {
      const current = markdown.indexOf(heading);
      assert.ok(current > previous, `${filename}: ${heading} is missing or out of order`);
      previous = current;
    }
    assert.equal(bulletCount(section(markdown, '## Status')), 8, `${filename}: status rows`);
    assert.equal(bulletCount(section(markdown, '## What does the user see?')), 5, `${filename}: view rows`);
    assert.equal(bulletCount(section(markdown, '## How does the simulation work?')), 6, `${filename}: simulation rows`);
    assert.equal(bulletCount(section(markdown, '## How do comparison and playback work?')), 5, `${filename}: comparison rows`);
    assert.equal(bulletCount(section(markdown, '## What can and cannot be claimed?')), 8, `${filename}: claim rows`);
    assert.equal(bulletCount(section(markdown, '## What is verified?')), 6, `${filename}: verification rows`);
    assert.ok(
      [...section(markdown, '## Where is it implemented?').matchAll(/\[[^\]]+\]\([^)]+\)/g)].length <= 8,
      `${filename}: implementation links exceed eight`,
    );
    assert.equal(markdown.includes('—'), false, `${filename}: em dash is forbidden`);
  }
});

test('canonical experience set covers every registered public profile', () => {
  const claimInventory = JSON.parse(read('public/data/application-profiles/profile-claim-inventory-v1.json'));
  const documentedProfileIds = EXPERIENCE_FILES.flatMap((filename) => {
    const markdown = read(`docs/simulatte/experiences/${filename}`);
    const match = section(markdown, '## Status').match(/^- Profile ID: `([^`]+)`$/m);
    return match ? [match[1]] : [];
  }).sort();
  assert.deepEqual(documentedProfileIds, [...claimInventory.profileIds].sort());
});

test('experience index links every canonical page and local links resolve', () => {
  const index = read('docs/simulatte/experiences/README.md');
  for (const filename of EXPERIENCE_FILES) {
    assert.match(index, new RegExp(`\\(${filename.replace('.', '\\.')}\\)`), filename);
  }
  for (const filename of ['README.md', ...EXPERIENCE_FILES]) {
    const absolutePath = path.join(DOCS_DIRECTORY, filename);
    const markdown = fs.readFileSync(absolutePath, 'utf8');
    for (const match of markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1];
      if (/^(?:https?:|#)/.test(target)) continue;
      const withoutAnchor = target.split('#')[0];
      assert.ok(
        fs.existsSync(path.resolve(path.dirname(absolutePath), withoutAnchor)),
        `${filename}: unresolved link ${target}`,
      );
    }
  }
});

test('legacy experience documents are thin canonical pointers', () => {
  const pointerFiles = [
    'docs/simulatte/proposed-experiences/README.md',
    'docs/simulatte/proposed-experiences/asteroid-defense.md',
    'docs/simulatte/proposed-experiences/exoplanet-survey.md',
    'docs/simulatte/proposed-experiences/grid-resilience.md',
    'docs/simulatte/proposed-experiences/subsea-network.md',
    'docs/simulatte/interstellar-relay-network-handoff.md',
    'public/shared/plugins/cable-trader/HANDOFF.md',
    'public/shared/plugins/sun-walker/HANDOFF.md',
    'public/shared/plugins/maritime-trade-global/handoff.md',
    'public/shared/plugins/interstellar-relay-network/README.md',
    'public/shared/plugins/interstellar-relay-network/handoff.md',
  ];
  for (const filename of pointerFiles) {
    const markdown = read(filename);
    assert.ok(markdown.split(/\s+/).length <= 55, `${filename}: pointer accumulated duplicate documentation`);
    assert.match(markdown, /experiences\//, `${filename}: canonical experience link missing`);
  }
});
