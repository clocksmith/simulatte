#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const defaultReport = path.join(root, 'artifacts', 'simulatte-pipeline-audit', 'live-score', 'latest.json');
const reportPath = path.resolve(process.argv[2] || defaultReport);

if (!fs.existsSync(reportPath)) {
  console.error(`Missing pipeline audit report: ${path.relative(root, reportPath)}`);
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const phaseScores = report.phaseScores || {};
const prompts = Array.isArray(report.prompts) ? report.prompts : [];
const belowFloor = report.belowFloor || [];
const identity = report.artifactIdentity || {};
const artifactKind = report.artifactKind || identity.kind || 'unknown';
const compareGroup = report.compareGroup || identity.compareGroup || 'unknown';
const phaseTaxonomyVersion = report.phaseTaxonomyVersion || identity.phaseTaxonomyVersion || 'unknown';
const sourceLiveReport = report.sourceLiveReport || identity.sourceLiveReport || '';
const weakestPrompts = prompts
  .slice()
  .sort((a, b) => Number(a.pipelineScore || 0) - Number(b.pipelineScore || 0))
  .slice(0, 5);

console.log(`artifact=${artifactKind} compareGroup=${compareGroup} phaseTaxonomy=${phaseTaxonomyVersion}`);
console.log(`canonical=${identity.canonical === true ? 'true' : 'false'} sourceLiveReport=${sourceLiveReport || 'none'}`);
console.log(`pipeline=${report.pipelineScore ?? 'n/a'} verdict=${report.verdict || 'n/a'} floor=${report.floor ?? 'n/a'}`);
console.log(`weakest=${report.weakestPhase || 'n/a'} belowFloor=${belowFloor.join(',') || 'none'}`);
console.log(`phases=${Object.entries(phaseScores).map(([id, score]) => `${id}:${score}`).join(' ')}`);
console.log(`prompts=${report.promptCount ?? prompts.length} mode=${report.measurementMode || 'n/a'}`);
console.log(`report=${path.relative(root, report.reportPath || reportPath)}`);

if (weakestPrompts.length) {
  console.log('weakestPrompts:');
  for (const row of weakestPrompts) {
    console.log(`- #${row.index} score=${row.pipelineScore} weakest=${row.weakestPhase} kind=${row.kind}`);
    console.log(`  prompt=${row.prompt}`);
    console.log(`  failures=${(row.failures || []).join('; ') || 'none'}`);
  }
}
