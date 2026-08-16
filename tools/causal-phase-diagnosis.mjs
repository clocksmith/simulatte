#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DIAGNOSIS_SCHEMA = 'simulatte.causalPhaseDiagnosis.v1';
export const FAILURE_RUN_SCHEMA = 'simulatte.phaseFailureRun.v1';
export const PHASE_TAXONOMY = Object.freeze([
  phase(1, 'runtime'),
  phase(2, 'language'),
  phase(3, 'retrieval'),
  phase(4, 'grounded-intent'),
  phase(5, 'simulation'),
  phase(6, 'visual'),
  phase(7, 'render'),
  phase(8, 'scene-proof'),
]);

function phase(index, id) {
  return Object.freeze({ index, id });
}

export function earliestObservableDivergence(observations) {
  const rows = validateObservations(observations);
  const row = rows.find((entry) => entry.status !== 'pass') || null;
  return row ? observationIdentity(row) : null;
}

export async function diagnosePhaseBoundary(input = {}) {
  const observations = validateObservations(input.observations);
  const earliest = observations.find((row) => row.status !== 'pass');
  if (!earliest) throw new Error('Causal diagnosis requires an observable phase divergence');
  const knownGoodArtifact = requireArtifact(input.knownGoodArtifact, 'known-good phase artifact');
  const candidate = validateLane(input.candidateLane, 'candidate');
  const reference = validateLane(input.referenceLane, 'reference');
  if (candidate.id === reference.id || candidate.implementationHash === reference.implementationHash) {
    throw new Error('Candidate and reference downstream implementations must have distinct identities and hashes');
  }
  const suspectArtifact = earliest.artifact;
  if (artifactHash(suspectArtifact) === artifactHash(knownGoodArtifact)) {
    throw new Error('Suspect and known-good artifacts must have distinct identities');
  }
  const experiments = [];
  experiments.push(await runExperiment(candidate, 'suspect', suspectArtifact, earliest));
  experiments.push(await runExperiment(candidate, 'known-good', knownGoodArtifact, earliest));
  experiments.push(await runExperiment(reference, 'suspect', suspectArtifact, earliest));
  experiments.push(await runExperiment(reference, 'known-good', knownGoodArtifact, earliest));
  const attribution = classifyAttribution(experiments);
  const receipt = {
    schema: DIAGNOSIS_SCHEMA,
    phaseTaxonomy: PHASE_TAXONOMY.map((row) => ({ ...row })),
    earliestObservableDivergence: observationIdentity(earliest),
    retainedFailureArtifacts: observations.map((row) => ({
      phase: row.phase,
      phaseId: row.phaseId,
      status: row.status,
      obligationIds: row.obligationIds,
      artifactHash: artifactHash(row.artifact),
    })),
    suspectArtifactHash: artifactHash(suspectArtifact),
    knownGoodArtifactHash: artifactHash(knownGoodArtifact),
    lanes: {
      candidate: laneIdentity(candidate),
      reference: laneIdentity(reference),
    },
    experiments,
    attribution,
  };
  receipt.contentHash = contentHash(receipt);
  validateDiagnosis(receipt);
  return receipt;
}

export function validateDiagnosis(receipt) {
  requireObject(receipt, 'diagnosis receipt');
  requireExactKeys(receipt, [
    'schema', 'phaseTaxonomy', 'earliestObservableDivergence', 'retainedFailureArtifacts',
    'suspectArtifactHash', 'knownGoodArtifactHash', 'lanes', 'experiments', 'attribution',
    'contentHash',
  ], 'diagnosis receipt');
  if (receipt.schema !== DIAGNOSIS_SCHEMA) throw new Error(`Expected ${DIAGNOSIS_SCHEMA}`);
  validateTaxonomy(receipt.phaseTaxonomy);
  validateObservationIdentity(receipt.earliestObservableDivergence);
  if (!Array.isArray(receipt.retainedFailureArtifacts) || receipt.retainedFailureArtifacts.length !== 8) {
    throw new Error('Diagnosis must retain all eight failing-run phase artifacts');
  }
  receipt.retainedFailureArtifacts.forEach((row, index) => {
    requireExactKeys(row, ['phase', 'phaseId', 'status', 'obligationIds', 'artifactHash'], `retained phase ${index + 1}`);
    validateObservationIdentity(row);
    if (row.phase !== PHASE_TAXONOMY[index].index || row.phaseId !== PHASE_TAXONOMY[index].id) {
      throw new Error('Retained failure artifacts are not in canonical phase order');
    }
    requireHash(row.artifactHash, `retained phase ${index + 1} artifactHash`);
  });
  const expectedEarliest = receipt.retainedFailureArtifacts.find((row) => row.status !== 'pass');
  if (!expectedEarliest || canonicalJson(observationIdentity(expectedEarliest)) !==
    canonicalJson(receipt.earliestObservableDivergence)) {
    throw new Error('Earliest observable divergence does not match retained phase outcomes');
  }
  requireHash(receipt.suspectArtifactHash, 'suspectArtifactHash');
  requireHash(receipt.knownGoodArtifactHash, 'knownGoodArtifactHash');
  if (receipt.suspectArtifactHash !== expectedEarliest.artifactHash) {
    throw new Error('Suspect artifact does not match the earliest divergence');
  }
  if (receipt.suspectArtifactHash === receipt.knownGoodArtifactHash) {
    throw new Error('Suspect and known-good artifact identities are not distinct');
  }
  requireObject(receipt.lanes, 'lanes');
  requireExactKeys(receipt.lanes, ['candidate', 'reference'], 'lanes');
  for (const role of ['candidate', 'reference']) validateLaneIdentity(receipt.lanes[role], role);
  if (receipt.lanes.candidate.id === receipt.lanes.reference.id ||
    receipt.lanes.candidate.implementationHash === receipt.lanes.reference.implementationHash) {
    throw new Error('Diagnosis lanes are not independent');
  }
  if (!Array.isArray(receipt.experiments) || receipt.experiments.length !== 4) {
    throw new Error('Diagnosis requires all four artifact-substitution experiments');
  }
  receipt.experiments.forEach(validateExperiment);
  const expectedIds = [
    'candidate:suspect', 'candidate:known-good', 'reference:suspect', 'reference:known-good',
  ];
  if (canonicalJson(receipt.experiments.map((row) => row.id)) !== canonicalJson(expectedIds)) {
    throw new Error('Diagnosis experiments are missing, duplicated, or out of order');
  }
  for (const experiment of receipt.experiments) {
    const laneRole = experiment.id.split(':')[0];
    const expectedLane = receipt.lanes[laneRole];
    const expectedArtifactHash = experiment.artifactRole === 'suspect'
      ? receipt.suspectArtifactHash
      : receipt.knownGoodArtifactHash;
    if (!expectedLane || experiment.laneId !== expectedLane.id ||
      experiment.laneImplementationHash !== expectedLane.implementationHash) {
      throw new Error('Experiment is not bound to its declared downstream lane');
    }
    if (experiment.artifactHash !== expectedArtifactHash) {
      throw new Error('Experiment is not bound to its declared artifact role');
    }
  }
  const expectedAttribution = classifyAttribution(receipt.experiments);
  if (canonicalJson(receipt.attribution) !== canonicalJson(expectedAttribution)) {
    throw new Error('Diagnosis attribution does not match its interventions');
  }
  requireHash(receipt.contentHash, 'contentHash');
  if (receipt.contentHash !== contentHash(receipt)) throw new Error('Diagnosis contentHash does not match canonical content');
  return receipt;
}

async function runExperiment(lane, artifactRole, artifact, divergence) {
  const inputArtifactHash = artifactHash(artifact);
  const requiredPhaseIds = PHASE_TAXONOMY.slice(divergence.phase).map((row) => row.id);
  let result;
  try {
    result = await lane.run({
      phase: divergence.phase,
      phaseId: divergence.phaseId,
      artifact: structuredClone(artifact),
      artifactRole,
      inputArtifactHash,
      requiredPhaseIds: [...requiredPhaseIds],
    });
  } catch (error) {
    result = { verdict: 'error', error: error && error.message ? error.message : String(error) };
  }
  requireObject(result, `${lane.role} ${artifactRole} result`);
  const verdict = String(result.verdict || result.status || 'not-proven');
  if (!['pass', 'fail', 'not-proven', 'error'].includes(verdict)) {
    throw new Error(`Unknown intervention verdict ${verdict}`);
  }
  validateReplayExecution(result.execution, {
    inputArtifactHash,
    startedAfterPhase: divergence.phase,
    requiredPhaseIds,
  });
  return {
    schema: 'simulatte.causalPhaseExperiment.v1',
    id: `${lane.role}:${artifactRole}`,
    laneId: lane.id,
    laneImplementationHash: lane.implementationHash,
    artifactRole,
    artifactHash: inputArtifactHash,
    verdict,
    outcomeHash: artifactHash(result),
  };
}

function validateReplayExecution(value, expected) {
  requireObject(value, 'downstream replay execution');
  requireExactKeys(value, [
    'schema', 'inputArtifactHash', 'startedAfterPhase', 'executedPhaseIds',
    'completedThroughPhase',
  ], 'downstream replay execution');
  if (value.schema !== 'simulatte.downstreamReplayExecution.v1' ||
    value.inputArtifactHash !== expected.inputArtifactHash ||
    value.startedAfterPhase !== expected.startedAfterPhase ||
    value.completedThroughPhase !== 8 ||
    canonicalJson(value.executedPhaseIds) !== canonicalJson(expected.requiredPhaseIds)) {
    throw new Error('Downstream runner skipped or misidentified required replay phases');
  }
}

function classifyAttribution(experiments) {
  const verdict = Object.fromEntries(experiments.map((row) => [row.id, row.verdict]));
  const failed = (value) => ['fail', 'not-proven', 'error'].includes(value);
  if (failed(verdict['candidate:suspect']) && verdict['candidate:known-good'] === 'pass' &&
    failed(verdict['reference:suspect']) && verdict['reference:known-good'] === 'pass') {
    return {
      status: 'proven',
      owner: 'suspect-phase-output',
      reason: 'Both downstream implementations fail on the suspect artifact and pass on the known-good substitution.',
    };
  }
  if (failed(verdict['candidate:suspect']) && failed(verdict['candidate:known-good']) &&
    verdict['reference:suspect'] === 'pass' && verdict['reference:known-good'] === 'pass') {
    return {
      status: 'proven',
      owner: 'candidate-downstream',
      reason: 'The candidate downstream fails both artifacts while the reference downstream passes both.',
    };
  }
  return {
    status: 'not-proven',
    owner: 'inconclusive',
    reason: 'The artifact substitutions do not isolate one owner.',
  };
}

function validateObservations(value) {
  if (!Array.isArray(value) || value.length !== PHASE_TAXONOMY.length) {
    throw new Error('Failure run must retain exactly eight ordered phase observations');
  }
  return value.map((row, index) => {
    requireObject(row, `phase observation ${index + 1}`);
    const expected = PHASE_TAXONOMY[index];
    if (row.phase !== expected.index || row.phaseId !== expected.id) {
      throw new Error(`Expected phase ${expected.index} ${expected.id}`);
    }
    const status = String(row.status || '');
    if (!['pass', 'fail', 'not-proven'].includes(status)) throw new Error(`Invalid phase ${row.phase} status`);
    return {
      phase: row.phase,
      phaseId: row.phaseId,
      status,
      obligationIds: uniqueStrings(row.obligationIds),
      artifact: requireArtifact(row.artifact, `phase ${row.phase} artifact`),
    };
  });
}

function observationIdentity(row) {
  return {
    phase: row.phase,
    phaseId: row.phaseId,
    status: row.status,
    obligationIds: uniqueStrings(row.obligationIds),
  };
}

function validateObservationIdentity(row) {
  requireObject(row, 'phase observation identity');
  for (const key of ['phase', 'phaseId', 'status', 'obligationIds']) {
    if (!Object.hasOwn(row, key)) throw new Error(`Phase observation is missing ${key}`);
  }
  const expected = PHASE_TAXONOMY[row.phase - 1];
  if (!expected || expected.id !== row.phaseId) throw new Error('Phase observation has an invalid identity');
  if (!['pass', 'fail', 'not-proven'].includes(row.status)) throw new Error('Phase observation has an invalid status');
  if (!Array.isArray(row.obligationIds)) throw new Error('Phase observation obligationIds must be an array');
}

function validateTaxonomy(rows) {
  if (canonicalJson(rows) !== canonicalJson(PHASE_TAXONOMY)) throw new Error('Diagnosis phase taxonomy is invalid');
}

function validateLane(value, role) {
  requireObject(value, `${role} lane`);
  const id = String(value.id || '').trim();
  const implementationHash = String(value.implementationHash || '').trim();
  if (!id || typeof value.run !== 'function') throw new Error(`${role} lane requires id and run`);
  requireHash(implementationHash, `${role} implementationHash`);
  return { role, id, implementationHash, run: value.run };
}

function laneIdentity(lane) {
  return { id: lane.id, implementationHash: lane.implementationHash };
}

function validateLaneIdentity(value, role) {
  requireObject(value, `${role} lane identity`);
  requireExactKeys(value, ['id', 'implementationHash'], `${role} lane identity`);
  if (!String(value.id || '').trim()) throw new Error(`${role} lane identity requires id`);
  requireHash(value.implementationHash, `${role} implementationHash`);
}

function validateExperiment(row, index) {
  requireObject(row, `experiment ${index + 1}`);
  requireExactKeys(row, [
    'schema', 'id', 'laneId', 'laneImplementationHash', 'artifactRole', 'artifactHash',
    'verdict', 'outcomeHash',
  ], `experiment ${index + 1}`);
  if (row.schema !== 'simulatte.causalPhaseExperiment.v1') throw new Error('Unexpected experiment schema');
  if (!['suspect', 'known-good'].includes(row.artifactRole)) throw new Error('Unexpected artifact role');
  if (!['pass', 'fail', 'not-proven', 'error'].includes(row.verdict)) throw new Error('Unexpected experiment verdict');
  requireHash(row.laneImplementationHash, 'experiment laneImplementationHash');
  requireHash(row.artifactHash, 'experiment artifactHash');
  requireHash(row.outcomeHash, 'experiment outcomeHash');
}

function requireArtifact(value, label) {
  requireObject(value, label);
  return value;
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
}

function requireExactKeys(value, keys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (canonicalJson(actual) !== canonicalJson(expected)) throw new Error(`${label} has undeclared or missing fields`);
}

function requireHash(value, label) {
  if (!/^sha256:[0-9a-f]{64}$/.test(String(value || ''))) throw new Error(`${label} must be a sha256 identity`);
}

function uniqueStrings(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))).sort();
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().flatMap((key) => (
    value[key] === undefined ? [] : [[key, canonicalValue(value[key])]]
  )));
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function artifactHash(value) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function contentHash(value) {
  const copy = { ...(value || {}) };
  delete copy.contentHash;
  return artifactHash(copy);
}

async function cli(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log([
      'usage: node tools/causal-phase-diagnosis.mjs --failure-run FILE --known-good FILE',
      '       --candidate-runner MODULE --reference-runner MODULE [--out FILE]',
      '',
      'Runner modules export replayDownstream(context) with a complete downstream execution receipt.',
      'The failure-run file contains { schema, observations } for all eight phases.',
    ].join('\n'));
    return;
  }
  for (const key of ['failureRun', 'knownGood', 'candidateRunner', 'referenceRunner']) {
    if (!options[key]) throw new Error(`Missing --${camelToFlag(key)}`);
  }
  const failureRun = JSON.parse(await fs.readFile(options.failureRun, 'utf8'));
  if (failureRun.schema !== FAILURE_RUN_SCHEMA) throw new Error(`Expected ${FAILURE_RUN_SCHEMA}`);
  const knownGoodArtifact = JSON.parse(await fs.readFile(options.knownGood, 'utf8'));
  const candidateLane = await loadLane(options.candidateRunner, 'candidate');
  const referenceLane = await loadLane(options.referenceRunner, 'reference');
  const receipt = await diagnosePhaseBoundary({
    observations: failureRun.observations,
    knownGoodArtifact,
    candidateLane,
    referenceLane,
  });
  const output = `${JSON.stringify(receipt, null, 2)}\n`;
  if (options.out) {
    await fs.mkdir(path.dirname(options.out), { recursive: true });
    await fs.writeFile(options.out, output);
    console.log(`causal diagnosis ${receipt.attribution.status}: ${receipt.attribution.owner}; wrote ${options.out}`);
  } else {
    process.stdout.write(output);
  }
}

function parseArgs(argv) {
  const options = { help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const [flag, inline] = argv[index].split('=');
    const value = () => path.resolve(inline ?? argv[++index] ?? '');
    if (flag === '--help') options.help = true;
    else if (flag === '--failure-run') options.failureRun = value();
    else if (flag === '--known-good') options.knownGood = value();
    else if (flag === '--candidate-runner') options.candidateRunner = value();
    else if (flag === '--reference-runner') options.referenceRunner = value();
    else if (flag === '--out') options.out = value();
    else throw new Error(`Unknown argument ${flag}`);
  }
  return options;
}

async function loadLane(modulePath, role) {
  const source = await fs.readFile(modulePath);
  const imported = await import(`${pathToFileURL(modulePath).href}?sha=${artifactHash(source.toString()).slice(7)}`);
  const run = imported.replayDownstream || imported.default;
  if (typeof run !== 'function') throw new Error(`${role} runner must export replayDownstream`);
  return {
    id: `${role}:${path.basename(modulePath)}`,
    implementationHash: `sha256:${crypto.createHash('sha256').update(source).digest('hex')}`,
    run,
  };
}

function camelToFlag(value) {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

const executedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === executedPath) {
  cli(process.argv.slice(2)).catch((error) => {
    console.error(error && error.message ? error.message : error);
    process.exitCode = 1;
  });
}
