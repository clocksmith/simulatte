const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const CONTRACT_URL = pathToFileURL(path.join(ROOT, 'tools/simulatte/profile-evidence-contract.mjs')).href;
const INVENTORY_PATH = path.join(ROOT, 'public/data/application-profiles/profile-claim-inventory-v1.json');

async function fixture() {
  const contract = await import(CONTRACT_URL);
  const plan = contract.buildEvidencePlan(ROOT);
  const inventory = contract.readJson(INVENTORY_PATH);
  const claims = contract.expandClaims(ROOT, inventory);
  const run = plan.runs[0];
  const buildIdentity = {
    buildId: 'test-build',
    commitSha: 'a'.repeat(40),
    worktreeSha256: 'b'.repeat(64),
  };
  const sourceIdentity = contract.currentSourceIdentity(ROOT, run, buildIdentity);
  const receipt = {
    schema: 'simulatte.profileEvidenceReceipt.v1',
    run: {
      id: run.id,
      profileId: run.profileId,
      seedId: run.seedId,
      seed: run.seed,
      viewportId: run.viewport.id,
      interactionPath: run.interactionPath,
    },
    sourceIdentity: structuredClone(sourceIdentity),
    browser: {
      product: 'Chrome/1',
      protocolVersion: '1',
      userAgent: 'test',
      gpu: { available: true, vendor: 'test' },
    },
    runtime: {
      path: 'native-v4',
      profileId: run.profileId,
      contributionSources: run.pluginIds.map((pluginId) => ({ pluginId, source: 'native-v4' })),
    },
    evidence: {
      controls: [{ id: 'start-button' }],
      events: [{ id: 'event-1' }],
      progressiveStates: [{ phase: 'running' }, { phase: 'completed' }],
      comparisons: [{ id: 'comparison-1', status: 'settled' }],
      settlements: [{ id: 'settlement-1', status: 'settled' }],
      console: [],
      consoleErrors: [],
      performance: { frameCount: 2, elapsedMs: 5 },
      screenshot: { sha256: 'c'.repeat(64), path: 'screenshots/c.png' },
      pixelReadback: { status: 'pass', sampleCount: 256, distinctColorCount: 4 },
      lifecycle: [...run.interactionPath],
    },
    integrity: { status: 'pass', contradictions: [] },
    claims: claims
      .filter((claim) => claim.profileId === run.profileId && claim.seedId === run.seedId)
      .map((claim) => ({ id: claim.id, sentence: claim.sentence })),
  };
  return { buildIdentity, claims, contract, plan, receipt, run, sourceIdentity };
}

test('profile evidence plan enumerates seven profiles, twenty-nine seeds, and two required viewports', async () => {
  const { plan } = await fixture();
  assert.equal(plan.profileIds.length, 7);
  assert.equal(new Set(plan.runs.map((run) => `${run.profileId}:${run.seedId}`)).size, 29);
  assert.equal(plan.runCount, 58);
  assert.deepEqual([...new Set(plan.runs.map((run) => run.viewport.id))], [
    'desktop-1440x1000',
    'mobile-390x844',
  ]);
  assert.ok(plan.runs.every((run) => run.interactionPath.includes('settle')));
  assert.ok(plan.runs.every((run) => run.interactionPath.includes('replay')));
  assert.ok(plan.runs.every((run) => run.interactionPath.includes('reload')));
});

test('claim inventory assigns one stable claim ID to every published seed description', async () => {
  const { claims } = await fixture();
  assert.equal(claims.length, 29);
  assert.equal(new Set(claims.map((claim) => claim.id)).size, claims.length);
  assert.ok(claims.every((claim) => claim.sentence.length > 0));
  assert.ok(claims.every((claim) => claim.source.path.startsWith('public/data/application-profiles/')));
});

test('complete native browser evidence settles its profile claim', async () => {
  const { buildIdentity, claims, contract, receipt, run, sourceIdentity } = await fixture();
  const validation = contract.validateReceipt({ receipt, run, sourceIdentity, claims, buildIdentity });
  assert.equal(validation.pass, true);
  assert.deepEqual(validation.failures, []);
  assert.ok(validation.claimResults.every((row) => row.pass));
});

test('missing controls, unavailable comparison evidence, and incomplete lifecycle fail closed', async () => {
  const { claims, contract, receipt, run, sourceIdentity } = await fixture();
  receipt.evidence.controls = [];
  receipt.evidence.comparisons = [];
  receipt.evidence.lifecycle = ['boot', 'select-seed', 'start', 'settle'];
  const validation = contract.validateReceipt({ receipt, run, sourceIdentity, claims });
  assert.equal(validation.pass, false);
  assert.ok(validation.failures.includes('claim_evidence_unresolved'));
  assert.deepEqual(validation.claimResults[0].missing, [
    'controls-captured',
    'comparison-settled',
    'interaction-path-complete',
  ]);
});

test('legacy-only and different runtime paths cannot satisfy native evidence claims', async () => {
  const { claims, contract, receipt, run, sourceIdentity } = await fixture();
  receipt.runtime.path = 'legacy-adapter';
  let validation = contract.validateReceipt({ receipt, run, sourceIdentity, claims });
  assert.ok(validation.failures.includes('legacy_only_evidence'));
  receipt.runtime.path = 'metadata-only';
  validation = contract.validateReceipt({ receipt, run, sourceIdentity, claims });
  assert.ok(validation.failures.includes('runtime_path_mismatch'));
});

test('stale profile, plugin, dataset, commit, and worktree identities fail source closure', async () => {
  const { claims, contract, receipt, run, sourceIdentity } = await fixture();
  receipt.sourceIdentity.profile.sha256 = '0'.repeat(64);
  receipt.sourceIdentity.plugins[0].sha256 = '1'.repeat(64);
  receipt.sourceIdentity.plugins[0].datasets[0].sha256 = '2'.repeat(64);
  receipt.sourceIdentity.build.commitSha = '3'.repeat(40);
  receipt.sourceIdentity.build.worktreeSha256 = '4'.repeat(64);
  const validation = contract.validateReceipt({ receipt, run, sourceIdentity, claims });
  assert.ok(validation.failures.includes('profile_hash_stale'));
  assert.ok(validation.failures.some((failure) => failure.startsWith('plugin_manifest_stale:')));
  assert.ok(validation.failures.some((failure) => failure.startsWith('dataset_identity_stale:')));
  assert.ok(validation.failures.includes('commit_identity_mismatch'));
  assert.ok(validation.failures.includes('worktree_identity_mismatch'));
});

test('contradictory evidence prevents a polished claim result', async () => {
  const { claims, contract, receipt, run, sourceIdentity } = await fixture();
  receipt.integrity = { status: 'contradictory', contradictions: ['branch_clock_drift'] };
  const validation = contract.validateReceipt({ receipt, run, sourceIdentity, claims });
  assert.equal(validation.pass, false);
  assert.ok(validation.failures.includes('receipt_contradictory'));
  assert.deepEqual(validation.claimResults[0].contradictory, ['runtime-errors-recorded']);
});

test('content-addressed receipts are canonical and immutable by identity', async () => {
  const { contract, receipt } = await fixture();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'simulatte-profile-evidence-'));
  try {
    const first = contract.storeReceipt(directory, receipt);
    const second = contract.storeReceipt(directory, structuredClone(receipt));
    assert.equal(first.sha256, second.sha256);
    assert.equal(first.path, second.path);
    assert.equal(path.basename(first.path), `${first.sha256}.json`);
    assert.equal(contract.sha256Bytes(fs.readFileSync(first.path)), first.sha256);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
