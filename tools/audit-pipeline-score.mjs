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
  signal('biological', /\b(growth|grow|grows|cell|protein|root|roots|coral|algae|mycelium|membrane|neuron|tissue|microbiome|enzyme|mangrove|fermentation|gluten|dough|yeast)\b/i),
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
  phase('activationCloud', 4, 'Activation Cloud'),
  phase('groundedIntent', 5, 'Grounded Intent'),
  phase('simulationCompile', 6, 'Simulation Compile'),
  phase('visualIR', 7, 'VisualIR Compile'),
  phase('webgpu', 8, 'WebGPU Render'),
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
  const lab = require(path.join(ROOT, 'public', 'js', 'simulatte-physics-lab.js'));
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
    measurementMode: options.liveReport ? 'compiled-static-plus-live-visual' : 'compiled-static',
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
    activationCloud: scoreActivationCloud(context),
    groundedIntent: scoreGroundedIntent(context),
    simulationCompile: scoreSimulationCompile(context),
    visualIR: scoreVisualIR(context),
    webgpu: scoreWebGpu(context, liveRows.get(normalize(row.prompt))),
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
  const renderProgram = spec && spec.renderProgram || {};
  const visualIR = renderProgram.visualIR || {};
  return {
    prompt,
    expectedSignals,
    contentTerms,
    spec,
    intent,
    brief,
    languageEvidence: brief.languageEvidence || {},
    activationCloud: brief.activationCloud || [],
    grounded: brief.groundedInterpretation || {},
    universeGraph: spec && spec.universeGraph || {},
    physicsIR: spec && spec.physicsIR || {},
    validationReceipt: spec && spec.validationReceipt || {},
    solverGraph: spec && spec.solverGraph || {},
    renderIR: spec && spec.renderIR || {},
    renderProgram,
    visualIR,
    graphicsAtoms: visualIR.graphicsAtoms || {},
  };
}

function scoreRuntime(context, compileError) {
  let score = 50;
  const detail = {
    compileError,
    hasSpec: Boolean(context.spec),
    hasWorker: fsSync.existsSync(path.join(ROOT, 'public', 'js', 'simulatte-pipeline-worker.js')),
    hasRenderer: fsSync.existsSync(path.join(ROOT, 'public', 'js', 'simulatte-physics-renderer.js')),
    hasWebGpuRenderer: fsSync.existsSync(path.join(ROOT, 'public', 'js', 'simulatte-webgpu-renderer.js')),
  };
  if (!compileError && context.spec) score += 18;
  if (context.renderProgram && context.renderProgram.schema) score += 10;
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
  const evidenceRows = context.brief.retrievedEvidence || [];
  const semantic = context.intent.semanticRag || {};
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
  const accepted = context.grounded.acceptedActivations || [];
  const text = compactText(accepted.length ? accepted : rows);
  const signalCoverage = signalCoverageScore(context.expectedSignals, text);
  const directSignals = accepted.filter((row) => row.source === 'language-evidence-visual-signal').length;
  const score = sumParts([
    part(18, rows.length >= Math.max(12, context.expectedSignals.length * 2)),
    part(18, accepted.length >= Math.max(6, context.expectedSignals.length)),
    part(34, signalCoverage.coverage),
    part(15, directSignals / Math.max(1, context.expectedSignals.length)),
    part(15, signalCoverage.falsePositivePenalty === 0),
  ]) - signalCoverage.falsePositivePenalty;
  return scored(score, `accepted=${accepted.length} signalCoverage=${pct(signalCoverage.coverage)}`, {
    activationCount: rows.length,
    acceptedActivationCount: accepted.length,
    directSignalCount: directSignals,
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
  const text = compactText([
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
  const score = sumParts([
    part(10, (visual.entities || []).length >= 1),
    part(10, (visual.materials || []).length >= 1),
    part(10, (visual.fields || []).length >= 1),
    part(12, (visual.processes || []).length >= 1),
    part(18, visualSpecificity),
    part(12, (visual.motion || []).length >= Math.max(1, context.expectedSignals.length)),
    part(16, (atoms.mappings || []).length >= Math.max(1, Math.min(4, context.expectedSignals.length))),
    part(12, signalCoverage.coverage),
  ]) - Math.min(32, signalCoverage.falsePositivePenalty);
  return scored(score, `atoms=${(atoms.mappings || []).length} signalCoverage=${pct(signalCoverage.coverage)}`, {
    sceneKind: visual.sceneKind || '',
    entityCount: (visual.entities || []).length,
    materialCount: (visual.materials || []).length,
    fieldCount: (visual.fields || []).length,
    processCount: (visual.processes || []).length,
    geometryCount: (visual.geometry || []).length,
    motionCount: (visual.motion || []).length,
    mappingCount: (atoms.mappings || []).length,
    languageSignalCount: (atoms.languageSignals || []).length,
    uniformSlots: atomSlots,
    visualSpecificity,
    signalCoverage,
  });
}

function scoreWebGpu(context, liveResult) {
  const webgpuPath = path.join(ROOT, 'public', 'js', 'simulatte-webgpu-renderer.js');
  const webgpuSource = fsSync.existsSync(webgpuPath) ? fsSync.readFileSync(webgpuPath, 'utf8') : '';
  const atoms = context.graphicsAtoms || {};
  const visual = context.visualIR || {};
  const atomValues = atoms.uniforms && atoms.uniforms.values || [];
  const staticSignalCoverage = signalCoverageScore(
    context.expectedSignals,
    compactText([atoms.mappings || [], atoms.languageSignals || [], visual.geometry || [], visual.motion || []])
  );
  let score = sumParts([
    part(14, /visualIR/.test(webgpuSource)),
    part(12, /graphicsAtomUniformVector/.test(webgpuSource)),
    part(12, /WEBGPU_SHADER/.test(webgpuSource)),
    part(10, atomValues.some((value) => Number(value || 0) > 0)),
    part(10, visual.sceneKind && visual.sceneKind !== 'generic'),
    part(14, staticSignalCoverage.coverage),
  ]);
  const detail = {
    sceneKind: visual.sceneKind || '',
    shaderUsesVisualIR: /visualIR/.test(webgpuSource),
    shaderUsesAtomUniforms: /graphicsAtomUniformVector/.test(webgpuSource),
    atomUniformCount: atomValues.filter((value) => Number(value || 0) > 0).length,
    staticSignalCoverage,
    liveVisualScore: null,
    liveDynamic: null,
    liveMissingSignals: [],
    evidenceMode: liveResult ? 'live-report' : 'compiled-static-proxy',
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
    score = score * 0.35 + liveScore * 0.45 + representation * 100 * 0.12 + dynamic * 8 - missingCount * 4;
  } else {
    score = Math.min(62, score);
  }
  return scored(score, liveResult ? 'live visual report folded in' : 'no live visual proof; static proxy capped', detail);
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
  const covered = terms.filter((term) => normalized.includes(normalize(term)));
  return covered.length / terms.length;
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
