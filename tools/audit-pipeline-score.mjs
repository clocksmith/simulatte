#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT_DIR = path.join(ROOT, 'artifacts', 'simulatte-pipeline-audit');
const FLOOR = 76;
const RUBRIC_VERSION = 'phase-floor-76.v1';
const PROMPT_SET_VERSION = 'core-adversarial-human-v1';

const CORE_PROMPTS = Object.freeze([
  'particle collider muon tracks collision plume through a detector slice with field lines and calorimeter heat',
  'mangrove roots buffering storm surge while sediment settles in brackish tidal channels',
  'gut microbiome colonies exchanging metabolites through intestinal folds under immune sampling',
  'railway dispatch conflict resolution across signal blocks with delayed train agents and platform slots',
  'edge data center server racks recirculating heat between cooling aisles under controller limits',
  'city zoning shadow allocation between building masses with sunlight volumes and pedestrian comfort',
  'planetary rings shepherd moon resonance sorting ice boulders into density waves and orbital gaps',
  'sourdough fermentation gas bubbles growing through a dough matrix with gluten strands and acidity gradients',
]);

const ADVERSARIAL_PROMPTS = Object.freeze([
  'warehouse fire with smoke in concrete stairwell and renderer layers soot',
  'warehouse robot arms sort parcels on conveyor belts',
  'protein folding with bond constraints and energy minimization',
  'robot gripper twists a protein sample holder without molecular folding',
  'qubit chip phase readout through microwave resonator',
  'phase study in a generic lab with no qubits or quantum hardware',
  'glacier calving into fjord with sea ice waves',
  'forest fire jumps a road under wind shear',
]);

const SIGNALS = Object.freeze([
  signal('thermal', /\b(heat|heats|thermal|temperature|cool|cools|cooling|coolant|steam|lava|hot|cold|melt|melts|freeze|freezes|fire|flame|smoke|soot)\b/i),
  signal('fluid', /\b(flow|flows|fluid|water|river|wind|airflow|coolant|pump|channel|channels|droplet|gas|bubble|bubbles|smoke|plume|pressure|velocity|turbulence|vortex|microfluidic|meniscus|surge|tidal|brackish|fjord|ocean)\b/i),
  signal('stress', /\b(stress|strain|fracture|crack|impact|collision|calving|load|buckling|contact|constraint|constraints|bond|bonds|deform|shear|torque|resonance|bridge|twists)\b/i),
  signal('feedback', /\b(control|controller|feedback|sensor|setpoint|regulate|stabilize|stabilizes|actuator|valve|loop|throttle|inverter)\b/i),
  signal('orbital', /\b(orbit|orbits|orbital|gravity|planet|moon|asteroid|rocket|space|ring|rings|trajectory|barycenter)\b/i),
  signal('electromagnetic', /\b(magnet|magnetic|electric|charge|current|voltage|coil|plasma|field|flux|transformer|grid|battery)\b/i),
  signal('optical', /\b(light|sunlight|shadow|shadows|laser|lens|prism|mirror|photon|caustic|refraction|interference|ray|spectral|glass)\b/i),
  signal('quantum', /\b(quantum|qubit|superconducting|microwave|resonator|spin|ion trap|readout)\b/i),
  signal('acoustic', /\b(acoustic|sound|speaker|membrane|standing wave|standing waves|frequency|vibration|pressure ring)\b/i),
  signal('biological', /\b(growth|grow|grows|cell|protein|root|roots|coral|algae|mycelium|membrane|neuron|tissue|microbiome|enzyme|mangrove|fermentation|gluten|dough|yeast|dog|dogs|cat|cats|animal|animals|mammal|mammals)\b/i),
  signal('chemical', /\b(reaction|chemical|acid|acidic|acidity|crystal|concentration|electrolyte|solvent|catalyst|reagent|diffusion|dose|fermentation|metabolite)\b/i),
  signal('network', /\b(network|queue|market|traffic|route|packet|server|parcel|zoning|agent|dispatch|supply|demand|crowd|railway|data center)\b/i),
  signal('granular', /\b(grain|sand|soil|sediment|erosion|erodes|terrain|slope|dust|powder|silo|avalanche|bead|sieve|hail|boulder|boulders)\b/i),
  signal('instrument', /\b(detector|sensor|readout|instrument|probe|meter|scope|camera|phototube|calorimeter|chip|chiplet)\b/i),
  signal('robotic', /\b(robot|robotic|gripper|servo|workcell|manipulator|armature|pick and place|conveyor)\b/i),
]);

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'be', 'build', 'by', 'create', 'for', 'from',
  'in', 'into', 'is', 'it', 'of', 'on', 'or', 'the', 'to', 'with', 'within',
  'under', 'over', 'while', 'where', 'when', 'through', 'between', 'across',
  'then', 'so', 'scene', 'simulate', 'simulation', 'show', 'renderer',
]);

const PHASES = Object.freeze([
  phase('runtime', 1, 'Prompt Runtime'),
  phase('languageGraph', 2, 'Language Graph'),
  phase('retrieval', 3, 'Embedding Retrieval'),
  phase('activationFusion', 3, 'Activation Fusion'),
  phase('groundedIntent', 4, 'Grounded Intent'),
  phase('simulationCompile', 5, 'Simulation Compile'),
  phase('visualIR', 6, 'VisualIR Compile'),
  phase('webgpu', 7, 'WebGPU Render'),
  phase('sceneProof', 8, 'Scene Proof'),
]);

function signal(id, pattern) {
  return Object.freeze({ id, pattern });
}

function phase(id, step, label) {
  return Object.freeze({ id, step, label });
}

function parseArgs(argv) {
  const options = {
    outDir: DEFAULT_OUT_DIR,
    writeBaseline: false,
    prompt: [],
    includeCore: true,
    includeAdversarial: true,
    includeHuman: true,
    floor: FLOOR,
    liveReport: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const [key, inline] = arg.split('=');
    const readValue = () => inline ?? argv[++i];
    if (key === '--out') options.outDir = path.resolve(readValue() || options.outDir);
    else if (key === '--write-baseline') options.writeBaseline = true;
    else if (key === '--prompt') options.prompt.push(String(readValue() || '').trim());
    else if (key === '--no-core') options.includeCore = false;
    else if (key === '--no-adversarial') options.includeAdversarial = false;
    else if (key === '--no-human') options.includeHuman = false;
    else if (key === '--floor') options.floor = Number(readValue() || FLOOR);
    else if (key === '--live-report') options.liveReport = path.resolve(readValue() || '');
    else if (key === '--help') {
      console.log([
        'usage: node tools/audit-pipeline-score.mjs [options]',
        '',
        '--write-baseline       copy this run to baseline.json',
        '--prompt TEXT          include one custom prompt',
        '--live-report PATH     fold in an existing live visual eval report',
        '--no-core              skip stable core prompt set',
        '--no-adversarial       skip adversarial prompt set',
        '--no-human             skip human review prompts',
        '--floor N              phase pass floor, default 76',
        '--out DIR              audit output directory',
      ].join('\n'));
      process.exit(0);
    }
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const lab = require(path.join(ROOT, 'public', 'app', 'simulation', 'simulation-lab.js'));
  const prompts = await buildPromptRows(options);
  const liveRows = options.liveReport ? await readLiveReport(options.liveReport) : new Map();
  const rows = prompts.map((row, index) => scorePrompt(row, index + 1, lab, liveRows, options));
  const phaseScores = aggregatePhaseScores(rows);
  const pipelineScore = minScore(phaseScores);
  const runId = runIdForReport(rows);
  const report = {
    schema: 'simulatte.pipelineAuditRun.v1',
    generatedAt: new Date().toISOString(),
    runId,
    gitSha: gitSha(),
    version: readVersion(),
    rubricVersion: RUBRIC_VERSION,
    promptSetVersion: PROMPT_SET_VERSION,
    floor: options.floor,
    measurementMode: options.liveReport ? 'compiled-static-plus-live-visual' : 'compiled-static-live-webgpu-required',
    phaseDefinitions: PHASES,
    promptCount: rows.length,
    phaseScores,
    pipelineScore,
    verdict: pipelineScore >= options.floor ? 'pass' : 'fail',
    weakestPhase: weakestPhase(phaseScores),
    belowFloor: PHASES
      .filter((phase) => Number(phaseScores[phase.id] || 0) < options.floor)
      .map((phase) => phase.id),
    failures: rows.flatMap((row) => row.failures.map((failure) => `${row.index}:${failure}`)),
    prompts: rows,
  };
  report.reportPath = await writeReport(report, options);
  printSummary(report);
}

async function buildPromptRows(options) {
  const rows = [];
  if (options.includeCore) {
    CORE_PROMPTS.forEach((prompt) => rows.push({ kind: 'core', prompt }));
  }
  if (options.includeAdversarial) {
    ADVERSARIAL_PROMPTS.forEach((prompt) => rows.push({ kind: 'adversarial', prompt }));
  }
  for (const prompt of options.prompt.filter(Boolean)) rows.push({ kind: 'custom', prompt });
  if (options.includeHuman) {
    for (const prompt of await readHumanReviewPrompts()) rows.push({ kind: 'human-review', prompt });
  }
  return dedupePromptRows(rows);
}

async function readHumanReviewPrompts() {
  const file = path.join(ROOT, 'artifacts', 'simulatte-human-reviews', 'reviews.jsonl');
  if (!fsSync.existsSync(file)) return [];
  const text = await fs.readFile(file, 'utf8');
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        const row = JSON.parse(line);
        return String(row.prompt || row.review && row.review.prompt || '').trim();
      } catch (_error) {
        return '';
      }
    })
    .filter(Boolean)
    .slice(-24);
}

function dedupePromptRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = normalize(row.prompt);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function readLiveReport(reportPath) {
  if (!fsSync.existsSync(reportPath)) return new Map();
  const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
  const rows = new Map();
  for (const result of report.results || []) {
    const prompt = normalize(result.prompt || '');
    if (!prompt) continue;
    rows.set(prompt, result);
  }
  return rows;
}

function scorePrompt(row, index, lab, liveRows, options) {
  const expectedSignals = expectedSignalsForPrompt(row.prompt);
  const contentTerms = contentTermsForPrompt(row.prompt);
  const failures = [];
  let spec = null;
  let compileError = '';
  try {
    spec = lab.createSpecFromPrompt(row.prompt, { allowPrototypeFallback: true });
  } catch (error) {
    compileError = error && error.message ? error.message : String(error);
  }
  const context = buildContext(spec, row.prompt, expectedSignals, contentTerms);
  const phaseRows = {
    runtime: scoreRuntime(context, compileError),
    languageGraph: scoreLanguageGraph(context),
    retrieval: scoreRetrieval(context),
    activationFusion: scoreActivationCloud(context),
    groundedIntent: scoreGroundedIntent(context),
    simulationCompile: scoreSimulationCompile(context),
    visualIR: scoreVisualIR(context),
    webgpu: scoreWebGpu(context, liveRows.get(normalize(row.prompt))),
    sceneProof: scoreSceneProof(context, liveRows.get(normalize(row.prompt))),
  };
  const phaseScores = Object.fromEntries(Object.entries(phaseRows).map(([key, value]) => [key, value.score]));
  for (const [key, value] of Object.entries(phaseRows)) {
    if (value.score < options.floor) failures.push(`${key}:${value.reason}`);
  }
  return {
    index,
    kind: row.kind,
    prompt: row.prompt,
    expectedSignals,
    phaseScores,
    pipelineScore: minScore(phaseScores),
    weakestPhase: weakestPhase(phaseScores),
    failures,
    phaseDetails: Object.fromEntries(Object.entries(phaseRows).map(([key, value]) => [key, value.detail])),
  };
}

function buildContext(spec, prompt, expectedSignals, contentTerms) {
  const intent = spec && spec.intent || {};
  const brief = intent.intentBrief || {};
	  const phaseArtifacts = spec && spec.phaseArtifacts || {};
	  const phase2Artifact = phaseArtifacts.phase2 && phaseArtifacts.phase2.artifact || {};
	  const phase3Artifact = phaseArtifacts.phase3 && phaseArtifacts.phase3.artifact || {};
	  const phase4Artifact = phaseArtifacts.phase4 && phaseArtifacts.phase4.artifact || {};
	  const phase5Artifact = phaseArtifacts.phase5 && phaseArtifacts.phase5.artifact || {};
  const phase6Artifact = phaseArtifacts.phase6 && phaseArtifacts.phase6.artifact || {};
  const languageGraph = phase2Artifact.languageGraph || null;
  const retrievalRerankResult = phase3Artifact.retrievalRerankResult || null;
  const activationCloud = phase4Artifact.activationCloud || null;
  const groundedIntent = phase4Artifact.groundedIntent || null;
  const simulationCompile = phase5Artifact.simulationCompile || null;
  const renderProgram = spec && spec.renderProgram || {};
  const visualCompile = phase6Artifact.visualCompile || {};
  const visualIR = visualCompile.visualIR || {};
  const retrievalRows = retrievalRerankResult
    ? [
      ...(retrievalRerankResult.rankedPrimitives || []),
      ...(retrievalRerankResult.rankedCards || []),
      ...(retrievalRerankResult.rankedUniverseRows || []),
    ]
    : brief.retrievedEvidence || [];
  const acceptedGraph = groundedIntent && groundedIntent.acceptedGraph || spec && spec.universeGraph || {};
  const graphBrief = acceptedGraph && acceptedGraph.intentBrief || brief;
  const phaseLanguageEvidence = languageGraph ? {
    ...languageGraph,
    predicateFrames: languageGraph.predicateFrames || languageGraph.predicates || [],
    nounPhrases: languageGraph.nounPhrases || (languageGraph.spans || []).filter((span) => (
      span.kind === 'entity' || span.kind === 'material'
    )),
    verbPhrases: languageGraph.verbPhrases || (languageGraph.spans || []).filter((span) => span.kind === 'process'),
    summary: {
      ...(languageGraph.summary || {}),
      hasCausalLanguage: Boolean((languageGraph.clauses || []).length || (languageGraph.predicates || []).length),
    },
  } : null;
  const phaseSchemas = Object.fromEntries(Array.from({ length: 7 }, (_, index) => {
    const key = `phase${index + 1}`;
    return [key, phaseArtifacts[key] && phaseArtifacts[key].schema || ''];
  }));
  return {
    prompt,
    expectedSignals,
    contentTerms,
    spec,
    phaseArtifacts,
    phaseSchemas,
    intent,
    brief: graphBrief || brief,
    languageEvidence: phaseLanguageEvidence || brief.languageEvidence || {},
    retrievalRerankResult,
    retrievalRows,
    activationCloud: activationCloud && activationCloud.weightedActivations || brief.activationCloud || [],
    activationFusion: phase3Artifact.activationCloud || activationCloud || null,
    grounded: graphBrief && graphBrief.groundedInterpretation || brief.groundedInterpretation || {},
    groundedIntent,
    universeGraph: acceptedGraph || {},
    physicsIR: simulationCompile && simulationCompile.physicsIR || spec && spec.physicsIR || {},
    validationReceipt: simulationCompile && simulationCompile.validationReceipt || spec && spec.validationReceipt || {},
    solverGraph: simulationCompile && simulationCompile.solverGraph || spec && spec.solverGraph || {},
    renderIR: simulationCompile && simulationCompile.renderIR || spec && spec.renderIR || {},
    simulationCompile,
    renderProgram,
    visualCompile,
    visualIR,
    graphicsAtoms: visualIR.graphicsAtoms || {},
  };
}

function scoreRuntime(context, compileError) {
  let score = 50;
  const detail = {
    compileError,
    hasSpec: Boolean(context.spec),
    hasWorker: fsSync.existsSync(path.join(ROOT, 'public', 'app', 'workers', 'simulatte-pipeline-worker.js')),
    hasRenderer: fsSync.existsSync(path.join(ROOT, 'public', 'app', 'prompt', 'prompt-controller.js')),
    hasWebGpuRenderer: fsSync.existsSync(path.join(ROOT, 'public', 'pipeline', 'phase-07-render', 'simulatte-webgpu-renderer.js')),
    phaseSchemas: context.phaseSchemas || {},
  };
  if (!compileError && context.spec) score += 18;
  if (context.phaseSchemas && context.phaseSchemas.phase6 === 'simulatte.phase6.output.v2') score += 10;
  if (context.visualIR && context.visualIR.schema) score += 8;
  if (detail.hasWorker) score += 4;
  if (detail.hasRenderer && detail.hasWebGpuRenderer) score += 6;
  return scored(score, compileError ? `compile failed: ${compileError}` : 'runtime compile contract ok', detail);
}

function scoreLanguageGraph(context) {
  const evidence = context.languageEvidence || {};
  const spans = evidence.spans || [];
  const clauses = evidence.clauses || [];
  const frames = evidence.predicateFrames || [];
  const nounPhrases = evidence.nounPhrases || [];
  const verbPhrases = evidence.verbPhrases || [];
  const text = compactText([...spans, ...clauses, ...frames, ...nounPhrases, ...verbPhrases]);
  const termCoverage = coverage(context.contentTerms, text);
  const hasVerb = /\b(absorbs|bends|burns|cools|drives|erodes|flows|grows|heats|orbits|sort|sorts|stabilizes|twists)\b/i
    .test(context.prompt);
  const score = sumParts([
    part(16, evidence.tokens && evidence.tokens.length >= Math.min(6, context.contentTerms.length)),
    part(18, spans.length >= Math.min(8, Math.max(3, context.contentTerms.length))),
    part(14, clauses.length > 0),
    part(16, !hasVerb || frames.length > 0 || verbPhrases.length > 0),
    part(24, termCoverage),
    part(12, (evidence.negations || []).length || !/\b(no|not|without|exclude)\b/i.test(context.prompt)),
  ]);
  return scored(score, `termCoverage=${pct(termCoverage)}`, {
    tokenCount: (evidence.tokens || []).length,
    spanCount: spans.length,
    clauseCount: clauses.length,
    predicateFrameCount: frames.length,
    termCoverage,
  });
}

function scoreRetrieval(context) {
  const evidenceRows = context.retrievalRows || [];
  const retrieval = context.retrievalRerankResult || {};
  const semantic = retrieval.semanticRag || context.intent.semanticRag || {};
  const synthesis = context.intent.synthesis || null;
  const text = compactText(evidenceRows);
  const signalCoverage = signalCoverageScore(context.expectedSignals, text);
  const termCoverage = coverage(context.contentTerms, text);
  const score = sumParts([
    part(18, evidenceRows.length >= Math.max(8, context.expectedSignals.length * 2)),
    part(12, semantic.schema || evidenceRows.length),
    part(12, synthesis && synthesis.schema || evidenceRows.length >= 16),
    part(30, signalCoverage.coverage),
    part(20, termCoverage),
    part(8, signalCoverage.falsePositivePenalty === 0),
  ]) - signalCoverage.falsePositivePenalty;
  return scored(score, `signalCoverage=${pct(signalCoverage.coverage)}`, {
    evidenceCount: evidenceRows.length,
    semanticRag: semantic.schema || '',
    synthesis: synthesis && synthesis.schema || '',
    termCoverage,
    signalCoverage,
  });
}

function scoreActivationCloud(context) {
  const rows = context.activationCloud || [];
  const fusion = context.activationFusion || {};
  const verdicts = Array.isArray(fusion.obligationVerdicts) ? fusion.obligationVerdicts : [];
  const conflicts = Array.isArray(fusion.evidenceConflicts) ? fusion.evidenceConflicts : [];
  const accepted = context.grounded.acceptedActivations || [];
  const text = compactText([...(accepted.length ? accepted : rows), ...verdicts]);
  const signalCoverage = signalCoverageScore(context.expectedSignals, text);
  const directSignals = accepted.filter((row) => row.source === 'language-evidence-visual-signal').length;
  const ledgerObligations = fusion.compositionLedger && Array.isArray(fusion.compositionLedger.obligations)
    ? fusion.compositionLedger.obligations
    : [];
  const settledVerdicts = verdicts.filter((row) => row.verdict && row.verdict !== 'pending');
  const adjudicationCoverage = ledgerObligations.length
    ? Math.min(1, verdicts.length / ledgerObligations.length)
    : 0;
  const evidenceBackedVerdicts = verdicts.filter((row) => (
    row.verdict === 'supported' || row.verdict === 'strongly-supported' || row.verdict === 'inferred'
  ));
  const claimsWithProvenance = evidenceBackedVerdicts.filter((row) => (row.provenance || []).length > 0);
  const surfacedNegationConflicts = verdicts.filter((row) => row.negationConflict === true);
  const claimIntegrity = verdicts.length === 0
    ? 0
    : (evidenceBackedVerdicts.length === 0 || claimsWithProvenance.length === evidenceBackedVerdicts.length) &&
      surfacedNegationConflicts.every((row) => row.verdict === 'negated')
      ? 1
      : claimsWithProvenance.length / Math.max(1, evidenceBackedVerdicts.length);
  const fusionSectionsComplete = verdicts.length > 0 &&
    Array.isArray(fusion.negativeEvidence) &&
    fusion.conflictsBySlot && typeof fusion.conflictsBySlot === 'object';
  const score = sumParts([
    part(12, rows.length >= Math.max(12, context.expectedSignals.length * 2)),
    part(12, accepted.length >= Math.max(6, context.expectedSignals.length)),
    part(30, signalCoverage.coverage),
    part(10, directSignals / Math.max(1, context.expectedSignals.length)),
    part(10, signalCoverage.falsePositivePenalty === 0),
    part(10, adjudicationCoverage),
    part(8, claimIntegrity),
    part(8, fusionSectionsComplete),
  ]) - signalCoverage.falsePositivePenalty;
  const verdictBuckets = {};
  for (const row of verdicts) {
    const bucket = row.verdict || 'unknown';
    verdictBuckets[bucket] = (verdictBuckets[bucket] || 0) + 1;
  }
  const sampleVerdict = evidenceBackedVerdicts[0] || verdicts[0] || null;
  const reason = ledgerObligations.length === 0
    ? 'no obligations to adjudicate; language graph tracked no entities for this prompt'
    : `accepted=${accepted.length} verdicts=${settledVerdicts.length}/${verdicts.length} signalCoverage=${pct(signalCoverage.coverage)}`;
  return scored(score, reason, {
    activationCount: rows.length,
    acceptedActivationCount: accepted.length,
    directSignalCount: directSignals,
    ledgerObligationCount: ledgerObligations.length,
    obligationVerdictCount: verdicts.length,
    settledVerdictCount: settledVerdicts.length,
    adjudicationCoverage,
    claimIntegrity,
    verdictBuckets,
    sampleVerdict,
    evidenceConflictCount: conflicts.length,
    signalCoverage,
  });
}

function scoreGroundedIntent(context) {
  const grounded = context.grounded || {};
  const accepted = grounded.acceptedActivations || [];
  const bindings = grounded.evidenceBindings || [];
  const gaps = grounded.coverageGaps || [];
  const causalEdges = context.brief.causalGraph || [];
  const affordances = context.brief.visualIntent && context.brief.visualIntent.affordances || [];
  const text = compactText([...accepted, ...bindings, ...causalEdges, ...affordances]);
  const signalCoverage = signalCoverageScore(context.expectedSignals, text);
  const causalLanguage = context.languageEvidence.summary && context.languageEvidence.summary.hasCausalLanguage;
  const score = sumParts([
    part(24, signalCoverage.coverage),
    part(18, accepted.length > 0 && bindings.length >= accepted.length * 0.5),
    part(16, !causalLanguage || causalEdges.length > 0),
    part(16, affordances.length > 0 || context.expectedSignals.length <= 1),
    part(14, grounded.summary && Number(grounded.summary.acceptedActivationCount || 0) === accepted.length),
    part(12, Array.isArray(gaps)),
  ]) - signalCoverage.falsePositivePenalty;
  return scored(score, `signalCoverage=${pct(signalCoverage.coverage)} gaps=${gaps.length}`, {
    acceptedActivationCount: accepted.length,
    evidenceBindingCount: bindings.length,
    causalEdgeCount: causalEdges.length,
    visualAffordanceCount: affordances.length,
    coverageGapCount: gaps.length,
    signalCoverage,
  });
}

function scoreSimulationCompile(context) {
  const universe = context.universeGraph || {};
  const ir = context.physicsIR || {};
  const solver = context.solverGraph || {};
  const nodeText = compactText(universe.nodes || []);
  const irText = compactText([ir.entities || [], ir.domains || [], ir.operators || [], ir.stateFields || []]);
  const signalCoverage = signalCoverageScore(context.expectedSignals, `${nodeText} ${irText}`);
  const termCoverage = coverage(context.contentTerms, nodeText);
  const geometrySpecificity = specificGeometryRatio(ir);
  const topologySpecificity = topologySpecificityRatio(context.universeGraph, ir);
  const score = sumParts([
    part(12, (universe.nodes || []).length >= Math.min(3, Math.max(1, context.expectedSignals.length))),
    part(12, termCoverage),
    part(12, (ir.entities || []).length > 0 && (ir.domains || []).length > 0),
    part(15, (ir.operators || []).length >= Math.max(1, context.expectedSignals.length)),
    part(13, (solver.steps || []).length > 0 && Object.keys(solver.channels || {}).length > 0),
    part(24, geometrySpecificity),
    part(8, topologySpecificity),
    part(4, signalCoverage.coverage),
  ]) - Math.min(18, signalCoverage.falsePositivePenalty);
  return scored(score, `operators=${(ir.operators || []).length} geometry=${pct(geometrySpecificity)}`, {
    universeNodeCount: (universe.nodes || []).length,
    physicsEntityCount: (ir.entities || []).length,
    operatorCount: (ir.operators || []).length,
    solverStepCount: (solver.steps || []).length,
    channelCount: Object.keys(solver.channels || {}).length,
    termCoverage,
    geometrySpecificity,
    topologySpecificity,
    signalCoverage,
  });
}

function scoreVisualIR(context) {
  const visual = context.visualIR || {};
  const atoms = context.graphicsAtoms || {};
  const renderInstances = visual.renderInstances || [];
  const rejectedRows = visual.rejectedRows || [];
  const text = compactText([
    renderInstances,
    visual.entities || [],
    visual.materials || [],
    visual.fields || [],
    visual.processes || [],
    visual.geometry || [],
    visual.motion || [],
    atoms.mappings || [],
    atoms.languageSignals || [],
  ]);
  const signalCoverage = signalCoverageScore(context.expectedSignals, text);
  const atomSlots = Object.entries(atoms.uniforms && atoms.uniforms.bySlot || {})
    .filter(([, value]) => Number(value || 0) > 0)
    .map(([slot]) => slot);
  const visualSpecificity = visualSpecificityRatio(visual);
  const acceptedInstanceCount = renderInstances.filter((row) => row.status !== 'rejected').length;
  const sourceLinkedInstanceCount = renderInstances.filter((row) => row.sourceGraphId || (row.sourceIds || []).length).length;
  const score = sumParts([
    part(8, (visual.entities || []).length >= 1),
    part(8, (visual.materials || []).length >= 1),
    part(8, (visual.fields || []).length >= 1),
    part(10, (visual.processes || []).length >= 1),
    part(14, visualSpecificity),
    part(10, (visual.motion || []).length >= Math.max(1, context.expectedSignals.length)),
    part(12, (atoms.mappings || []).length >= Math.max(1, Math.min(4, context.expectedSignals.length))),
    part(12, renderInstances.length >= Math.max(3, context.expectedSignals.length + 2)),
    part(8, acceptedInstanceCount / Math.max(1, renderInstances.length)),
    part(6, sourceLinkedInstanceCount / Math.max(1, renderInstances.length)),
    part(4, signalCoverage.coverage),
  ]) - Math.min(32, signalCoverage.falsePositivePenalty);
  return scored(score, `atoms=${(atoms.mappings || []).length} signalCoverage=${pct(signalCoverage.coverage)}`, {
    sceneKind: visual.sceneKind || '',
    entityCount: (visual.entities || []).length,
    materialCount: (visual.materials || []).length,
    fieldCount: (visual.fields || []).length,
    processCount: (visual.processes || []).length,
    geometryCount: (visual.geometry || []).length,
    motionCount: (visual.motion || []).length,
    renderInstanceCount: renderInstances.length,
    acceptedRenderInstanceCount: acceptedInstanceCount,
    sourceLinkedRenderInstanceCount: sourceLinkedInstanceCount,
    rejectedRowCount: rejectedRows.length,
    mappingCount: (atoms.mappings || []).length,
    languageSignalCount: (atoms.languageSignals || []).length,
    uniformSlots: atomSlots,
    visualSpecificity,
    signalCoverage,
  });
}

function liveRenderExecutionInputSchema(liveResult) {
  if (!liveResult) return '';
  if (liveResult.phase7RenderExecutionInput) return liveResult.phase7RenderExecutionInput;
  if (liveResult.phase7Input === 'simulatte.renderExecutionInput.v1') return liveResult.phase7Input;
  return liveResult.renderExecutionInput || '';
}

function liveSceneRenderPacketInputSchema(liveResult) {
  if (!liveResult) return '';
  if (liveResult.phase7SceneRenderPacketInput) return liveResult.phase7SceneRenderPacketInput;
  return liveResult.phase7Input === 'simulatte.sceneRenderPacket.v1'
    ? liveResult.phase7Input
    : '';
}

function moduleFamilySource(dir, prefix) {
  if (!fsSync.existsSync(dir)) return '';
  return fsSync.readdirSync(dir)
    .filter((file) => file.startsWith(prefix) && file.endsWith('.js'))
    .sort()
    .map((file) => fsSync.readFileSync(path.join(dir, file), 'utf8'))
    .join('\n');
}

function scoreWebGpu(context, liveResult) {
  const webgpuSource = moduleFamilySource(
    path.join(ROOT, 'public', 'pipeline', 'phase-07-render'),
    'simulatte-webgpu-renderer'
  );
  const atoms = context.graphicsAtoms || {};
  const visual = context.visualIR || {};
  const scenePacket = context.visualCompile && context.visualCompile.sceneRenderPacket || {};
  const packetEntities = Array.isArray(scenePacket.entities) ? scenePacket.entities : [];
  const packetFields = Array.isArray(scenePacket.fields) ? scenePacket.fields : [];
  const packetEffects = Array.isArray(scenePacket.effects) ? scenePacket.effects : [];
  const packetSpatialRatio = packetEntities.length
    ? packetEntities.filter((row) => row.transform &&
      Array.isArray(row.transform.position) &&
      Array.isArray(row.transform.scale) &&
      row.geometry &&
      row.material &&
      row.animation &&
      row.collider).length / packetEntities.length
    : 0;
  const packetIdentityRatio = packetEntities.length
    ? packetEntities.filter((row) => row.identity &&
      row.identity.type &&
      row.identity.category &&
      row.identity.renderClass).length / packetEntities.length
    : 0;
  const atomValues = atoms.uniforms && atoms.uniforms.values || [];
  const structuralProofs = [
    /scenePacketFeatureVector/.test(webgpuSource),
    /scenePacketAtomUniformVector/.test(webgpuSource),
    /scenePacketSceneMixVector/.test(webgpuSource),
    /visualIrLayerVector/.test(webgpuSource),
    /sceneRenderPacketFromExecutionInput/.test(webgpuSource),
    /simulatte\.renderExecutionInput\.v1/.test(webgpuSource),
    /emptySceneRenderPacket/.test(webgpuSource),
    /scenePacketObjectUniformVector/.test(webgpuSource),
    /scenePacketIdentitySummary/.test(webgpuSource),
    /composedVisualIrScene/.test(webgpuSource),
    /graphComposedVisualIrScene/.test(webgpuSource),
    /sceneRenderPacketScene/.test(webgpuSource),
    /scenePacketIdentityAt\(index: i32\)/.test(webgpuSource),
    /scenePacketSemanticCode/.test(webgpuSource),
    /sceneMixAt\(index: i32\)/.test(webgpuSource),
    /visualIrAt\(index: i32\)/.test(webgpuSource),
    /scenePacketObjectAt\(index: i32\)/.test(webgpuSource),
    /canvas\.dataset\.sceneMix/.test(webgpuSource),
    /canvas\.dataset\.visualIrLayers/.test(webgpuSource),
    /canvas\.dataset\.sceneRenderPacket/.test(webgpuSource),
    /canvas\.dataset\.sceneObjectUniforms/.test(webgpuSource),
    /canvas\.dataset\.sceneObjectIdentities/.test(webgpuSource),
    !/function visualTextFromSpec|function refineSceneKindFromText|function sceneKindFromSpec/.test(webgpuSource),
    !/renderProgram\.visualIR/.test(webgpuSource),
  ];
  const structuralCoverage = structuralProofs.filter(Boolean).length / structuralProofs.length;
  const staticSignalCoverage = signalCoverageScore(
    context.expectedSignals,
    compactText([
      atoms.mappings || [],
      atoms.languageSignals || [],
      visual.geometry || [],
      visual.motion || [],
      packetEntities,
      packetFields,
      packetEffects,
      packetEntities.map((row) => row.identity || {}),
    ])
  );
  let score = sumParts([
    part(8, /visualIR/.test(webgpuSource)),
    part(8, /scenePacketAtomUniformVector/.test(webgpuSource)),
    part(8, /WEBGPU_SHADER/.test(webgpuSource)),
    part(8, atomValues.some((value) => Number(value || 0) > 0)),
    part(8, visual.sceneKind && visual.sceneKind !== 'generic'),
    part(14, staticSignalCoverage.coverage),
    part(22, structuralCoverage),
    part(4, (visual.geometry || []).length > 0 && (visual.motion || []).length > 0),
    part(8, scenePacket.schema === 'simulatte.sceneRenderPacket.v1'),
    part(4, packetSpatialRatio),
    part(4, packetIdentityRatio),
    part(4, /sceneRenderPacketScene/.test(webgpuSource)),
  ]);
  const detail = {
    sceneKind: visual.sceneKind || '',
    shaderUsesVisualIR: /visualIR/.test(webgpuSource),
    shaderUsesAtomUniforms: /scenePacketAtomUniformVector/.test(webgpuSource),
    shaderUsesSceneRenderPacket: /sceneRenderPacketScene/.test(webgpuSource),
    rendererRejectsSemanticInference: !/function visualTextFromSpec|function refineSceneKindFromText|function sceneKindFromSpec|renderProgram|renderIR|retrieval/.test(webgpuSource),
    atomUniformCount: atomValues.filter((value) => Number(value || 0) > 0).length,
    sceneRenderPacket: scenePacket.schema || '',
    sceneRenderPacketCompiler: scenePacket.compiler || '',
    sceneRenderPacketEntityCount: packetEntities.length,
    sceneRenderPacketFieldCount: packetFields.length,
    sceneRenderPacketEffectCount: packetEffects.length,
    sceneRenderPacketSpatialRatio: packetSpatialRatio,
    sceneRenderPacketIdentityRatio: packetIdentityRatio,
    sceneRenderPacketIdentities: Array.from(new Set(packetEntities
      .map((row) => row.identity && (row.identity.label || row.identity.type))
      .filter(Boolean))).slice(0, 32),
    structuralCoverage,
    staticSignalCoverage,
    liveVisualScore: null,
    liveDynamic: null,
    liveMissingSignals: [],
    livePhase7Input: liveRenderExecutionInputSchema(liveResult),
    liveRenderExecutionInput: liveRenderExecutionInputSchema(liveResult),
    liveSceneRenderPacketInput: liveSceneRenderPacketInputSchema(liveResult),
    liveSceneRenderPacket: liveResult && liveResult.sceneRenderPacket || '',
    liveSceneRenderEntityCount: liveResult && Number(liveResult.sceneRenderEntityCount || 0) || 0,
    liveSceneRenderSpatialHash: liveResult && liveResult.sceneRenderSpatialHash || '',
    liveSceneObjectUniforms: liveResult && liveResult.sceneObjectUniforms || '',
    liveSceneObjectIdentities: liveResult && liveResult.sceneObjectIdentities || '',
    liveSceneRenderPacketIdentities: liveResult && liveResult.visualIRSceneRenderPacketIdentities || [],
    liveProofRequired: true,
    evidenceMode: liveResult ? 'live-report' : 'compiled-static-visual-ir-proof',
  };
  if (liveResult) {
    const rubric = liveResult.visualRubric || {};
    const liveScore = Number(rubric.score || 0);
    const representation = Number(rubric.representationQuality || 0);
    const dynamic = rubric.dynamic ? 1 : 0;
    const missingCount = (rubric.missingSignals || []).length;
    detail.liveVisualScore = liveScore;
    detail.liveDynamic = Boolean(rubric.dynamic);
    detail.liveMissingSignals = rubric.missingSignals || [];
    detail.evidenceMode = 'live-report-required';
    score = score * 0.35 + liveScore * 0.45 + representation * 100 * 0.12 + dynamic * 8 - missingCount * 4;
  } else {
    score = Math.min(68, score);
  }
  return scored(
    score,
    liveResult
      ? 'live visual report folded in'
      : structuralCoverage >= 0.75
        ? 'live WebGPU proof required; static VisualIR proxy capped'
        : 'no live visual proof; static proxy capped',
    detail
  );
}

function scoreSceneProof(context, liveResult) {
  const sceneProofSource = moduleFamilySource(
    path.join(ROOT, 'public', 'pipeline', 'phase-08-scene-proof'),
    'simulatte-scene-proof'
  );
  const ledger = context.visualCompile && context.visualCompile.compositionLedger || null;
  const obligations = ledger && Array.isArray(ledger.obligations) ? ledger.obligations : [];
  const structuralProofs = [
    /function settleSceneProof/.test(sceneProofSource),
    /phase8-scene-proof/.test(sceneProofSource),
    /simulatte\.phase8\.output\.v2/.test(sceneProofSource),
    /not-proven/.test(sceneProofSource),
    /requiredLost/.test(sceneProofSource),
  ];
  const structuralCoverage = structuralProofs.filter(Boolean).length / structuralProofs.length;
  let score = sumParts([
    part(30, structuralCoverage),
    part(20, obligations.length > 0),
    part(18, obligations.every((row) => typeof row.status === 'string' && row.status.length > 0)),
  ]);
  const detail = {
    obligationCount: obligations.length,
    structuralCoverage,
    liveVerdict: liveResult && liveResult.sceneProofVerdict || '',
    liveLostCount: liveResult && Number(liveResult.sceneProofLostCount || 0) || 0,
    evidenceMode: liveResult && liveResult.sceneProofVerdict ? 'live-scene-proof' : 'compiled-static-proxy',
  };
  if (liveResult && liveResult.sceneProofVerdict) {
    const verdictScore = liveResult.sceneProofVerdict === 'pass'
      ? 100
      : liveResult.sceneProofVerdict === 'not-proven'
        ? 62
        : liveResult.sceneProofVerdict === 'fail'
          ? 24
          : 10;
    score = score * 0.3 + verdictScore * 0.7;
  } else {
    score = Math.min(68, score + 20);
  }
  return scored(
    score,
    detail.liveVerdict
      ? `live scene proof verdict ${detail.liveVerdict}`
      : 'live scene proof required; static settlement proxy capped',
    detail
  );
}

function expectedSignalsForPrompt(prompt) {
  const positive = positiveLanguageText(prompt);
  const ids = SIGNALS.filter((row) => row.pattern.test(positive)).map((row) => row.id);
  if (/\bwarehouse\b/.test(positive) && /\b(robot|robotic|sort|parcels|conveyor|logistics)\b/.test(positive)) {
    ids.push('network');
  }
  return unique(ids);
}

function positiveLanguageText(value = '') {
  const word = "[a-z0-9]+(?:[-'][a-z0-9]+)*";
  const stop = '(?:and|with|while|where|when|because|but|however|though|although|unless|inside|outside|near|around|between|against|across|during|through|then|so)';
  const negated = new RegExp(`\\b(?:no|not|never|none|without|cannot|can't|wont|won't|avoid|exclude|except)\\b(?:\\s+(?:a|an|the|any))?(?:\\s+(?!\\b${stop}\\b)${word}){1,6}`, 'gi');
  return String(value || '').toLowerCase().replace(negated, ' ').replace(/\s+/g, ' ').trim();
}

function contentTermsForPrompt(prompt) {
  return unique(String(prompt || '').toLowerCase()
    .match(/[a-z0-9]+(?:[-'][a-z0-9]+)*/g) || [])
    .filter((term) => term.length > 2 && !STOP_WORDS.has(term))
    .slice(0, 24);
}

function signalCoverageScore(expectedSignals, text) {
  const normalized = normalize(text);
  if (!expectedSignals.length) return { coverage: 1, found: [], missing: [], unexpected: [], falsePositivePenalty: 0 };
  const found = expectedSignals.filter((id) => normalized.includes(id) || signalPattern(id).test(normalized));
  const missing = expectedSignals.filter((id) => !found.includes(id));
  const unexpected = SIGNALS
    .map((row) => row.id)
    .filter((id) => !expectedSignals.includes(id) && normalized.includes(id))
    .slice(0, 8);
  return {
    coverage: found.length / expectedSignals.length,
    found,
    missing,
    unexpected,
    falsePositivePenalty: unexpected.length * 4,
  };
}

function signalPattern(id) {
  const row = SIGNALS.find((signal) => signal.id === id);
  return row ? row.pattern : /a^/;
}

function specificGeometryRatio(physicsIR) {
  const entities = physicsIR.entities || [];
  if (!entities.length) return 0;
  const generic = new Set(['body', 'path', 'barrier', 'graph']);
  let specific = 0;
  for (const entity of entities) {
    const kind = entity.geometryRef && entity.geometryRef.kind || '';
    if (kind && !generic.has(kind)) specific += 1;
  }
  return specific / entities.length;
}

function topologySpecificityRatio(universeGraph, physicsIR) {
  const nodeRows = universeGraph && universeGraph.nodes || [];
  const entityRows = physicsIR && physicsIR.entities || [];
  const total = Math.max(1, nodeRows.length + entityRows.length);
  let specific = 0;
  for (const node of nodeRows) {
    if ((node.shapeHints || []).length || (node.operatorHints || []).length > 1 || (node.materialIds || []).length) {
      specific += 1;
    }
  }
  for (const entity of entityRows) {
    if (entity.materialId && entity.materialId !== 'metal' || (entity.operatorHints || []).length > 1) {
      specific += 1;
    }
  }
  return specific / total;
}

function visualSpecificityRatio(visualIR) {
  const geometry = visualIR && visualIR.geometry || [];
  if (!geometry.length) return 0;
  const generic = new Set([
    'body',
    'field-sheet',
    'volume-ribbon',
    'procedural-silhouette',
    'node-link-volume',
    'node-link-agent',
  ]);
  let specific = 0;
  for (const row of geometry) {
    const primitive = String(row.primitive || '');
    const id = String(row.id || '');
    if (primitive && !generic.has(primitive)) specific += 1;
    else if (/open-[a-z0-9-]+/.test(id) && !/generic|unknown/.test(id)) specific += 0.35;
  }
  return specific / geometry.length;
}

function aggregatePhaseScores(rows) {
  const out = {};
  for (const phase of PHASES) {
    out[phase.id] = round(average(rows.map((row) => row.phaseScores[phase.id])));
  }
  return out;
}

function minScore(scores) {
  return round(Math.min(...Object.values(scores).map((value) => Number(value || 0))));
}

function weakestPhase(scores) {
  return Object.entries(scores)
    .sort((a, b) => Number(a[1] || 0) - Number(b[1] || 0))[0]?.[0] || '';
}

function coverage(terms, text) {
  if (!terms.length) return 1;
  const normalized = normalize(text);
  const covered = terms.filter((term) => termVariants(term).some((variant) => {
    const normalizedVariant = normalize(variant);
    if (!normalizedVariant) return false;
    return new RegExp(`\\b${escapeRegExp(normalizedVariant)}\\b`).test(normalized);
  }));
  return covered.length / terms.length;
}

function termVariants(term) {
  const value = normalize(term);
  const variants = [value];
  if (value.endsWith('ies') && value.length > 4) variants.push(`${value.slice(0, -3)}y`);
  if (value.endsWith('es') && value.length > 4) variants.push(value.slice(0, -2));
  if (value.endsWith('s') && value.length > 3) variants.push(value.slice(0, -1));
  if (value.endsWith('ing') && value.length > 5) {
    const stem = value.slice(0, -3);
    variants.push(stem);
    if (/([a-z])\1$/.test(stem)) variants.push(stem.slice(0, -1));
  }
  return unique(variants);
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compactText(value) {
  if (Array.isArray(value)) return value.map(compactText).join(' ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value || '');
}

function sumParts(parts) {
  return parts.reduce((total, part) => total + part.value, 0);
}

function part(weight, conditionOrRatio) {
  const ratio = typeof conditionOrRatio === 'number'
    ? clamp01(conditionOrRatio)
    : conditionOrRatio ? 1 : 0;
  return { weight, value: weight * ratio };
}

function scored(score, reason, detail) {
  return { score: round(clamp(Number(score || 0), 0, 100)), reason, detail };
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[_-]+/g, ' ').replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function pct(value) {
  return `${Math.round(clamp01(value) * 100)}%`;
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function average(values) {
  const rows = values.map(Number).filter(Number.isFinite);
  if (!rows.length) return 0;
  return rows.reduce((total, value) => total + value, 0) / rows.length;
}

function round(value) {
  return Number(Number(value || 0).toFixed(1));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value) {
  return clamp(Number(value || 0), 0, 1);
}

function runIdForReport(rows) {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(rows.map((row) => [row.prompt, row.phaseScores])));
  return `${new Date().toISOString().replace(/[:.]/g, '-')}-${hash.digest('hex').slice(0, 10)}`;
}

function gitSha() {
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch (_error) {
    return '';
  }
}

function readVersion() {
  try {
    return JSON.parse(fsSync.readFileSync(path.join(ROOT, 'public', 'version.json'), 'utf8')).version || '';
  } catch (_error) {
    return '';
  }
}

async function writeReport(report, options) {
  const runDir = path.join(options.outDir, 'runs', report.runId);
  await fs.mkdir(runDir, { recursive: true });
  const reportPath = path.join(runDir, 'report.json');
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await fs.mkdir(options.outDir, { recursive: true });
  await fs.writeFile(path.join(options.outDir, 'latest.json'), `${JSON.stringify({ ...report, reportPath }, null, 2)}\n`);
  await fs.appendFile(path.join(options.outDir, 'history.jsonl'), `${JSON.stringify(summaryRow(report, reportPath))}\n`);
  if (options.writeBaseline) {
    await fs.writeFile(path.join(options.outDir, 'baseline.json'), `${JSON.stringify({ ...report, reportPath }, null, 2)}\n`);
  }
  return reportPath;
}

function summaryRow(report, reportPath) {
  return {
    schema: 'simulatte.pipelineAuditHistoryRow.v1',
    generatedAt: report.generatedAt,
    runId: report.runId,
    gitSha: report.gitSha,
    floor: report.floor,
    phaseScores: report.phaseScores,
    pipelineScore: report.pipelineScore,
    verdict: report.verdict,
    weakestPhase: report.weakestPhase,
    belowFloor: report.belowFloor,
    reportPath,
  };
}

function printSummary(report) {
  console.log(`pipeline=${report.pipelineScore} verdict=${report.verdict} weakest=${report.weakestPhase}`);
  console.log(`belowFloor=${report.belowFloor.join(',') || 'none'}`);
  console.log(`phaseScores=${PHASES.map((phase) => `${phase.id}:${report.phaseScores[phase.id]}`).join(' ')}`);
  console.log(`run=${path.relative(ROOT, report.reportPath || path.join(DEFAULT_OUT_DIR, 'runs', report.runId, 'report.json'))}`);
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
