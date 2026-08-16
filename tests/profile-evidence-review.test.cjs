const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const REVIEW_CONTRACT_URL = pathToFileURL(path.join(
  ROOT,
  'tools/simulatte/profile-evidence-review-contract.mjs',
)).href;
const REVIEW_SERVER_URL = pathToFileURL(path.join(
  ROOT,
  'tools/simulatte/profile-evidence-review-server.mjs',
)).href;
const EVIDENCE_CONTRACT_URL = pathToFileURL(path.join(
  ROOT,
  'tools/simulatte/profile-evidence-contract.mjs',
)).href;

function proofClass(className, status, required = true) {
  return {
    schema: 'simulatte.worldProofClass.v1',
    class: className,
    required,
    status,
    evidence: [],
    failures: status === 'not-proven' ? ['human visual evidence required'] : [],
  };
}

async function fixture({ releaseReady = true } = {}) {
  const evidence = await import(EVIDENCE_CONTRACT_URL);
  const review = await import(REVIEW_CONTRACT_URL);
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'simulatte-profile-review-'));
  const canvasBytes = Buffer.from('bound canvas screenshot bytes');
  const pageBytes = Buffer.from('bound page screenshot bytes');
  const canvasSha256 = evidence.sha256Bytes(canvasBytes);
  const pageSha256 = evidence.sha256Bytes(pageBytes);
  const canvasPath = `screenshots/canvas/sha256/${canvasSha256}.png`;
  const pagePath = `screenshots/page/sha256/${pageSha256}.png`;
  fs.mkdirSync(path.join(outputDirectory, path.dirname(canvasPath)), { recursive: true });
  fs.mkdirSync(path.join(outputDirectory, path.dirname(pagePath)), { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, canvasPath), canvasBytes);
  fs.writeFileSync(path.join(outputDirectory, pagePath), pageBytes);
  const runId = 'run-review-contract';
  const buildIdentity = {
    buildId: 'review-test-build',
    commitSha: 'a'.repeat(40),
    worktreeSha256: 'b'.repeat(64),
  };
  const worldSpec = {
    schema: 'simulatte.worldSpec.v1',
    id: 'world-spec:review-test',
    contentHash: 'fnv1a32:reviewtest',
    source: {
      schema: 'simulatte.worldSpecSource.v1',
      prompt: 'Show a red signal beside a clearly labeled modeled forecast.',
    },
  };
  const worldProof = {
    schema: 'simulatte.worldProof.v1',
    worldSpec: {
      schema: worldSpec.schema,
      id: worldSpec.id,
      contentHash: worldSpec.contentHash,
      revision: 0,
      patchIds: [],
      promptHash: 'fnv1a32:prompt',
    },
    bindings: {
      schema: 'simulatte.worldProofBinding.v1',
      renderDataKey: canvasSha256,
      runtimeReceiptId: 'runtime:review-test',
    },
    proofClasses: {
      intent: proofClass('intent', 'pass'),
      semantic: proofClass('semantic', 'pass'),
      compilation: proofClass('compilation', 'pass'),
      simulation: proofClass('simulation', 'pass'),
      interaction: proofClass('interaction', 'not-applicable', false),
      safety: proofClass('safety', 'not-applicable', false),
      visual: proofClass('visual', 'not-proven'),
      replay: proofClass('replay', 'pass'),
    },
    evidence: {},
    verdict: 'not-proven',
    criticalFailures: [{
      class: 'visual',
      status: 'not-proven',
      failures: ['human visual evidence required'],
    }],
  };
  const deployment = {
    status: 'pass',
    servedBuildId: buildIdentity.buildId,
    pageUrl: 'http://127.0.0.1:4173/review-test',
    route: '/review-test',
    versionUrl: 'http://127.0.0.1:4173/version.json',
  };
  const receipt = {
    schema: 'simulatte.profileEvidenceReceipt.v1',
    capturedAt: '2026-08-15T12:00:00.000Z',
    run: {
      id: runId,
      profileId: 'review-profile-v1',
      seedId: 'review-seed',
      seed: 'review-seed-001',
      viewportId: 'desktop-1440x1000',
      interactionPath: ['boot', 'start', 'settle', 'replay'],
      comparisonMode: 'none',
    },
    sourceIdentity: {
      schema: 'simulatte.profileEvidenceSourceIdentity.v1',
      build: buildIdentity,
      profile: { id: 'review-profile-v1', path: 'fixture.json', sha256: 'c'.repeat(64) },
      plugins: [],
    },
    browser: { product: 'Chrome/test' },
    runtime: {
      path: 'native-v4',
      profileId: 'review-profile-v1',
      worldSpec,
      worldProof,
      viewReceipt: { schema: 'simulatte.viewDirectorReceipt.v4', mode: 'overview' },
      compositorReceipts: [{ schema: 'simulatte.compositorReceipt.v4', representedLayerIds: ['red-signal'] }],
      contributionSources: [{ pluginId: 'review-plugin', source: 'fixture' }],
    },
    evidence: {
      deployment,
      screenshot: {
        sha256: canvasSha256,
        path: canvasPath,
        kind: 'canvas2d-canvas-readback',
        sourceBackend: 'canvas2d',
        width: 1440,
        height: 1000,
      },
      pageScreenshot: { sha256: pageSha256, path: pagePath },
      pixelReadback: { schema: 'simulatte.pixelReadback.v1', sha256: canvasSha256, status: 'pass' },
      visual: { schema: 'simulatte.renderedEvidence.v1', obstructionRatio: 0 },
    },
    claims: [],
    integrity: { contradictions: [] },
  };
  const receiptSha256 = evidence.sha256Bytes(evidence.canonicalJson(receipt));
  const receiptPath = `receipts/sha256/${receiptSha256}.json`;
  fs.mkdirSync(path.join(outputDirectory, path.dirname(receiptPath)), { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, receiptPath), evidence.canonicalJson(receipt));
  const index = {
    schema: 'simulatte.profileEvidenceIndex.v1',
    totalRuns: 1,
    passedRuns: 1,
    capturePass: releaseReady,
    coverageComplete: releaseReady,
    pass: releaseReady,
    runs: [{
      runId,
      profileId: receipt.run.profileId,
      seedId: receipt.run.seedId,
      viewportId: receipt.run.viewportId,
      receiptSha256,
      receiptPath,
      pass: true,
      failures: [],
      worldProofVerdict: 'not-proven',
      platformClaimEligible: false,
    }],
  };
  fs.writeFileSync(path.join(outputDirectory, 'index.json'), evidence.canonicalJson(index));
  const bindings = review.deriveProfileVisualBindings(outputDirectory, receipt);
  const queue = {
    schema: review.QUEUE_SCHEMA,
    status: releaseReady ? 'human-adjudication-required' : 'machine-evidence-incomplete',
    indexSha256: evidence.sha256File(path.join(outputDirectory, 'index.json')),
    requiredBindings: [
      'runId', 'receiptSha256', 'buildIdentity', 'deployment',
      'worldSpec.contentHash', 'scenePacketIdentity.sha256',
      'canvasScreenshot.sha256', 'pageScreenshot.sha256',
      'renderEvidenceSha256', 'reviewerId', 'reviewedAt', 'verdict',
    ],
    requiredVerdicts: [
      'recognizability', 'composition', 'perceptualQuality', 'truthBoundaryLegibility',
    ],
    totalRuns: 1,
    pendingRuns: 1,
    rows: [{
      runId,
      profileId: receipt.run.profileId,
      seedId: receipt.run.seedId,
      viewportId: receipt.run.viewportId,
      machineStatus: 'ready',
      receiptSha256,
      receiptPath,
      buildIdentity,
      deployment,
      ...bindings,
      worldProofVerdict: 'not-proven',
      machineWorldProofEligible: false,
      platformClaimEligible: false,
      reviewStatus: 'human-adjudication-required',
    }],
  };
  fs.writeFileSync(path.join(outputDirectory, 'human-review-queue.json'), evidence.canonicalJson(queue));
  review.writeProfileReviewIndex(outputDirectory);
  return {
    outputDirectory,
    runId,
    canvasPath,
    canvasSha256,
    receiptPath,
    review,
    evidence,
  };
}

function reviewInput(runId, reviewerId = 'Reviewer One', overrides = {}) {
  return {
    runId,
    reviewerId,
    verdict: {
      recognizability: 'pass',
      composition: 'pass',
      perceptualQuality: 'pass',
      truthBoundaryLegibility: 'pass',
      ...(overrides.verdict || {}),
    },
    note: overrides.note || '',
  };
}

test('profile review receipt derives immutable prompt, build, packet, screenshot, and proof bindings', async (t) => {
  const value = await fixture();
  t.after(() => fs.rmSync(value.outputDirectory, { recursive: true, force: true }));
  const context = value.review.loadProfileReviewContext(value.outputDirectory);
  const receipt = value.review.createProfileReviewReceipt(
    context,
    reviewInput(value.runId, 'Reviewer One', { note: 'Required subjects remain visibly distinct.' }),
    { reviewedAt: '2026-08-15T13:00:00.000Z' },
  );
  assert.equal(receipt.schema, value.review.REVIEW_SCHEMA);
  assert.equal(receipt.queue.sha256, context.queueSha256);
  assert.equal(receipt.prompt.text, 'Show a red signal beside a clearly labeled modeled forecast.');
  assert.equal(receipt.binding.buildIdentity.buildId, 'review-test-build');
  assert.equal(receipt.binding.scenePacketIdentity.lane, 'profile-compositor');
  assert.equal(receipt.binding.canvasScreenshot.sha256, value.canvasSha256);
  assert.equal(receipt.binding.baseWorldProof.verdict, 'not-proven');
  assert.equal(receipt.verdict.overall, 'pass');
  assert.throws(
    () => value.review.createProfileReviewReceipt(context, {
      ...reviewInput(value.runId),
      buildIdentity: { buildId: 'forged' },
    }),
    /profile_review_input_field_forbidden/,
  );
});

test('content-addressed reviews are immutable and one passing reviewer closes the adjudicated envelope', async (t) => {
  const value = await fixture();
  t.after(() => fs.rmSync(value.outputDirectory, { recursive: true, force: true }));
  const context = value.review.loadProfileReviewContext(value.outputDirectory);
  const receipt = value.review.createProfileReviewReceipt(
    context,
    reviewInput(value.runId, 'Reviewer One', { note: 'Required subjects remain visibly distinct.' }),
    { reviewedAt: '2026-08-15T13:01:00.000Z' },
  );
  const stored = value.review.storeProfileReviewReceipt(context, receipt);
  assert.match(path.basename(stored.path), new RegExp(`^${stored.sha256}\\.json$`));
  assert.equal(value.evidence.sha256File(stored.path), stored.sha256);
  const result = value.review.writeProfileReviewIndex(value.outputDirectory);
  assert.deepEqual(result.index.summary, {
    pass: 1,
    fail: 0,
    conflict: 0,
    pending: 0,
    blocked: 0,
    platformClaimEligible: 1,
  });
  assert.equal(result.index.rows[0].adjudicatedWorldProof.verdict, 'pass');
  assert.equal(result.index.rows[0].platformClaimEligible, true);
  assert.deepEqual(result.index.rows[0].reviews[0].verdict, receipt.verdict);
  assert.equal(result.index.rows[0].reviews[0].note, 'Required subjects remain visibly distinct.');
  assert.throws(
    () => value.review.storeProfileReviewReceipt(context, receipt),
    /profile_review_duplicate_reviewer/,
  );
  assert.doesNotThrow(() => value.review.validateProfileReviewIndex(value.outputDirectory));
});

test('disagreeing reviewers remain an explicit conflict and cannot promote a platform claim', async (t) => {
  const value = await fixture();
  t.after(() => fs.rmSync(value.outputDirectory, { recursive: true, force: true }));
  const context = value.review.loadProfileReviewContext(value.outputDirectory);
  const passing = value.review.createProfileReviewReceipt(
    context,
    reviewInput(value.runId, 'Reviewer Pass'),
    { reviewedAt: '2026-08-15T13:02:00.000Z' },
  );
  const failing = value.review.createProfileReviewReceipt(
    context,
    reviewInput(value.runId, 'Reviewer Fail', { verdict: { composition: 'fail' } }),
    { reviewedAt: '2026-08-15T13:03:00.000Z' },
  );
  value.review.storeProfileReviewReceipt(context, passing);
  value.review.storeProfileReviewReceipt(context, failing);
  const result = value.review.writeProfileReviewIndex(value.outputDirectory).index;
  assert.equal(result.rows[0].reviewStatus, 'conflict');
  assert.equal(result.rows[0].platformClaimEligible, false);
  assert.equal(result.rows[0].adjudicatedWorldProof.verdict, 'not-proven');
  assert.deepEqual(result.rows[0].adjudicatedWorldProof.criticalFailures, [
    'human-visual-review-conflict',
  ]);
});

test('a passing review cannot promote a platform claim from incomplete release coverage', async (t) => {
  const value = await fixture({ releaseReady: false });
  t.after(() => fs.rmSync(value.outputDirectory, { recursive: true, force: true }));
  const context = value.review.loadProfileReviewContext(value.outputDirectory);
  assert.equal(context.releaseReady, false);
  value.review.storeProfileReviewReceipt(
    context,
    value.review.createProfileReviewReceipt(
      context,
      reviewInput(value.runId, 'Partial Capture Reviewer'),
      { reviewedAt: '2026-08-15T13:04:00.000Z' },
    ),
  );
  const result = value.review.writeProfileReviewIndex(value.outputDirectory).index;
  assert.equal(result.rows[0].reviewStatus, 'pass');
  assert.equal(result.rows[0].adjudicatedWorldProof.verdict, 'pass');
  assert.equal(result.rows[0].platformClaimEligible, false);
  assert.equal(result.summary.platformClaimEligible, 0);
});

test('queue, screenshot, and stored-review tampering fail review validation', async (t) => {
  const screenshotFixture = await fixture();
  const indexFixture = await fixture();
  const verdictFixture = await fixture();
  const reviewFixture = await fixture();
  t.after(() => {
    for (const value of [screenshotFixture, indexFixture, verdictFixture, reviewFixture]) {
      fs.rmSync(value.outputDirectory, { recursive: true, force: true });
    }
  });
  fs.appendFileSync(path.join(screenshotFixture.outputDirectory, screenshotFixture.canvasPath), 'tamper');
  assert.throws(
    () => screenshotFixture.review.loadProfileReviewContext(screenshotFixture.outputDirectory),
    /profile_review_canvas_screenshot_hash_mismatch/,
  );
  fs.appendFileSync(path.join(indexFixture.outputDirectory, 'index.json'), ' ');
  assert.throws(
    () => indexFixture.review.loadProfileReviewContext(indexFixture.outputDirectory),
    /profile_review_queue_index_stale/,
  );
  const queuePath = path.join(verdictFixture.outputDirectory, 'human-review-queue.json');
  const queue = verdictFixture.evidence.readJson(queuePath);
  queue.requiredVerdicts = ['recognizability', 'composition'];
  fs.writeFileSync(queuePath, verdictFixture.evidence.canonicalJson(queue));
  assert.throws(
    () => verdictFixture.review.loadProfileReviewContext(verdictFixture.outputDirectory),
    /profile_review_queue_verdicts_invalid/,
  );
  const context = reviewFixture.review.loadProfileReviewContext(reviewFixture.outputDirectory);
  const stored = reviewFixture.review.storeProfileReviewReceipt(
    context,
    reviewFixture.review.createProfileReviewReceipt(context, reviewInput(reviewFixture.runId)),
  );
  fs.appendFileSync(stored.path, ' ');
  assert.throws(
    () => reviewFixture.review.loadProfileReviewReceipts(context),
    /profile_review_file_hash_mismatch/,
  );
});

test('local reviewer server exposes only bound assets and derives submitted identities server-side', async (t) => {
  const value = await fixture();
  const serverApi = await import(REVIEW_SERVER_URL);
  const running = await serverApi.listenProfileReviewServer({
    outputDirectory: value.outputDirectory,
    host: '127.0.0.1',
    port: 0,
  });
  t.after(async () => {
    await new Promise((resolve) => running.server.close(resolve));
    fs.rmSync(value.outputDirectory, { recursive: true, force: true });
  });
  const page = await fetch(`${running.baseUrl}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Profile evidence review/);
  const queueResponse = await fetch(`${running.baseUrl}/api/queue`);
  assert.equal(queueResponse.status, 200);
  const queue = await queueResponse.json();
  assert.equal(queue.rows[0].runId, value.runId);
  assert.equal(queue.rows[0].canvasScreenshot.sha256, value.canvasSha256);
  const asset = await fetch(`${running.baseUrl}/api/assets/${value.canvasSha256}`);
  assert.equal(asset.status, 200);
  assert.equal(Buffer.from(await asset.arrayBuffer()).toString(), 'bound canvas screenshot bytes');
  assert.equal((await fetch(`${running.baseUrl}/api/assets/${'f'.repeat(64)}`)).status, 404);
  const forged = await fetch(`${running.baseUrl}/api/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...reviewInput(value.runId), receiptSha256: 'f'.repeat(64) }),
  });
  assert.equal(forged.status, 400);
  assert.equal((await forged.json()).error, 'profile_review_input_field_forbidden');
  const submitted = await fetch(`${running.baseUrl}/api/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reviewInput(value.runId, 'HTTP Reviewer')),
  });
  assert.equal(submitted.status, 201);
  const response = await submitted.json();
  assert.match(response.reviewSha256, /^[a-f0-9]{64}$/);
  assert.equal(response.reviewStatus, 'pass');
  assert.equal(response.platformClaimEligible, true);
  const receipts = value.review.loadProfileReviewReceipts(
    value.review.loadProfileReviewContext(value.outputDirectory),
  );
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].receipt.binding.evidenceReceipt.sha256, queue.rows[0].review.adjudicatedWorldProof.baseEvidenceReceiptSha256);
  const duplicate = await fetch(`${running.baseUrl}/api/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reviewInput(value.runId, 'HTTP Reviewer')),
  });
  assert.equal(duplicate.status, 409);
});
