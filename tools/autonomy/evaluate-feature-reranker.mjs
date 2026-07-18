#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { writeImmutableGeneratedArtifact } from './immutable-generated-artifact.mjs';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIR, '../..');
const require = createRequire(import.meta.url);
const missionApi = require('../../public/mission/mission-compiler.js');
const worldApi = require('../../public/world/world-model.js');
const routePlanner = require('../../public/world/route-planner.js');
const featureRetrieval = require('../../public/runtime/feature-retrieval.js');
const OUTPUT = path.join(ROOT, 'public/data/autonomy/evidence/feature-reranker-public-diagnostic-v2.json');

function main() {
  const files = {
    world: 'public/data/autonomy/worlds/nyc-core-autonomy-v1.json',
    featureCatalog: 'public/data/autonomy/feature-cards-v1.json',
    embodiment: 'public/data/autonomy/embodiments/delivery-bike-v1.json',
    policy: 'public/data/autonomy/policies/bet-selector-v1.json',
    corpus: 'tools/samer/autonomy/public-navigation-missions-v2.json',
    runtime: 'public/runtime/feature-retrieval.js',
  };
  const world = readJson(files.world);
  const featureCatalog = readJson(files.featureCatalog);
  const embodiment = readJson(files.embodiment);
  const policy = readJson(files.policy);
  const corpus = readJson(files.corpus);
  const judgments = corpus.missions.flatMap((row) => evaluateMission({ row, world, featureCatalog, embodiment, policy }));
  const control = metrics(judgments, 'controlRank');
  const challenger = metrics(judgments, 'challengerRank');
  const accepted = challenger.meanReciprocalRank > control.meanReciprocalRank
    && challenger.recallAt5 >= control.recallAt5;
  const receipt = {
    schema: 'simulatte.autonomyRerankerEvaluation.v1',
    id: 'feature-reranker-public-diagnostic-v2',
    contentVersion: 'feature-reranker-public-diagnostic-2026-07-18',
    population: { id: corpus.id, kind: corpus.population, promotionEligible: false, rowCount: corpus.missions.length },
    intervention: {
      kind: 'typed_evidence_reranker_weights',
      control: featureCatalog.rerankerPolicy.control,
      challenger: featureCatalog.rerankerPolicy.id,
      weights: featureCatalog.rerankerPolicy.weights,
      frozenMetric: 'mean_reciprocal_rank',
      guardrail: 'recall_at_5_non_regression',
    },
    identities: Object.fromEntries(Object.entries(files).map(([key, file]) => [key, { path: file, sha256: hashFile(file) }])),
    control,
    challenger,
    deltas: {
      meanReciprocalRank: round(challenger.meanReciprocalRank - control.meanReciprocalRank),
      recallAt5: round(challenger.recallAt5 - control.recallAt5),
    },
    accepted,
    judgments,
    claimBoundary: 'This receipt supports retaining the declared deterministic reranker weights on the exposed diagnostic missions. It does not establish model quality, generalization, or promotion eligibility.',
  };
  const status = writeImmutableGeneratedArtifact(OUTPUT, `${JSON.stringify(sortValue(receipt), null, 2)}\n`, receipt.id);
  console.log(`AUTONOMY-RERANKER accepted=${accepted} controlMRR=${control.meanReciprocalRank} challengerMRR=${challenger.meanReciprocalRank} recallAt5=${challenger.recallAt5} status=${status} output=${OUTPUT}`);
  if (!accepted) process.exitCode = 1;
}

function evaluateMission({ row, world, featureCatalog, embodiment, policy }) {
  const worldModel = worldApi.createWorldModel(world);
  const mission = missionApi.compileMission(row.sourceText, world, embodiment);
  const route = routePlanner.planRoute({
    worldModel,
    originNodeId: mission.originNodeId,
    destinationNodeId: mission.destinationNodeId,
    mode: embodiment.mode,
    tick: 0,
    mission,
    policy,
  });
  const state = { tick: 0, currentNodeId: mission.originNodeId, currentSegmentId: null, segmentProgressM: 0, speedMps: 0 };
  const receipt = featureRetrieval.retrieveAndRerankFeatures({ featureCatalog, mission, state, route, worldModel });
  return [
    judgment(row.id, 'route-segment', row.gold.retrieval.routeSegmentCardId, receipt),
    judgment(row.id, 'mission', row.gold.retrieval.missionCardId, receipt),
  ];
}

function judgment(missionId, queryId, relevantCardId, receipt) {
  return {
    missionId,
    queryId,
    relevantCardId,
    controlRank: rankFor(receipt.retrievedRows, queryId, relevantCardId),
    challengerRank: rankFor(receipt.rerankedRows, queryId, relevantCardId),
  };
}

function rankFor(rows, queryId, cardId) {
  const rank = rows.filter((row) => row.matchedQueryIds.includes(queryId)).findIndex((row) => row.cardId === cardId);
  return rank < 0 ? null : rank + 1;
}

function metrics(judgments, key) {
  const reciprocalSum = judgments.reduce((sum, row) => sum + (row[key] ? 1 / row[key] : 0), 0);
  const recalledAt5 = judgments.filter((row) => row[key] && row[key] <= 5).length;
  return {
    judgmentCount: judgments.length,
    meanReciprocalRank: round(reciprocalSum / judgments.length),
    recallAt5: round(recalledAt5 / judgments.length),
  };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex');
}

function round(value) {
  return Number(value.toFixed(6));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error && error.stack || error);
    process.exit(1);
  }
}

export { evaluateMission, judgment, metrics, rankFor };
