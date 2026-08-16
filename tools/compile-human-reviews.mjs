#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.resolve(process.env.SIMULATTE_REVIEW_DIR || path.join(ROOT, 'artifacts', 'simulatte-human-reviews'));
const REVIEW_LOG = path.join(DATA_DIR, 'reviews.jsonl');
const HEURISTICS_PATH = path.join(DATA_DIR, 'compiled-heuristics.json');
const CANDIDATES_PATH = path.join(DATA_DIR, 'training-candidates.json');
const CALIBRATION_RECEIPT_PATH = path.join(DATA_DIR, 'calibration-receipt.json');

const PHASE_NAMES = Object.freeze({
  1: 'phase-01-runtime',
  2: 'phase-02-language',
  3: 'phase-03-retrieval',
  4: 'phase-04-grounded-intent',
  5: 'phase-05-simulation',
  6: 'phase-06-visual',
  7: 'phase-07-render',
  8: 'phase-08-scene-proof',
});

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function compileReviews(reviews = [], options = {}) {
  const generatedAt = new Date().toISOString();
  const phaseBuckets = {
    '1->2': [],
    '1->3': [],
    '1->4': [],
    '1->5': [],
    '1->6': [],
    '1->7': [],
    '1->8': [],
    final: [],
    unknown: [],
  };

  const statusCounts = { pass: 0, fail: 0, critique: 0, other: 0 };
  const failingPrompts = new Map();
  const keywordFrequency = new Map();
  const phaseHeuristics = {};

  for (let phase = 1; phase <= 8; phase++) {
    phaseHeuristics[`phase-0${phase}`] = {
      phaseNumber: phase,
      phaseName: PHASE_NAMES[phase],
      critiqueCount: 0,
      commonFailures: [],
      suggestedRules: [],
    };
  }

  for (const review of reviews) {
    const status = String(review.status || 'critique').toLowerCase();
    if (status === 'pass') statusCounts.pass += 1;
    else if (status === 'fail') statusCounts.fail += 1;
    else if (status === 'critique') statusCounts.critique += 1;
    else statusCounts.other += 1;

    const phaseTo = review.phaseTo ? `1->${review.phaseTo}` : (review.phaseLabel || 'unknown');
    if (phaseBuckets[phaseTo]) {
      phaseBuckets[phaseTo].push(review);
    } else {
      phaseBuckets.unknown.push(review);
    }

    if (review.phaseTo && phaseHeuristics[`phase-0${review.phaseTo}`]) {
      phaseHeuristics[`phase-0${review.phaseTo}`].critiqueCount += 1;
    }

    const prompt = String(review.prompt || '').trim();
    const feedback = String(review.feedback || review.note || '').trim();

    if (status !== 'pass' && prompt) {
      const existing = failingPrompts.get(prompt) || { prompt, count: 0, phases: new Set(), feedback: [] };
      existing.count += 1;
      if (review.phaseTo) existing.phases.add(`1->${review.phaseTo}`);
      if (feedback) existing.feedback.push(feedback);
      failingPrompts.set(prompt, existing);
    }

    if (feedback) {
      const tokens = feedback.toLowerCase().split(/[^a-z0-9_-]+/).filter((t) => t.length > 3);
      for (const token of tokens) {
        keywordFrequency.set(token, (keywordFrequency.get(token) || 0) + 1);
      }
    }
  }

  // Compile Phase Heuristics & Actionable Guidance
  for (let phase = 1; phase <= 8; phase++) {
    const key = `phase-0${phase}`;
    const pReviews = phaseBuckets[`1->${phase}`] || [];
    const feedbackItems = pReviews.map((r) => r.feedback || r.note).filter(Boolean);

    if (phase === 2) {
      phaseHeuristics[key].suggestedRules = [
        'Enforce explicit token bounds on clause negation and spatial modifier attachment.',
        'Strictly validate numeric quantity extraction before intent graph lowering.',
      ];
    } else if (phase === 3) {
      phaseHeuristics[key].suggestedRules = [
        'Boost lexical keyword matching weight when dense cosine similarity drops below 0.65.',
        'Index multi-word domain entity synonyms into semantic RAG cache.',
      ];
    } else if (phase === 4) {
      phaseHeuristics[key].suggestedRules = [
        'Flag unsupported spatial obligations as explicit approximations instead of dropping nodes.',
        'Preserve causal dependency edges across multi-clause intent sequences.',
      ];
    } else if (phase === 5) {
      phaseHeuristics[key].suggestedRules = [
        'Ensure solver ODE step size clamps to minimum 1/120s under high agent velocity.',
        'Validate constraint satisfaction boundaries at terminal simulation state.',
      ];
    } else if (phase === 6) {
      phaseHeuristics[key].suggestedRules = [
        'Enforce bounding-box spatial non-intersection for procedural instance layout.',
        'Check camera frustum coverage across primary subject trajectory.',
      ];
    } else if (phase === 7) {
      phaseHeuristics[key].suggestedRules = [
        'Verify WebGPU uniform buffer alignment (256-byte stride compliance).',
        'Check depth buffer write-mask state across layered semi-transparent geometry.',
      ];
    } else if (phase === 8) {
      phaseHeuristics[key].suggestedRules = [
        'Generate deterministic WorldProof receipt with explicit obligation settlement table.',
        'Record exact frame readback hashes for regression verification.',
      ];
    }

    phaseHeuristics[key].commonFailures = feedbackItems.slice(0, 10);
  }

  // Training Candidates
  const trainingCandidates = Array.from(failingPrompts.values()).map((row) => ({
    prompt: row.prompt,
    failureCount: row.count,
    failedPhases: Array.from(row.phases),
    recordedCritiques: row.feedback.slice(0, 5),
    targetSuitability: row.count >= 2 ? 'high-priority-calibration' : 'exploratory-candidate',
  }));

  // Top Keywords
  const topKeywords = Array.from(keywordFrequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([keyword, count]) => ({ keyword, count }));

  const heuristics = {
    schema: 'simulatte.compiledHumanCritiqueHeuristics.v1',
    generatedAt,
    reviewCount: reviews.length,
    statusSummary: statusCounts,
    topKeywords,
    phaseHeuristics,
  };

  const candidatePayload = {
    schema: 'simulatte.compiledTrainingCandidates.v1',
    generatedAt,
    candidateCount: trainingCandidates.length,
    candidates: trainingCandidates,
  };

  const receipt = {
    schema: 'simulatte.calibrationReceipt.v1',
    generatedAt,
    sourceReviewsSha256: sha256(JSON.stringify(reviews)),
    reviewCount: reviews.length,
    passCount: statusCounts.pass,
    critiqueCount: statusCounts.critique + statusCounts.fail,
    candidatesCompiled: trainingCandidates.length,
    heuristicsCompiled: Object.keys(phaseHeuristics).length,
  };

  return {
    heuristics,
    candidates: candidatePayload,
    receipt,
  };
}

export async function runAutoCompilation(options = {}) {
  const dataDir = options.dataDir || DATA_DIR;
  await mkdir(dataDir, { recursive: true });
  const reviewFile = options.reviewFile || REVIEW_LOG;

  let raw = '';
  try {
    raw = await readFile(reviewFile, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      raw = '';
    } else {
      throw error;
    }
  }

  const reviews = raw
    .split(/\n+/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const compiled = compileReviews(reviews, options);

  const heuristicsFile = options.heuristicsFile || HEURISTICS_PATH;
  const candidatesFile = options.candidatesFile || CANDIDATES_PATH;
  const receiptFile = options.receiptFile || CALIBRATION_RECEIPT_PATH;

  await writeFile(heuristicsFile, `${JSON.stringify(compiled.heuristics, null, 2)}\n`, 'utf8');
  await writeFile(candidatesFile, `${JSON.stringify(compiled.candidates, null, 2)}\n`, 'utf8');
  await writeFile(receiptFile, `${JSON.stringify(compiled.receipt, null, 2)}\n`, 'utf8');

  return {
    reviewCount: reviews.length,
    heuristicsFile,
    candidatesFile,
    receiptFile,
    receipt: compiled.receipt,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runAutoCompilation()
    .then((result) => {
      console.log(`Auto-compiled ${result.reviewCount} human reviews successfully.`);
      console.log(`- Heuristics: ${result.heuristicsFile}`);
      console.log(`- Candidates: ${result.candidatesFile}`);
      console.log(`- Receipt: ${result.receiptFile}`);
    })
    .catch((error) => {
      console.error('Auto-compilation failed:', error);
      process.exit(1);
    });
}
