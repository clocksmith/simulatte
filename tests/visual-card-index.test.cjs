const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const visualCardDir = path.join(root, 'public', 'models', 'simulatte-visual-cards');
const manifestPath = path.join(visualCardDir, 'manifest.json');
const indexPath = path.join(visualCardDir, 'visual-card-index-v1.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runTool(script) {
  return childProcess.execFileSync(process.execPath, [path.join(root, 'tools', script)], {
    cwd: root,
    encoding: 'utf8',
  });
}

function unique(rows, selector) {
  return new Set(rows.map(selector).filter(Boolean));
}

function hasProbe(documents, terms) {
  return documents.some((card) => {
    const text = String(card.candidateText || '').toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

function coverageRowsFromBuilder(name) {
  const builder = fs.readFileSync(path.join(root, 'tools', 'build-visual-card-index.mjs'), 'utf8');
  const startMarker = `const ${name} = String.raw\``;
  const start = builder.indexOf(startMarker);
  assert.notEqual(start, -1, `missing ${name}`);
  const bodyStart = start + startMarker.length;
  const bodyEnd = builder.indexOf('`;', bodyStart);
  assert.notEqual(bodyEnd, -1, `missing ${name} terminator`);
  return builder.slice(bodyStart, bodyEnd).trim().split(/\n+/).filter(Boolean).map((line) => {
    const parts = line.split('|');
    assert.equal(parts.length, 6, `${name} row must have 6 fields: ${line}`);
    return { cardId: parts[0], line };
  });
}

test('visual card package exposes source-authored universe-representative cards', () => {
  const manifest = readJson(manifestPath);
  const index = readJson(indexPath);

  assert.equal(manifest.schema, 'simulatte.visualCardManifest.v1');
  assert.equal(manifest.indexes.visualCards.artifact, './visual-card-index-v1.json');
  assert.equal(manifest.indexes.visualCards.documentCount, 812);
  assert.ok(manifest.coverage.scenes >= 760);
  assert.ok(manifest.coverage.materials >= 760);
  assert.ok(manifest.coverage.processes >= 480);
  assert.ok(manifest.coverage.compositions >= 100);
  assert.ok(manifest.coverage.objects >= 520);
  assert.ok(manifest.coverage.variants >= 40);
  assert.equal(manifest.coverage.palettes, 16);
  assert.equal(manifest.coverage.proceduralRecipeSignatures, 812);
  assert.equal(manifest.coverage.sourceExamples, 812);
  assert.equal(manifest.coverage.generatedScaffoldCards, 0);

  assert.equal(index.schema, 'simulatte.visualCardIndex.v1');
  assert.equal(index.id, 'simulatte-visual-card-index-v1');
  assert.equal(index.documentCount, 812);
  assert.equal(index.documents.length, 812);
  assert.deepEqual(index.counts.byType, {
    scene: 204,
    material: 200,
    process: 193,
    composition: 215,
  });
  assert.deepEqual(index.counts.bySourceGroup, {
    'diagnostic-anchor': 7,
    'curated-anchor': 20,
    'user-coverage-list-100': 100,
    'user-coverage-list-101-200': 100,
    'extreme-boundary-list-64': 64,
    'handwritten-universe-300': 300,
    'handwritten-universe-501-721': 221,
  });
  assert.equal(index.curatedSourceIds.length, 812);
  assert.equal(new Set(index.curatedSourceIds).size, 812);
  assert.ok(index.documents.every((card) => card.sourceExampleId));
});

test('visual card validator accepts the generated package', () => {
  const report = JSON.parse(runTool('validate-visual-card-index.mjs'));

  assert.equal(report.schema, 'simulatte.visualCardValidation.v1');
  assert.equal(report.ok, true, report.errors.join('\n'));
  assert.equal(report.documentCount, 812);
  assert.deepEqual(report.sourceGroups, {
    'diagnostic-anchor': 7,
    'curated-anchor': 20,
    'user-coverage-list-100': 100,
    'user-coverage-list-101-200': 100,
    'extreme-boundary-list-64': 64,
    'handwritten-universe-300': 300,
    'handwritten-universe-501-721': 221,
  });
  assert.equal(report.unique.cardIds, 812);
  assert.equal(report.unique.recipeSignatures, 812);
  assert.ok(report.unique.visualGrammars >= 16);
  assert.ok(report.unique.textureBases >= 16);
  assert.ok(report.unique.lightingModels >= 16);
  assert.ok(report.unique.motionCues >= 16);
});

test('all literal user extreme and handwritten coverage rows enter the generated index', () => {
  const index = readJson(indexPath);
  const cardIds = new Set(index.documents.map((card) => card.cardId));
  const sourceIds = new Set(index.curatedSourceIds);
  const userRows = coverageRowsFromBuilder('USER_COVERAGE_LINES');
  const userRows101200 = coverageRowsFromBuilder('USER_COVERAGE_LINES_101_200');
  const extremeRows = coverageRowsFromBuilder('EXTREME_BOUNDARY_LINES');
  const handwrittenRows = coverageRowsFromBuilder('HANDWRITTEN_UNIVERSE_LINES');
  const handwrittenRows501721 = coverageRowsFromBuilder('HANDWRITTEN_UNIVERSE_LINES_501_721');

  assert.equal(userRows.length, 100);
  assert.equal(userRows101200.length, 100);
  assert.equal(extremeRows.length, 64);
  assert.equal(handwrittenRows.length, 300);
  assert.equal(handwrittenRows501721.length, 221);

  for (const row of [...userRows, ...userRows101200, ...extremeRows, ...handwrittenRows, ...handwrittenRows501721]) {
    assert.ok(cardIds.has(row.cardId), `${row.cardId} should be indexed`);
    assert.ok(sourceIds.has(row.cardId), `${row.cardId} should be a source example`);
  }
});

test('visual cards preserve distinct render recipes and hard semantic probes', () => {
  const index = readJson(indexPath);
  const cards = index.documents;
  const cardIds = unique(cards, (card) => card.cardId);
  const recipeSignatures = unique(cards, (card) => card.renderHints.proceduralRecipe.signature);

  assert.equal(cardIds.size, cards.length);
  assert.equal(recipeSignatures.size, cards.length);
  assert.ok(cards.every((card) => card.renderHints.proceduralRecipe.schema === 'simulatte.visualRecipe.v1'));
  assert.ok(cards.every((card) => card.renderHints.layers.length >= 5));
  assert.ok(cards.every((card) => card.retrieval.tokens.length >= 24));
  assert.ok(cards.every((card) => String(card.candidateText).split(/\s+/).length >= 40));

  for (const terms of [
    ['battery', 'leak', 'electrolyte'],
    ['building', 'fire', 'smoke'],
    ['algae', 'pond', 'green'],
    ['acoustic', 'tube', 'resonate'],
    ['moss', 'turbine', 'grow'],
    ['mirror', 'orbit', 'reflect'],
    ['robot', 'warehouse', 'control'],
    ['subway', 'mercury', 'signal', 'tunnel'],
    ['coral', 'reef', 'aerogel', 'diffusion'],
    ['black', 'hole', 'glass', 'refract'],
    ['hospital', 'blood', 'pump', 'feedback'],
    ['textile', 'carbon', 'fiber', 'weave'],
    ['ice', 'shelf', 'neon', 'discharge'],
    ['beehive', 'wax', 'swarm'],
    ['optical', 'lens', 'focus', 'onto'],
    ['data', 'center', 'snow', 'cool'],
    ['volcano', 'graphite', 'foam', 'absorb'],
    ['market', 'paper', 'queue'],
    ['brass', 'tube', 'dust', 'levitate'],
    ['soil', 'microbiome', 'mycelium'],
    ['rocket', 'molten', 'salt', 'heat'],
    ['traffic', 'silicon', 'reroute'],
    ['crystal', 'cavern', 'quartz', 'crystallize'],
    ['ant', 'colony', 'acid', 'erode'],
    ['orbital', 'mirror', 'reflect'],
    ['kiln', 'porcelain', 'sinter'],
    ['wave', 'tank', 'oil', 'separate'],
  ]) {
    assert.ok(hasProbe(cards, terms), `missing visual card probe ${terms.join(' ')}`);
  }

  for (const cardId of [
    'visual.scene.warehouse.soot-concrete.burn.burning-in.building.damaged-failure-state',
    'visual.material.wind-farm.moss.grow.growing-on.turbine.macro-inspection',
    'visual.scene.warehouse.steel.control.controlled-by.robot.system-diagram',
    'visual.scene.subway-station.mercury.signal.through.dynamic-motion-trace',
    'visual.material.coral-reef.aerogel.diffuse.inside.macro-inspection',
    'visual.process.black-hole-lens.glass.refract.around.wide-establishing-view',
    'visual.composition.hospital-ward.blood.pump.controlled-by.system-diagram',
    'visual.scene.textile-loom.carbon-fiber.weave.across.cutaway-section',
    'visual.material.ice-shelf.neon-gas.discharge.under.wide-establishing-view',
    'visual.process.beehive.wax.swarm.around.topographic-map',
    'visual.composition.optical-bench.lens-glass.focus.onto.instrumented-lab-view',
    'visual.scene.data-center.snow.cool.through.system-diagram',
    'visual.material.volcano.graphite-foam.absorb.over.macro-inspection',
    'visual.process.market-floor.paper.queue.at.dynamic-motion-trace',
    'visual.composition.brass-tube-resonator.dust.levitate.inside.cutaway-section',
    'visual.scene.soil-microbiome.mycelium.grow.through.macro-inspection',
    'visual.material.rocket-pad.molten-salt.heat.released-from.wide-establishing-view',
    'visual.process.traffic-control-room.silicon.reroute.between.system-diagram',
    'visual.composition.crystal-cavern.quartz.crystallize.from.macro-inspection',
    'visual.scene.ant-colony.acid.erode.along.cutaway-section',
    'visual.material.orbital-station.mirror.reflect.between.wide-establishing-view',
    'visual.process.kiln-room.porcelain.sinter.inside.instrumented-lab-view',
    'visual.composition.wave-tank.oil.separate.into.topographic-map',
  ]) {
    assert.ok(cardIds.has(cardId), `${cardId} should be indexed`);
  }

  for (const cardId of [
    'visual.scene.subway-station.mercury.signal.through.dynamic-motion-trace',
    'visual.process.beehive.wax.swarm.around.topographic-map',
    'visual.composition.wave-tank.oil.separate.into.topographic-map',
  ]) {
    const card = cards.find((candidate) => candidate.cardId === cardId);
    assert.equal(card.sourceExampleId, cardId);
    assert.ok(card.visualDescription.length > 20);
  }
});

test('visual card builders are registered as package commands', () => {
  const packageJson = readJson(path.join(root, 'package.json'));

  assert.equal(packageJson.scripts['build:visual-cards'], 'node tools/build-visual-card-index.mjs');
  assert.equal(packageJson.scripts['validate:visual-cards'], 'node tools/validate-visual-card-index.mjs');
  assert.ok(fs.existsSync(path.join(root, 'tools', 'build-visual-card-index.mjs')));
  assert.ok(fs.existsSync(path.join(root, 'tools', 'validate-visual-card-index.mjs')));
});
