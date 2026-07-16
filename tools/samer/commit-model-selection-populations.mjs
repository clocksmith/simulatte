#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SAMER_DIR = path.join(ROOT, 'tools', 'samer');
const DEFAULT_SEALED_DIR = path.join(SAMER_DIR, 'model-selection', 'sealed');
const JOBS_PATH = path.join(SAMER_DIR, 'classification-jobs-v1.json');
const POPULATIONS = Object.freeze([
  {
    task: 'classification',
    file: 'classification-population-v1.json',
    schema: 'simulatte.sealedClassificationPopulation.v1',
    commitment: 'classification-population-v1.commitment.json',
  },
  {
    task: 'embedding-retrieval',
    file: 'embedding-retrieval-population-v1.json',
    schema: 'simulatte.sealedEmbeddingRetrievalPopulation.v1',
    commitment: 'embedding-retrieval-population-v1.commitment.json',
  },
  {
    task: 'reranking',
    file: 'reranking-population-v1.json',
    schema: 'simulatte.sealedRerankingPopulation.v1',
    commitment: 'reranking-population-v1.commitment.json',
  },
]);

function parseArgs(argv) {
  const options = { sealedDir: DEFAULT_SEALED_DIR, write: false, checkPrivate: false };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--write') options.write = true;
    else if (key === '--check-private') options.checkPrivate = true;
    else if (key === '--sealed-dir') options.sealedDir = path.resolve(argv[++index] || '');
    else throw new Error(`Unknown argument: ${key}`);
  }
  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function validateCommitmentManifest(row, expected) {
  if (row.schema !== 'simulatte.sealedModelSelectionPopulationCommitment.v1') fail(`${expected.task} commitment schema mismatch`);
  if (row.task !== expected.task || row.populationSchema !== expected.schema) fail(`${expected.task} commitment task/schema mismatch`);
  requireText(row.id, `${expected.task} commitment id`);
  requireHash(row.populationSha256, `${expected.task} population hash`);
  requireHash(row.generatorSha256, `${expected.task} generator hash`);
  requirePositiveInteger(row.rowCount, `${expected.task} row count`);
  if (row.visibility !== 'sealed') fail(`${expected.task} commitment visibility must remain sealed`);
  if (!Array.isArray(row.openings)) fail(`${expected.task} openings must be an array`);
  if (row.contaminationStatus === 'unexposed') {
    if (row.openings.length !== 0) fail(`${expected.task} unexposed commitment cannot contain an opening`);
  } else if (row.contaminationStatus === 'opened-for-one-time-evaluation') {
    if (row.openings.length !== 1) fail(`${expected.task} opened commitment requires exactly one opening receipt`);
    validateOpeningReceipt(row.openings[0], expected.task);
  } else fail(`${expected.task} contamination status is invalid`);
}

function validateOpeningReceipt(pointer, task) {
  const relativePath = requireText(pointer && pointer.path, `${task} opening receipt path`);
  requireHash(pointer && pointer.sha256, `${task} opening receipt hash`);
  const receiptPath = path.resolve(ROOT, relativePath);
  if (!fs.existsSync(receiptPath)) fail(`${task} opening receipt is missing at ${relativePath}`);
  const bytes = fs.readFileSync(receiptPath);
  if (digest(bytes) !== pointer.sha256) fail(`${task} opening receipt hash mismatch`);
  const receipt = JSON.parse(bytes.toString('utf8'));
  if (receipt.schema !== 'simulatte.sealedModelSelectionOpening.v1' || receipt.task !== task) fail(`${task} opening receipt schema/task mismatch`);
  if (receipt.candidateProcessesReceivedGoldLabels !== false || receipt.evaluatorOwnedMetrics !== true) fail(`${task} opening receipt does not preserve evaluator custody`);
}

function validatePopulation(population, expected, jobs) {
  if (population.schema !== expected.schema) fail(`${expected.task} population schema mismatch`);
  requireText(population.id, `${expected.task} population id`);
  requireText(population.sealedAt, `${expected.task} sealedAt`);
  if (population.task !== expected.task) fail(`${expected.task} population task mismatch`);
  if (population.visibility !== 'sealed' || population.contaminationStatus !== 'unexposed') fail(`${expected.task} private population must be sealed and unexposed`);
  if (!Array.isArray(population.rows) || population.rows.length < 60) fail(`${expected.task} private population requires at least 60 rows`);
  const ids = new Set();
  for (const row of population.rows) {
    const id = requireText(row && row.id, `${expected.task} row id`);
    if (ids.has(id)) fail(`${expected.task} duplicate row id ${id}`);
    ids.add(id);
  }
  if (expected.task === 'classification') validateClassification(population.rows, jobs);
  if (expected.task === 'embedding-retrieval') validateRetrieval(population.rows);
  if (expected.task === 'reranking') validateReranking(population.rows);
}

function validateClassification(rows, jobs) {
  const jobsById = new Map(jobs.jobs.map((job) => [job.id, job]));
  const counts = new Map(jobs.jobs.map((job) => [job.id, 0]));
  for (const row of rows) {
    const job = jobsById.get(row.headId);
    if (!job) fail(`classification row ${row.id} has unknown head ${row.headId || 'missing'}`);
    if (!job.labels.includes(row.expectedLabel)) fail(`classification row ${row.id} has label outside ${row.headId} taxonomy`);
    requireText(row.input && row.input.text, `classification row ${row.id} input text`);
    counts.set(row.headId, counts.get(row.headId) + 1);
  }
  for (const [headId, count] of counts) {
    if (count < 10) fail(`classification head ${headId} requires at least 10 sealed rows`);
  }
}

function validateRetrieval(rows) {
  let hardNegativeRows = 0;
  let mustRefuseRows = 0;
  for (const row of rows) {
    requireText(row.query, `retrieval row ${row.id} query`);
    if (!Array.isArray(row.candidates) || row.candidates.length < 4) fail(`retrieval row ${row.id} requires at least four candidates`);
    const candidateIds = new Set(row.candidates.map((candidate) => requireText(candidate.id, `retrieval row ${row.id} candidate id`)));
    const relevant = Array.isArray(row.relevantIds) ? row.relevantIds : [];
    const hard = Array.isArray(row.hardNegativeIds) ? row.hardNegativeIds : [];
    if (row.mustRefuse === true) {
      mustRefuseRows += 1;
      if (relevant.length) fail(`retrieval must-refuse row ${row.id} cannot declare relevant candidates`);
    } else if (!relevant.length) fail(`retrieval row ${row.id} requires a relevant candidate or mustRefuse=true`);
    for (const id of [...relevant, ...hard]) if (!candidateIds.has(id)) fail(`retrieval row ${row.id} references missing candidate ${id}`);
    if (hard.length) hardNegativeRows += 1;
  }
  if (hardNegativeRows < 20) fail('retrieval population requires at least 20 hard-negative rows');
  if (mustRefuseRows < 20) fail('retrieval population requires at least 20 must-refuse rows');
}

function validateReranking(rows) {
  for (const row of rows) {
    requireText(row.query, `reranking row ${row.id} query`);
    if (!Array.isArray(row.candidates) || row.candidates.length < 4) fail(`reranking row ${row.id} requires at least four candidates`);
    const ids = new Set();
    let maximum = -1;
    for (const candidate of row.candidates) {
      const id = requireText(candidate.id, `reranking row ${row.id} candidate id`);
      if (ids.has(id)) fail(`reranking row ${row.id} duplicates candidate ${id}`);
      ids.add(id);
      if (!Number.isInteger(candidate.relevance) || candidate.relevance < 0 || candidate.relevance > 3) fail(`reranking row ${row.id} relevance must be 0..3`);
      maximum = Math.max(maximum, candidate.relevance);
    }
    if (!ids.has(row.winnerId)) fail(`reranking row ${row.id} winner is absent`);
    if (row.candidates.find((candidate) => candidate.id === row.winnerId).relevance !== maximum) fail(`reranking row ${row.id} winner lacks maximum relevance`);
  }
}

function buildCommitment(bytes, population, expected, generatorHash) {
  return {
    schema: 'simulatte.sealedModelSelectionPopulationCommitment.v1',
    id: population.id,
    task: expected.task,
    populationSchema: expected.schema,
    sealedAt: population.sealedAt,
    populationSha256: digest(bytes),
    generatorSha256: generatorHash,
    rowCount: population.rows.length,
    visibility: 'sealed',
    contaminationStatus: 'unexposed',
    labelAuthority: population.labelAuthority,
    custody: 'The population bytes and generator remain outside version control. Move them off the evaluation host before candidate development. Opening requires a hash-bound append-only receipt.',
    openings: [],
  };
}

function verifyCommittedOnly() {
  const hashes = [];
  let openingCount = 0;
  for (const expected of POPULATIONS) {
    const manifestPath = path.join(SAMER_DIR, expected.commitment);
    if (!fs.existsSync(manifestPath)) fail(`missing ${expected.commitment}`);
    const manifest = readJson(manifestPath);
    validateCommitmentManifest(manifest, expected);
    hashes.push(manifest.populationSha256);
    openingCount += manifest.openings.length;
  }
  if (new Set(hashes).size !== hashes.length) fail('the three tasks must not share population bytes');
  console.log(`MODEL-POPULATIONS commitments=verified count=${POPULATIONS.length} openings=${openingCount}`);
}

function verifyOrWritePrivate(options) {
  const jobs = readJson(JOBS_PATH);
  const generatorPath = path.join(options.sealedDir, 'population-generator.mjs');
  if (!fs.existsSync(generatorPath)) fail(`sealed generator missing at ${generatorPath}`);
  const generatorHash = digest(fs.readFileSync(generatorPath));
  const commitments = [];
  for (const expected of POPULATIONS) {
    const populationPath = path.join(options.sealedDir, expected.file);
    if (!fs.existsSync(populationPath)) fail(`sealed population missing at ${populationPath}`);
    const bytes = fs.readFileSync(populationPath);
    const population = JSON.parse(bytes.toString('utf8'));
    validatePopulation(population, expected, jobs);
    const commitment = buildCommitment(bytes, population, expected, generatorHash);
    const commitmentPath = path.join(SAMER_DIR, expected.commitment);
    if (options.write) fs.writeFileSync(commitmentPath, `${JSON.stringify(commitment, null, 2)}\n`);
    else {
      const existing = readJson(commitmentPath);
      validateCommitmentManifest(existing, expected);
      for (const field of ['id', 'task', 'populationSchema', 'sealedAt', 'populationSha256', 'generatorSha256', 'rowCount', 'visibility', 'labelAuthority']) {
        if (existing[field] !== commitment[field]) fail(`${expected.task} private bytes differ from committed identity at ${field}`);
      }
    }
    commitments.push(commitment);
  }
  if (new Set(commitments.map((row) => row.populationSha256)).size !== commitments.length) fail('private task populations must have distinct bytes');
  console.log(`MODEL-POPULATIONS commitments=${options.write ? 'written' : 'matched'} count=${commitments.length} private=sealed`);
}

function requireText(value, label) {
  const text = String(value || '').trim();
  if (!text) fail(`${label} is required`);
  return text;
}

function requireHash(value, label) {
  const hash = String(value || '');
  if (!/^[a-f0-9]{64}$/.test(hash)) fail(`${label} must be a lowercase SHA-256 digest`);
}

function requirePositiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) fail(`${label} must be a positive integer`);
}

function fail(message) {
  throw new Error(`Sealed model population invalid: ${message}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.write || options.checkPrivate) verifyOrWritePrivate(options);
  else verifyCommittedOnly();
}

try {
  main();
} catch (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
}
