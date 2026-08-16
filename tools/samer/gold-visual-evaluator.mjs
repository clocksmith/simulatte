import crypto from 'node:crypto';
import fs from 'node:fs';
import { validateBrowserMemoryReceipt } from '../browser-memory-receipt.mjs';
import { validateExactWorldProofReplayReceipt } from '../exact-world-proof-replay-audit.mjs';

const GOLD_ADJUDICATION_SCHEMA = 'simulatte.goldVisualAdjudication.v3';

export function loadGoldSet(file) {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (value.schema !== 'simulatte.promptGoldSet.v1' || !value.id || !Array.isArray(value.rows)) {
    throw new Error(`Gold set ${file} expected simulatte.promptGoldSet.v1 with rows`);
  }
  validateGoverningMetric(value);
  return value;
}

export function loadGoldAdjudication(file) {
  if (!file) return null;
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (value.schema !== GOLD_ADJUDICATION_SCHEMA || !value.goldSetId || !Array.isArray(value.rows)) {
    throw new Error(`Gold adjudication ${file} expected ${GOLD_ADJUDICATION_SCHEMA} with rows`);
  }
  return value;
}

export function evaluateGoldVisualResults(results, goldSet, adjudication = null) {
  if (!goldSet) return null;
  if (goldSet.schema !== 'simulatte.promptGoldSet.v1' || !goldSet.id || !Array.isArray(goldSet.rows)) {
    throw new Error('Gold visual evaluation requires simulatte.promptGoldSet.v1');
  }
  const governingMetric = validateGoverningMetric(goldSet);
  if (adjudication && adjudication.schema !== GOLD_ADJUDICATION_SCHEMA) {
    throw new Error(`Gold visual evaluation requires ${GOLD_ADJUDICATION_SCHEMA}`);
  }
  if (adjudication && adjudication.goldSetId !== goldSet.id) {
    throw new Error(`Gold adjudication expected goldSetId ${goldSet.id}, received ${adjudication.goldSetId}`);
  }
  const goldById = uniqueRowIndex(goldSet.rows, 'gold set', null, true);
  const resultByGoldId = uniqueRowIndex(results || [], 'gold audit results', goldById, false);
  const adjudicationByGoldId = adjudication
    ? uniqueRowIndex(adjudication.rows, 'gold adjudication', goldById, true)
    : new Map();
  if (adjudication) {
    for (const goldRow of goldSet.rows) {
      const row = adjudicationByGoldId.get(goldRow.id);
      if (!row) throw new Error(`Gold adjudication is missing row ${goldRow.id}`);
      assertRuleIdentities(row, goldRow);
    }
  }
  const rows = goldSet.rows.map((goldRow) => {
    const result = resultByGoldId.get(goldRow.id) || null;
    const machine = evaluateMachineGoldRow(result, goldRow, governingMetric);
    const human = evaluateHumanGoldRow(result, goldRow, adjudicationByGoldId.get(goldRow.id));
    return {
      schema: 'simulatte.goldVisualResult.v1',
      goldRowId: goldRow.id,
      prompt: goldRow.prompt,
      difficulty: goldRow.difficulty,
      machine,
      human,
      pass: machine.pass && human.pass,
    };
  });
  const machinePassCount = rows.filter((row) => row.machine.pass).length;
  const humanPassCount = rows.filter((row) => row.human.pass).length;
  const passCount = rows.filter((row) => row.pass).length;
  const status = machinePassCount !== rows.length
    ? 'fail'
    : humanPassCount === rows.length
      ? 'pass'
      : rows.some((row) => row.human.status === 'not-proven')
        ? 'not-proven'
        : 'fail';
  return {
    schema: 'simulatte.goldVisualEvaluation.v1',
    goldSetId: goldSet.id,
    promptCount: rows.length,
    status,
    machinePassCount,
    humanPassCount,
    passCount,
    machinePassRate: rate(machinePassCount, rows.length),
    humanPassRate: rate(humanPassCount, rows.length),
    gatedPassRate: rate(passCount, rows.length),
    pass: status === 'pass',
    governingMetric: {
      ...governingMetric,
      everyCriticalPromptMustPass: true,
      difficultySummaries: governingMetric.difficulties.map((difficulty) => summarizeDifficulty(rows, difficulty)),
    },
    rows,
  };
}

function evaluateMachineGoldRow(result, goldRow, metric) {
  if (!result) return machineResult([failure('audit-result', 'missing screenshot audit result')]);
  const failures = [];
  const expectedPromptHash = digestText(goldRow.prompt);
  const extraction = evaluateExtraction(result.phase2IntentRequirementLedger, goldRow);
  for (const row of extraction.failures) failures.push(failure(`requirement-extraction:${row.id}`, row.reason));
  if (result.prompt !== goldRow.prompt) {
    failures.push(failure('prompt', 'audit prompt does not exactly match the gold prompt'));
  }
  if (result.compiledPrompt !== goldRow.prompt) {
    failures.push(failure('compiled-prompt', 'compiled prompt does not exactly match the gold prompt'));
  }
  if (result.promptSha256 !== expectedPromptHash) {
    failures.push(failure('prompt-sha256', 'audit prompt hash does not match the gold prompt'));
  }
  if (!result.buildId) failures.push(failure('build-id', 'audit result is missing the page build identity'));
  if (!isSha256(result.sceneRenderPacketSha256)) {
    failures.push(failure('scene-render-packet-sha256', 'audit result is missing the full Phase 6 packet hash'));
  }
  if (!isSha256(result.screenshotHash)) {
    failures.push(failure('page-screenshot-sha256', 'audit result is missing the full-page screenshot hash'));
  }
  if (!result.canvasScreenshot || !isSha256(result.canvasScreenshotHash)) {
    failures.push(failure('canvas-screenshot-sha256', 'audit result is missing the reviewed canvas crop and hash'));
  }
  const identities = result.sceneRenderPacketIdentities || [];
  const expectedTypes = new Set((goldRow.entities || []).map((row) => row.type));
  const unexpectedEntityCount = identities.filter((row) => !expectedTypes.has(row.type)).length;
  if (unexpectedEntityCount > metric.maximumUnexpectedEntityCount) {
    failures.push(failure(
      'unsupported-invention:unexpected-entities',
      `expected at most ${metric.maximumUnexpectedEntityCount}, received ${unexpectedEntityCount}`
    ));
  }
  const reportedUnsupportedCount = Math.max(
    Number(result.intentBriefUnsupportedCount || 0),
    Number(result.physicalReceiptUnsupportedCount || 0),
  );
  if (reportedUnsupportedCount > metric.maximumReportedUnsupportedCount) {
    failures.push(failure(
      'unsupported-invention:reported-unsupported',
      `expected at most ${metric.maximumReportedUnsupportedCount}, received ${reportedUnsupportedCount}`
    ));
  }
  for (const expected of goldRow.entities || []) {
    const matches = identities.filter((row) => row.type === expected.type);
    if (expected.count != null && matches.length !== Number(expected.count)) {
      failures.push(failure(`entity:${expected.type}:count`, `expected ${expected.count}, received ${matches.length}`));
    }
    if (expected.minimumCount != null && matches.length < Number(expected.minimumCount)) {
      failures.push(failure(`entity:${expected.type}:minimum-count`, `expected at least ${expected.minimumCount}, received ${matches.length}`));
    }
    if (matches.length && matches.every((row) => (
      row.grammarId === 'object-grammar.object' || row.literal !== true || row.unsupportedIdentity === true
    ))) {
      failures.push(failure(`entity:${expected.type}:specific-geometry`, 'no supported literal geometry reached Phase 7'));
    }
  }
  for (const expected of goldRow.closeSemanticDistractors || []) {
    const required = identities.filter((row) => row.type === expected.requiredType);
    const distractor = identities.filter((row) => row.type === expected.distractorType);
    const requiredCodes = new Set(required.map((row) => Number(row.semanticCode || 0)).filter((code) => code > 0));
    const distractorCodes = new Set(distractor.map((row) => Number(row.semanticCode || 0)).filter((code) => code > 0));
    if (!required.length || !distractor.length || !requiredCodes.size || !distractorCodes.size ||
        [...requiredCodes].some((code) => distractorCodes.has(code))) {
      failures.push(failure(
        `semantic-distractor:${expected.requiredType}:${expected.distractorType}`,
        'close semantic identities did not retain distinct compiled render codes'
      ));
    }
  }
  const relations = result.phase6CompositionObligations || [];
  const phase7Proof = parseProofRows(result.phase7VisualObligationProof);
  for (const expected of goldRow.absences || []) {
    if (identities.some((row) => row.type === expected.type)) {
      failures.push(failure(`absence:${expected.type}:packet`, 'forbidden identity reached the Phase 6 packet'));
    }
    const phase6Absence = relations.find((row) => (
      row.constraintKind === 'absence' && row.targetIdentity === expected.type
    ));
    if (!phase6Absence || phase6Absence.status !== 'preserved' || !(Number(phase6Absence.targetSemanticCode) > 0)) {
      failures.push(failure(`absence:${expected.type}:phase6`, 'bounded semantic absence did not reach Phase 6 as preserved'));
    }
    const phase7Absence = phase7Proof.find((row) => (
      row.target === expected.type && row.pixelProof &&
      row.pixelProof.detector && row.pixelProof.detector.targetIdentity === expected.type
    ));
    if (!phase7Absence || phase7Absence.status !== 'pass' || phase7Absence.pixelSatisfied !== true ||
        phase7Absence.pixelProof.detector.status !== 'pass' ||
        phase7Absence.pixelProof.detector.method !== 'closed-world-semantic-submission-with-texture-readback-binding') {
      failures.push(failure(`absence:${expected.type}:phase7`, 'bounded semantic absence lacks passing submission/readback evidence'));
    }
  }
  for (const expected of goldRow.relations || []) {
    if (!relations.some((row) => row.status === 'preserved' && relationMatches(row.id, expected))) {
      failures.push(failure(`relation:${expected.subjectType}:${expected.kind}:${expected.objectType}`, 'required relation did not reach Phase 6 as preserved'));
    }
    if (!phase7Proof.some((row) => (
      relationMatches(row.obligationId || row.id, expected) && row.status === 'pass' &&
      row.geometrySatisfied === true && row.pixelSatisfied === true
    ))) {
      failures.push(failure(
        `relation:${expected.subjectType}:${expected.kind}:${expected.objectType}:pixels`,
        'required relation was not proven against final projected geometry and live pixels'
      ));
    }
  }
  for (const expected of goldRow.poses || []) {
    const matches = identities.filter((row) => row.type === expected.type);
    if (!matches.length || !matches.every((row) => poseMatches(row.animationKind, expected.pose))) {
      failures.push(failure(`pose:${expected.type}:${expected.pose}`, `animation kinds were ${matches.map((row) => row.animationKind || 'missing').join(', ') || 'missing'}`));
    }
  }
  for (const expected of goldRow.properties || []) {
    const matches = identities.filter((row) => row.type === expected.type);
    const bound = matches.some((row) => (row.propertyBindings || []).some((binding) => (
      binding.propertyKind === expected.kind && binding.value === expected.value &&
      binding.status === 'bound' && (binding.matchedPartIds || []).length > 0
    )));
    if (!bound) {
      failures.push(failure(
        `property:${expected.type}:${expected.kind}:${expected.value}`,
        'property did not bind to visible geometry parts'
      ));
    }
  }
  if (result.phase7PixelProofStatus !== 'pass') {
    failures.push(failure('phase7-pixel-proof', `status was ${result.phase7PixelProofStatus || 'missing'}`));
  }
  if (result.sceneProofVerdict !== 'pass') {
    failures.push(failure('phase8-scene-proof', `verdict was ${result.sceneProofVerdict || 'missing'}`));
  }
  const auditDurationMs = Number(result.auditTiming && result.auditTiming.durationMs);
  if (result.auditTiming?.schema !== 'simulatte.visualAuditTiming.v1' || !Number.isFinite(auditDurationMs)) {
    failures.push(failure('audit-latency', 'audit timing receipt is missing'));
  } else if (auditDurationMs > metric.maximumAuditDurationMs) {
    failures.push(failure('audit-latency', `duration ${auditDurationMs}ms exceeded ${metric.maximumAuditDurationMs}ms`));
  }
  const memory = validateBrowserMemoryReceipt(result.browserMemory, metric.maximumObservedJsHeapBytes);
  for (const reason of memory.failures) failures.push(failure('browser-memory', reason));
  if (metric.exactReplayRequired) {
    try {
      validateExactWorldProofReplayReceipt(result.exactReplay, goldRow.prompt);
    } catch (error) {
      failures.push(failure('exact-world-proof-replay', error && error.message || String(error)));
    }
  }
  return machineResult(failures, {
    extraction: extraction.observation,
    auditDurationMs: Number.isFinite(auditDurationMs) ? auditDurationMs : null,
    browserMemory: memory.observation,
    unexpectedEntityCount,
    reportedUnsupportedCount,
    exactReplayRequired: metric.exactReplayRequired,
  });
}

function evaluateHumanGoldRow(result, goldRow, adjudication) {
  if (!result) return humanResult('not-proven', false, ['missing screenshot audit result'], null);
  if (!adjudication) return humanResult('not-proven', false, ['human adjudication is absent'], null);
  const failures = [];
  const expectedPromptHash = digestText(goldRow.prompt);
  if (adjudication.goldRowId !== goldRow.id) failures.push('adjudication gold row identity does not match');
  if (adjudication.prompt !== goldRow.prompt || adjudication.prompt !== result.prompt) {
    failures.push('adjudication prompt does not exactly match the gold and captured prompts');
  }
  if (adjudication.promptSha256 !== expectedPromptHash || adjudication.promptSha256 !== result.promptSha256) {
    failures.push('adjudication prompt hash does not match the gold and captured prompts');
  }
  if (!result.buildId || adjudication.buildId !== result.buildId) {
    failures.push('adjudication build identity does not match the captured page');
  }
  if (!result.sceneRenderPacketSha256 ||
      adjudication.sceneRenderPacketSha256 !== result.sceneRenderPacketSha256) {
    failures.push('adjudication render packet hash does not match the captured Phase 6 packet');
  }
  if (adjudication.screenshotKind !== 'canvas-crop') {
    failures.push('adjudication screenshot kind must be canvas-crop');
  }
  if (adjudication.screenshotSha256 !== result.canvasScreenshotHash) {
    failures.push('adjudication screenshot hash does not match the captured canvas crop');
  }
  if (!adjudication.reviewer || !adjudication.reviewedAt) {
    failures.push('reviewer and reviewedAt are required');
  }
  if (!String(adjudication.note || '').trim()) failures.push('review note is required');
  const rules = new Map((adjudication.rules || []).map((row) => [row.id, row.pass === true]));
  for (const rule of goldRow.blockingVisualRules || []) {
    if (rules.get(rule) !== true) failures.push(`blocking visual rule failed or missing: ${rule}`);
  }
  if (adjudication.verdict !== 'pass') failures.push(`adjudication verdict was ${adjudication.verdict || 'missing'}`);
  return humanResult(failures.length ? 'fail' : 'pass', failures.length === 0, failures, {
    goldRowId: adjudication.goldRowId,
    prompt: adjudication.prompt,
    promptSha256: adjudication.promptSha256,
    buildId: adjudication.buildId,
    sceneRenderPacketSha256: adjudication.sceneRenderPacketSha256,
    reviewer: adjudication.reviewer,
    reviewedAt: adjudication.reviewedAt,
    screenshotKind: adjudication.screenshotKind,
    screenshotSha256: adjudication.screenshotSha256,
    note: adjudication.note,
  });
}

function uniqueRowIndex(rows, label, allowedRows, requireEveryId) {
  const index = new Map();
  for (const row of rows || []) {
    const id = String(row && (row.goldRowId || row.id) || '');
    if (!id) {
      if (requireEveryId) throw new Error(`${label} contains a row without an identity`);
      continue;
    }
    if (allowedRows && !allowedRows.has(id)) throw new Error(`${label} contains unknown row ${id}`);
    if (index.has(id)) throw new Error(`${label} contains duplicate row ${id}`);
    index.set(id, row);
  }
  return index;
}

function validateGoverningMetric(goldSet) {
  const metric = goldSet.governingMetric;
  if (metric?.schema !== 'simulatte.promptGoldGoverningMetric.v1') {
    throw new Error('Gold set requires simulatte.promptGoldGoverningMetric.v1');
  }
  const difficulties = Array.isArray(metric.difficulties) ? metric.difficulties : [];
  if (!difficulties.length || new Set(difficulties).size !== difficulties.length ||
      difficulties.some((row) => !String(row || '').trim())) {
    throw new Error('Gold governing metric requires unique difficulty identities');
  }
  const minimumRowsPerDifficulty = Number(metric.minimumRowsPerDifficulty);
  if (!Number.isInteger(minimumRowsPerDifficulty) || minimumRowsPerDifficulty < 1) {
    throw new Error('Gold governing metric minimumRowsPerDifficulty must be a positive integer');
  }
  for (const field of [
    'maximumAuditDurationMs', 'maximumObservedJsHeapBytes',
    'maximumUnexpectedEntityCount', 'maximumReportedUnsupportedCount',
  ]) {
    const value = Number(metric[field]);
    if (!Number.isFinite(value) || value < 0 ||
        (field === 'maximumObservedJsHeapBytes' && value <= 0) ||
        (!['maximumAuditDurationMs', 'maximumObservedJsHeapBytes'].includes(field) && !Number.isInteger(value))) {
      throw new Error(`Gold governing metric ${field} is invalid`);
    }
  }
  if (metric.exactReplayRequired !== true) {
    throw new Error('Gold governing metric must require exact replay');
  }
  const seenRows = new Set();
  for (const row of goldSet.rows) {
    if (!row?.id || seenRows.has(row.id)) throw new Error(`Gold set contains duplicate or missing row ${row?.id || '(missing)'}`);
    seenRows.add(row.id);
    if (!difficulties.includes(row.difficulty)) throw new Error(`Gold row ${row.id} has undeclared difficulty ${row.difficulty || '(missing)'}`);
    if (!String(row.difficultyBasis || '').trim()) throw new Error(`Gold row ${row.id} is missing difficultyBasis`);
    validateExtractionRequirements(row);
  }
  for (const difficulty of difficulties) {
    const count = goldSet.rows.filter((row) => row.difficulty === difficulty).length;
    if (count < minimumRowsPerDifficulty) {
      throw new Error(`Gold difficulty ${difficulty} requires ${minimumRowsPerDifficulty} rows, received ${count}`);
    }
  }
  return {
    schema: metric.schema,
    difficulties: [...difficulties],
    minimumRowsPerDifficulty,
    exactReplayRequired: true,
    maximumAuditDurationMs: Number(metric.maximumAuditDurationMs),
    maximumObservedJsHeapBytes: Number(metric.maximumObservedJsHeapBytes),
    maximumUnexpectedEntityCount: Number(metric.maximumUnexpectedEntityCount),
    maximumReportedUnsupportedCount: Number(metric.maximumReportedUnsupportedCount),
    measures: [...(metric.measures || [])],
    doesNotMeasure: [...(metric.doesNotMeasure || [])],
  };
}

function validateExtractionRequirements(goldRow) {
  const rows = goldRow.extractionRequirements;
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error(`Gold row ${goldRow.id} requires extractionRequirements`);
  }
  const ids = new Set();
  for (const row of rows) {
    const id = String(row && row.id || '');
    if (!id || ids.has(id)) throw new Error(`Gold row ${goldRow.id} has duplicate or missing extraction requirement ${id || '(missing)'}`);
    ids.add(id);
    if (!['action', 'attribute', 'entity', 'quantity', 'relation'].includes(row.kind)) {
      throw new Error(`Gold row ${goldRow.id} extraction requirement ${id} has invalid kind ${row.kind || '(missing)'}`);
    }
    if (!Array.isArray(row.targetIds) || !row.targetIds.length || row.targetIds.some((targetId) => !String(targetId || ''))) {
      throw new Error(`Gold row ${goldRow.id} extraction requirement ${id} requires targetIds`);
    }
    if (row.polarity != null && !['required', 'forbidden'].includes(row.polarity)) {
      throw new Error(`Gold row ${goldRow.id} extraction requirement ${id} has invalid polarity`);
    }
    if (row.predicateAny != null && (!Array.isArray(row.predicateAny) || !row.predicateAny.length)) {
      throw new Error(`Gold row ${goldRow.id} extraction requirement ${id} has invalid predicateAny`);
    }
    if (row.value != null && row.minimumValue != null) {
      throw new Error(`Gold row ${goldRow.id} extraction requirement ${id} cannot declare value and minimumValue`);
    }
  }
}

function evaluateExtraction(ledger, goldRow) {
  const expected = goldRow.extractionRequirements || [];
  const failures = [];
  const actual = ledger && Array.isArray(ledger.requirements) ? ledger.requirements : [];
  if (ledger?.schema !== 'simulatte.intentRequirementLedger.v1') {
    failures.push({ id: 'ledger', reason: 'Phase 2 intent requirement ledger is missing or invalid' });
  }
  if (!String(ledger && ledger.contentHash || '').startsWith('fnv1a32:')) {
    failures.push({ id: 'ledger-content-hash', reason: 'Phase 2 intent requirement ledger is not content addressed' });
  }
  if (!String(ledger && ledger.sourcePromptHash || '').startsWith('fnv1a32:')) {
    failures.push({ id: 'source-prompt-hash', reason: 'Phase 2 intent requirement ledger is not bound to the source prompt' });
  }
  const matches = expected.map((row) => actual.some((candidate) => extractionRequirementMatches(candidate, row)));
  expected.forEach((row, index) => {
    if (!matches[index]) failures.push({ id: row.id, reason: `Phase 2 omitted expected ${row.kind} requirement ${row.id}` });
  });
  const matchedCount = matches.filter(Boolean).length;
  return {
    failures,
    observation: {
      status: failures.length ? 'fail' : 'pass',
      expectedCount: expected.length,
      matchedCount,
      recall: rate(matchedCount, expected.length),
      missingRequirementIds: expected.filter((row, index) => !matches[index]).map((row) => row.id),
      ledgerContentHash: String(ledger && ledger.contentHash || ''),
      sourcePromptHash: String(ledger && ledger.sourcePromptHash || ''),
    },
  };
}

function extractionRequirementMatches(candidate, expected) {
  if (!candidate || candidate.kind !== expected.kind) return false;
  if (expected.polarity && candidate.polarity !== expected.polarity) return false;
  const targetIds = new Set(candidate.targetIds || []);
  if (!expected.targetIds.every((targetId) => targetIds.has(targetId))) return false;
  if (expected.predicateAny && !expected.predicateAny.includes(candidate.predicate)) return false;
  if (expected.value != null && candidate.value !== expected.value) return false;
  if (expected.minimumValue != null && !(Number(candidate.value) >= Number(expected.minimumValue))) return false;
  return true;
}

function summarizeDifficulty(rows, difficulty) {
  const selected = rows.filter((row) => row.difficulty === difficulty);
  const machinePassCount = selected.filter((row) => row.machine.pass).length;
  const humanPassCount = selected.filter((row) => row.human.pass).length;
  const passCount = selected.filter((row) => row.pass).length;
  return {
    difficulty,
    promptCount: selected.length,
    machinePassCount,
    humanPassCount,
    passCount,
    machinePassRate: rate(machinePassCount, selected.length),
    humanPassRate: rate(humanPassCount, selected.length),
    gatedPassRate: rate(passCount, selected.length),
    pass: selected.length > 0 && passCount === selected.length,
  };
}

function rate(count, total) {
  return total ? Number((count / total).toFixed(4)) : 0;
}

function assertRuleIdentities(adjudicationRow, goldRow) {
  const expected = new Set(goldRow.blockingVisualRules || []);
  const seen = new Set();
  for (const rule of adjudicationRow.rules || []) {
    const id = String(rule && rule.id || '');
    if (!expected.has(id)) throw new Error(`Gold adjudication ${goldRow.id} contains unknown rule ${id || '(missing)'}`);
    if (seen.has(id)) throw new Error(`Gold adjudication ${goldRow.id} contains duplicate rule ${id}`);
    seen.add(id);
  }
}

function digestText(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function isSha256(value) {
  return /^[0-9a-f]{64}$/.test(String(value || ''));
}

function relationMatches(id, expected) {
  const text = String(id || '').toLowerCase();
  const aliases = { above: ['above', 'over'], inside: ['inside', 'in'], with: ['with'] };
  return text.includes(`entity-${expected.subjectType}`) && text.includes(`entity-${expected.objectType}`) &&
    (aliases[expected.kind] || [expected.kind]).some((kind) => text.includes(`:${kind}:`) || text.includes(`-${kind}-`));
}

function poseMatches(animationKind, expectedPose) {
  const value = String(animationKind || '');
  if (expectedPose === 'static') return value === 'static-pose';
  if (expectedPose === 'flight') return value === 'flight-path';
  if (expectedPose === 'play-interaction') return value === 'play-loop';
  if (expectedPose === 'grasp-hold') return value === 'hold-pose';
  return value.includes(expectedPose);
}

function parseProofRows(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function failure(id, reason) {
  return { id, reason };
}

function machineResult(failures, observations = {}) {
  return { status: failures.length ? 'fail' : 'pass', pass: failures.length === 0, failures, observations };
}

function humanResult(status, pass, failures, receipt) {
  return { status, pass, failures, receipt };
}
