#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const defaultReport = path.join(root, 'artifacts/live-visual-eval/report.json');
const reportPath = path.resolve(process.argv[2] || defaultReport);

if (!fs.existsSync(reportPath)) {
  console.error(`Missing live visual eval report: ${path.relative(root, reportPath)}`);
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const summary = report.summary || {};
const rating = summary.autoRating || {};
const rubric = summary.visualRubric || {};
const results = Array.isArray(report.results) ? report.results : [];
const failingResults = results.filter((result) => {
  const row = result.visualRubric || {};
  const hasRepresentation = Object.hasOwn(row, 'representationQuality');
  return !row.pass || !row.dynamic || (hasRepresentation && Number(row.representationQuality || 0) < 0.5) ||
    (row.missingSignals || []).length > 0;
});

console.log(`score=${rating.score ?? 'n/a'} grade=${rating.grade || 'n/a'} verdict=${rating.verdict || 'n/a'}`);
console.log(`prompts=${rating.promptCount ?? results.length} passRate=${rating.passRate ?? 'n/a'} sceneDiversity=${rating.sceneDiversity ?? 'n/a'} canvasDiversity=${rating.canvasDiversity ?? 'n/a'}`);
console.log(`failures=${rating.failureCount ?? (summary.failures || []).length} dynamicFailures=${rating.dynamicFailureCount ?? (rubric.dynamicFailures || []).length} representationFailures=${rating.representationFailureCount ?? (rubric.representationFailures || []).length}`);
console.log(`missingSignals=${(rating.missingSignals || rubric.missingSignals || []).join(',') || 'none'}`);
console.log(`report=${path.relative(root, reportPath)}`);

if (failingResults.length) {
  console.log('failingPrompts:');
  for (const result of failingResults) {
    const row = result.visualRubric || {};
    const screenshot = result.screenshot || '';
    const canvas = result.canvasScreenshot || '';
    const late = result.canvasScreenshotLater || '';
    console.log(`- #${result.index} ${result.kind || 'prompt'} score=${row.score ?? 'n/a'} dynamic=${Boolean(row.dynamic)} representation=${row.representationQuality ?? 'n/a'} missing=${(row.missingSignals || []).join(',') || 'none'}`);
    console.log(`  prompt=${result.prompt}`);
    if (screenshot) console.log(`  screenshot=${path.relative(root, screenshot)}`);
    if (canvas) console.log(`  canvas=${path.relative(root, canvas)}`);
    if (late) console.log(`  canvasLate=${path.relative(root, late)}`);
  }
} else {
  console.log('failingPrompts=none');
}

if ((summary.failures || []).length) {
  console.log('failureMessages:');
  for (const failure of summary.failures) console.log(`- ${failure}`);
}
