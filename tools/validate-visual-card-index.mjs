import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const VISUAL_CARD_DIR = path.join(ROOT, 'public/models/simulatte-visual-cards');
const MANIFEST_PATH = path.join(VISUAL_CARD_DIR, 'manifest.json');
const INDEX_PATH = path.join(VISUAL_CARD_DIR, 'visual-card-index-v1.json');

const EXPECTED_COUNT = 812;
const EXPECTED_TYPE_COUNTS = {
  scene: 204,
  material: 200,
  process: 193,
  composition: 215,
};

const EXPECTED_MIN_COVERAGE = {
  scenes: 760,
  materials: 760,
  processes: 480,
  compositions: 100,
  objects: 520,
  variants: 40,
  palettes: 16,
  sourceExamples: 812,
};

const EXPECTED_SOURCE_GROUPS = {
  'diagnostic-anchor': 7,
  'curated-anchor': 20,
  'user-coverage-list-100': 100,
  'user-coverage-list-101-200': 100,
  'extreme-boundary-list-64': 64,
  'handwritten-universe-300': 300,
  'handwritten-universe-501-721': 221,
};

const REQUIRED_PROBES = [
  ['battery leak electrolyte', ['battery', 'leak', 'electrolyte']],
  ['building fire smoke', ['building', 'fire', 'smoke']],
  ['algae pond green', ['algae', 'pond', 'green']],
  ['acoustic tube resonate', ['acoustic', 'tube', 'resonate']],
  ['moss turbine grow', ['moss', 'turbine', 'grow']],
  ['mirror orbit reflect', ['mirror', 'orbit', 'reflect']],
  ['robot warehouse control', ['robot', 'warehouse', 'control']],
  ['subway mercury signal tunnel', ['subway', 'mercury', 'signal', 'tunnel']],
  ['coral reef aerogel diffusion', ['coral', 'reef', 'aerogel', 'diffusion']],
  ['black hole glass refract', ['black', 'hole', 'glass', 'refract']],
  ['hospital blood pump feedback', ['hospital', 'blood', 'pump', 'feedback']],
  ['textile carbon fiber weave', ['textile', 'carbon', 'fiber', 'weave']],
  ['ice shelf neon discharge', ['ice', 'shelf', 'neon', 'discharge']],
  ['beehive wax swarm', ['beehive', 'wax', 'swarm']],
  ['optical lens focus onto', ['optical', 'lens', 'focus', 'onto']],
  ['data center snow cool', ['data', 'center', 'snow', 'cool']],
  ['volcano graphite foam absorb', ['volcano', 'graphite', 'foam', 'absorb']],
  ['market paper queue', ['market', 'paper', 'queue']],
  ['brass tube dust levitate', ['brass', 'tube', 'dust', 'levitate']],
  ['soil microbiome mycelium', ['soil', 'microbiome', 'mycelium']],
  ['rocket molten salt heat', ['rocket', 'molten', 'salt', 'heat']],
  ['traffic silicon reroute', ['traffic', 'silicon', 'reroute']],
  ['crystal cavern quartz crystallize', ['crystal', 'cavern', 'quartz', 'crystallize']],
  ['ant colony acid erode', ['ant', 'colony', 'acid', 'erode']],
  ['orbital mirror reflect', ['orbital', 'mirror', 'reflect']],
  ['kiln porcelain sinter', ['kiln', 'porcelain', 'sinter']],
  ['wave tank oil separate', ['wave', 'tank', 'oil', 'separate']],
];

const CURATED_EXAMPLE_IDS = [
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
];

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function addError(errors, condition, message) {
  if (!condition) errors.push(message);
}

function countBy(rows, selector) {
  return rows.reduce((counts, row) => {
    const key = selector(row);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function uniqueCount(rows, selector) {
  return new Set(rows.map(selector).filter(Boolean)).size;
}

function hasProbe(documents, terms) {
  return documents.some((card) => {
    const text = String(card.candidateText || '').toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

function validateVisualCardPackage(manifest, index) {
  const errors = [];
  const warnings = [];
  const documents = Array.isArray(index.documents) ? index.documents : [];

  addError(errors, manifest.schema === 'simulatte.visualCardManifest.v1', 'Manifest schema is incorrect');
  addError(errors, manifest.id === 'simulatte-visual-cards-v1', 'Manifest id is incorrect');
  addError(errors, index.schema === 'simulatte.visualCardIndex.v1', 'Index schema is incorrect');
  addError(errors, index.id === 'simulatte-visual-card-index-v1', 'Index id is incorrect');
  addError(errors, index.documentCount === EXPECTED_COUNT, `Index documentCount must be ${EXPECTED_COUNT}`);
  addError(errors, documents.length === EXPECTED_COUNT, `Index documents array must contain ${EXPECTED_COUNT} source cards`);
  addError(
    errors,
    manifest.indexes
      && manifest.indexes.visualCards
      && manifest.indexes.visualCards.artifact === './visual-card-index-v1.json',
    'Manifest visualCards artifact is incorrect'
  );

  for (const [key, value] of Object.entries(EXPECTED_MIN_COVERAGE)) {
    addError(errors, manifest.coverage && manifest.coverage[key] >= value, `Coverage ${key} must be at least ${value}`);
  }
  addError(
    errors,
    manifest.coverage && manifest.coverage.proceduralRecipeSignatures === EXPECTED_COUNT,
    `Coverage proceduralRecipeSignatures must be ${EXPECTED_COUNT}`
  );
  addError(
    errors,
    manifest.coverage && manifest.coverage.generatedScaffoldCards === 0,
    'Coverage generatedScaffoldCards must be 0'
  );

  const typeCounts = countBy(documents, (card) => card.type);
  const sourceGroups = index.counts && index.counts.bySourceGroup || {};
  for (const [key, value] of Object.entries(EXPECTED_TYPE_COUNTS)) {
    addError(errors, typeCounts[key] === value, `Type ${key} must contain ${value} cards`);
  }
  for (const [key, value] of Object.entries(EXPECTED_SOURCE_GROUPS)) {
    addError(errors, sourceGroups[key] === value, `Source group ${key} must contain ${value} cards`);
  }
  addError(errors, Array.isArray(index.curatedSourceIds), 'Index must expose curatedSourceIds');
  addError(errors, index.curatedSourceIds && index.curatedSourceIds.length === EXPECTED_COUNT, `Index must expose ${EXPECTED_COUNT} curated source ids`);
  addError(
    errors,
    index.curatedSourceIds && new Set(index.curatedSourceIds).size === index.curatedSourceIds.length,
    'Curated source ids must be unique'
  );

  const unique = {
    cardIds: uniqueCount(documents, (card) => card.cardId),
    domains: uniqueCount(documents, (card) => card.facets && card.facets.domain),
    materialFamilies: uniqueCount(documents, (card) => card.facets && card.facets.materialFamily),
    processFamilies: uniqueCount(documents, (card) => card.facets && card.facets.processFamily),
    compositionFamilies: uniqueCount(documents, (card) => card.facets && card.facets.compositionFamily),
    geometries: uniqueCount(documents, (card) => card.renderHints && card.renderHints.geometry),
    materialShaders: uniqueCount(documents, (card) => card.renderHints && card.renderHints.materialShader),
    processOverlays: uniqueCount(documents, (card) => card.renderHints && card.renderHints.processOverlay),
    compositionLayouts: uniqueCount(documents, (card) => card.renderHints && card.renderHints.compositionLayout),
    recipeSignatures: uniqueCount(
      documents,
      (card) => card.renderHints
        && card.renderHints.proceduralRecipe
        && card.renderHints.proceduralRecipe.signature
    ),
    visualGrammars: uniqueCount(
      documents,
      (card) => card.renderHints
        && card.renderHints.proceduralRecipe
        && card.renderHints.proceduralRecipe.visualGrammar
    ),
    textureBases: uniqueCount(
      documents,
      (card) => card.renderHints
        && card.renderHints.proceduralRecipe
        && card.renderHints.proceduralRecipe.textureBasis
    ),
    lightingModels: uniqueCount(
      documents,
      (card) => card.renderHints
        && card.renderHints.proceduralRecipe
        && card.renderHints.proceduralRecipe.lightingModel
    ),
    motionCues: uniqueCount(
      documents,
      (card) => card.renderHints
        && card.renderHints.proceduralRecipe
        && card.renderHints.proceduralRecipe.motionCue
    ),
  };

  addError(errors, unique.cardIds === EXPECTED_COUNT, `Card ids must be unique across all ${EXPECTED_COUNT} cards`);
  addError(errors, documents.every((card) => Boolean(card.sourceExampleId)), 'Every card must be backed by a literal source example');
  addError(
    errors,
    Object.values(sourceGroups).reduce((sum, value) => sum + value, 0) === EXPECTED_COUNT,
    'Source group counts must account for every exported card'
  );
  addError(errors, unique.recipeSignatures === EXPECTED_COUNT, 'Recipe signatures must be unique');
  addError(errors, unique.visualGrammars >= 16, 'Visual grammar coverage is too narrow');
  addError(errors, unique.textureBases >= 16, 'Texture basis coverage is too narrow');
  addError(errors, unique.lightingModels >= 16, 'Lighting model coverage is too narrow');
  addError(errors, unique.motionCues >= 16, 'Motion cue coverage is too narrow');

  for (const card of documents) {
    addError(errors, card.schema === 'simulatte.visualCard.v1', `Card ${card.cardId || '<missing>'} schema is incorrect`);
    addError(errors, Boolean(card.sourceExampleId), `Card ${card.cardId || '<missing>'} is not source backed`);
    addError(errors, Boolean(card.facets), `Card ${card.cardId || '<missing>'} is missing facets`);
    addError(errors, Boolean(card.renderHints), `Card ${card.cardId || '<missing>'} is missing render hints`);
    addError(errors, Boolean(card.retrieval), `Card ${card.cardId || '<missing>'} is missing retrieval data`);
    addError(
      errors,
      Array.isArray(card.renderHints && card.renderHints.layers) && card.renderHints.layers.length >= 5,
      `Card ${card.cardId || '<missing>'} has a weak render layer stack`
    );
    addError(
      errors,
      String(card.candidateText || '').split(/\s+/).filter(Boolean).length >= 40,
      `Card ${card.cardId || '<missing>'} has weak candidate text`
    );
  }

  for (const [label, terms] of REQUIRED_PROBES) {
    addError(errors, hasProbe(documents, terms), `Missing visual coverage probe: ${label}`);
  }

  const cardIds = new Set(documents.map((card) => card.cardId));
  const sourceExampleIds = new Set(documents.map((card) => card.sourceExampleId).filter(Boolean));
  for (const id of CURATED_EXAMPLE_IDS) {
    addError(errors, cardIds.has(id), `Missing curated visual card id ${id}`);
    addError(errors, sourceExampleIds.has(id), `Missing curated source example id ${id}`);
  }

  return {
    schema: 'simulatte.visualCardValidation.v1',
    ok: errors.length === 0,
    documentCount: documents.length,
    typeCounts,
    sourceGroups,
    unique,
    errors,
    warnings,
  };
}

async function main() {
  const [manifest, index] = await Promise.all([
    readJson(MANIFEST_PATH),
    readJson(INDEX_PATH),
  ]);
  const report = validateVisualCardPackage(manifest, index);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
