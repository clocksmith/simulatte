#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MODEL_RUNTIME_LOCK_PATH,
  modelRuntimeLockHash,
  readModelRuntimeLock,
} from './model-runtime-lock-utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = path.join(ROOT, 'public', 'data', 'simulatte-embedder', 'manifest.json');
const UNIVERSE_MANIFEST_PATH = path.join(ROOT, 'public', 'data', 'simulatte-universe', 'manifest.json');
const INDEX_PATH = path.join(ROOT, 'public', 'data', 'simulatte-embedder', 'primitive-index-v2.json');
const CARD_INDEX_PATH = path.join(ROOT, 'public', 'data', 'simulatte-embedder', 'surface-card-index-qwen-v1.json');
const EVIDENCE_CONTRACT_PATH = path.join(ROOT, 'public', 'data', 'simulatte-embedder', 'intent-evidence-contract-v1.json');
const INVENTORY_PATH = path.join(ROOT, 'public', 'data', 'simulatte-catalog-inventory.json');
const STRUCTURER_MANIFEST_PATH = path.join(ROOT, 'public', 'data', 'simulatte-intent-structurer', 'manifest.json');
const INDEX_BUILDERS = [
  path.join(ROOT, 'tools', 'build-primitive-embedding-index.mjs'),
  path.join(ROOT, 'tools', 'build-surface-card-embedding-index.mjs'),
];
const INTENT_BRIEF_SCHEMA_PATH = path.join(
  ROOT,
  'public',
  'pipeline',
  'phase-04-grounded-intent',
  'simulatte-intent-brief-schema.js'
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function hashHex(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.replace(/^sha256:/, '').toLowerCase();
  return String(value.hex || '').toLowerCase();
}

function fail(message) {
  throw new Error(`Model runtime lock invalid: ${message}`);
}

function requireText(value, label) {
  const text = String(value || '').trim();
  if (!text) fail(`${label} is required`);
  return text;
}

function requirePositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) fail(`${label} must be a positive integer`);
  return number;
}

function requireLockedArtifact(relativePath, label, expectedKind) {
  const value = requireText(relativePath, label);
  const artifactPath = path.resolve(path.dirname(MODEL_RUNTIME_LOCK_PATH), value);
  if (!artifactPath.startsWith(path.join(ROOT, 'public') + path.sep)) {
    fail(`${label} must resolve inside public/`);
  }
  if (!fs.existsSync(artifactPath)) fail(`${label} does not exist at ${artifactPath}`);
  const stat = fs.statSync(artifactPath);
  if (expectedKind === 'file' && !stat.isFile()) fail(`${label} must resolve to a file`);
  if (expectedKind === 'directory' && !stat.isDirectory()) fail(`${label} must resolve to a directory`);
  return value;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) fail(`${label}: expected ${expected}, received ${actual}`);
}

function assertLockReference(reference, lock, label, expectedArtifact) {
  if (!reference || typeof reference !== 'object') fail(`${label} is required`);
  assertEqual(reference.id, lock.id, `${label}.id`);
  assertEqual(Number(reference.number), Number(lock.number), `${label}.number`);
  assertEqual(reference.artifact, expectedArtifact, `${label}.artifact`);
  assertEqual(hashHex(reference.artifactHash), modelRuntimeLockHash(), `${label}.artifactHash`);
}

function assertSubset(actual, expected, label) {
  for (const [key, expectedValue] of Object.entries(expected || {})) {
    const actualValue = actual && actual[key];
    if (expectedValue && typeof expectedValue === 'object' && !Array.isArray(expectedValue)) {
      assertSubset(actualValue, expectedValue, `${label}.${key}`);
    } else if (actualValue !== expectedValue) {
      fail(`${label}.${key}: expected ${JSON.stringify(expectedValue)}, received ${JSON.stringify(actualValue)}`);
    }
  }
}

function validatePinnedModel(model, conversion, expectedModelType) {
  requireText(model.id, `${expectedModelType}.id`);
  requireText(model.defaultModelBaseUrl, `${expectedModelType}.defaultModelBaseUrl`);
  const source = model.source || {};
  const revision = requireText(source.revision, `${expectedModelType}.source.revision`);
  const sourcePath = requireText(source.path, `${expectedModelType}.source.path`);
  if (!model.defaultModelBaseUrl.includes(`/resolve/${revision}/${sourcePath}`)) {
    fail(`${expectedModelType}.defaultModelBaseUrl must resolve its pinned source revision and path`);
  }
  if (!/^[0-9a-f]{64}$/i.test(hashHex(model.manifestHash))) {
    fail(`${expectedModelType}.manifestHash must be a SHA-256 digest`);
  }
  const conversionPath = path.join(ROOT, requireText(conversion.projectPath, `${expectedModelType}.conversion.projectPath`));
  assertEqual(hashFile(conversionPath), conversion.sha256, `${expectedModelType}.conversion.sha256`);
  const config = readJson(conversionPath);
  assertEqual(config.output?.modelBaseId, model.id, `${expectedModelType} conversion output.modelBaseId`);
  assertEqual(config.manifest?.artifactIdentity?.sourceCheckpointId, source.sourceCheckpointId, `${expectedModelType} conversion sourceCheckpointId`);
  assertEqual(config.manifest?.artifactIdentity?.weightPackId, source.weightPackId, `${expectedModelType} conversion weightPackId`);
  assertEqual(config.manifest?.artifactIdentity?.manifestVariantId, source.manifestVariantId, `${expectedModelType} conversion manifestVariantId`);
  return config;
}

function main() {
  const lock = readModelRuntimeLock();
  assertEqual(lock.schema, 'simulatte.modelRuntimeLock.v1', 'lock.schema');
  requireText(lock.id, 'lock.id');
  requirePositiveInteger(lock.number, 'lock.number');
  const doppler = lock.doppler || {};
  const dopplerPackage = doppler.package || {};
  requireLockedArtifact(doppler.moduleUrl, 'doppler.moduleUrl', 'file');
  requireLockedArtifact(doppler.deviceModuleUrl, 'doppler.deviceModuleUrl', 'file');
  requireLockedArtifact(doppler.storageModuleUrl, 'doppler.storageModuleUrl', 'file');
  requireLockedArtifact(doppler.kernelBasePath, 'doppler.kernelBasePath', 'directory');
  requireText(dopplerPackage.name, 'doppler.package.name');
  requireText(dopplerPackage.version, 'doppler.package.version');
  requireText(dopplerPackage.integrity, 'doppler.package.integrity');
  requireText(dopplerPackage.shasum, 'doppler.package.shasum');
  requirePositiveInteger(dopplerPackage.fileCount, 'doppler.package.fileCount');
  if (doppler.localPatches) fail('doppler.localPatches is forbidden; sync the complete sibling package');
  const development = doppler.development || {};
  assertEqual(development.kind, 'sibling-git-archive', 'doppler.development.kind');
  requireText(development.workspacePath, 'doppler.development.workspacePath');
  if (!/^[0-9a-f]{40}$/i.test(String(development.gitSha || ''))) {
    fail('doppler.development.gitSha must be a full Git SHA');
  }

  const embedding = lock.embedding || {};
  requirePositiveInteger(embedding.dimensions, 'embedding.dimensions');
  const indexEmbeddingMode = requireText(embedding.indexEmbeddingMode, 'embedding.indexEmbeddingMode');
  const embeddingConversion = validatePinnedModel(embedding, embedding.conversion || {}, 'embedding');
  assertSubset(embeddingConversion.session, embedding.runtimeConfig?.inference?.session, 'embedding conversion session');
  const manifestPoolingMode = requireText(
    embeddingConversion.inference?.output?.embeddingPostprocessor?.poolingMode,
    'embedding conversion inference.output.embeddingPostprocessor.poolingMode'
  );
  assertEqual(indexEmbeddingMode, manifestPoolingMode, 'embedding.indexEmbeddingMode');

  const reranker = lock.reranker || {};
  assertEqual(reranker.schema, 'simulatte.intentRerankerConfig.v1', 'reranker.schema');
  assertEqual(reranker.required, true, 'reranker.required');
  assertEqual(reranker.phase, 3, 'reranker.phase');
  assertEqual(reranker.executeInPhase, 3, 'reranker.executeInPhase');
  requirePositiveInteger(reranker.maxCandidatesPerCall, 'reranker.maxCandidatesPerCall');
  requirePositiveInteger(reranker.maxSlotCandidatesPerCall, 'reranker.maxSlotCandidatesPerCall');
  requirePositiveInteger(reranker.maxCandidateTermsPerDocument, 'reranker.maxCandidateTermsPerDocument');
  requirePositiveInteger(reranker.scoreCacheMaxEntries, 'reranker.scoreCacheMaxEntries');
  assertEqual(reranker.execution?.selectedTokenLogits, 'required', 'reranker.execution.selectedTokenLogits');
  assertEqual(reranker.execution?.prefixKvReuse, 'required', 'reranker.execution.prefixKvReuse');
  assertEqual(reranker.execution?.statefulPrefixReuse, 'required', 'reranker.execution.statefulPrefixReuse');
  const rerankerConversion = validatePinnedModel(reranker.model || {}, reranker.conversion || {}, 'reranker');
  assertEqual(rerankerConversion.inference?.supportsRerank, true, 'reranker conversion inference.supportsRerank');
  assertSubset(rerankerConversion.session, reranker.runtimeConfig?.inference?.session, 'reranker conversion session');

  const runtime = lock.runtime || {};
  const queryEmbeddingMode = requireText(runtime.queryEmbeddingMode, 'runtime.queryEmbeddingMode');
  assertEqual(queryEmbeddingMode, manifestPoolingMode, 'runtime.queryEmbeddingMode');
  requireText(runtime.embeddingText?.schema, 'runtime.embeddingText.schema');
  assertEqual(runtime.requireModelBackedQuery, true, 'runtime.requireModelBackedQuery');
  if (!Array.isArray(lock.runtimeOrder) || !lock.runtimeOrder.length) {
    fail('runtimeOrder must be a non-empty array');
  }
  const cache = lock.cache || {};
  requireText(cache.namespace, 'cache.namespace');
  if (!Array.isArray(cache.storage) || !cache.storage.length) fail('cache.storage must be a non-empty array');
  if (!cache.storage.includes('Doppler') || !cache.storage.includes('OPFS')) {
    fail('cache.storage must include Doppler and OPFS');
  }
  assertEqual(cache.owner, 'doppler', 'cache.owner');
  assertEqual(cache.prefetch, true, 'cache.prefetch');
  assertEqual(cache.strategy, 'doppler-opfs-verified', 'cache.strategy');
  assertEqual(cache.requirePersistent, true, 'cache.requirePersistent');

  const manifest = readJson(MANIFEST_PATH);
  assertEqual(manifest.schema, 'simulatte.modelBackedEmbedderManifest.v3', 'intent manifest schema');
  assertLockReference(manifest.modelRuntimeLock, lock, 'intent manifest modelRuntimeLock', './model-runtime-lock.json');
  assertEqual(
    hashHex(manifest.retrieval?.artifactHash),
    hashFile(INDEX_PATH),
    'primitive index artifactHash'
  );
  assertEqual(
    hashHex(manifest.retrieval?.cards?.artifactHash),
    hashFile(CARD_INDEX_PATH),
    'surface-card index artifactHash'
  );
  if (manifest.embedModel || manifest.reranker || manifest.runtime || manifest.runtimeOrder || manifest.cache) {
    fail('intent manifest must not duplicate model runtime policy from the numbered lock');
  }
  const evidenceContract = readJson(EVIDENCE_CONTRACT_PATH);
  assertEqual(evidenceContract.schema, 'simulatte.intentEvidenceContract.v1', 'intent evidence contract schema');
  assertLockReference(
    evidenceContract.modelRuntimeLock,
    lock,
    'intent evidence contract modelRuntimeLock',
    './model-runtime-lock.json'
  );
  if (evidenceContract.retrievalModel) fail('intent evidence contract must not duplicate the embedding model id');
  assertEqual(
    hashHex(manifest.retrieval?.intentEvidence?.artifactHash),
    hashFile(EVIDENCE_CONTRACT_PATH),
    'intent evidence contract artifactHash'
  );

  const universeManifest = readJson(UNIVERSE_MANIFEST_PATH);
  assertLockReference(universeManifest.modelRuntimeLock, lock, 'universe manifest modelRuntimeLock', '../simulatte-embedder/model-runtime-lock.json');
  if (universeManifest.embedModel) fail('universe manifest must not duplicate the embedding pin');

  const inventory = readJson(INVENTORY_PATH);
  assertLockReference(
    inventory.modelRuntimeLock,
    lock,
    'catalog inventory modelRuntimeLock',
    './simulatte-embedder/model-runtime-lock.json'
  );
  if (inventory.embedModel) fail('catalog inventory must not duplicate the embedding pin');

  const structurerManifest = readJson(STRUCTURER_MANIFEST_PATH);
  assertLockReference(
    structurerManifest.modelRuntimeLock,
    lock,
    'intent structurer modelRuntimeLock',
    '../simulatte-embedder/model-runtime-lock.json'
  );
  if (structurerManifest.retrievalDependency?.id || structurerManifest.rerank?.id) {
    fail('intent structurer must not duplicate retrieval or reranker model ids');
  }

  for (const builderPath of INDEX_BUILDERS) {
    const source = fs.readFileSync(builderPath, 'utf8');
    if (!source.includes("lockedEmbeddingModel()")) {
      fail(`${path.basename(builderPath)} must derive its embedding pin from model-runtime-lock-utils`);
    }
    if (/DEFAULT_MODEL_(?:ID|BASE_URL)|SIMULATTE_EMBED_MODEL_(?:BASE_URL|ID|HASH|MODE)/.test(source)) {
      fail(`${path.basename(builderPath)} must not expose an embedding pin override`);
    }
  }
  const intentBriefSchema = fs.readFileSync(INTENT_BRIEF_SCHEMA_PATH, 'utf8');
  if (intentBriefSchema.includes(embedding.id) || intentBriefSchema.includes(reranker.model.id)) {
    fail('intent brief schema must receive model identity from the Phase 1 runtime receipt');
  }
  if (!intentBriefSchema.includes('modelRuntimeLockNumber')) {
    fail('intent brief schema must receipt the numbered model runtime lock');
  }

  for (const [label, filePath] of [['primitive index', INDEX_PATH], ['surface-card index', CARD_INDEX_PATH]]) {
    const index = readJson(filePath);
    assertEqual(index.embedModelId, embedding.id, `${label} embedModelId`);
    assertEqual(hashHex(index.embedModelHash), hashHex(embedding.manifestHash), `${label} embedModelHash`);
    assertEqual(Number(index.embeddingDim), Number(embedding.dimensions), `${label} embeddingDim`);
  }

  console.log(`Model runtime lock clean: ${lock.id}#${lock.number} pins ${dopplerPackage.name}@${dopplerPackage.version}, ${embedding.id}, and ${reranker.model.id}.`);
}

try {
  main();
} catch (error) {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
}
