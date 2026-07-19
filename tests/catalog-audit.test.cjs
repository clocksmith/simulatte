const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const parser = require('../public/blank/pipeline/phase-02-language/simulatte-universe-parser.js');
const lexicon = require('../public/data/simulatte-language-lexicon.js');
const physicsIRSupport = require('../public/blank/pipeline/phase-05-simulation/simulatte-physics-ir-domains.js');
const createPhysicsIRBehaviors = require('../public/blank/pipeline/phase-05-simulation/simulatte-physics-ir-behaviors.js');

test('catalog inventory and language lexicon coverage are a test gate', () => {
  const output = execFileSync(process.execPath, ['tools/audit-catalog-inventory.mjs'], {
    cwd: root,
    encoding: 'utf8',
  });
  const report = JSON.parse(output);
  assert.equal(report.ok, true);
  assert.ok(report.lexiconCoverageChecks.every((row) => row.missingCount === 0));
});

test('catalog-only material and sampling concepts retain Phase 2 lexical ownership', () => {
  const parsed = parser.parsePrompt('materials lab measures an atomic sample through sampling');
  const spans = new Map(parsed.spans.map((row) => [row.text, row.kind]));
  assert.equal(spans.get('materials lab'), 'environment');
  assert.equal(spans.get('atomic sample'), 'entity');
  assert.equal(spans.get('sampling'), 'observable');
});

test('Phase 5 behavior selection consumes the data-owned language vocabulary', () => {
  const behaviorRows = lexicon.BEHAVIOR_PROCESS_LEXICON;
  const phrases = new Set(behaviorRows.flatMap((row) => row.phrases));
  const selector = createPhysicsIRBehaviors({
    ...physicsIRSupport,
    addField() {},
    addOperator() {},
    addCouplingOperator() {},
  }).behaviorProcessForText;

  for (const phrase of ['zoning', 'parcel', 'dispatch', 'calving', 'readout']) assert.ok(phrases.has(phrase));
  assert.equal(selector('zoning allocation across parcels'), 'network_flow');
  assert.equal(selector('railway dispatch'), 'network_flow');
  assert.equal(selector('glacier calving'), 'impact');
  assert.equal(selector('qubit phase readout'), 'measurement');
});
