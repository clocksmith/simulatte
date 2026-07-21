#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIR, '../..');
const PUBLIC = path.join(ROOT, 'public');
const MANIFEST_PATH = path.join(PUBLIC, 'data/simulatte/autonomy-manifest.json');
const require = createRequire(import.meta.url);
const contracts = require('../../public/shared/contracts/contract-validator.js');
const regionApi = require('../../public/simulatte/world/region-pack-merger.js');
const pluginContracts = require('../../public/simulatte/platform/contracts/plugin-contracts.js');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function resolveReference(manifest, key) {
  const reference = manifest[key];
  return resolveReferenceValue(reference, key);
}

function resolveReferenceValue(reference, key) {
  const file = path.resolve(path.dirname(MANIFEST_PATH), reference.path);
  const relative = path.relative(PUBLIC, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Autonomy manifest ${key} path leaves public/: ${reference.path}`);
  }
  if (!fs.existsSync(file)) throw new Error(`Autonomy manifest ${key} path does not exist: ${reference.path}`);
  const hash = hashFile(file);
  if (hash !== reference.sha256) {
    throw new Error(`Autonomy manifest ${key} SHA-256 expected ${reference.sha256}, received ${hash}`);
  }
  const value = readJson(file);
  if (value.id !== reference.id) throw new Error(`Autonomy manifest ${key} ID expected ${reference.id}, received ${value.id || 'missing'}`);
  return value;
}

function resolvePackReference(registryFile, reference) {
  const file = path.resolve(path.dirname(registryFile), reference.path);
  const relative = path.relative(PUBLIC, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Region pack path leaves public/: ${reference.path}`);
  if (!fs.existsSync(file)) throw new Error(`Region pack path does not exist: ${reference.path}`);
  const hash = hashFile(file);
  if (hash !== reference.sha256) throw new Error(`Region pack ${reference.id} SHA-256 expected ${reference.sha256}, received ${hash}`);
  const value = readJson(file);
  if (value.id !== reference.id) throw new Error(`Region pack ID expected ${reference.id}, received ${value.id || 'missing'}`);
  return value;
}

function resolveGeometryReference(registryFile, reference) {
  const geometry = reference.geometry;
  if (!geometry || !geometry.path) throw new Error(`Region pack ${reference.id} missing geometry sidecar reference`);
  const file = path.resolve(path.dirname(registryFile), geometry.path);
  const relative = path.relative(PUBLIC, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Region geometry path leaves public/: ${geometry.path}`);
  if (!fs.existsSync(file)) throw new Error(`Region geometry path does not exist: ${geometry.path}`);
  const hash = hashFile(file);
  if (hash !== geometry.sha256) throw new Error(`Region geometry ${reference.id} SHA-256 expected ${geometry.sha256}, received ${hash}`);
  const value = readJson(file);
  if (value.id !== reference.id) throw new Error(`Region geometry ID expected ${reference.id}, received ${value.id || 'missing'}`);
  return value;
}

function publicAutonomyJavaScript() {
  const roots = ['simulatte', 'shared']
    .map((directory) => path.join(PUBLIC, directory));
  const files = [];
  const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(file);
  });
  roots.forEach(walk);
  return files.sort();
}

function validateHtmlScripts() {
  const htmlPath = path.join(PUBLIC, 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const scripts = Array.from(html.matchAll(/<script defer src="([^"]+)"><\/script>/g)).map((match) => match[1]);
  if (!scripts.length) throw new Error('Autonomy HTML expected deferred runtime scripts');
  scripts.forEach((source) => {
    const file = path.resolve(path.dirname(htmlPath), source.replace(/\?v=.*$/, ''));
    if (!fs.existsSync(file)) throw new Error(`Autonomy HTML script does not exist: ${source}`);
  });
  if (!html.includes('id="autonomy-canvas"')) throw new Error('Autonomy HTML expected autonomy-canvas');
}

function main() {
  const manifest = readJson(MANIFEST_PATH);
  contracts.validateManifest(manifest);
  const featureCatalog = resolveReference(manifest, 'featureCatalog');
  const world = resolveReference(manifest, 'world');
  const embodiments = manifest.embodiments.map((reference) => resolveReferenceValue(reference, `embodiment:${reference.id}`));
  const embodiment = embodiments.find((row) => row.id === manifest.defaultEmbodimentId);
  if (!embodiment) throw new Error(`Default embodiment ${manifest.defaultEmbodimentId} was not loaded`);
  const policy = resolveReference(manifest, 'policy');
  const occurrenceCatalog = resolveReference(manifest, 'occurrenceCatalog');
  const rerankerEvidence = resolveReference(manifest, 'rerankerEvidence');
  const modelRuntimeLock = resolveReference(manifest, 'modelRuntimeLock');
  const pipelineModelSelection = resolveReference(manifest, 'pipelineModelSelection');
  const applicationProfile = resolveReference(manifest, 'applicationProfile');
  const placeEmbeddingIndex = resolveReference(manifest, 'placeEmbeddingIndex');
  const placeResolutionEvidence = resolveReference(manifest, 'placeResolutionEvidence');
  const curriculum = resolveReference(manifest, 'curriculum');
  const policyArenaEvidence = resolveReference(manifest, 'policyArenaEvidence');
  const regionRegistry = resolveReference(manifest, 'regionRegistry');
  const registryFile = path.resolve(path.dirname(MANIFEST_PATH), manifest.regionRegistry.path);
  contracts.validateRegionRegistry(regionRegistry);
  const regionPacks = regionRegistry.packs.map((reference) => resolvePackReference(registryFile, reference));
  regionPacks.forEach((pack) => contracts.validateRegionPack(pack, regionRegistry));
  const geometryByPackId = Object.fromEntries(regionRegistry.packs.map((reference) => [reference.id, resolveGeometryReference(registryFile, reference).renderGeometry]));
  const composition = regionApi.mergeRegionPacks(regionRegistry, regionPacks, geometryByPackId);
  const composedWorldHash = crypto.createHash('sha256').update(`${JSON.stringify(regionApi.sortValue(composition.world), null, 2)}\n`).digest('hex');
  const composedFeatureHash = crypto.createHash('sha256').update(`${JSON.stringify(regionApi.sortValue(composition.featureCatalog), null, 2)}\n`).digest('hex');
  if (composedWorldHash !== manifest.world.sha256) throw new Error(`Region-composed world SHA-256 expected ${manifest.world.sha256}, received ${composedWorldHash}`);
  if (composedFeatureHash !== manifest.featureCatalog.sha256) throw new Error(`Region-composed feature SHA-256 expected ${manifest.featureCatalog.sha256}, received ${composedFeatureHash}`);
  contracts.validateFeatureCatalog(featureCatalog);
  contracts.validateWorld(world, featureCatalog);
  embodiments.forEach((row) => contracts.validateEmbodiment(row));
  contracts.validatePolicy(policy);
  contracts.validateOccurrenceCatalog(occurrenceCatalog, world);
  contracts.validateRerankerEvidence(rerankerEvidence, featureCatalog, {
    world: manifest.world.sha256,
    featureCatalog: manifest.featureCatalog.sha256,
    embodiment: manifest.embodiments.find((row) => row.id === manifest.defaultEmbodimentId).sha256,
    policy: manifest.policy.sha256,
  });
  contracts.validateModelRuntimeLock(modelRuntimeLock);
  if (pipelineModelSelection.schema !== 'simulatte.pipelineModelSelection.v1') throw new Error(`Pipeline model selection schema expected simulatte.pipelineModelSelection.v1, received ${pipelineModelSelection.schema || 'missing'}`);
  if (pipelineModelSelection.modelRuntimeLock?.id !== modelRuntimeLock.id || Number(pipelineModelSelection.modelRuntimeLock?.number) !== Number(modelRuntimeLock.number)) {
    throw new Error(`Pipeline model selection expected ${modelRuntimeLock.id} #${modelRuntimeLock.number}`);
  }
  contracts.validatePlaceEmbeddingIndex(placeEmbeddingIndex, modelRuntimeLock);
  contracts.validatePlaceResolutionEvidence(placeResolutionEvidence, placeEmbeddingIndex, modelRuntimeLock);
  pluginContracts.validateProfile(applicationProfile);
  const pluginDatasets = resolvePluginDatasets(applicationProfile);
  const safetyHistoryIndex = pluginDatasets.get('nyc-crash-history-2025-07-to-2026-07-v1');
  contracts.validateSafetyHistoryIndex(safetyHistoryIndex, world, manifest.world.sha256);
  contracts.validateCurriculum(curriculum, world);
  contracts.validatePolicyArenaEvidence(policyArenaEvidence);
  publicAutonomyJavaScript().forEach((file) => {
    const lineCount = fs.readFileSync(file, 'utf8').split(/\r?\n/).length;
    if (lineCount > 999) throw new Error(`${path.relative(ROOT, file)} has ${lineCount} lines; maximum is 999`);
  });
  validateHtmlScripts();
  console.log(`AUTONOMY-DATA manifest=${manifest.id} world=${world.id} regions=${regionPacks.length} seams=${composition.receipt.seamNodeIds.length} embodiments=${embodiments.map((row) => row.id).join(',')} policy=${policy.id} status=verified`);
}

function resolvePluginDatasets(profile) {
  const values = new Map();
  profile.plugins.forEach((selection) => {
    const directory = path.join(PUBLIC, 'shared', 'plugins', selection.id);
    const manifest = readJson(path.join(directory, 'plugin.json'));
    pluginContracts.validateManifest(manifest);
    manifest.datasets.filter((row) => row.reference).forEach((declaration) => {
      const file = path.resolve(directory, declaration.reference.path);
      if (!file.startsWith(`${PUBLIC}${path.sep}`)) throw new Error(`Plugin ${manifest.id} dataset ${declaration.id} leaves public/`);
      if (hashFile(file) !== declaration.reference.sha256) throw new Error(`Plugin ${manifest.id} dataset ${declaration.id} SHA-256 mismatch`);
      const value = readJson(file);
      if (value.id !== declaration.id) throw new Error(`Plugin ${manifest.id} dataset ${declaration.id} identity mismatch`);
      const previous = values.get(declaration.id);
      if (previous && JSON.stringify(previous) !== JSON.stringify(value)) throw new Error(`Plugin dataset ${declaration.id} has conflicting values`);
      values.set(declaration.id, value);
    });
  });
  return values;
}

try {
  main();
} catch (error) {
  console.error(error && error.stack || error);
  process.exit(1);
}
