import fs from 'node:fs';
import path from 'node:path';
import {
  canonicalJson,
  readJson,
  sha256Bytes,
  sha256File,
} from './profile-evidence-contract.mjs';

const QUEUE_SCHEMA = 'simulatte.profileEvidenceHumanReviewQueue.v1';
const REVIEW_SCHEMA = 'simulatte.profileEvidenceHumanReview.v1';
const REVIEW_INDEX_SCHEMA = 'simulatte.profileEvidenceHumanReviewIndex.v1';
const ADJUDICATED_PROOF_SCHEMA = 'simulatte.profileEvidenceAdjudicatedWorldProof.v1';
const QUEUE_REQUIRED_BINDINGS = Object.freeze([
  'runId',
  'receiptSha256',
  'buildIdentity',
  'deployment',
  'worldSpec.contentHash',
  'scenePacketIdentity.sha256',
  'canvasScreenshot.sha256',
  'pageScreenshot.sha256',
  'renderEvidenceSha256',
  'reviewerId',
  'reviewedAt',
  'verdict',
]);
const VERDICT_FIELDS = Object.freeze([
  'recognizability',
  'composition',
  'perceptualQuality',
  'truthBoundaryLegibility',
]);
const HEX_64 = /^[a-f0-9]{64}$/;

function contractError(code, detail = '') {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  return error;
}

function assertContract(condition, code, detail = '') {
  if (!condition) throw contractError(code, detail);
}

function sameValue(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function safeArtifactPath(outputDirectory, relativePath, code) {
  const root = path.resolve(outputDirectory);
  const value = String(relativePath || '');
  assertContract(value && !path.isAbsolute(value), code, value || 'missing');
  const resolved = path.resolve(root, value);
  assertContract(resolved.startsWith(`${root}${path.sep}`), code, value);
  return resolved;
}

function verifiedVisualAsset(outputDirectory, evidence, kind) {
  assertContract(evidence && typeof evidence === 'object', `profile_review_${kind}_missing`);
  assertContract(HEX_64.test(String(evidence.sha256 || '')), `profile_review_${kind}_hash_invalid`);
  const assetPath = safeArtifactPath(outputDirectory, evidence.path, `profile_review_${kind}_path_invalid`);
  assertContract(fs.existsSync(assetPath), `profile_review_${kind}_file_missing`, evidence.path);
  assertContract(sha256File(assetPath) === evidence.sha256, `profile_review_${kind}_hash_mismatch`, evidence.path);
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

function profileScenePacketIdentity(receipt) {
  const packetProjection = {
    schema: 'simulatte.profileScenePacketProjection.v1',
    profileId: receipt.run?.profileId || '',
    worldSpecContentHash: receipt.runtime?.worldSpec?.contentHash || '',
    viewReceipt: receipt.runtime?.viewReceipt || null,
    compositorReceipts: receipt.runtime?.compositorReceipts || [],
    contributionSources: receipt.runtime?.contributionSources || [],
  };
  return {
    schema: 'simulatte.profileScenePacketIdentity.v1',
    lane: 'profile-compositor',
    sha256: sha256Bytes(canonicalJson(packetProjection)),
  };
}

function deriveProfileVisualBindings(outputDirectory, receipt) {
  const canvasScreenshot = verifiedVisualAsset(
    outputDirectory,
    receipt.evidence?.screenshot,
    'canvas_screenshot',
  );
  const pageScreenshot = verifiedVisualAsset(
    outputDirectory,
    receipt.evidence?.pageScreenshot,
    'page_screenshot',
  );
  const scenePacketIdentity = profileScenePacketIdentity(receipt);
  const renderEvidence = {
    schema: 'simulatte.profileRenderEvidenceBinding.v1',
    scenePacketIdentity,
    pixelReadback: receipt.evidence?.pixelReadback || null,
    visual: receipt.evidence?.visual || null,
  };
  return {
    canvasScreenshot,
    pageScreenshot,
    scenePacketIdentity,
    renderEvidenceSha256: sha256Bytes(canonicalJson(renderEvidence)),
  };
}

function readStoredEvidenceReceipt(outputDirectory, row) {
  const receiptPath = safeArtifactPath(
    outputDirectory,
    row.receiptPath,
    'profile_review_receipt_path_invalid',
  );
  assertContract(fs.existsSync(receiptPath), 'profile_review_receipt_missing', row.receiptPath);
  assertContract(HEX_64.test(String(row.receiptSha256 || '')), 'profile_review_receipt_hash_invalid');
  assertContract(sha256File(receiptPath) === row.receiptSha256, 'profile_review_receipt_hash_mismatch', row.runId);
  const receipt = readJson(receiptPath);
  assertContract(receipt.schema === 'simulatte.profileEvidenceReceipt.v1', 'profile_review_receipt_schema_invalid');
  assertContract(
    sha256Bytes(canonicalJson(receipt)) === row.receiptSha256,
    'profile_review_receipt_not_canonical',
    row.runId,
  );
  return receipt;
}

function machineProofReady(indexRow, queueRow, receipt) {
  const proof = receipt.runtime?.worldProof;
  if (!indexRow?.pass || queueRow.machineStatus !== 'ready') return false;
  if (proof?.schema !== 'simulatte.worldProof.v1') return false;
  const classes = proof.proofClasses || {};
  const requiredClasses = ['intent', 'semantic', 'compilation', 'simulation', 'visual', 'replay'];
  if (!requiredClasses.every((className) => classes[className])) return false;
  for (const [className, proofClass] of Object.entries(classes)) {
    if (className === 'visual') continue;
    if (proofClass?.required && proofClass.status !== 'pass') return false;
    if (!proofClass?.required && !['pass', 'not-applicable'].includes(proofClass?.status)) return false;
  }
  if (!['pass', 'not-proven'].includes(classes.visual?.status)) return false;
  return (proof.criticalFailures || []).every((failure) => failure.class === 'visual');
}

function queueRowContext(outputDirectory, queueRow, indexRow, releaseReady) {
  assertContract(indexRow, 'profile_review_index_run_missing', queueRow.runId);
  assertContract(indexRow.receiptSha256 === queueRow.receiptSha256, 'profile_review_index_receipt_mismatch', queueRow.runId);
  assertContract(indexRow.receiptPath === queueRow.receiptPath, 'profile_review_index_path_mismatch', queueRow.runId);
  const receipt = readStoredEvidenceReceipt(outputDirectory, queueRow);
  const run = receipt.run || {};
  assertContract(run.id === queueRow.runId, 'profile_review_run_id_mismatch', queueRow.runId);
  assertContract(run.profileId === queueRow.profileId, 'profile_review_profile_id_mismatch', queueRow.runId);
  assertContract(run.seedId === queueRow.seedId, 'profile_review_seed_id_mismatch', queueRow.runId);
  assertContract(run.viewportId === queueRow.viewportId, 'profile_review_viewport_id_mismatch', queueRow.runId);
  assertContract(sameValue(receipt.sourceIdentity?.build || null, queueRow.buildIdentity), 'profile_review_build_mismatch', queueRow.runId);
  assertContract(sameValue(receipt.evidence?.deployment || null, queueRow.deployment), 'profile_review_deployment_mismatch', queueRow.runId);
  const expectedMachineStatus = indexRow.pass ? 'ready' : 'blocked';
  const expectedReviewStatus = indexRow.pass
    ? 'human-adjudication-required'
    : 'blocked-on-machine-evidence';
  assertContract(queueRow.machineStatus === expectedMachineStatus, 'profile_review_machine_status_mismatch', queueRow.runId);
  assertContract(queueRow.reviewStatus === expectedReviewStatus, 'profile_review_queue_row_status_mismatch', queueRow.runId);
  assertContract(queueRow.platformClaimEligible === false, 'profile_review_queue_preemptive_eligibility', queueRow.runId);
  if (!indexRow.pass) {
    for (const field of [
      'canvasScreenshot',
      'pageScreenshot',
      'scenePacketIdentity',
      'renderEvidenceSha256',
    ]) {
      assertContract(queueRow[field] === null, `profile_review_blocked_${field}_must_be_null`, queueRow.runId);
    }
    assertContract(queueRow.machineWorldProofEligible === false, 'profile_review_blocked_world_proof_eligibility', queueRow.runId);
    return {
      queueRow,
      indexRow,
      receipt,
      machineReady: false,
      releaseReady,
      prompt: null,
      worldSpec: null,
      worldProof: null,
    };
  }
  const visualBindings = deriveProfileVisualBindings(outputDirectory, receipt);
  for (const field of ['canvasScreenshot', 'pageScreenshot', 'scenePacketIdentity', 'renderEvidenceSha256']) {
    assertContract(sameValue(visualBindings[field], queueRow[field]), `profile_review_${field}_mismatch`, queueRow.runId);
  }
  const worldSpec = receipt.runtime?.worldSpec;
  const worldProof = receipt.runtime?.worldProof;
  assertContract(worldSpec?.schema === 'simulatte.worldSpec.v1', 'profile_review_world_spec_missing', queueRow.runId);
  assertContract(worldProof?.schema === 'simulatte.worldProof.v1', 'profile_review_world_proof_missing', queueRow.runId);
  assertContract(worldProof.worldSpec?.contentHash === worldSpec.contentHash, 'profile_review_world_proof_spec_mismatch', queueRow.runId);
  assertContract(worldProof.bindings?.renderDataKey === visualBindings.canvasScreenshot.sha256, 'profile_review_world_proof_render_mismatch', queueRow.runId);
  assertContract(queueRow.worldProofVerdict === worldProof.verdict, 'profile_review_world_proof_verdict_mismatch', queueRow.runId);
  assertContract(
    queueRow.machineWorldProofEligible === (worldProof.verdict === 'pass'),
    'profile_review_world_proof_eligibility_mismatch',
    queueRow.runId,
  );
  const promptText = String(worldSpec.source?.prompt || '').trim();
  assertContract(promptText, 'profile_review_prompt_missing', queueRow.runId);
  return {
    queueRow,
    indexRow,
    receipt,
    machineReady: machineProofReady(indexRow, queueRow, receipt),
    releaseReady,
    prompt: {
      text: promptText,
      sha256: sha256Bytes(promptText),
    },
    worldSpec: {
      id: worldSpec.id,
      contentHash: worldSpec.contentHash,
      sha256: sha256Bytes(canonicalJson(worldSpec)),
    },
    worldProof: {
      schema: worldProof.schema,
      verdict: worldProof.verdict,
      sha256: sha256Bytes(canonicalJson(worldProof)),
    },
  };
}

function loadProfileReviewContext(outputDirectory) {
  const root = path.resolve(outputDirectory);
  const queuePath = path.join(root, 'human-review-queue.json');
  const indexPath = path.join(root, 'index.json');
  assertContract(fs.existsSync(queuePath), 'profile_review_queue_missing', queuePath);
  assertContract(fs.existsSync(indexPath), 'profile_review_evidence_index_missing', indexPath);
  const queue = readJson(queuePath);
  const index = readJson(indexPath);
  assertContract(queue.schema === QUEUE_SCHEMA, 'profile_review_queue_schema_invalid');
  assertContract(sameValue(Object.keys(queue).sort(), [
    'indexSha256',
    'pendingRuns',
    'requiredBindings',
    'requiredVerdicts',
    'rows',
    'schema',
    'status',
    'totalRuns',
  ]), 'profile_review_queue_shape_invalid');
  assertContract(sha256Bytes(canonicalJson(queue)) === sha256File(queuePath), 'profile_review_queue_not_canonical');
  assertContract(queue.indexSha256 === sha256File(indexPath), 'profile_review_queue_index_stale');
  assertContract(Array.isArray(queue.rows) && Array.isArray(index.runs), 'profile_review_queue_rows_invalid');
  assertContract(queue.totalRuns === queue.rows.length, 'profile_review_queue_total_mismatch');
  assertContract(sameValue(queue.requiredBindings, QUEUE_REQUIRED_BINDINGS), 'profile_review_queue_bindings_invalid');
  assertContract(sameValue(queue.requiredVerdicts, VERDICT_FIELDS), 'profile_review_queue_verdicts_invalid');
  assertContract(
    queue.pendingRuns === queue.rows.filter((row) => row.reviewStatus === 'human-adjudication-required').length,
    'profile_review_queue_pending_mismatch',
  );
  const releaseReady = index.capturePass === true && index.coverageComplete === true && index.pass === true;
  const expectedQueueStatus = releaseReady
    ? 'human-adjudication-required'
    : 'machine-evidence-incomplete';
  assertContract(queue.status === expectedQueueStatus, 'profile_review_queue_status_mismatch');
  const indexRows = new Map(index.runs.map((row) => [row.runId, row]));
  const runIds = new Set();
  const rows = queue.rows.map((row) => {
    assertContract(!runIds.has(row.runId), 'profile_review_queue_duplicate_run', row.runId);
    runIds.add(row.runId);
    return queueRowContext(root, row, indexRows.get(row.runId), releaseReady);
  });
  assertContract(indexRows.size === rows.length, 'profile_review_queue_index_run_count_mismatch');
  return {
    outputDirectory: root,
    queue,
    queueSha256: sha256File(queuePath),
    index,
    indexSha256: sha256File(indexPath),
    releaseReady,
    rows,
    rowsById: new Map(rows.map((row) => [row.queueRow.runId, row])),
  };
}

function reviewBinding(context, row) {
  const queueRow = row.queueRow;
  return {
    evidenceReceipt: {
      path: queueRow.receiptPath,
      sha256: queueRow.receiptSha256,
    },
    buildIdentity: queueRow.buildIdentity,
    deployment: queueRow.deployment,
    worldSpec: row.worldSpec,
    baseWorldProof: row.worldProof,
    scenePacketIdentity: queueRow.scenePacketIdentity,
    canvasScreenshot: queueRow.canvasScreenshot,
    pageScreenshot: queueRow.pageScreenshot,
    renderEvidenceSha256: queueRow.renderEvidenceSha256,
  };
}

function normalizedReviewerId(value) {
  const reviewerId = String(value || '').trim().replace(/\s+/g, ' ');
  assertContract(reviewerId.length >= 2 && reviewerId.length <= 120, 'profile_review_reviewer_id_invalid');
  return reviewerId;
}

function normalizedVerdict(value) {
  assertContract(value && typeof value === 'object' && !Array.isArray(value), 'profile_review_verdict_invalid');
  const keys = Object.keys(value).sort();
  assertContract(sameValue(keys, [...VERDICT_FIELDS].sort()), 'profile_review_verdict_fields_invalid');
  const result = {};
  for (const field of VERDICT_FIELDS) {
    assertContract(['pass', 'fail'].includes(value[field]), 'profile_review_verdict_value_invalid', field);
    result[field] = value[field];
  }
  result.overall = VERDICT_FIELDS.every((field) => result[field] === 'pass') ? 'pass' : 'fail';
  return result;
}

function createProfileReviewReceipt(context, input, options = {}) {
  assertContract(input && typeof input === 'object' && !Array.isArray(input), 'profile_review_input_invalid');
  const allowed = ['note', 'reviewerId', 'runId', 'verdict'];
  assertContract(Object.keys(input).every((key) => allowed.includes(key)), 'profile_review_input_field_forbidden');
  const runId = String(input.runId || '');
  const row = context.rowsById.get(runId);
  assertContract(row, 'profile_review_run_unknown', runId);
  assertContract(row.machineReady, 'profile_review_machine_evidence_not_ready', runId);
  const reviewedAt = String(options.reviewedAt || new Date().toISOString());
  assertContract(Number.isFinite(Date.parse(reviewedAt)), 'profile_review_reviewed_at_invalid');
  const note = String(input.note || '').trim();
  assertContract(note.length <= 4000, 'profile_review_note_too_large');
  return {
    schema: REVIEW_SCHEMA,
    queue: {
      sha256: context.queueSha256,
      indexSha256: context.indexSha256,
    },
    action: {
      type: 'submit',
      reviewerId: normalizedReviewerId(input.reviewerId),
      reviewedAt,
    },
    run: {
      id: runId,
      profileId: row.queueRow.profileId,
      seedId: row.queueRow.seedId,
      viewportId: row.queueRow.viewportId,
    },
    prompt: row.prompt,
    binding: reviewBinding(context, row),
    verdict: normalizedVerdict(input.verdict),
    note,
  };
}

function reviewStoreDirectory(context) {
  return path.join(
    context.outputDirectory,
    'human-reviews',
    'queues',
    context.queueSha256,
    'sha256',
  );
}

function validateProfileReviewReceipt(context, receipt, expectedSha256 = '') {
  assertContract(receipt?.schema === REVIEW_SCHEMA, 'profile_review_schema_invalid');
  const topKeys = ['action', 'binding', 'note', 'prompt', 'queue', 'run', 'schema', 'verdict'];
  assertContract(sameValue(Object.keys(receipt).sort(), topKeys), 'profile_review_shape_invalid');
  const row = context.rowsById.get(receipt.run?.id);
  assertContract(row, 'profile_review_run_unknown', receipt.run?.id);
  assertContract(row.machineReady, 'profile_review_machine_evidence_not_ready', receipt.run.id);
  assertContract(sameValue(receipt.queue, {
    sha256: context.queueSha256,
    indexSha256: context.indexSha256,
  }), 'profile_review_queue_binding_mismatch', receipt.run.id);
  assertContract(sameValue(receipt.run, {
    id: row.queueRow.runId,
    profileId: row.queueRow.profileId,
    seedId: row.queueRow.seedId,
    viewportId: row.queueRow.viewportId,
  }), 'profile_review_run_binding_mismatch', receipt.run.id);
  assertContract(sameValue(receipt.prompt, row.prompt), 'profile_review_prompt_binding_mismatch', receipt.run.id);
  assertContract(sameValue(receipt.binding, reviewBinding(context, row)), 'profile_review_evidence_binding_mismatch', receipt.run.id);
  assertContract(receipt.action?.type === 'submit', 'profile_review_action_invalid');
  const reviewerId = normalizedReviewerId(receipt.action?.reviewerId);
  assertContract(reviewerId === receipt.action.reviewerId, 'profile_review_reviewer_id_not_canonical');
  assertContract(Number.isFinite(Date.parse(receipt.action?.reviewedAt)), 'profile_review_reviewed_at_invalid');
  const suppliedVerdict = { ...receipt.verdict };
  delete suppliedVerdict.overall;
  assertContract(sameValue(receipt.verdict, normalizedVerdict(suppliedVerdict)), 'profile_review_verdict_not_canonical');
  assertContract(typeof receipt.note === 'string' && receipt.note.length <= 4000, 'profile_review_note_invalid');
  const sha256 = sha256Bytes(canonicalJson(receipt));
  if (expectedSha256) assertContract(sha256 === expectedSha256, 'profile_review_hash_mismatch');
  return { sha256, receipt, row };
}

function loadProfileReviewReceipts(context) {
  const directory = reviewStoreDirectory(context);
  if (!fs.existsSync(directory)) return [];
  const receipts = [];
  const reviewerRunKeys = new Set();
  for (const fileName of fs.readdirSync(directory).sort()) {
    assertContract(/^[a-f0-9]{64}\.json$/.test(fileName), 'profile_review_store_entry_invalid', fileName);
    const sha256 = fileName.slice(0, 64);
    const filePath = path.join(directory, fileName);
    assertContract(sha256File(filePath) === sha256, 'profile_review_file_hash_mismatch', fileName);
    const validated = validateProfileReviewReceipt(context, readJson(filePath), sha256);
    const duplicateKey = `${validated.receipt.run.id}\0${validated.receipt.action.reviewerId.toLowerCase()}`;
    assertContract(!reviewerRunKeys.has(duplicateKey), 'profile_review_duplicate_reviewer', validated.receipt.run.id);
    reviewerRunKeys.add(duplicateKey);
    receipts.push(validated);
  }
  return receipts;
}

function storeProfileReviewReceipt(context, receipt) {
  const validated = validateProfileReviewReceipt(context, receipt);
  const existing = loadProfileReviewReceipts(context);
  const reviewerKey = receipt.action.reviewerId.toLowerCase();
  assertContract(
    !existing.some((row) => row.receipt.run.id === receipt.run.id
      && row.receipt.action.reviewerId.toLowerCase() === reviewerKey),
    'profile_review_duplicate_reviewer',
    receipt.run.id,
  );
  const directory = reviewStoreDirectory(context);
  fs.mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, `${validated.sha256}.json`);
  try {
    fs.writeFileSync(filePath, canonicalJson(receipt), { flag: 'wx' });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    assertContract(sha256File(filePath) === validated.sha256, 'profile_review_existing_receipt_mismatch');
  }
  return { sha256: validated.sha256, path: filePath, receipt };
}

function aggregateReviewStatus(receipts) {
  if (!receipts.length) return 'pending';
  for (const field of VERDICT_FIELDS) {
    const values = new Set(receipts.map((row) => row.receipt.verdict[field]));
    if (values.size > 1) return 'conflict';
  }
  return receipts.every((row) => row.receipt.verdict.overall === 'pass') ? 'pass' : 'fail';
}

function adjudicatedWorldProof(row, receipts, reviewStatus) {
  const machineStatus = row.machineReady ? 'pass' : 'fail';
  let verdict = 'not-proven';
  const criticalFailures = [];
  if (machineStatus === 'fail') {
    verdict = 'fail';
    criticalFailures.push('machine-evidence-not-ready');
  } else if (reviewStatus === 'pass') {
    verdict = 'pass';
  } else if (reviewStatus === 'fail') {
    verdict = 'fail';
    criticalFailures.push('human-visual-review-failed');
  } else if (reviewStatus === 'conflict') {
    criticalFailures.push('human-visual-review-conflict');
  } else {
    criticalFailures.push('human-visual-review-pending');
  }
  return {
    schema: ADJUDICATED_PROOF_SCHEMA,
    baseEvidenceReceiptSha256: row.queueRow.receiptSha256,
    baseWorldProofSha256: row.worldProof?.sha256 || null,
    humanReviewReceiptSha256s: receipts.map((receipt) => receipt.sha256).sort(),
    machineStatus,
    visualStatus: reviewStatus,
    verdict,
    criticalFailures,
  };
}

function buildProfileReviewIndex(context, reviewReceipts = loadProfileReviewReceipts(context)) {
  const reviewsByRun = new Map();
  for (const review of reviewReceipts) {
    const runId = review.receipt.run.id;
    reviewsByRun.set(runId, [...(reviewsByRun.get(runId) || []), review]);
  }
  const rows = context.rows.map((row) => {
    const receipts = (reviewsByRun.get(row.queueRow.runId) || []).sort((left, right) => left.sha256.localeCompare(right.sha256));
    const reviewStatus = row.machineReady ? aggregateReviewStatus(receipts) : 'blocked';
    const proof = adjudicatedWorldProof(row, receipts, reviewStatus);
    return {
      runId: row.queueRow.runId,
      profileId: row.queueRow.profileId,
      seedId: row.queueRow.seedId,
      viewportId: row.queueRow.viewportId,
      machineStatus: row.machineReady ? 'ready' : 'blocked',
      reviewStatus,
      platformClaimEligible: proof.verdict === 'pass' && context.releaseReady,
      reviews: receipts.map((receipt) => ({
        sha256: receipt.sha256,
        reviewerId: receipt.receipt.action.reviewerId,
        reviewedAt: receipt.receipt.action.reviewedAt,
        verdict: receipt.receipt.verdict,
        note: receipt.receipt.note,
      })),
      adjudicatedWorldProof: proof,
    };
  });
  const count = (status) => rows.filter((row) => row.reviewStatus === status).length;
  return {
    schema: REVIEW_INDEX_SCHEMA,
    queueSha256: context.queueSha256,
    evidenceIndexSha256: context.indexSha256,
    releaseReady: context.releaseReady,
    totalRuns: rows.length,
    totalReviews: reviewReceipts.length,
    summary: {
      pass: count('pass'),
      fail: count('fail'),
      conflict: count('conflict'),
      pending: count('pending'),
      blocked: count('blocked'),
      platformClaimEligible: rows.filter((row) => row.platformClaimEligible).length,
    },
    rows,
  };
}

function writeProfileReviewIndex(outputDirectory) {
  const context = loadProfileReviewContext(outputDirectory);
  const index = buildProfileReviewIndex(context);
  const indexPath = path.join(context.outputDirectory, 'human-review-index.json');
  fs.writeFileSync(indexPath, canonicalJson(index));
  return { context, index, indexPath, sha256: sha256File(indexPath) };
}

function validateProfileReviewIndex(outputDirectory) {
  const context = loadProfileReviewContext(outputDirectory);
  const expected = buildProfileReviewIndex(context);
  const indexPath = path.join(context.outputDirectory, 'human-review-index.json');
  assertContract(fs.existsSync(indexPath), 'profile_review_index_missing');
  const actual = readJson(indexPath);
  assertContract(actual.schema === REVIEW_INDEX_SCHEMA, 'profile_review_index_schema_invalid');
  assertContract(sha256Bytes(canonicalJson(actual)) === sha256File(indexPath), 'profile_review_index_not_canonical');
  assertContract(sameValue(actual, expected), 'profile_review_index_stale');
  return { context, index: actual, indexPath, sha256: sha256File(indexPath) };
}

function profileReviewQueueView(context, index = buildProfileReviewIndex(context)) {
  const statuses = new Map(index.rows.map((row) => [row.runId, row]));
  return {
    schema: 'simulatte.profileEvidenceHumanReviewView.v1',
    queueSha256: context.queueSha256,
    evidenceIndexSha256: context.indexSha256,
    releaseReady: context.releaseReady,
    requiredVerdicts: VERDICT_FIELDS,
    summary: index.summary,
    rows: context.rows.map((row) => ({
      runId: row.queueRow.runId,
      profileId: row.queueRow.profileId,
      seedId: row.queueRow.seedId,
      viewportId: row.queueRow.viewportId,
      machineStatus: row.machineReady ? 'ready' : 'blocked',
      prompt: row.prompt,
      buildIdentity: row.queueRow.buildIdentity,
      deployment: row.queueRow.deployment,
      worldSpec: row.worldSpec,
      baseWorldProof: row.worldProof,
      scenePacketIdentity: row.queueRow.scenePacketIdentity,
      canvasScreenshot: row.queueRow.canvasScreenshot,
      pageScreenshot: row.queueRow.pageScreenshot,
      renderEvidenceSha256: row.queueRow.renderEvidenceSha256,
      review: statuses.get(row.queueRow.runId),
    })),
  };
}

export {
  ADJUDICATED_PROOF_SCHEMA,
  QUEUE_SCHEMA,
  QUEUE_REQUIRED_BINDINGS,
  REVIEW_INDEX_SCHEMA,
  REVIEW_SCHEMA,
  VERDICT_FIELDS,
  aggregateReviewStatus,
  buildProfileReviewIndex,
  createProfileReviewReceipt,
  deriveProfileVisualBindings,
  loadProfileReviewContext,
  loadProfileReviewReceipts,
  profileReviewQueueView,
  profileScenePacketIdentity,
  reviewStoreDirectory,
  safeArtifactPath,
  storeProfileReviewReceipt,
  validateProfileReviewIndex,
  validateProfileReviewReceipt,
  writeProfileReviewIndex,
};
