#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function benchmarkRerankerFrontier(report, options = {}) {
  if (!report || !Array.isArray(report.results)) {
    throw new Error('reranker frontier requires a visual-audit report with results');
  }
  const rows = report.results.map(frontierSourceRow).filter(Boolean);
  if (!rows.length) throw new Error('reranker frontier found no model-backed Phase 3 receipts');
  const maximumK = Math.max(...rows.map((row) => row.candidates.length));
  const fullCandidateCount = sum(rows.map((row) => row.candidates.length));
  const fullExecutionDurationMs = sum(rows.map((row) => row.executionDurationMs));
  const frontiers = [];
  for (let k = 1; k <= maximumK; k += 1) {
    const replayRows = rows.map((row) => replayRowAtK(row, k));
    const evaluatedCandidateCount = sum(replayRows.map((row) => row.evaluatedCandidateCount));
    const executionDurationMs = sum(replayRows.map((row) => row.executionDurationMs));
    const changedRows = replayRows.filter((row) => row.frontierWinner !== row.fullWinner);
    frontiers.push({
      k,
      promptCount: replayRows.length,
      evaluatedCandidateCount,
      candidateReductionCount: fullCandidateCount - evaluatedCandidateCount,
      candidateReductionRate: ratio(fullCandidateCount - evaluatedCandidateCount, fullCandidateCount),
      estimatedExecutionDurationMs: round(executionDurationMs),
      estimatedDurationSavingsMs: round(fullExecutionDurationMs - executionDurationMs),
      estimatedDurationSavingsRate: ratio(fullExecutionDurationMs - executionDurationMs, fullExecutionDurationMs),
      fullWinnerRetentionCount: replayRows.length - changedRows.length,
      fullWinnerRetentionRate: ratio(replayRows.length - changedRows.length, replayRows.length),
      changedPromptCount: changedRows.length,
      changedPrompts: changedRows.map((row) => ({
        prompt: row.prompt,
        fullWinner: row.fullWinner,
        frontierWinner: row.frontierWinner,
        fullWinnerInputOrder: row.fullWinnerInputOrder,
        selectionMode: row.selectionMode,
      })),
    });
  }
  return {
    schema: 'simulatte.rerankerFrontierBenchmark.v1',
    source: {
      path: String(options.sourcePath || ''),
      sha256: String(options.sourceSha256 || ''),
      reportSchema: String(report.schema || ''),
      reportCreatedAt: String(report.createdAt || ''),
      intentMode: String(report.intentMode || ''),
    },
    model: modelIdentity(rows),
    promptCount: rows.length,
    fullCandidateCount,
    fullExecutionDurationMs: round(fullExecutionDurationMs),
    selectionModes: countBy(rows, (row) => row.selectionMode),
    frontiers,
    promotionEligible: false,
    promotionBlockers: [
      'winner retention compares against the observed full-K model winner, not labeled semantic relevance',
      'replay does not recompile Phases 4 through 8 or compare visible obligation coverage',
    ],
    rows: rows.map((row) => ({
      prompt: row.prompt,
      modelId: row.modelId,
      candidateCount: row.candidates.length,
      selectionMode: row.selectionMode,
      candidateBudgetPolicy: row.candidateBudgetPolicy,
      fullWinner: row.fullWinner,
      fullWinnerInputOrder: row.fullWinnerInputOrder,
      executionDurationMs: round(row.executionDurationMs),
      candidates: row.candidates,
    })),
  };
}

function frontierSourceRow(result) {
  const receipt = result && result.modelExecutionReceipt;
  const phase3 = receipt && receipt.phase3Rerank;
  if (!phase3 || phase3.modelReady !== true) return null;
  const inputs = Array.isArray(phase3.candidateInputs) ? phase3.candidateInputs : [];
  const outputs = Array.isArray(phase3.candidateOutputs) ? phase3.candidateOutputs : [];
  if (!inputs.length || inputs.length !== outputs.length) {
    throw new Error(`Phase 3 reranker receipt for "${result.prompt || ''}" has mismatched inputs and outputs`);
  }
  const outputById = new Map(outputs.map((row) => [String(row.primitiveId || ''), row]));
  if (outputById.size !== outputs.length || outputById.has('')) {
    throw new Error(`Phase 3 reranker receipt for "${result.prompt || ''}" has duplicate or missing output IDs`);
  }
  const candidates = inputs.map((input, inputOrder) => {
    const primitiveId = String(input.primitiveId || '');
    const output = outputById.get(primitiveId);
    if (!primitiveId || !output) {
      throw new Error(`Phase 3 reranker receipt for "${result.prompt || ''}" cannot join input ${inputOrder}`);
    }
    const executionDurationMs = finiteNonnegative(output.executionDurationMs, 'candidate execution duration');
    return {
      primitiveId,
      inputOrder,
      modelRank: finiteNonnegativeInteger(output.rank, 'candidate model rank'),
      modelScore: finiteNumber(output.score, 'candidate model score'),
      localScore: finiteNumber(input.localScore, 'candidate local score'),
      executionDurationMs,
    };
  });
  const ranked = [...candidates].sort(candidateRankOrder);
  const fullWinner = ranked[0];
  return {
    prompt: String(result.prompt || ''),
    modelId: String(receipt.rerankerModelId || phase3.model || ''),
    modelHash: String(receipt.rerankerModelHash || ''),
    runtimeLockNumber: Number(receipt.modelRuntimeLock && receipt.modelRuntimeLock.number || 0),
    selectionMode: String(phase3.candidateSelectionMode || ''),
    candidateBudgetPolicy: String(phase3.candidateBudgetPolicy || ''),
    candidates,
    fullWinner: fullWinner.primitiveId,
    fullWinnerInputOrder: fullWinner.inputOrder,
    executionDurationMs: sum(candidates.map((row) => row.executionDurationMs)),
  };
}

function replayRowAtK(row, k) {
  const evaluated = row.candidates.filter((candidate) => candidate.inputOrder < k);
  const winner = [...evaluated].sort(candidateRankOrder)[0];
  return {
    prompt: row.prompt,
    selectionMode: row.selectionMode,
    fullWinner: row.fullWinner,
    fullWinnerInputOrder: row.fullWinnerInputOrder,
    frontierWinner: winner.primitiveId,
    evaluatedCandidateCount: evaluated.length,
    executionDurationMs: sum(evaluated.map((candidate) => candidate.executionDurationMs)),
  };
}

function candidateRankOrder(a, b) {
  return a.modelRank - b.modelRank
    || b.modelScore - a.modelScore
    || a.primitiveId.localeCompare(b.primitiveId);
}

function modelIdentity(rows) {
  const identities = new Map(rows.map((row) => [
    `${row.modelId}:${row.modelHash}:${row.runtimeLockNumber}`,
    {
      id: row.modelId,
      manifestHash: row.modelHash,
      runtimeLockNumber: row.runtimeLockNumber,
    },
  ]));
  if (identities.size !== 1) throw new Error('reranker frontier requires one compatible model identity');
  return identities.values().next().value;
}

function countBy(rows, keyForRow) {
  const counts = new Map();
  for (const row of rows) {
    const key = String(keyForRow(row) || 'missing');
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function finiteNonnegative(value, label) {
  const number = finiteNumber(value, label);
  if (number < 0) throw new Error(`${label} must be nonnegative`);
  return number;
}

function finiteNonnegativeInteger(value, label) {
  const number = finiteNonnegative(value, label);
  if (!Number.isInteger(number)) throw new Error(`${label} must be an integer`);
  return number;
}

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite`);
  return number;
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function round(value) {
  return Number(Number(value || 0).toFixed(3));
}

function ratio(numerator, denominator) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(6)) : 0;
}

function parseArguments(argv) {
  const options = { report: '', out: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!['--report', '--out'].includes(key)) throw new Error(`unknown argument: ${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${key} requires a value`);
    options[key.slice(2)] = value;
    index += 1;
  }
  if (!options.report) throw new Error('--report is required');
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const sourcePath = path.resolve(options.report);
  const sourceBytes = fs.readFileSync(sourcePath);
  const report = JSON.parse(sourceBytes.toString('utf8'));
  const benchmark = benchmarkRerankerFrontier(report, {
    sourcePath: path.relative(process.cwd(), sourcePath),
    sourceSha256: crypto.createHash('sha256').update(sourceBytes).digest('hex'),
  });
  const serialized = `${JSON.stringify(benchmark, null, 2)}\n`;
  if (options.out) {
    const outputPath = path.resolve(options.out);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, serialized);
  }
  process.stdout.write(serialized);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}
