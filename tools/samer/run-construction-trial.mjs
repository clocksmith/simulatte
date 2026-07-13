#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIR, '../..');
const DEFAULT_CONTRACT = path.join(TOOL_DIR, 'simulatte-construction-contract.json');
const DEFAULT_GOLD_SET = path.join(TOOL_DIR, 'simulatte-public-gold-v1.json');
const require = createRequire(import.meta.url);
const lab = require('../../public/app/simulation/simulation-lab.js');

function parseArgs(argv) {
  const options = {
    contractPath: DEFAULT_CONTRACT,
    goldSetPath: DEFAULT_GOLD_SET,
    outDir: '',
    checkOnly: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const [key, inline] = argv[index].split('=');
    const value = () => inline ?? argv[++index];
    if (key === '--contract') options.contractPath = path.resolve(value());
    else if (key === '--gold-set') options.goldSetPath = path.resolve(value());
    else if (key === '--out') options.outDir = path.resolve(value());
    else if (key === '--check') options.checkOnly = true;
    else if (key === '--help') {
      console.log('usage: node tools/samer/run-construction-trial.mjs [--check] [--contract PATH] [--gold-set PATH] [--out DIR]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argv[index]}`);
    }
  }
  return options;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function digest(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : canonicalJson(value));
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}

function assertContract(contract, goldSet) {
  if (contract.schema !== 'simulatte.samerConstructionContract.v1') {
    throw new Error(`Construction contract expected simulatte.samerConstructionContract.v1, received ${contract.schema || 'missing'}`);
  }
  if (goldSet.schema !== 'simulatte.promptGoldSet.v1' || goldSet.id !== contract.budget.promptSetId) {
    throw new Error(`Gold set expected ${contract.budget.promptSetId}, received ${goldSet.id || 'missing'}`);
  }
  const expected = [
    ['anchor', 'anchor', 'category-catalog'],
    ['targeted', 'targeted', 'prompt-obligation-coverage'],
    ['construction_control', 'control', 'deterministic-control'],
  ];
  if (!Array.isArray(contract.lanes) || contract.lanes.length !== expected.length) {
    throw new Error('Construction contract requires exactly three matched lanes');
  }
  for (let index = 0; index < expected.length; index += 1) {
    const lane = contract.lanes[index] || {};
    const [id, role, approachId] = expected[index];
    if (lane.id !== id || lane.role !== role || lane.approachId !== approachId) {
      throw new Error(`Lane ${index} expected ${id}/${role}/${approachId}, received ${lane.id}/${lane.role}/${lane.approachId}`);
    }
    if (!Number.isInteger(lane.seed) || lane.seed < 0) throw new Error(`Lane ${lane.id} has an invalid seed`);
  }
  if (!Array.isArray(goldSet.rows) || !goldSet.rows.length) throw new Error('Gold set requires rows');
  for (const row of goldSet.rows) {
    if (!row.id || !row.prompt || !Array.isArray(row.entities) || !row.entities.length) {
      throw new Error(`Gold row ${row.id || 'missing'} requires a prompt and entities`);
    }
  }
}

function repositoryState() {
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const status = execFileSync('git', ['status', '--short'], { cwd: ROOT, encoding: 'utf8' }).trim();
  return { revision, dirty: Boolean(status) };
}

function phase5ForLane(basePhase5, lane, contractHash) {
  const phase5 = structuredClone(basePhase5);
  phase5.artifact.simulationCompile.renderIR.constructionApproach = {
    schema: 'simulatte.constructionApproach.v1',
    id: lane.approachId,
    seed: lane.seed,
    laneId: lane.id,
    contractHash,
  };
  return phase5;
}

function compileLane(basePhase5, lane, contractHash, repetitions) {
  const phase5 = phase5ForLane(basePhase5, lane, contractHash);
  const phase5Hash = digest(phase5);
  const outputs = [];
  for (let index = 0; index < repetitions; index += 1) {
    outputs.push(lab.runPhase6VisualCompile(structuredClone(phase5)));
  }
  const hashes = outputs.map(digest);
  return {
    phase5Hash,
    phase6Hash: hashes[0],
    deterministic: hashes.every((hash) => hash === hashes[0]),
    phase6: outputs[0],
  };
}

function selectionRows(packet) {
  return (packet.entities || []).flatMap((entity) => {
    const program = entity.geometry && entity.geometry.program || {};
    const receipt = program.constructionSelectionReceipt || null;
    if (!receipt) return [];
    return [{
      entityId: entity.id || '',
      type: entity.identity && entity.identity.type || '',
      grammarId: program.grammarId || '',
      strategy: receipt.strategy || '',
      seed: Number(receipt.seed || 0),
      selectedObligationScore: selectedObligationScore(receipt),
      candidates: (receipt.candidates || []).map((row) => row.grammarId).sort(),
    }];
  });
}

function selectedObligationScore(receipt) {
  const row = (receipt.candidates || []).find((candidate) => candidate.grammarId === receipt.selectedGrammarId);
  return Number(row && row.obligationScore || 0);
}

function evaluateGoldRow(goldRow, phase6, lane) {
  const visualCompile = phase6.artifact.visualCompile;
  const packet = visualCompile.sceneRenderPacket || {};
  const ledger = visualCompile.compositionLedger || {};
  const entities = packet.entities || [];
  const obligations = [];
  for (const expected of goldRow.entities || []) {
    const matching = entities.filter((entity) => entity.identity && entity.identity.type === expected.type);
    const expectedCount = Number(expected.count || 0);
    const minimumCount = Number(expected.minimumCount || expectedCount);
    const countPass = expectedCount ? matching.length === expectedCount : matching.length >= minimumCount;
    obligations.push(obligation(`entity:${expected.type}:count`, countPass, {
      expectedCount: expectedCount || null,
      minimumCount: minimumCount || null,
      actualCount: matching.length,
    }));
    const specific = matching.filter((entity) => {
      const program = entity.geometry && entity.geometry.program || {};
      return program.grammarId !== 'object-grammar.object' && program.literal === true &&
        program.unsupportedIdentity !== true;
    });
    obligations.push(obligation(`entity:${expected.type}:specific-geometry`, specific.length === matching.length && matching.length > 0, {
      grammarIds: matching.map((entity) => entity.geometry && entity.geometry.program && entity.geometry.program.grammarId || ''),
    }));
  }
  for (const expected of goldRow.relations || []) {
    const relationRows = (ledger.obligations || []).filter((row) => row.kind === 'relation' || String(row.id || '').startsWith('relation:'));
    const relationPass = relationRows.some((row) => goldRelationMatches(row, expected) && row.status === 'preserved');
    obligations.push(obligation(`relation:${expected.subjectType}:${expected.kind}:${expected.objectType}`, relationPass, {
      matchedIds: relationRows.filter((row) => goldRelationMatches(row, expected)).map((row) => row.id),
    }));
  }
  for (const expected of goldRow.poses || []) {
    const matching = entities.filter((entity) => entity.identity && entity.identity.type === expected.type);
    const posePass = matching.length > 0 && matching.every((entity) => goldPoseMatches(entity, expected.pose, ledger));
    obligations.push(obligation(`pose:${expected.type}:${expected.pose}`, posePass, {
      animationKinds: matching.map((entity) => entity.animation && entity.animation.kind || ''),
      programPoses: matching.map((entity) => entity.geometry && entity.geometry.program && entity.geometry.program.pose || ''),
    }));
  }
  for (const expected of goldRow.properties || []) {
    const matching = entities.filter((entity) => entity.identity && entity.identity.type === expected.type);
    const bindings = matching.flatMap((entity) => (
      entity.geometry && entity.geometry.program && entity.geometry.program.promptPropertyBindings || []
    ));
    const propertyPass = bindings.some((binding) => (
      binding.propertyKind === expected.kind && binding.value === expected.value &&
      binding.status === 'bound' && (binding.matchedPartIds || []).length > 0
    ));
    obligations.push(obligation(`property:${expected.type}:${expected.kind}:${expected.value}`, propertyPass, {
      matchingBindings: bindings.filter((binding) => (
        binding.propertyKind === expected.kind && binding.value === expected.value
      )),
    }));
  }
  const selections = selectionRows(packet);
  const strategyPass = selections.length > 0 && selections.every((row) => row.strategy === lane.approachId);
  obligations.push(obligation('receipt:strategy-match', strategyPass, {
    strategies: [...new Set(selections.map((row) => row.strategy))],
  }));
  const requiredLosses = (ledger.obligations || []).filter((row) => row.required === true && /^(?:lost|failed|not-proven)$/.test(row.status));
  obligations.push(obligation('ledger:no-required-loss', requiredLosses.length === 0, {
    lossIds: requiredLosses.map((row) => row.id),
  }));
  const passed = obligations.filter((row) => row.pass).length;
  return {
    schema: 'simulatte.samerGoldEvaluation.v1',
    goldRowId: goldRow.id,
    prompt: goldRow.prompt,
    laneId: lane.id,
    pass: passed === obligations.length,
    passRate: Number((passed / Math.max(1, obligations.length)).toFixed(6)),
    obligations,
    selections,
    screenshotAdjudication: {
      status: 'required',
      rules: goldRow.blockingVisualRules || [],
    },
  };
}

function obligation(id, pass, evidence) {
  return { id, pass: Boolean(pass), evidence };
}

function goldRelationMatches(row, expected) {
  const id = String(row.id || '').toLowerCase();
  const relationAliases = {
    above: ['above', 'over'],
    inside: ['inside', 'in'],
    with: ['with'],
  };
  const kinds = relationAliases[expected.kind] || [expected.kind];
  return id.includes(`entity-${expected.subjectType}`) && id.includes(`entity-${expected.objectType}`) &&
    kinds.some((kind) => id.includes(`:${kind}:`) || id.includes(`-${kind}-`));
}

function goldPoseMatches(entity, expectedPose, ledger) {
  const animation = String(entity.animation && entity.animation.kind || '');
  const programPose = String(entity.geometry && entity.geometry.program && entity.geometry.program.pose || '');
  if (expectedPose === 'static') return animation === 'static-pose';
  if (expectedPose === 'flight') return /flight/.test(`${animation} ${programPose}`);
  if (new RegExp(expectedPose, 'i').test(`${animation} ${programPose}`)) return true;
  return (ledger.obligations || []).some((row) => (
    row.status === 'preserved' && String(row.id || '').includes(`pose-${entity.identity.type}-${expectedPose}`)
  ));
}

function candidateSetsByEntity(evaluation) {
  return Object.fromEntries(evaluation.selections.map((row) => [row.entityId, row.candidates]));
}

function equalCandidateSets(promptLanes) {
  const reference = candidateSetsByEntity(promptLanes[0].evaluation);
  return promptLanes.every((row) => canonicalJson(candidateSetsByEntity(row.evaluation)) === canonicalJson(reference));
}

function aggregateLane(lane, rows) {
  const obligationRows = rows.flatMap((row) => row.evaluation.obligations);
  const passed = obligationRows.filter((row) => row.pass).length;
  const selectionRowsForLane = rows.flatMap((row) => row.evaluation.selections);
  return {
    id: lane.id,
    role: lane.role,
    approachId: lane.approachId,
    goldObligationPassRate: Number((passed / Math.max(1, obligationRows.length)).toFixed(6)),
    goldPromptPassCount: rows.filter((row) => row.evaluation.pass).length,
    goldPromptCount: rows.length,
    meanSelectedObligationScore: Number((selectionRowsForLane.reduce((sum, row) => sum + row.selectedObligationScore, 0) /
      Math.max(1, selectionRowsForLane.length)).toFixed(6)),
  };
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(sortValue(value), null, 2)}\n`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const contract = readJson(options.contractPath);
  const goldSet = readJson(options.goldSetPath);
  assertContract(contract, goldSet);
  const contractHash = digest(fs.readFileSync(options.contractPath));
  const goldSetHash = digest(fs.readFileSync(options.goldSetPath));
  if (options.checkOnly) {
    console.log(`contract=${contract.experimentId} goldSet=${goldSet.id} rows=${goldSet.rows.length} status=valid`);
    return;
  }
  const repository = repositoryState();
  const promptResults = [];
  for (const goldRow of goldSet.rows) {
    const spec = lab.createSpecFromPrompt(goldRow.prompt, { allowPrototypeFallback: true });
    const basePhase5 = spec.phaseArtifacts.phase5;
    const basePhase5Hash = digest(basePhase5);
    const lanes = contract.lanes.map((lane) => {
      const compiled = compileLane(basePhase5, lane, contractHash, contract.budget.recompilesPerLane);
      const evaluation = evaluateGoldRow(goldRow, compiled.phase6, lane);
      return {
        laneId: lane.id,
        approachId: lane.approachId,
        phase5Hash: compiled.phase5Hash,
        phase6Hash: compiled.phase6Hash,
        deterministic: compiled.deterministic,
        evaluation,
      };
    });
    promptResults.push({
      goldRowId: goldRow.id,
      prompt: goldRow.prompt,
      basePhase5Hash,
      equalCandidateSets: equalCandidateSets(lanes),
      lanes,
    });
  }
  const laneSummaries = contract.lanes.map((lane) => aggregateLane(lane, promptResults.map((prompt) => ({
    evaluation: prompt.lanes.find((row) => row.laneId === lane.id).evaluation,
  }))));
  const mechanicsPass = promptResults.every((prompt) => (
    prompt.equalCandidateSets && prompt.lanes.every((lane) => lane.deterministic)
  ));
  const targeted = laneSummaries.find((lane) => lane.id === 'targeted');
  const report = {
    schema: 'simulatte.samerConstructionTrial.v1',
    experimentId: contract.experimentId,
    evidenceStage: mechanicsPass ? 'mechanics_proven' : 'harness_ready',
    claimBoundary: 'This trial proves matched deterministic Phase 6 construction-policy execution only. Public prompts, structural receipts, and absent screenshot adjudication do not prove visual capability.',
    contract: { path: path.relative(ROOT, options.contractPath), sha256: contractHash },
    goldSet: { path: path.relative(ROOT, options.goldSetPath), sha256: goldSetHash, rowCount: goldSet.rows.length },
    repository,
    laneSummaries,
    promptResults,
    promotion: {
      eligible: false,
      targetedGoldObligationPassRate: targeted.goldObligationPassRate,
      blockers: [
        'live pixel reports are absent for matched lanes',
        'human screenshot adjudication is absent',
        'sealed promotion prompts are absent',
        ...(repository.dirty ? ['repository has uncommitted changes'] : []),
      ],
    },
  };
  const runId = `${contract.experimentId}-${contractHash.slice(0, 10)}-${goldSetHash.slice(0, 10)}`;
  const outDir = options.outDir || path.join(ROOT, 'artifacts', 'samer', runId);
  writeJson(path.join(outDir, 'report.json'), report);
  console.log(`experiment=${contract.experimentId} stage=${report.evidenceStage} targetedGold=${targeted.goldObligationPassRate} report=${path.relative(ROOT, path.join(outDir, 'report.json'))}`);
  if (!mechanicsPass) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
}
