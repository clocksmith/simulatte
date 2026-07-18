#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { doppler } from '../../public/vendor/doppler/src/index.js';
import { bootstrapNodeWebGPU } from '../../public/vendor/doppler/src/tooling/node-webgpu.js';
import { runRerank } from '../../public/vendor/doppler/src/inference/browser-harness-text-helpers.js';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIR, '../..');
const DEFAULT_EMBEDDING_RECEIPT = path.join(ROOT, 'public/data/autonomy/evidence/place-resolution-public-diagnostic-v2.json');
const DEFAULT_OUTPUT = path.join(ROOT, 'artifacts/autonomy-performance/neural-place-reranker.json');
const MODEL_LOCK_PATH = path.join(ROOT, 'public/data/simulatte-embedder/model-runtime-lock.json');
const INDEX_PATH = path.join(ROOT, 'public/data/autonomy/place-embedding-index-v1.json');
const CORPUS_PATH = path.join(ROOT, 'tools/samer/autonomy/place-resolution-probes-v1.json');
const DOPPLER_ENTRY_PATH = path.join(ROOT, 'public/vendor/doppler/src/index.js');

function parseArgs(argv) {
  const options = { embeddingReceipt: DEFAULT_EMBEDDING_RECEIPT, output: DEFAULT_OUTPUT, topK: 5, documentMaxChars: 1200, includeRefusals: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--embedding-receipt') options.embeddingReceipt = path.resolve(ROOT, String(argv[++index] || ''));
    else if (argument === '--out') options.output = path.resolve(ROOT, String(argv[++index] || ''));
    else if (argument === '--top-k') options.topK = positiveInteger(argv[++index], argument);
    else if (argument === '--document-max-chars') options.documentMaxChars = positiveInteger(argv[++index], argument);
    else if (argument === '--include-refusals') options.includeRefusals = true;
    else if (argument === '--help') {
      console.log('usage: node tools/autonomy/evaluate-neural-place-reranker.mjs [--embedding-receipt PATH] [--out PATH] [--top-k N] [--document-max-chars N] [--include-refusals]');
      process.exit(0);
    } else throw new Error(`unknown argument: ${argument}`);
  }
  return options;
}

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label} expected a positive integer`);
  return parsed;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function createPipelineHandle(model) {
  return {
    manifest: model.manifest,
    tokenizer: { encode: (text) => model.advanced.tokenizeText(text) },
    reset: () => model.resetGenerationState(),
    resetToSeqLen: (length) => model.advanced.resetToSeqLen(length),
    prefillKVOnly: (prompt, options) => model.advanced.prefillKV(prompt, options),
    prefillWithTokenLogits: (prompt, tokenIds, options) => model.advanced.prefillWithTokenLogits(prompt, tokenIds, options),
  };
}

function resolveRows(receipt) {
  const rows = receipt?.lanes?.challenger?.rows;
  if (!Array.isArray(rows)) throw new Error('embedding receipt requires lanes.challenger.rows');
  return rows.filter((row) => row?.evidence?.lane === 'qwen_embedding_cosine' && Array.isArray(row.evidence.ranking));
}

function compactCandidateText(text, maximumCharacters) {
  const lines = String(text || '').split('\n');
  const structured = lines.filter((line) => !line.startsWith('revision-pinned public context:'));
  const publicContext = lines.find((line) => line.startsWith('revision-pinned public context:')) || '';
  const combined = [...structured, publicContext].join('\n');
  return combined.length <= maximumCharacters ? combined : `${combined.slice(0, maximumCharacters - 1).trimEnd()}…`;
}

function distribution(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return { count: 0, min: null, p50: null, p95: null, max: null, mean: null };
  const at = (fraction) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
  return {
    count: sorted.length,
    min: round(sorted[0]),
    p50: round(at(0.5)),
    p95: round(at(0.95)),
    max: round(sorted.at(-1)),
    mean: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const lock = readJson(MODEL_LOCK_PATH);
  const modelLock = lock.reranker?.model;
  if (!modelLock?.defaultModelBaseUrl || !modelLock?.manifestHash?.hex) throw new Error('runtime lock reranker model pin is incomplete');
  const embeddingReceipt = readJson(options.embeddingReceipt);
  const index = readJson(INDEX_PATH);
  const corpus = readJson(CORPUS_PATH);
  const probeById = new Map(corpus.probes.map((probe) => [probe.probeId, probe]));
  const documentByNodeId = new Map(index.documents.map((document) => [document.nodeId, document]));
  const neuralRows = resolveRows(embeddingReceipt).filter((row) => options.includeRefusals || row.kind === 'paraphrase');
  const missingDocuments = neuralRows.flatMap((row) => row.evidence.ranking.slice(0, options.topK)).filter((candidate) => !documentByNodeId.has(candidate.nodeId));
  if (missingDocuments.length) throw new Error(`embedding ranking references ${missingDocuments.length} document(s) absent from the index`);

  const gpu = await bootstrapNodeWebGPU();
  if (!gpu.ok) throw new Error(`Node WebGPU unavailable: ${gpu.detail || gpu.provider || 'unknown'}`);
  const loadStart = performance.now();
  const model = await doppler.load({ url: modelLock.defaultModelBaseUrl }, {});
  const modelLoadMs = performance.now() - loadStart;
  const pipeline = createPipelineHandle(model);
  const outputRows = [];
  try {
    for (const [rowIndex, row] of neuralRows.entries()) {
      const probe = probeById.get(row.probeId);
      if (!probe) throw new Error(`missing probe ${row.probeId}`);
      const candidates = row.evidence.ranking.slice(0, options.topK);
      const candidateDocuments = candidates.map((candidate) => documentByNodeId.get(candidate.nodeId));
      const reranked = await runRerank(pipeline, {}, {
        benchmark: true,
        rerank: {
          query: row.evidence.queryText,
          documents: candidateDocuments.map((document) => compactCandidateText(document.candidateText, options.documentMaxChars)),
        },
      });
      const ranking = reranked.ranking.map((scoreRow) => ({
        rank: scoreRow.rank,
        nodeId: candidates[scoreRow.index].nodeId,
        label: candidates[scoreRow.index].label,
        score: scoreRow.score,
        probability: scoreRow.probability,
        tokenCount: scoreRow.tokenCount,
        scoringPath: scoreRow.scoringPath,
      }));
      const goldDocument = probe.gold.outcome === 'resolve'
        ? index.documents.find((document) => document.label === probe.gold.placeLabel && candidates.some((candidate) => candidate.nodeId === document.nodeId))
        : null;
      const embeddingTop = candidates[0] || null;
      const rerankerTop = ranking[0] || null;
      outputRows.push({
        probeId: row.probeId,
        kind: row.kind,
        gold: probe.gold,
        queryText: row.evidence.queryText,
        embeddingDecision: row.outcome,
        embeddingTop: embeddingTop ? { nodeId: embeddingTop.nodeId, label: embeddingTop.label, similarity: embeddingTop.similarity } : null,
        embeddingTopCorrect: Boolean(goldDocument && embeddingTop?.nodeId === goldDocument.nodeId),
        goldInCandidateSet: Boolean(goldDocument),
        rerankerTopCorrect: Boolean(goldDocument && rerankerTop?.nodeId === goldDocument.nodeId),
        rerankerTop,
        rerankerMargin: ranking.length > 1 ? round(ranking[0].score - ranking[1].score) : null,
        ranking,
        phase: reranked.phase,
      });
      console.error(`[place-reranker] ${rowIndex + 1}/${neuralRows.length} ${row.probeId} top=${rerankerTop?.label || 'none'} totalMs=${round(reranked.phase.totalMs)}`);
    }
  } finally {
    await model.unload();
  }

  const resolvable = outputRows.filter((row) => row.gold.outcome === 'resolve');
  const mustRefuse = outputRows.filter((row) => row.gold.outcome === 'refuse');
  const receipt = {
    schema: 'simulatte.neuralPlaceRerankerDiagnostic.v1',
    generatedAt: new Date().toISOString(),
    host: {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpuModel: os.cpus()[0]?.model || null,
      logicalCpuCount: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
      node: process.version,
      gpu: modelSafeGpuIdentity(gpu),
    },
    identities: {
      embeddingReceipt: { path: path.relative(ROOT, options.embeddingReceipt), sha256: sha256(options.embeddingReceipt) },
      corpus: { path: path.relative(ROOT, CORPUS_PATH), sha256: sha256(CORPUS_PATH) },
      placeEmbeddingIndex: { path: path.relative(ROOT, INDEX_PATH), sha256: sha256(INDEX_PATH), id: index.id },
      modelRuntimeLock: { path: path.relative(ROOT, MODEL_LOCK_PATH), sha256: sha256(MODEL_LOCK_PATH), id: lock.id, number: lock.number },
      dopplerRuntime: { path: path.relative(ROOT, DOPPLER_ENTRY_PATH), sha256: sha256(DOPPLER_ENTRY_PATH), gitSha: lock.doppler.development.gitSha },
      model: {
        id: modelLock.id,
        sourceRevision: modelLock.source.revision,
        manifestSha256: modelLock.manifestHash.hex,
        sizeBytes: modelLock.source.sizeBytes,
      },
    },
    workload: {
      inputLane: embeddingReceipt.lanes.challenger.resolverId,
      neuralProbeCount: outputRows.length,
      resolvableProbeCount: resolvable.length,
      mustRefuseProbeCount: mustRefuse.length,
      candidateCount: options.topK,
      documentEncoding: {
        method: 'structured_lines_then_revision_pinned_context_prefix_v1',
        maximumCharacters: options.documentMaxChars,
      },
      scoring: 'qwen3_yes_no_selected_token_logits',
      population: corpus.population,
      promotionEligible: false,
    },
    accuracy: {
      embeddingPolicyCorrect: resolvable.filter((row) => row.embeddingDecision === 'resolve' && row.embeddingTopCorrect).length,
      embeddingTop1CorrectIgnoringThreshold: resolvable.filter((row) => row.embeddingTopCorrect).length,
      goldCoveredByTopK: resolvable.filter((row) => row.goldInCandidateSet).length,
      rerankerTop1Correct: resolvable.filter((row) => row.rerankerTopCorrect).length,
      resolvableTotal: resolvable.length,
      mustRefuseRowsScored: mustRefuse.length,
      mustRefuseDecisionPolicy: 'none; a reranker ranking is not permission to resolve an ambiguous or out-of-world place',
    },
    performance: {
      modelLoadMs: round(modelLoadMs),
      queryLatencyMs: distribution(outputRows.map((row) => row.phase.totalMs)),
      candidateLatencyMs: distribution(outputRows.flatMap((row) => row.phase.documents.map((document) => document.phase.totalMs))),
      prefixAppliedCount: outputRows.filter((row) => row.phase.prefixApplied).length,
    },
    rows: outputRows,
    decision: {
      eligibleForRuntimeIntegration: false,
      reasons: [
        'diagnostic population is exposed',
        'no predeclared confidence/refusal policy exists for ambiguous and out-of-world inputs',
        'ranking quality must justify an additional model artifact and runtime load before integration',
      ],
    },
    claimBoundary: 'This exposed diagnostic tests whether the pinned Qwen reranker reorders embedding top-K candidates toward known places. It does not authorize resolving must-refuse inputs, establish generalization, or promote the reranker into the runtime.',
  };
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({
    output: path.relative(ROOT, options.output),
    modelLoadMs: receipt.performance.modelLoadMs,
    embeddingPolicyCorrect: `${receipt.accuracy.embeddingPolicyCorrect}/${receipt.accuracy.resolvableTotal}`,
    embeddingTop1CorrectIgnoringThreshold: `${receipt.accuracy.embeddingTop1CorrectIgnoringThreshold}/${receipt.accuracy.resolvableTotal}`,
    goldCoveredByTopK: `${receipt.accuracy.goldCoveredByTopK}/${receipt.accuracy.resolvableTotal}`,
    rerankerTop1Correct: `${receipt.accuracy.rerankerTop1Correct}/${receipt.accuracy.resolvableTotal}`,
    queryP95Ms: receipt.performance.queryLatencyMs.p95,
  }, null, 2));
}

function modelSafeGpuIdentity(gpu) {
  const info = gpu?.adapter?.info || gpu?.adapterInfo || null;
  if (!info) return { provider: gpu?.provider || null };
  return {
    provider: gpu?.provider || null,
    vendor: info.vendor || null,
    architecture: info.architecture || null,
    device: info.device || null,
    description: info.description || null,
  };
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
