#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIR, '../..');
const PUBLIC_DATA_DIR = path.join(ROOT, 'public/data');
const DATA_DIR = path.join(ROOT, 'public/data/autonomy');
const MANIFEST_PATH = path.join(DATA_DIR, 'autonomy-manifest.json');
const REFERENCE_KEYS = Object.freeze([
  'world', 'featureCatalog', 'policy', 'occurrenceCatalog', 'rerankerEvidence', 'regionRegistry',
  'placeEmbeddingIndex', 'placeResolutionEvidence', 'modelRuntimeLock', 'accessibilityIndex', 'routeAmenityIndex',
  'safetyHistoryIndex', 'curriculum', 'worldSnapshotRegistry',
  'policyArenaEvidence',
  'cooperativeScenario',
]);

function main() {
  const manifest = readJson(MANIFEST_PATH);
  REFERENCE_KEYS.forEach((key) => syncReference(manifest, key));
  manifest.embodiments.forEach((reference) => syncReferenceValue(reference, `embodiment:${reference.id}`));
  const registry = readJson(resolvePath(manifest.regionRegistry.path));
  if (registry.composition.worldSha256 !== manifest.world.sha256) {
    throw new Error(`Region registry world SHA-256 ${registry.composition.worldSha256} does not match manifest ${manifest.world.sha256}`);
  }
  if (registry.composition.featureCatalogSha256 !== manifest.featureCatalog.sha256) {
    throw new Error(`Region registry feature SHA-256 ${registry.composition.featureCatalogSha256} does not match manifest ${manifest.featureCatalog.sha256}`);
  }
  fs.writeFileSync(MANIFEST_PATH, artifactText(manifest));
  console.log(`AUTONOMY-MANIFEST id=${manifest.id} refs=${REFERENCE_KEYS.length + manifest.embodiments.length} registry=${registry.id} status=synchronized`);
}

function syncReference(manifest, key) {
  const reference = manifest[key];
  syncReferenceValue(reference, key);
}

function syncReferenceValue(reference, key) {
  if (!reference || !reference.path) throw new Error(`Manifest ${key} reference expected path`);
  const file = resolvePath(reference.path);
  if (!fs.existsSync(file)) throw new Error(`Manifest ${key} file missing at ${file}`);
  const value = readJson(file);
  if (value.id !== reference.id) throw new Error(`Manifest ${key} ID expected ${reference.id}, received ${value.id || 'missing'}`);
  reference.sha256 = sha256(fs.readFileSync(file));
}

function resolvePath(relative) {
  const file = path.resolve(DATA_DIR, relative);
  const withinData = path.relative(PUBLIC_DATA_DIR, file);
  if (withinData.startsWith('..') || path.isAbsolute(withinData)) throw new Error(`Manifest path leaves autonomy data: ${relative}`);
  return file;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function artifactText(value) {
  return `${JSON.stringify(sortValue(value), null, 2)}\n`;
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}

try {
  main();
} catch (error) {
  console.error(error && error.stack || error);
  process.exit(1);
}
