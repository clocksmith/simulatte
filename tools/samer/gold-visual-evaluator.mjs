import fs from 'node:fs';

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
  if (value.schema !== 'simulatte.goldVisualAdjudication.v1' || !value.goldSetId || !Array.isArray(value.rows)) {
    throw new Error(`Gold adjudication ${file} expected simulatte.goldVisualAdjudication.v1 with rows`);
  }
  return value;
}

export function evaluateGoldVisualResults(results, goldSet, adjudication = null) {
  if (!goldSet) return null;
  if (adjudication && adjudication.goldSetId !== goldSet.id) {
    throw new Error(`Gold adjudication expected goldSetId ${goldSet.id}, received ${adjudication.goldSetId}`);
  }
  const resultByGoldId = new Map((results || []).map((result) => [result.goldRowId, result]));
  const adjudicationByGoldId = new Map((adjudication && adjudication.rows || [])
    .map((row) => [row.goldRowId, row]));
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
    reviewer: adjudication.reviewer,
    reviewedAt: adjudication.reviewedAt,
    screenshotSha256: adjudication.screenshotSha256,
  });
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
