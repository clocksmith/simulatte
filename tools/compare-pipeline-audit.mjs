#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const auditDir = path.join(root, 'artifacts', 'simulatte-pipeline-audit');
const canonicalDir = path.join(auditDir, 'live-score');
const currentPath = path.resolve(process.argv[2] || path.join(canonicalDir, 'latest.json'));
const baselinePath = path.resolve(process.argv[3] || path.join(canonicalDir, 'baseline.json'));

if (!fs.existsSync(currentPath)) {
  console.error(`Missing current pipeline report: ${path.relative(root, currentPath)}`);
  process.exit(1);
}
if (!fs.existsSync(baselinePath)) {
  console.error(`Missing pipeline baseline: ${path.relative(root, baselinePath)}`);
  process.exit(1);
}

const current = JSON.parse(fs.readFileSync(currentPath, 'utf8'));
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const currentIdentity = current.artifactIdentity || {};
const baselineIdentity = baseline.artifactIdentity || {};
if (currentIdentity.canonical !== true || baselineIdentity.canonical !== true) {
  console.error('Pipeline audit comparison requires canonical model-live artifacts.');
  process.exit(1);
}
if (!currentIdentity.compareGroup || currentIdentity.compareGroup !== baselineIdentity.compareGroup) {
  console.error(`Pipeline audit compare-group mismatch: current=${currentIdentity.compareGroup || 'missing'} baseline=${baselineIdentity.compareGroup || 'missing'}`);
  process.exit(1);
}
const phaseIds = unique([
  ...Object.keys(baseline.phaseScores || {}),
  ...Object.keys(current.phaseScores || {}),
]);
const phaseDeltas = Object.fromEntries(phaseIds.map((id) => [
  id,
  delta(current.phaseScores && current.phaseScores[id], baseline.phaseScores && baseline.phaseScores[id]),
]));
const pipelineDelta = delta(current.pipelineScore, baseline.pipelineScore);
const regressionFloor = Number(process.env.SIMULATTE_PIPELINE_REGRESSION_FLOOR || 2);
const regressions = phaseIds.filter((id) => phaseDeltas[id] <= -regressionFloor);
const improvements = phaseIds.filter((id) => phaseDeltas[id] > 0);
const drift = phaseIds.filter((id) => phaseDeltas[id] < 0 && phaseDeltas[id] > -regressionFloor);

console.log(`pipeline=${current.pipelineScore} baseline=${baseline.pipelineScore} delta=${formatDelta(pipelineDelta)}`);
console.log(`verdict=${current.verdict || 'n/a'} weakest=${current.weakestPhase || 'n/a'}`);
console.log(`phaseDeltas=${phaseIds.map((id) => `${id}:${formatDelta(phaseDeltas[id])}`).join(' ')}`);
console.log(`improvements=${improvements.join(',') || 'none'}`);
console.log(`regressions=${regressions.join(',') || 'none'}`);
console.log(`minorDrift=${drift.join(',') || 'none'} threshold=${regressionFloor}`);
console.log(`belowFloor=${(current.belowFloor || []).join(',') || 'none'}`);

if (pipelineDelta <= -regressionFloor || regressions.length) process.exitCode = 1;

function delta(currentValue, baselineValue) {
  return Number((Number(currentValue || 0) - Number(baselineValue || 0)).toFixed(1));
}

function formatDelta(value) {
  const rounded = Number(value || 0).toFixed(1);
  return Number(value || 0) >= 0 ? `+${rounded}` : rounded;
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}
