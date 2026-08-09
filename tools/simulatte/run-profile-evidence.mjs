#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  addressReceipt,
  buildEvidencePlan,
  canonicalJson,
  currentReleaseIdentity,
  currentSourceIdentity,
  expandClaims,
  readJson,
  sha256Bytes,
  sha256File,
  storeReceipt,
  validateReceipt,
} from './profile-evidence-contract.mjs';
import { captureBrowserRun, createEvidenceServer, findChrome } from './profile-evidence-browser.mjs';

const TOOL_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIRECTORY, '../..');
const DEFAULT_OUTPUT = path.join(ROOT, 'artifacts/profile-evidence');
const INVENTORY_PATH = path.join(ROOT, 'public/data/application-profiles/profile-claim-inventory-v1.json');

function parseArgs(argv) {
  const options = {
    capture: false,
    check: false,
    planOnly: false,
    outputDirectory: DEFAULT_OUTPUT,
    chromePath: process.env.CHROME_PATH || '',
    baseUrl: '',
    runIds: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const [key, inlineValue] = argv[index].split('=');
    const value = () => inlineValue ?? argv[++index];
    if (key === '--capture') options.capture = true;
    else if (key === '--check') options.check = true;
    else if (key === '--plan') options.planOnly = true;
    else if (key === '--out') options.outputDirectory = path.resolve(value());
    else if (key === '--chrome') options.chromePath = path.resolve(value());
    else if (key === '--url' || key === '--base-url') options.baseUrl = new URL(value()).toString();
    else if (key === '--run') options.runIds.push(value());
    else if (key === '--help') {
      console.log('usage: node tools/simulatte/run-profile-evidence.mjs --plan | --capture [--check] [--out DIR] [--chrome PATH] [--base-url URL] [--run RUN_ID]');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!options.capture && !options.check && !options.planOnly) options.planOnly = true;
  return options;
}

function worktreeSha256() {
  const diff = execFileSync(
    'git',
    ['diff', '--binary', 'HEAD', '--', '.', ':(exclude)artifacts/**'],
    { cwd: ROOT, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 },
  );
  const rawStatus = execFileSync(
    'git',
    ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.', ':(exclude)artifacts/**'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
  const rows = rawStatus.split('\0').filter(Boolean).filter((row) => {
    const relativePath = row.slice(3).replaceAll('\\', '/');
    return !relativePath.startsWith('artifacts/');
  });
  const hash = crypto.createHash('sha256').update(diff).update(rows.join('\0'));
  for (const row of rows) {
    if (!row.startsWith('?? ')) continue;
    const filePath = path.join(ROOT, row.slice(3));
    if (fs.statSync(filePath).isFile()) hash.update(fs.readFileSync(filePath));
  }
  return hash.digest('hex');
}

function buildIdentity() {
  return {
    buildId: readJson(path.join(ROOT, 'public/version.json')).build,
    commitSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    worktreeSha256: worktreeSha256(),
  };
}

function failedReceipt(run, sourceIdentity, claims, error) {
  return {
    schema: 'simulatte.profileEvidenceReceipt.v1',
    capturedAt: new Date().toISOString(),
    run: {
      id: run.id,
      profileId: run.profileId,
      seedId: run.seedId,
      seed: run.seed,
      viewportId: run.viewport.id,
      interactionPath: run.interactionPath,
      comparisonMode: run.comparisonMode,
    },
    sourceIdentity,
    browser: null,
    runtime: { path: 'unavailable', profileId: run.profileId },
    evidence: {
      controls: [],
      events: [],
      progressiveStates: [],
      comparisons: [],
      settlements: [],
      replay: { attempted: false, beforeSha256: null, afterSha256: null, deterministic: false },
      deployment: { status: 'fail', servedBuildId: null, pageUrl: null, route: null, versionUrl: null },
      interactionCoverage: { expected: run.interactionPath, observed: [], missing: run.interactionPath },
      console: [],
      consoleErrors: [{
        type: 'capture',
        values: [error.code || error.name || 'Error', error.message],
        evidence: error.evidence || null,
      }],
      performance: {
        frameCount: 0,
        elapsedMs: null,
        firstMeaningfulFrame: { status: 'fail', atMs: null, frameCount: 0, contributionCount: 0, semanticLayerCount: 0, compositorReceiptCount: 0 },
        framePacing: { status: 'fail', sampleCount: 0, p50Ms: null, p95Ms: null, maxMs: null, over50MsCount: 0 },
        memory: { status: 'fail', sampleCount: 0, initialUsedJsHeapBytes: null, finalUsedJsHeapBytes: null, peakUsedJsHeapBytes: null, finalTotalJsHeapBytes: null },
      },
      screenshot: null,
      pixelReadback: { status: 'fail' },
      visual: null,
      lifecycle: [],
      reload: { attempted: false, restored: false, reason: 'capture_failed' },
    },
    integrity: { status: 'contradictory', contradictions: ['capture_failed'] },
    claims: claims.map((claim) => ({ id: claim.id, sentence: claim.sentence })),
  };
}

function attemptSourceIdentity(factory) {
  try {
    return { sourceIdentity: factory(), error: null };
  } catch (error) {
    return { sourceIdentity: null, error };
  }
}

function writePlan(outputDirectory, plan, inventory) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const output = {
    ...plan,
    claimInventory: {
      path: path.relative(ROOT, INVENTORY_PATH),
      sha256: sha256File(INVENTORY_PATH),
      schema: inventory.schema,
      contentVersion: inventory.contentVersion,
    },
  };
  fs.writeFileSync(path.join(outputDirectory, 'plan.json'), `${JSON.stringify(output, null, 2)}\n`);
  return output;
}

function prepareCaptureDirectory(outputDirectory) {
  for (const relativePath of ['receipts', 'screenshots']) {
    fs.rmSync(path.join(outputDirectory, relativePath), { recursive: true, force: true });
  }
  for (const relativePath of ['index.json', 'release-freeze.json', 'summary.md']) {
    fs.rmSync(path.join(outputDirectory, relativePath), { force: true });
  }
}

function writeReleaseFreeze(outputDirectory, releaseIdentity) {
  const content = canonicalJson(releaseIdentity);
  fs.writeFileSync(path.join(outputDirectory, 'release-freeze.json'), content);
  return sha256Bytes(content);
}

function relativeArtifactLink(outputDirectory, filePath) {
  return path.relative(outputDirectory, filePath).split(path.sep).join('/');
}

function writeSummary(outputDirectory, report) {
  const status = evidenceReportStatus(report);
  const lines = [
    '# Simulatte profile evidence',
    '',
    `Status: ${status}`,
    '',
    `Captured runs: ${report.passedRuns}/${report.totalRuns} passed`,
    '',
    `Release coverage: ${report.totalRuns}/${report.requiredRuns} runs (${report.coverageComplete ? 'complete' : 'incomplete'})`,
    '',
    'Human visual adjudication: required for every passing run. See [human-review-queue.json](human-review-queue.json).',
    '',
    '| Profile | Passed | Total | Blocking failures |',
    '| --- | ---: | ---: | --- |',
    ...report.profiles.map((row) => `| ${row.profileId} | ${row.passedRuns} | ${row.totalRuns} | ${Object.entries(row.failureCounts).map(([failure, count]) => `${failure} (${count})`).join(', ') || 'none'} |`),
    '',
    '| Profile | Seed | Viewport | Status | Receipt | Failures |',
    '| --- | --- | --- | --- | --- | --- |',
    ...report.runs.map((row) => `| ${row.profileId} | ${row.seedId} | ${row.viewportId} | ${row.pass ? 'pass' : 'fail'} | [${row.receiptSha256.slice(0, 12)}](${row.receiptPath}) | ${row.failures.join(', ') || 'none'} |`),
    '',
  ];
  fs.writeFileSync(path.join(outputDirectory, 'summary.md'), `${lines.join('\n')}\n`);
}

function verifiedVisualAsset(outputDirectory, evidence, kind) {
  if (!evidence) return null;
  const root = path.resolve(outputDirectory);
  const assetPath = path.resolve(root, evidence.path || '');
  if (!assetPath.startsWith(`${root}${path.sep}`)) throw new Error(`profile_evidence_${kind}_path_invalid`);
  if (!fs.existsSync(assetPath)) throw new Error(`profile_evidence_${kind}_missing: ${evidence.path}`);
  if (sha256File(assetPath) !== evidence.sha256) throw new Error(`profile_evidence_${kind}_hash_mismatch: ${evidence.path}`);
  return {
    sha256: evidence.sha256,
    path: evidence.path,
    ...(kind === 'canvas_screenshot' ? {
      kind: evidence.kind,
      sourceBackend: evidence.sourceBackend,
      width: evidence.width ?? null,
      height: evidence.height ?? null,
    } : {}),
  };
}

function writeHumanReviewQueue(outputDirectory, report) {
  const indexPath = path.join(outputDirectory, 'index.json');
  const rows = report.runs.map((row) => {
    const receipt = verifyStoredReceipt(outputDirectory, row);
    const screenshot = receipt.evidence?.screenshot || null;
    const pageScreenshot = receipt.evidence?.pageScreenshot || null;
    const renderEvidence = {
      compositorReceipts: receipt.runtime?.compositorReceipts || [],
      contributionSources: receipt.runtime?.contributionSources || [],
      pixelReadback: receipt.evidence?.pixelReadback || null,
      visual: receipt.evidence?.visual || null,
    };
    return {
      runId: row.runId,
      profileId: row.profileId,
      seedId: row.seedId,
      viewportId: row.viewportId,
      machineStatus: row.pass ? 'ready' : 'blocked',
      receiptSha256: row.receiptSha256,
      receiptPath: row.receiptPath,
      buildIdentity: receipt.sourceIdentity?.build || null,
      deployment: receipt.evidence?.deployment || null,
      canvasScreenshot: verifiedVisualAsset(outputDirectory, screenshot, 'canvas_screenshot'),
      pageScreenshot: verifiedVisualAsset(outputDirectory, pageScreenshot, 'page_screenshot'),
      renderEvidenceSha256: sha256Bytes(canonicalJson(renderEvidence)),
      reviewStatus: row.pass ? 'human-adjudication-required' : 'blocked-on-machine-evidence',
    };
  });
  const queue = {
    schema: 'simulatte.profileEvidenceHumanReviewQueue.v1',
    status: report.capturePass && report.coverageComplete
      ? 'human-adjudication-required'
      : 'machine-evidence-incomplete',
    indexSha256: sha256File(indexPath),
    requiredBindings: [
      'runId',
      'receiptSha256',
      'buildIdentity',
      'deployment',
      'canvasScreenshot.sha256',
      'renderEvidenceSha256',
      'reviewerId',
      'reviewedAt',
      'verdict',
    ],
    requiredVerdicts: ['recognizability', 'truth-boundary-legibility'],
    totalRuns: rows.length,
    pendingRuns: rows.filter((row) => row.reviewStatus === 'human-adjudication-required').length,
    rows,
  };
  fs.writeFileSync(path.join(outputDirectory, 'human-review-queue.json'), canonicalJson(queue));
  return queue;
}

function evidenceReportStatus(report) {
  if (!report.capturePass) return 'fail';
  return report.coverageComplete ? 'pass' : 'partial-pass';
}

function profileClosureMatrix(rows) {
  const profiles = new Map();
  rows.forEach((row) => {
    if (!profiles.has(row.profileId)) {
      profiles.set(row.profileId, {
        profileId: row.profileId,
        totalRuns: 0,
        passedRuns: 0,
        failureCounts: {},
      });
    }
    const profile = profiles.get(row.profileId);
    profile.totalRuns += 1;
    if (row.pass) profile.passedRuns += 1;
    row.failures.forEach((failure) => {
      profile.failureCounts[failure] = (profile.failureCounts[failure] || 0) + 1;
    });
  });
  return [...profiles.values()];
}

function verifyStoredReceipt(outputDirectory, row) {
  const receiptPath = path.join(outputDirectory, row.receiptPath);
  if (!fs.existsSync(receiptPath)) throw new Error(`profile_evidence_receipt_missing: ${row.receiptPath}`);
  const bytes = fs.readFileSync(receiptPath);
  const hash = sha256Bytes(bytes);
  if (hash !== row.receiptSha256) throw new Error(`profile_evidence_receipt_hash_mismatch: ${row.receiptPath}`);
  const receipt = JSON.parse(bytes);
  const addressed = addressReceipt(receipt);
  if (addressed.sha256 !== row.receiptSha256) throw new Error(`profile_evidence_receipt_not_canonical: ${row.receiptPath}`);
  return receipt;
}

function validateIndex({ outputDirectory, plan, claims, identity }) {
  const indexPath = path.join(outputDirectory, 'index.json');
  if (!fs.existsSync(indexPath)) throw new Error(`profile_evidence_index_missing: ${indexPath}`);
  const index = readJson(indexPath);
  const indexFailures = [];
  const planSha256 = sha256Bytes(fs.readFileSync(path.join(outputDirectory, 'plan.json')));
  const freezePath = path.join(outputDirectory, 'release-freeze.json');
  const expectedReleaseIdentitySha256 = sha256Bytes(canonicalJson(currentReleaseIdentity(ROOT, identity)));
  if (index.planSha256 !== planSha256) indexFailures.push('evidence_plan_stale');
  if (index.claimInventorySha256 !== sha256File(INVENTORY_PATH)) indexFailures.push('claim_inventory_stale');
  if (!fs.existsSync(freezePath)) indexFailures.push('release_freeze_missing');
  else if (sha256File(freezePath) !== expectedReleaseIdentitySha256) indexFailures.push('release_freeze_stale');
  if (index.releaseIdentitySha256 !== expectedReleaseIdentitySha256) indexFailures.push('release_freeze_identity_stale');
  if (index.totalRuns !== plan.runs.length) indexFailures.push('run_count_mismatch');
  const rowsById = new Map(index.runs.map((row) => [row.runId, row]));
  const validations = plan.runs.map((run) => {
    const row = rowsById.get(run.id);
    if (!row) return { runId: run.id, pass: false, failures: ['run_receipt_missing'], claimResults: [] };
    try {
      const receipt = verifyStoredReceipt(outputDirectory, row);
      return validateReceipt({
        receipt,
        run,
        sourceIdentity: currentSourceIdentity(ROOT, run, identity),
        claims,
      });
    } catch (error) {
      return { runId: run.id, pass: false, failures: [error.code || error.message], claimResults: [] };
    }
  });
  const extras = index.runs.filter((row) => !plan.runs.some((run) => run.id === row.runId));
  if (extras.length) validations.push({ runId: 'index', pass: false, failures: ['unexpected_run_receipts'], claimResults: [] });
  if (indexFailures.length) validations.push({ runId: 'index-contract', pass: false, failures: indexFailures, claimResults: [] });
  return validations;
}

async function captureAll({ options, plan, claims, identity, releaseIdentitySha256 }) {
  const selectedRuns = options.runIds.length
    ? plan.runs.filter((run) => options.runIds.includes(run.id))
    : plan.runs;
  if (selectedRuns.length !== (options.runIds.length || plan.runs.length)) throw new Error('profile_evidence_run_filter_unknown');
  const chromePath = findChrome(options.chromePath);
  const localServer = options.baseUrl ? null : await createEvidenceServer(path.join(ROOT, 'public'));
  const baseUrl = options.baseUrl || localServer.baseUrl;
  const rows = [];
  try {
    for (const run of selectedRuns) {
      const runClaims = claims.filter((claim) => claim.profileId === run.profileId && claim.seedId === run.seedId);
      const profile = readJson(path.join(ROOT, run.profilePath));
      if (!profile.seeds.some((seed) => seed.id === run.seedId)) throw new Error(`profile_evidence_seed_missing: ${run.profileId}/${run.seedId}`);
      console.log(`PROFILE-EVIDENCE capture profile=${run.profileId} seed=${run.seedId} viewport=${run.viewport.id}`);
      const sourceAttempt = attemptSourceIdentity(() => currentSourceIdentity(ROOT, run, identity));
      if (sourceAttempt.error) {
        const receipt = failedReceipt(run, null, runClaims, sourceAttempt.error);
        const stored = storeReceipt(path.join(options.outputDirectory, 'receipts'), receipt);
        const failures = [sourceAttempt.error.code || sourceAttempt.error.message];
        rows.push({
          runId: run.id,
          profileId: run.profileId,
          seedId: run.seedId,
          viewportId: run.viewport.id,
          receiptSha256: stored.sha256,
          receiptPath: relativeArtifactLink(options.outputDirectory, stored.path),
          pass: false,
          failures,
        });
        console.log(`PROFILE-EVIDENCE result=fail run=${run.id} failures=${failures.join(',')}`);
        continue;
      }
      const { sourceIdentity } = sourceAttempt;
      let receipt;
      try {
        receipt = await captureBrowserRun({
          chromePath,
          baseUrl,
          run,
          sourceIdentity,
          claims: runClaims,
          outputDirectory: options.outputDirectory,
        });
      } catch (error) {
        receipt = failedReceipt(run, sourceIdentity, runClaims, error);
      }
      const stored = storeReceipt(path.join(options.outputDirectory, 'receipts'), receipt);
      const validation = validateReceipt({ receipt, run, sourceIdentity, claims });
      rows.push({
        runId: run.id,
        profileId: run.profileId,
        seedId: run.seedId,
        viewportId: run.viewport.id,
        receiptSha256: stored.sha256,
        receiptPath: relativeArtifactLink(options.outputDirectory, stored.path),
        pass: validation.pass,
        failures: validation.failures,
      });
      console.log(`PROFILE-EVIDENCE result=${validation.pass ? 'pass' : 'fail'} run=${run.id} failures=${validation.failures.join(',') || 'none'}`);
    }
  } finally {
    if (localServer) {
      localServer.server.close();
      localServer.server.closeIdleConnections?.();
      localServer.server.closeAllConnections?.();
      localServer.server.unref();
    }
  }
  const report = {
    schema: 'simulatte.profileEvidenceIndex.v1',
    planSha256: sha256Bytes(fs.readFileSync(path.join(options.outputDirectory, 'plan.json'))),
    claimInventorySha256: sha256File(INVENTORY_PATH),
    releaseIdentitySha256,
    sourceIdentity: identity,
    totalRuns: selectedRuns.length,
    requiredRuns: plan.runs.length,
    passedRuns: rows.filter((row) => row.pass).length,
    capturePass: rows.every((row) => row.pass),
    coverageComplete: selectedRuns.length === plan.runs.length,
    pass: rows.every((row) => row.pass) && selectedRuns.length === plan.runs.length,
    profiles: profileClosureMatrix(rows),
    runs: rows,
  };
  fs.writeFileSync(path.join(options.outputDirectory, 'index.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeSummary(options.outputDirectory, report);
  writeHumanReviewQueue(options.outputDirectory, report);
  return report;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const plan = buildEvidencePlan(ROOT);
  const inventory = readJson(INVENTORY_PATH);
  const claims = expandClaims(ROOT, inventory);
  const identity = buildIdentity();
  if (options.capture) prepareCaptureDirectory(options.outputDirectory);
  writePlan(options.outputDirectory, plan, inventory);
  if (options.planOnly) {
    console.log(`PROFILE-EVIDENCE plan profiles=${plan.profileIds.length} runs=${plan.runCount} claims=${claims.length}`);
    return;
  }
  let report = null;
  if (options.capture) {
    const releaseIdentitySha256 = writeReleaseFreeze(
      options.outputDirectory,
      currentReleaseIdentity(ROOT, identity),
    );
    report = await captureAll({ options, plan, claims, identity, releaseIdentitySha256 });
  }
  if (options.check) {
    const validations = validateIndex({ outputDirectory: options.outputDirectory, plan, claims, identity });
    const passed = validations.filter((row) => row.pass).length;
    console.log(`PROFILE-EVIDENCE check runs=${validations.length} passed=${passed} failed=${validations.length - passed}`);
    if (passed !== plan.runs.length || validations.length !== plan.runs.length) process.exitCode = 1;
  } else if (report && !report.capturePass) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(
    () => process.exit(process.exitCode || 0),
    (error) => {
      console.error(error && error.stack || error);
      process.exit(1);
    }
  );
}

export {
  attemptSourceIdentity,
  buildIdentity,
  failedReceipt,
  evidenceReportStatus,
  parseArgs,
  prepareCaptureDirectory,
  profileClosureMatrix,
  validateIndex,
  writeHumanReviewQueue,
  writeReleaseFreeze,
  worktreeSha256,
};
