#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();
const inventoryPath = path.join(root, 'public/data/simulatte-catalog-inventory.json');
const inventory = readJson(inventoryPath);
const languageLexicon = require(path.join(root, 'public/data/simulatte-language-lexicon.js'));
const failures = [];
const summary = {
  schema: 'simulatte.catalogInventoryAudit.v1',
  inventory: 'public/data/simulatte-catalog-inventory.json',
  staticCatalogs: [],
  runtimeCatalogs: [],
  manifestContracts: [],
  lexiconCoverageChecks: [],
  mirrorChecks: [],
};

for (const catalog of inventory.staticCatalogs || []) {
  const filePath = path.join(root, catalog.path);
  const json = readJson(filePath);
  const rows = Array.isArray(json[catalog.itemKey]) ? json[catalog.itemKey] : [];
  const actualCount = rows.length;
  const byteSize = fs.statSync(filePath).size;
  const avgWords = averageWords(rows);
  const ok = actualCount === catalog.expectedCount;
  if (!ok) failures.push(`${catalog.id}: expected ${catalog.expectedCount}, got ${actualCount}`);
  summary.staticCatalogs.push({
    id: catalog.id,
    path: catalog.path,
    expectedCount: catalog.expectedCount,
    actualCount,
    byteSize,
    avgWords,
    ok,
  });
}

for (const catalog of inventory.runtimeCatalogs || []) {
  const modulePath = path.join(root, catalog.path);
  const moduleExports = require(modulePath);
  const rows = Array.isArray(moduleExports[catalog.exportName]) ? moduleExports[catalog.exportName] : [];
  const actualCount = rows.length;
  const byteSize = fs.statSync(modulePath).size;
  const avgWords = averageWords(rows);
  const ok = actualCount === catalog.expectedCount;
  if (!ok) failures.push(`${catalog.id}: expected ${catalog.expectedCount}, got ${actualCount}`);
  summary.runtimeCatalogs.push({
    id: catalog.id,
    path: catalog.path,
    exportName: catalog.exportName,
    expectedCount: catalog.expectedCount,
    actualCount,
    byteSize,
    avgWords,
    ok,
  });
}

for (const contract of inventory.manifestContracts || []) {
  const json = readJson(path.join(root, contract.path));
  const actualValue = pointer(json, contract.jsonPointer);
  const ok = actualValue === contract.expectedValue;
  if (!ok) failures.push(`${contract.id}: expected ${contract.expectedValue}, got ${actualValue}`);
  summary.manifestContracts.push({
    id: contract.id,
    path: contract.path,
    jsonPointer: contract.jsonPointer,
    expectedValue: contract.expectedValue,
    actualValue,
    ok,
  });
}

checkCausalMirror();
checkVisualMirror();
checkLexiconCoverage();

summary.ok = failures.length === 0;
summary.failures = failures;
console.log(JSON.stringify(summary, null, 2));
if (failures.length) process.exit(1);

function checkCausalMirror() {
  const runtime = require(path.join(root, 'public/pipeline/phase-04-grounded-intent/simulatte-causal-physics-graph.js')).CAUSAL_RELATION_RULES || [];
  const staticRows = readJson(path.join(root, 'public/data/simulatte-universe/causal-relation-index-v1.json')).documents || [];
  const runtimeIds = new Set(runtime.map((row) => row.id));
  const staticIds = new Set(staticRows.map((row) => row.id));
  const missingStatic = [...runtimeIds].filter((id) => !staticIds.has(id));
  const missingRuntime = [...staticIds].filter((id) => !runtimeIds.has(id));
  const ok = missingStatic.length === 0 && missingRuntime.length === 0;
  if (!ok) failures.push(`causal mirror drift: missingStatic=${missingStatic.length}, missingRuntime=${missingRuntime.length}`);
  summary.mirrorChecks.push({
    id: 'runtime-causal-rules-to-static-causal-relations',
    runtimeCount: runtimeIds.size,
    staticCount: staticIds.size,
    missingStatic,
    missingRuntime,
    ok,
  });
}

function checkVisualMirror() {
  const runtime = require(path.join(root, 'public/pipeline/phase-04-grounded-intent/simulatte-causal-visual-affordances.js')).CAUSAL_VISUAL_AFFORDANCES || [];
  const staticRows = readJson(path.join(root, 'public/data/simulatte-visual-cards/causal-visual-affordance-index-v1.json')).documents || [];
  const runtimeRelations = new Set(runtime.map((row) => row.causalRelationId));
  const staticRelations = new Set(staticRows.map((row) => row.causalRelationId));
  const missingStatic = [...runtimeRelations].filter((id) => !staticRelations.has(id));
  const missingRuntime = [...staticRelations].filter((id) => !runtimeRelations.has(id));
  const ok = missingStatic.length === 0 && missingRuntime.length === 0;
  if (!ok) failures.push(`visual mirror drift: missingStatic=${missingStatic.length}, missingRuntime=${missingRuntime.length}`);
  summary.mirrorChecks.push({
    id: 'runtime-causal-visual-affordances-to-static-causal-visual-affordances',
    runtimeCount: runtimeRelations.size,
    staticCount: staticRelations.size,
    missingStatic,
    missingRuntime,
    ok,
  });
}

function checkLexiconCoverage() {
  const phrases = lexiconCoveragePhrases();
  const phrasePatterns = phrases.map((phrase) => phrasePattern(phrase));
  for (const catalog of inventory.staticCatalogs || []) {
    const filePath = path.join(root, catalog.path);
    const json = readJson(filePath);
    const rows = Array.isArray(json[catalog.itemKey]) ? json[catalog.itemKey] : [];
    const missing = [];
    for (const row of rows) {
      const text = normalizeCoverageText(collectCoverageText(row));
      if (!phrasePatterns.some((pattern) => pattern.test(text))) {
        missing.push(row.id || row.cardId || row.candidateId || row.primitiveId || '');
      }
    }
    const ok = missing.length === 0;
    if (!ok) failures.push(`${catalog.id}: ${missing.length} rows lack language lexicon coverage`);
    summary.lexiconCoverageChecks.push({
      id: `${catalog.id}-language-lexicon-coverage`,
      path: catalog.path,
      rowCount: rows.length,
      coveredCount: rows.length - missing.length,
      missingCount: missing.length,
      missingSample: missing.slice(0, 24),
      ok,
    });
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function pointer(value, jsonPointer) {
  return String(jsonPointer || '')
    .split('/')
    .slice(1)
    .reduce((node, key) => node && node[key], value);
}

function averageWords(rows) {
  if (!rows.length) return 0;
  const total = rows.reduce((sum, row) => sum + wordCount(row), 0);
  return Math.round((total / rows.length) * 10) / 10;
}

function wordCount(value) {
  const text = collectText(value);
  const words = text.toLowerCase().match(/[a-z0-9_.-]+/g);
  return words ? words.length : 0;
}

function collectText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return '';
  if (Array.isArray(value)) return value.map(collectText).join(' ');
  if (typeof value === 'object') return Object.values(value).map(collectText).join(' ');
  return '';
}

function lexiconCoveragePhrases() {
  const lexicon = languageLexicon.LANGUAGE_LEXICON || {};
  return [
    ...(lexicon.entityPhrases || languageLexicon.ENTITY_PHRASES || []).map((row) => Array.isArray(row) ? row[0] : row),
    ...(lexicon.processPhrases || languageLexicon.PROCESS_PHRASES || []),
    ...(lexicon.modifierPhrases || languageLexicon.MODIFIER_PHRASES || []).map((row) => Array.isArray(row) ? row[0] : row),
    ...(lexicon.observablePhrases || languageLexicon.OBSERVABLE_PHRASES || []),
    ...(lexicon.coveragePhrases || languageLexicon.COVERAGE_PHRASES || []),
  ].map(normalizeCoverageText).filter(Boolean);
}

function phrasePattern(phrase) {
  return new RegExp(`\\b${escapeRegExp(phrase)}\\b`);
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectCoverageText(value, key = '') {
  const ignoredKeys = new Set([
    'schema',
    'provenance',
    'sourceHash',
    'hash',
    'rowHash',
    'contentHash',
    'embedding',
    'vector',
    'values',
    'score',
    'scores',
    'rank',
    'createdAt',
    'updatedAt',
    'version',
    'sourceVersion',
  ]);
  if (value === null || value === undefined || ignoredKeys.has(key)) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return '';
  if (Array.isArray(value)) return value.map((row) => collectCoverageText(row, key)).join(' ');
  if (typeof value === 'object') {
    return Object.entries(value).map(([childKey, childValue]) => collectCoverageText(childValue, childKey)).join(' ');
  }
  return '';
}

function normalizeCoverageText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
