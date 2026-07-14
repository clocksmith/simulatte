#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateGoldVisualResults,
  loadGoldAdjudication,
  loadGoldSet,
} from './gold-visual-evaluator.mjs';

const DEFAULT_REPORT = 'artifacts/samer-gold-visual/report.json';
const DEFAULT_GOLD_SET = 'tools/samer/simulatte-public-gold-v1.json';
const DEFAULT_ADJUDICATION = 'artifacts/samer-gold-visual/adjudication.json';

export function verifyGoldCanvasArtifacts(results, reportDirectory) {
  const failures = [];
  let verifiedCount = 0;
  for (const result of results || []) {
    const rowId = String(result.goldRowId || '(missing gold row)');
    const fileName = String(result.canvasScreenshot || '');
    const relative = path.normalize(fileName);
    if (!fileName || path.isAbsolute(relative) || relative.startsWith(`..${path.sep}`) || relative === '..') {
      failures.push(`${rowId}: invalid canvas screenshot path`);
      continue;
    }
    const file = path.resolve(reportDirectory, relative);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      failures.push(`${rowId}: canvas screenshot is missing: ${fileName}`);
      continue;
    }
    const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    if (digest !== result.canvasScreenshotHash) {
      failures.push(`${rowId}: canvas bytes do not match report hash`);
      continue;
    }
    verifiedCount += 1;
  }
  return { verifiedCount, failures };
}

export function verifyGoldAdjudication({ reportFile, goldSetFile, adjudicationFile }) {
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  if (!Array.isArray(report.results)) throw new Error(`Report ${reportFile} has no results array`);
  const artifacts = verifyGoldCanvasArtifacts(report.results, path.dirname(reportFile));
  const evaluation = evaluateGoldVisualResults(
    report.results,
    loadGoldSet(goldSetFile),
    loadGoldAdjudication(adjudicationFile)
  );
  return {
    schema: 'simulatte.goldAdjudicationVerification.v1',
    reportFile,
    goldSetFile,
    adjudicationFile,
    artifactCount: artifacts.verifiedCount,
    artifactFailures: artifacts.failures,
    machinePassCount: evaluation.machinePassCount,
    humanPassCount: evaluation.humanPassCount,
    promptCount: evaluation.promptCount,
    pass: artifacts.failures.length === 0 && evaluation.pass,
    evaluation,
  };
}

function parseOptions(argv) {
  const options = {
    reportFile: path.resolve(DEFAULT_REPORT),
    goldSetFile: path.resolve(DEFAULT_GOLD_SET),
    adjudicationFile: path.resolve(DEFAULT_ADJUDICATION),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--report') options.reportFile = path.resolve(argv[++index] || '');
    else if (key === '--gold-set') options.goldSetFile = path.resolve(argv[++index] || '');
    else if (key === '--adjudication') options.adjudicationFile = path.resolve(argv[++index] || '');
    else if (key === '--help') {
      console.log('usage: node tools/samer/verify-gold-adjudication.mjs [--report PATH] [--gold-set PATH] [--adjudication PATH]');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${key}`);
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const verification = verifyGoldAdjudication(parseOptions(process.argv.slice(2)));
    console.log(JSON.stringify(verification, null, 2));
    if (!verification.pass) process.exitCode = 1;
  } catch (error) {
    console.error(error && error.stack || error);
    process.exitCode = 1;
  }
}
