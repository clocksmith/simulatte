#!/usr/bin/env node
// Language-to-place resolution evaluation over the public diagnostic probe
// corpus (tools/samer/autonomy/place-resolution-probes-v1.json).
//
// The control lane is the prior deterministic compiler policy: exact labels
// plus constrained fuzzy matching. The challenger is the shipped default
// compiler with the receipted extended typo policy enabled. An optional model
// candidate loads via --challenger <module.mjs>; the module must export
// createResolver({ world, embodiment }) returning
// { id, resolve(probe) -> { outcome: 'resolve'|'refuse', nodeId? } }.
//
// Scoring per probe:
//   correct      gold outcome matched; resolve additionally requires the
//                gold place's exact world node id
//   wrongPlace   resolved to a node other than gold (worst class)
//   violation    resolved anything on an ambiguous or out_of_world probe
//
// Guardrails, all hard:
//   must_refuse_violations == 0
//   exact and typo_within probes stay correct (control floor)
//   wrong_place_resolutions == 0
//
// A challenger is accepted only when it clears both guardrails and scores
// strictly more correct probes than the control. Results on this exposed
// corpus cannot promote a resolver; the claim boundary rides in the receipt.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIR, '../..');
const require = createRequire(import.meta.url);
const missionApi = require('../../public/simulatte/mission/mission-compiler.js');
const RECEIPT_ID = 'place-resolution-public-diagnostic-v2';
const OUTPUT = path.join(ROOT, `public/data/simulatte/evidence/${RECEIPT_ID}.json`);
const FLOOR_KINDS = Object.freeze(['exact', 'typo_within']);
const MUST_REFUSE_KINDS = Object.freeze(['ambiguous', 'out_of_world']);
const EXPECTED_CONTROL_REFUSAL_CODES = Object.freeze([
  'origin_not_grounded',
  'destination_not_grounded',
  'from_place_ambiguous',
  'to_place_ambiguous',
  // Two diagnostic paraphrases contain "around" as a place relation. The
  // shipped lexical compiler currently attempts its circuit grammar first.
  'termination_not_grounded',
]);

function parseArgs(argv) {
  const options = { challenger: '', check: false, output: OUTPUT, corpus: '', sealedOpen: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--challenger') {
      options.challenger = String(argv[index + 1] || '');
      index += 1;
    } else if (argv[index] === '--check') {
      options.check = true;
    } else if (argv[index] === '--out') {
      options.output = path.resolve(ROOT, String(argv[index + 1] || ''));
      index += 1;
    } else if (argv[index] === '--corpus') {
      options.corpus = String(argv[index + 1] || '');
      index += 1;
    } else if (argv[index] === '--sealed-open') {
      options.sealedOpen = true;
    } else {
      throw new Error(`unknown argument: ${argv[index]}`);
    }
  }
  if (!options.output) throw new Error('--out expected a path');
  if (options.sealedOpen && !options.corpus) throw new Error('--sealed-open requires --corpus <sealed population path>');
  return options;
}

// One-authorized-opening protocol for sealed populations. Verifies the
// population against its committed SHA-256, refuses a second opening, and
// appends the opening receipt to the commitment file after the run.
function openSealedPopulation(corpusPath) {
  const commitmentPath = path.join(ROOT, 'tools/samer/autonomy/sealed-place-population-v1.commitment.json');
  const commitment = JSON.parse(fs.readFileSync(commitmentPath, 'utf8'));
  const raw = fs.readFileSync(path.resolve(ROOT, corpusPath), 'utf8');
  const sha = crypto.createHash('sha256').update(raw).digest('hex');
  if (sha !== commitment.populationSha256) {
    throw new Error(`sealed population SHA-256 mismatch: expected ${commitment.populationSha256}, received ${sha}`);
  }
  if (commitment.openings.length > 0) {
    throw new Error(`sealed population already opened at ${commitment.openings[0].openedAt}; promotion evidence allows one opening`);
  }
  return {
    commitment,
    recordOpening(summary) {
      commitment.openings.push({ openedAt: new Date().toISOString(), populationSha256: sha, summary });
      fs.writeFileSync(commitmentPath, `${JSON.stringify(commitment, null, 2)}\n`);
    },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const files = {
    corpus: options.corpus || 'tools/samer/simulatte/place-resolution-probes-v1.json',
    world: 'public/data/simulatte/worlds/nyc-core-autonomy-v1.json',
    embodiment: 'public/data/simulatte/embodiments/delivery-bike-v1.json',
    compiler: 'public/simulatte/mission/mission-compiler.js',
  };
  const sealed = options.sealedOpen ? openSealedPopulation(files.corpus) : null;
  const corpus = readJson(files.corpus);
  const world = readJson(files.world);
  const embodiment = readJson(files.embodiment);
  const eligibleNodeIds = new Set(missionApi.eligiblePlaceNodeIds(world, embodiment.kind));
  const nodeIdByLabel = new Map(world.nodes.filter((node) => node.label && eligibleNodeIds.has(node.id)).map((node) => [node.label, node.id]));

  const resolver = (id, deterministicPlaceResolution) => ({
    id,
    resolve(probe) {
      try {
        const mission = missionApi.compileMission(probe.sourceText, world, embodiment, { deterministicPlaceResolution });
        return {
          outcome: 'resolve',
          nodeId: probe.role === 'origin' ? mission.originNodeId : mission.destinationNodeId,
        };
      } catch (error) {
        if (!EXPECTED_CONTROL_REFUSAL_CODES.includes(error?.code)) throw error;
        return { outcome: 'refuse' };
      }
    },
  });

  const lanes = {
    control: await evaluateLane(resolver('mission-compiler-legacy-constrained-v1', 'legacy_constrained'), corpus, nodeIdByLabel),
    challenger: await evaluateLane(resolver('mission-compiler-extended-typo-v2', 'extended_typo'), corpus, nodeIdByLabel),
  };
  const identities = Object.fromEntries(
    Object.entries(files).map(([key, file]) => [key, { path: file, sha256: hashFile(file) }])
  );

  const accepted = lanes.challenger.guardrails.mustRefuseViolations === 0
    && lanes.challenger.guardrails.floorMisses === 0
    && lanes.challenger.metrics.wrongPlace === 0
    && lanes.challenger.metrics.correct > lanes.control.metrics.correct;

  if (options.challenger) {
    const challengerModule = await import(pathToFileURL(path.resolve(ROOT, options.challenger)).href);
    const challenger = await challengerModule.createResolver({ world, embodiment });
    try {
      lanes.modelCandidate = await evaluateLane(challenger, corpus, nodeIdByLabel);
    } finally {
      await challenger.dispose?.();
    }
    identities.modelCandidateModule = { path: options.challenger, sha256: hashFile(options.challenger) };
    identities.modelCandidateAssets = structuredClone(challenger.identities || null);
  }

  const receipt = {
    schema: 'simulatte.placeResolutionEvaluation.v2',
    id: RECEIPT_ID,
    contentVersion: corpus.contentVersion,
    population: {
      id: corpus.id,
      kind: corpus.population,
      promotionEligible: false,
      probeCount: corpus.probes.length,
    },
    intervention: {
      kind: 'language_to_place_resolution',
      control: lanes.control.resolverId,
      challenger: lanes.challenger.resolverId,
      frozenMetric: 'correct_probe_count',
      guardrails: ['must_refuse_violations_zero', 'wrong_place_resolutions_zero', 'exact_and_typo_within_floor'],
    },
    identities,
    lanes,
    accepted,
    modelSelection: lanes.modelCandidate ? {
      status: lanes.modelCandidate.metrics.correct > lanes.challenger.metrics.correct
        ? 'candidate_improves_default'
        : 'rejected_no_incremental_gain',
      incrementalCorrect: lanes.modelCandidate.metrics.correct - lanes.challenger.metrics.correct,
      defaultCorrect: lanes.challenger.metrics.correct,
      modelCorrect: lanes.modelCandidate.metrics.correct,
    } : null,
    claimBoundary: 'This receipt scores language-to-place resolution on exposed diagnostic probes. It cannot promote a resolver, establish model quality, or support a generalization claim. Promotion needs an unmounted holdout population.',
  };
  const serialized = `${JSON.stringify(sortValue(receipt), null, 2)}\n`;
  if (options.check) {
    const existing = fs.readFileSync(options.output, 'utf8');
    if (existing !== serialized) throw new Error(`place-resolution receipt is stale: run ${reproductionCommand(options)}`);
  } else {
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, serialized);
  }
  const summary = lanes.challenger;
  if (sealed) {
    sealed.recordOpening({
      lane: summary?.resolverId || lanes.control.resolverId,
      correct: (summary || lanes.control).metrics.correct,
      probeCount: corpus.probes.length,
      accepted,
    });
  }
  console.log(`PLACE-RESOLUTION check=${options.check ? 'pass' : 'write'} accepted=${accepted} lane=${summary.resolverId} correct=${summary.metrics.correct}/${corpus.probes.length} winnable=${summary.metrics.winnableResolved}/${summary.metrics.winnableTotal} violations=${summary.guardrails.mustRefuseViolations} output=${path.relative(ROOT, options.output)}`);
  if (!accepted) process.exitCode = 1;
}

async function evaluateLane(resolver, corpus, nodeIdByLabel) {
  const rows = [];
  const perKind = {};
  const batchResults = resolver.resolveMany
    ? await resolver.resolveMany(corpus.probes)
    : await Promise.all(corpus.probes.map((probe) => resolver.resolve(probe)));
  if (!Array.isArray(batchResults) || batchResults.length !== corpus.probes.length) {
    throw new Error(`${resolver.id || 'resolver'} expected ${corpus.probes.length} results, received ${batchResults?.length || 0}`);
  }
  for (let probeIndex = 0; probeIndex < corpus.probes.length; probeIndex += 1) {
    const probe = corpus.probes[probeIndex];
    const result = batchResults[probeIndex] || { outcome: 'refuse' };
    if (!['resolve', 'refuse'].includes(result.outcome)) throw new Error(`${resolver.id || 'resolver'} returned invalid outcome for ${probe.probeId}`);
    if (result.outcome === 'resolve' && !result.nodeId) throw new Error(`${resolver.id || 'resolver'} resolved ${probe.probeId} without nodeId`);
    const goldNodeId = probe.gold.placeLabel ? nodeIdByLabel.get(probe.gold.placeLabel) || null : null;
    const resolvedCorrectly = result.outcome === 'resolve'
      && probe.gold.outcome === 'resolve'
      && result.nodeId === goldNodeId;
    const refusedCorrectly = result.outcome === 'refuse' && probe.gold.outcome === 'refuse';
    const wrongPlace = result.outcome === 'resolve'
      && probe.gold.outcome === 'resolve'
      && result.nodeId !== goldNodeId;
    const violation = result.outcome === 'resolve' && MUST_REFUSE_KINDS.includes(probe.kind);
    const correct = resolvedCorrectly || refusedCorrectly;
    rows.push({
      probeId: probe.probeId,
      kind: probe.kind,
      outcome: result.outcome,
      nodeId: result.outcome === 'resolve' ? result.nodeId || null : null,
      correct,
      wrongPlace,
      violation,
      evidence: result.evidence || null,
    });
    const bucket = perKind[probe.kind] || (perKind[probe.kind] = { probes: 0, correct: 0, wrongPlace: 0, violations: 0 });
    bucket.probes += 1;
    if (correct) bucket.correct += 1;
    if (wrongPlace) bucket.wrongPlace += 1;
    if (violation) bucket.violations += 1;
  }
  const winnable = corpus.probes.filter((probe) => probe.kind === 'typo_beyond' || probe.kind === 'paraphrase');
  const winnableResolved = rows.filter((row) =>
    (row.kind === 'typo_beyond' || row.kind === 'paraphrase') && row.correct
  ).length;
  const floorMisses = rows.filter((row) => FLOOR_KINDS.includes(row.kind) && !row.correct).length;
  const mustRefuseViolations = rows.filter((row) => row.violation).length;
  return {
    resolverId: resolver.id || 'unnamed-resolver',
    metrics: {
      probeCount: rows.length,
      correct: rows.filter((row) => row.correct).length,
      wrongPlace: rows.filter((row) => row.wrongPlace).length,
      winnableResolved,
      winnableTotal: winnable.length,
      perKind,
    },
    guardrails: { floorMisses, mustRefuseViolations },
    rows,
  };
}

function reproductionCommand(options) {
  const rows = ['node tools/autonomy/evaluate-place-resolution.mjs'];
  if (options.challenger) rows.push(`--challenger ${options.challenger}`);
  if (options.output !== OUTPUT) rows.push(`--out ${path.relative(ROOT, options.output)}`);
  return rows.join(' ');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex');
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(process.exitCode || 0)).catch((error) => {
    console.error(error && error.stack || error);
    process.exit(1);
  });
}

export { evaluateLane };
