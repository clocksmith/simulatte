#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REGISTRY_PATH = path.join(ROOT, 'tools', 'samer', 'model-candidate-registry.json');
const LOCK_PATH = path.join(ROOT, 'public', 'data', 'simulatte-embedder', 'model-runtime-lock.json');
const TASKS = Object.freeze(['classification', 'embedding-retrieval', 'reranking']);
const MODES = new Set([
  'deterministic-classification',
  'deterministic-retrieval',
  'deterministic-reranking',
  'linear-classification',
  'linear-svc-classification',
  'nli-classification',
  'embedding-classification',
  'sentence-embedding',
  'sequence-reranking',
  'causal-reranking',
]);

export function validateCandidateRegistry(registry, modelLock, options = {}) {
  if (!registry || registry.schema !== 'simulatte.modelCandidateRegistry.v1') fail('registry schema mismatch');
  if (!modelLock || modelLock.schema !== 'simulatte.modelRuntimeLock.v1') fail('model runtime lock schema mismatch');
  const environment = registry.comparisonEnvironment || {};
  for (const field of ['runtimeId', 'deviceId', 'dtype', 'cacheProtocolId', 'entrypoint']) requireText(environment[field], `comparison environment ${field}`);
  const entrypoint = path.resolve(options.root || ROOT, environment.entrypoint);
  if (!fs.existsSync(entrypoint)) fail(`candidate runtime entrypoint does not exist: ${environment.entrypoint}`);
  const ids = new Set();
  const implementations = new Set();
  for (const task of TASKS) {
    const candidates = registry.tasks && registry.tasks[task];
    if (!Array.isArray(candidates) || candidates.length < 2) fail(`${task} requires at least two candidates`);
    if (!candidates.some((row) => row.kind === 'deterministic')) fail(`${task} requires a deterministic control`);
    for (const candidate of candidates) {
      const id = requireText(candidate.id, `${task} candidate id`);
      if (ids.has(id)) fail(`candidate id is duplicated: ${id}`);
      ids.add(id);
      const implementationId = requireText(candidate.implementationId, `${id} implementationId`);
      if (implementations.has(implementationId)) fail(`implementation id is duplicated: ${implementationId}`);
      implementations.add(implementationId);
      if (!['deterministic', 'model'].includes(candidate.kind)) fail(`${id} kind must be deterministic or model`);
      if (!MODES.has(candidate.mode)) fail(`${id} has unsupported runtime mode ${candidate.mode || 'missing'}`);
      if (candidate.evaluationEligible !== true) fail(`${id} must explicitly be evaluation eligible`);
      if (typeof candidate.deploymentEligible !== 'boolean') fail(`${id} deploymentEligible must be boolean`);
      requireText(candidate.deploymentEvidence, `${id} deployment evidence`);
      if (candidate.kind === 'deterministic') {
        if (candidate.modelId !== null || candidate.revision !== null) fail(`${id} deterministic control must have null model identity and revision`);
      } else {
        requireText(candidate.modelId, `${id} modelId`);
        requireText(candidate.revision, `${id} revision`);
      }
    }
  }
  const retrievalIds = new Set(registry.tasks['embedding-retrieval'].map((row) => row.id));
  const cascades = registry.retrievalCascades;
  if (!Array.isArray(cascades) || !cascades.length) fail('retrieval cascades are required');
  for (const cascade of cascades) {
    const id = requireText(cascade.id, 'retrieval cascade id');
    if (ids.has(id)) fail(`candidate id is duplicated: ${id}`);
    ids.add(id);
    const implementationId = requireText(cascade.implementationId, `${id} implementationId`);
    if (implementations.has(implementationId)) fail(`implementation id is duplicated: ${implementationId}`);
    implementations.add(implementationId);
    if (cascade.kind !== 'composite') fail(`${id} kind must be composite`);
    if (!retrievalIds.has(cascade.refusalGateCandidateId) || !retrievalIds.has(cascade.recallCandidateId)) fail(`${id} references an unknown retrieval component`);
    const gate = candidateById(registry, cascade.refusalGateCandidateId);
    const recall = candidateById(registry, cascade.recallCandidateId);
    if (gate.kind !== 'deterministic') fail(`${id} refusal gate must be deterministic`);
    if (recall.kind !== 'model') fail(`${id} recall component must be model-backed`);
    if (cascade.evaluationEligible !== true) fail(`${id} must explicitly be evaluation eligible`);
    if (typeof cascade.deploymentEligible !== 'boolean') fail(`${id} deploymentEligible must be boolean`);
    requireText(cascade.deploymentEvidence, `${id} deployment evidence`);
  }
  const embedding = candidateById(registry, 'qwen3-embedding-control');
  const reranker = candidateById(registry, 'qwen3-reranker-control');
  if (embedding.modelId !== modelLock.embedding.source.sourceCheckpointId) fail('Qwen embedding candidate differs from the runtime lock source checkpoint');
  if (reranker.modelId !== modelLock.reranker.model.source.sourceCheckpointId) fail('Qwen reranker candidate differs from the runtime lock source checkpoint');
  return {
    schema: 'simulatte.modelCandidateRegistryCheck.v1',
    registryId: registry.id,
    registrySha256: digest(Buffer.from(`${JSON.stringify(registry, null, 2)}\n`)),
    runtimeSha256: digest(fs.readFileSync(entrypoint)),
    candidateCount: ids.size,
    retrievalCascadeCount: cascades.length,
    taskCandidateCounts: Object.fromEntries(TASKS.map((task) => [task, registry.tasks[task].length])),
    modelLockNumber: modelLock.number,
  };
}

export function readCandidateRegistry() {
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
}

function candidateById(registry, id) {
  const candidate = TASKS.flatMap((task) => registry.tasks[task]).find((row) => row.id === id);
  if (!candidate) fail(`required candidate is missing: ${id}`);
  return candidate;
}

function requireText(value, label) {
  const text = String(value || '').trim();
  if (!text) fail(`${label} is required`);
  return text;
}

function digest(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function fail(message) {
  throw new Error(`Model candidate registry invalid: ${message}`);
}

function main() {
  const registry = readCandidateRegistry();
  const modelLock = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
  const report = validateCandidateRegistry(registry, modelLock);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  }
}
