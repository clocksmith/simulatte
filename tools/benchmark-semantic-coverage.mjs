import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  INDEX_DEFINITIONS,
  REQUIRED_INDEX_NAMES,
  ROOT,
  lexicalUniverseMatches,
  loadPrimitiveIds,
  loadUniversePackage,
} from './simulatte-universe-utils.mjs';

const GOLD_SET_PATH = path.join(ROOT, 'tools/samer/simulatte-public-gold-v1.json');
const PRIMITIVE_INDEX_PATH = path.join(ROOT, 'public/data/simulatte-embedder/primitive-index-v2.json');
const SURFACE_INDEX_PATH = path.join(ROOT, 'public/data/simulatte-embedder/surface-card-index-qwen-v1.json');
const VISUAL_INDEX_PATH = path.join(ROOT, 'public/data/simulatte-visual-cards/visual-card-index-v1.json');
const MODEL_LOCK_PATH = path.join(ROOT, 'public/data/simulatte-embedder/model-runtime-lock.json');
const require = createRequire(import.meta.url);

async function main() {
  const universe = await loadUniversePackage();
  const requestedPrompts = process.argv.slice(2).filter(Boolean);
  const goldSet = requestedPrompts.length ? null : await readJson(GOLD_SET_PATH);
  const promptRows = requestedPrompts.length
    ? requestedPrompts.map((prompt) => ({ prompt }))
    : goldSet.rows;
  const rows = promptRows.map((row) => coverageForPrompt(universe.indexes, row.prompt, row));
  const indexBill = await semanticIndexBill(universe);
  const report = {
    schema: 'simulatte.semanticCoverageBenchmark.v2',
    manifestId: universe.manifest.id,
    promptSource: goldSet
      ? { kind: 'public-gold-set', id: goldSet.id, path: relativePath(GOLD_SET_PATH) }
      : { kind: 'command-line', id: '', path: '' },
    promptCount: rows.length,
    meanCoverage: mean(rows.map((row) => row.coverage)),
    meanGoldObligationCoverage: mean(rows.map((row) => row.goldObligationCoverage).filter(Number.isFinite)),
    exactPromptMatchCount: rows.reduce((sum, row) => sum + row.exactPromptMatches.length, 0),
    rows,
    indexBill,
    weakIndexes: REQUIRED_INDEX_NAMES.filter((name) => !indexBill.universe[name]?.documents),
  };
  console.log(JSON.stringify(report, null, 2));
  const strictThreshold = Number(process.env.SIMULATTE_COVERAGE_MIN || 0);
  const measuredCoverage = goldSet ? report.meanGoldObligationCoverage : report.meanCoverage;
  if (strictThreshold > 0 && measuredCoverage < strictThreshold) process.exitCode = 1;
}

function coverageForPrompt(indexes, prompt, goldRow = null) {
  const matches = lexicalUniverseMatches(indexes, prompt, { maxPerIndex: 8 });
  const normalizedPrompt = normalizeText(prompt);
  const exactPromptMatches = matches.candidates.filter(
    (match) => normalizeText(match.label) === normalizedPrompt
  );
  const topMatches = matches.candidates.filter(
    (match) => normalizeText(match.label) !== normalizedPrompt
  ).slice(0, 16);
  const promptTokens = meaningfulTokens(prompt);
  const candidateTokens = new Set(topMatches.flatMap((match) => meaningfulTokens(match.label)));
  const coveredTokens = promptTokens.filter((token) => candidateTokens.has(token));
  const obligations = goldRow ? goldObligations(indexes, goldRow) : [];
  const localObligations = goldRow ? localGoldObligations(goldRow) : [];
  return {
    id: goldRow && goldRow.id || '',
    prompt,
    coverage: round(coveredTokens.length / Math.max(1, promptTokens.length)),
    goldObligationCoverage: obligations.length
      ? round(obligations.filter((row) => row.matched).length / obligations.length)
      : null,
    matchedIndexes: Object.entries(matches.byIndex)
      .filter(([, indexRows]) => indexRows.length)
      .map(([name]) => name)
      .sort(),
    topMatches,
    coveredTokens,
    missingTokens: promptTokens.filter((token) => !candidateTokens.has(token)),
    exactPromptMatches,
    obligations,
    localObligations,
  };
}

function goldObligations(indexes, row) {
  const obligations = [
    ...(row.entities || []).map((entity) => obligation('entity', entity.type, [
      'concepts', 'shapes', 'affordances', 'scenes', 'synonyms', 'analogs',
    ])),
    ...(row.relations || []).map((relation) => obligation('relation', relation.kind, [
      'relations', 'synonyms',
    ])),
    ...(row.poses || []).filter((pose) => pose.pose !== 'static').map((pose) => obligation('pose', pose.pose, [
      'processes', 'affordances', 'relations', 'synonyms',
    ])),
    ...(row.properties || []).filter((property) => property.kind !== 'color').map((property) => (
      obligation('property', property.value, ['materials', 'concepts', 'synonyms'])
    )),
  ];
  return obligations.map((entry) => {
    const matches = lexicalUniverseMatches(indexes, entry.query, { maxPerIndex: 6 });
    const candidate = matches.candidates.find((match) => (
      entry.expectedIndexes.includes(match.indexName) && Number(match.score) >= 0.75
    ));
    return { ...entry, matched: Boolean(candidate), match: candidate || null };
  });
}

function localGoldObligations(row) {
  return [
    ...(row.entities || []).filter((entity) => entity.count != null || entity.minimumCount != null).map((entity) => ({
      kind: 'cardinality',
      query: entity.type,
      value: entity.count ?? entity.minimumCount,
      owner: 'phase-2-language',
    })),
    ...(row.poses || []).filter((pose) => pose.pose === 'static').map((pose) => ({
      kind: 'pose', query: pose.pose, value: pose.type, owner: 'phase-2-language',
    })),
    ...(row.properties || []).filter((property) => property.kind === 'color').map((property) => ({
      kind: 'color', query: property.type, value: property.value, owner: 'phase-2-language',
    })),
  ];
}

function obligation(kind, query, expectedIndexes) {
  return { kind, query: String(query || ''), expectedIndexes };
}

async function semanticIndexBill(universe) {
  const universeBill = {};
  for (const definition of INDEX_DEFINITIONS) {
    const filePath = path.join(ROOT, 'public/data/simulatte-universe', definition.artifact.replace(/^\.\//, ''));
    universeBill[definition.name] = {
      documents: universe.indexes[definition.name]?.documents?.length || 0,
      vectorDimensions: null,
      bytes: (await fs.stat(filePath)).size,
      artifact: relativePath(filePath),
    };
  }
  const [primitive, surface, visual, lock] = await Promise.all([
    readJson(PRIMITIVE_INDEX_PATH),
    readJson(SURFACE_INDEX_PATH),
    readJson(VISUAL_INDEX_PATH),
    readJson(MODEL_LOCK_PATH),
  ]);
  const primitiveCount = loadPrimitiveIds().size;
  const surfaceCardCount = sourceSurfaceCardCount();
  return {
    universe: universeBill,
    vectors: {
      primitives: await vectorBill(PRIMITIVE_INDEX_PATH, primitive, primitiveCount),
      surfaceCards: await vectorBill(SURFACE_INDEX_PATH, surface, surfaceCardCount),
    },
    visualCards: {
      documents: Number(visual.documentCount || visual.documents?.length || 0),
      bytes: (await fs.stat(VISUAL_INDEX_PATH)).size,
      artifact: relativePath(VISUAL_INDEX_PATH),
    },
    embeddingModel: {
      id: lock.embedding.id,
      sourceCheckpointId: lock.embedding.source.sourceCheckpointId,
      dimensions: lock.embedding.dimensions,
      suitability: 'dedicated-embedding-model',
    },
    englishCoverage: {
      value: null,
      status: 'not-measured',
      reason: 'No canonical denominator for open-domain English is defined.',
    },
  };
}

function sourceSurfaceCardCount() {
  const graphSynthesis = require('../public/blank/pipeline/phase-04-grounded-intent/simulatte-graph-synthesis.js');
  const semanticRag = require('../public/blank/pipeline/phase-03-retrieval/simulatte-semantic-rag.js');
  const ids = new Set(graphSynthesis.createSurfaceCardDocuments().map((row) => row.cardId));
  for (const row of semanticRag.SEMANTIC_SURFACE_CARDS || []) ids.add(row.id);
  return ids.size;
}

async function vectorBill(filePath, index, ownedDocumentCount) {
  const documents = Number(index.documentCount || index.documents?.length || 0);
  return {
    documents,
    vectorDimensions: Number(index.embeddingDim || index.dimensions || 0),
    bytes: (await fs.stat(filePath)).size,
    artifact: relativePath(filePath),
    ownerCoverage: round(documents / Math.max(1, Number(ownedDocumentCount || 0))),
  };
}

function meaningfulTokens(value) {
  return [...new Set(normalizeText(value).split(' ').filter((token) => token.length > 2).map(stemToken))];
}

function stemToken(token) {
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith('ing') && token.length > 5) return token.slice(0, -3).replace(/(.)\1$/, '$1');
  if (token.endsWith('s') && !token.endsWith('ss') && token.length > 3) return token.slice(0, -1);
  return token;
}

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function relativePath(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function mean(values) {
  return values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

function round(value) {
  return Number(Number(value || 0).toFixed(4));
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
