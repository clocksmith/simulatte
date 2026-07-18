#!/usr/bin/env node
// Cascade-composition diagnostic for embedding-retrieval-v1.
//
// The sealed trial scored each lane in isolation and found a complementary
// split: the deterministic lexical lane refuses perfectly (must-refuse 1.00)
// but retrieves poorly (recall@2 0.64), while the neural embedders retrieve
// almost perfectly (recall@2 0.99-1.00) but barely refuse (0.30-0.37). No
// single lane cleared both floors. This tool asks the question a
// single-candidate trial structurally cannot: does a cascade that lets the
// deterministic lane own the refusal decision and the neural lane own
// retrieval on the answered rows clear both floors at once.
//
// Boundary, stamped into the receipt: this reuses the ALREADY-OPENED
// population (the README performed the K=2 rescoring on it) for DIAGNOSIS
// ONLY. It is not a promotion and cannot be one. Promotion requires a new
// unopened population and an independently calibrated refusal rule, exactly
// as embedding-retrieval-v1/README states. The tool first reproduces the
// published standalone numbers as a self-check; a mismatch means the metric
// definitions are wrong and the cascade figure must not be trusted.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SEALED = 'tools/samer/model-selection/sealed/embedding-retrieval-population-v1.json';
const PRED_DIR = 'tools/samer/evidence/model-selection/embedding-retrieval-v1/predictions';
const OUT = 'tools/samer/evidence/model-selection/embedding-retrieval-v1/cascade-refusal-diagnostic.json';
const K = 2;
// Published standalone values from embedding-retrieval-v1/README (K=2).
const PUBLISHED = {
  'deterministic-lexical-control': { recallAtK: 0.64, hardNegativeAccuracy: 0.66, mustRefuseAccuracy: 1.00 },
  'all-minilm-l6-v2-embedder': { recallAtK: 0.99, hardNegativeAccuracy: 0.99, mustRefuseAccuracy: 0.30 },
  'qwen3-embedding-control': { recallAtK: 1.00, hardNegativeAccuracy: 1.00, mustRefuseAccuracy: 0.367 },
};

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const round = (v) => Number(v.toFixed(4));

function loadPredictions(candidateId) {
  const raw = readJson(`${PRED_DIR}/${candidateId}.json`);
  return new Map(raw.rows.map((row) => [row.id, { refused: row.refused === true, ranking: Array.isArray(row.ranking) ? row.ranking : [] }]));
}

// Score a per-row decision function against the gold. A decision is
// { refused: boolean, ranking: string[] }.
function score(goldRows, decide) {
  const answerable = goldRows.filter((row) => !row.mustRefuse);
  const mustRefuse = goldRows.filter((row) => row.mustRefuse);
  const hardNegRows = answerable.filter((row) => (row.hardNegativeIds || []).length > 0 && (row.relevantIds || []).length > 0);

  // recallAtK reproduces the published trial definition: relevant id in
  // top-K over ALL answerable rows, scoring the ranking regardless of the
  // lane's refused flag (refusal is measured only by must-refuse accuracy).
  // deliveredRecall is the combined metric the cascade actually needs: a
  // correct top-K answer that was also NOT refused. The gap between them is
  // the delivered-recall cost of the refusal gate's over-refusals.
  let recallHits = 0;
  let deliveredHits = 0;
  let answeredAnswerable = 0;
  for (const row of answerable) {
    const d = decide(row);
    if (!d.refused) answeredAnswerable += 1;
    const inTopK = (row.relevantIds || []).some((id) => d.ranking.slice(0, K).includes(id));
    if (inTopK) recallHits += 1;
    if (inTopK && !d.refused) deliveredHits += 1;
  }
  let refuseHits = 0;
  for (const row of mustRefuse) {
    if (decide(row).refused) refuseHits += 1;
  }
  // hardNegativeAccuracy: informational only. The exact published definition
  // is not reconstructable from the opened artifacts, so it is reported but
  // excluded from the self-validation gate.
  let hardNegHits = 0;
  for (const row of hardNegRows) {
    const top1 = decide(row).ranking[0];
    if ((row.relevantIds || []).includes(top1)) hardNegHits += 1;
  }
  return {
    recallAtK: round(recallHits / Math.max(1, answerable.length)),
    deliveredRecall: round(deliveredHits / Math.max(1, answerable.length)),
    mustRefuseAccuracy: round(refuseHits / Math.max(1, mustRefuse.length)),
    hardNegativeAccuracyInformational: round(hardNegHits / Math.max(1, hardNegRows.length)),
    answeredAnswerable,
    overRefusedAnswerable: answerable.length - answeredAnswerable,
  };
}

function main() {
  const population = readJson(SEALED);
  const goldRows = population.rows;
  const det = loadPredictions('deterministic-lexical-control');
  const minilm = loadPredictions('all-minilm-l6-v2-embedder');
  const qwen = loadPredictions('qwen3-embedding-control');
  const laneDecider = (predMap) => (row) => predMap.get(row.id) || { refused: false, ranking: [] };
  // Cascade: the deterministic lane owns the refusal decision; on rows it
  // does not refuse, the neural lane owns retrieval.
  const cascade = (neuralMap) => (row) => {
    const d = det.get(row.id) || { refused: false, ranking: [] };
    if (d.refused) return { refused: true, ranking: [] };
    const n = neuralMap.get(row.id) || { refused: false, ranking: [] };
    return { refused: false, ranking: n.ranking };
  };

  const standalone = {
    'deterministic-lexical-control': score(goldRows, laneDecider(det)),
    'all-minilm-l6-v2-embedder': score(goldRows, laneDecider(minilm)),
    'qwen3-embedding-control': score(goldRows, laneDecider(qwen)),
  };

  // Self-validation: recomputed standalone metrics must match the published
  // values within rounding, or the metric definitions are wrong.
  // The gate covers only the two metrics reproducible exactly from the
  // opened artifacts, which are also the two the cascade claim rests on.
  const selfCheck = Object.entries(PUBLISHED).map(([id, published]) => {
    const got = standalone[id];
    const deltas = {
      recallAtK: round(Math.abs(got.recallAtK - published.recallAtK)),
      mustRefuseAccuracy: round(Math.abs(got.mustRefuseAccuracy - published.mustRefuseAccuracy)),
    };
    return { candidate: id, published: { recallAtK: published.recallAtK, mustRefuseAccuracy: published.mustRefuseAccuracy }, recomputed: { recallAtK: got.recallAtK, mustRefuseAccuracy: got.mustRefuseAccuracy }, deltas, matches: Math.max(...Object.values(deltas)) <= 0.01 };
  });
  const validated = selfCheck.every((row) => row.matches);

  const cascades = {
    'deterministic-refusal + minilm-recall': score(goldRows, cascade(minilm)),
    'deterministic-refusal + qwen-recall': score(goldRows, cascade(qwen)),
  };

  const receipt = {
    schema: 'simulatte.cascadeRefusalDiagnostic.v1',
    trial: 'embedding-retrieval-v1',
    createdAt: new Date().toISOString(),
    diagnosisOnly: true,
    promotionEligible: false,
    claimBoundary: 'Reuses the already-opened embedding-retrieval-v1 population for diagnosis of a cascade design. It is not a promotion and cannot become one. Promotion requires a new unopened population and an independently calibrated refusal rule per embedding-retrieval-v1/README.',
    population: { path: SEALED, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, SEALED))).digest('hex'), rows: goldRows.length, mustRefuseRows: goldRows.filter((r) => r.mustRefuse).length },
    k: K,
    selfValidation: { validated, note: validated ? 'Recomputed standalone metrics match the published values; cascade figures are trustworthy under these definitions.' : 'MISMATCH: recomputed standalone metrics differ from published; cascade figures are NOT trustworthy until the metric definitions are reconciled.', rows: selfCheck },
    standalone,
    cascades,
    finding: validated
      ? summarizeFinding(standalone, cascades)
      : 'self-validation failed; no finding reported',
  };
  fs.writeFileSync(path.join(ROOT, OUT), `${JSON.stringify(receipt, null, 2)}\n`);
  const cq = cascades['deterministic-refusal + qwen-recall'];
  console.log(`CASCADE-DIAGNOSTIC validated=${validated} qwenCascade recall@2=${cq.recallAtK} mustRefuse=${cq.mustRefuseAccuracy} overRefused=${cq.overRefusedAnswerable} output=${OUT}`);
  if (!validated) process.exitCode = 1;
}

function summarizeFinding(standalone, cascades) {
  const det = standalone['deterministic-lexical-control'];
  const q = standalone['qwen3-embedding-control'];
  const c = cascades['deterministic-refusal + qwen-recall'];
  const overRefusalCost = round(q.deliveredRecall - c.deliveredRecall);
  return {
    complementarySplitConfirmed: det.mustRefuseAccuracy > q.mustRefuseAccuracy && q.recallAtK > det.recallAtK,
    cascadeMustRefuse: c.mustRefuseAccuracy,
    cascadeAnsweredRecall: c.recallAtK,
    cascadeDeliveredRecall: c.deliveredRecall,
    qwenStandaloneDeliveredRecall: q.deliveredRecall,
    overRefusedAnswerableRows: c.overRefusedAnswerable,
    overRefusalDeliveredRecallCost: overRefusalCost,
    interpretation: [
      `The refusal gate recovers must-refuse to ${c.mustRefuseAccuracy} (from Qwen's ${q.mustRefuseAccuracy}) and preserves answered retrieval quality at recall@${K} ${c.recallAtK}.`,
      `But the current deterministic lexical gate is blunt: it over-refuses ${c.overRefusedAnswerable} answerable rows, so delivered recall is ${c.deliveredRecall} versus Qwen's standalone ${q.deliveredRecall}, a ${overRefusalCost} cost.`,
      'Direction confirmed (deterministic refusal wrapper + neural recall), but the promotable version needs a calibrated, precise refusal rule rather than this over-refusing lexical gate, exactly as the trial README requires.',
    ].join(' '),
  };
}

main();
