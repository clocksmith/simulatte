import crypto from 'node:crypto';
import fs from 'node:fs';

const GOLD_ADJUDICATION_SCHEMA = 'simulatte.goldVisualAdjudication.v2';

export function loadGoldSet(file) {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (value.schema !== 'simulatte.promptGoldSet.v1' || !value.id || !Array.isArray(value.rows)) {
    throw new Error(`Gold set ${file} expected simulatte.promptGoldSet.v1 with rows`);
  }
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
    const machine = evaluateMachineGoldRow(result, goldRow);
    const human = evaluateHumanGoldRow(result, goldRow, adjudicationByGoldId.get(goldRow.id));
    return {
      schema: 'simulatte.goldVisualResult.v1',
      goldRowId: goldRow.id,
      prompt: goldRow.prompt,
      machine,
      human,
      pass: machine.pass && human.pass,
    };
  });
  return {
    schema: 'simulatte.goldVisualEvaluation.v1',
    goldSetId: goldSet.id,
    promptCount: rows.length,
    machinePassCount: rows.filter((row) => row.machine.pass).length,
    humanPassCount: rows.filter((row) => row.human.pass).length,
    passCount: rows.filter((row) => row.pass).length,
    pass: rows.every((row) => row.pass),
    rows,
  };
}

function evaluateMachineGoldRow(result, goldRow) {
  if (!result) return machineResult([failure('audit-result', 'missing screenshot audit result')]);
  const failures = [];
  const expectedPromptHash = digestText(goldRow.prompt);
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
    failures.push(failure('screenshot-sha256', 'audit result is missing the screenshot hash'));
  }
  const identities = result.sceneRenderPacketIdentities || [];
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
  const relations = result.phase6CompositionObligations || [];
  for (const expected of goldRow.relations || []) {
    if (!relations.some((row) => row.status === 'preserved' && relationMatches(row.id, expected))) {
      failures.push(failure(`relation:${expected.subjectType}:${expected.kind}:${expected.objectType}`, 'required relation did not reach Phase 6 as preserved'));
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
  return machineResult(failures);
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
  if (adjudication.screenshotSha256 !== result.screenshotHash) {
    failures.push('adjudication screenshot hash does not match captured screenshot');
  }
  if (!adjudication.reviewer || !adjudication.reviewedAt) {
    failures.push('reviewer and reviewedAt are required');
  }
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
    screenshotSha256: adjudication.screenshotSha256,
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

function failure(id, reason) {
  return { id, reason };
}

function machineResult(failures) {
  return { status: failures.length ? 'fail' : 'pass', pass: failures.length === 0, failures };
}

function humanResult(status, pass, failures, receipt) {
  return { status, pass, failures, receipt };
}
