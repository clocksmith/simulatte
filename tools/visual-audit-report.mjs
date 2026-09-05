import { createRequire } from 'node:module';
import { renderedSignalEvidence } from './visual-rubric-evidence.mjs';
import { modelPreparationFailures } from './model-preparation-receipt.mjs';
import { auditPromptMatches } from './audit-runtime-wait.mjs';
const require = createRequire(import.meta.url);

const phaseContracts = require('../public/blank/pipeline/simulatte-phase-contracts.js');
const EXPECTED_PHASE_OUTPUT_SCHEMAS = Object.freeze(Object.fromEntries(
  phaseContracts.phases
    .filter((row) => row.phase <= 7)
    .map((row) => [`phase${row.phase}`, row.outputSchema])
));
const VISUAL_RUBRIC_SIGNALS = Object.freeze([
  rubricSignal('thermal', /\b(heat|heats|thermal|temperature|cool|cools|cooling|coolant|steam|lava|hot|cold|melt|melts|freeze|freezes|fire|flame|smoke)\b/i, ['thermal', 'combustion', 'phase', 'emission'], ['visual.operator.heat-transfer.v1', 'visual.operator.thermal-combustion.v1', 'visual.operator.phase-transition.v1'], ['atomThermalPlume'], {
    layerSlots: ['thermal-field'],
    proofTerms: ['heat', 'thermal', 'fire', 'flame', 'smoke', 'melt', 'cool'],
  }),
  rubricSignal('fluid', /\b(flow|flows|flowing|advect|advects|airflow|pumps?|pressure drives?|velocity|turbulence|vortex|swim|swims|swimming|surge|upwelling|dispersion)\b/i, ['fluid', 'density', 'motion'], ['visual.operator.fluid-advection.v1'], ['atomFluidRibbons'], {
    layerSlots: ['water-volume', 'flow-field', 'bubble-volume'],
    proofTerms: ['swim', 'swimming', 'wake ripples', 'partial submersion', 'water', 'flow'],
  }),
  rubricSignal('stress', /\b(stress|strain|fracture|fractures|crack|cracks|impact|collision|collides?|buckling|contact force|deform|deforms|shear|torque|resonance|vortex shedding)\b/i, ['stress', 'constraint', 'motion'], ['visual.operator.stress-fracture.v1'], ['atomStressCracks']),
  rubricSignal('feedback', /\b(control|controller|feedback|sensor|setpoint|regulate|stabilize|stabilizes|actuator|valve|loop|throttle|inverter)\b/i, ['feedback', 'signal', 'instrument', 'measurement'], ['visual.operator.control-feedback.v1'], ['atomFeedbackArcs']),
  rubricSignal('orbital', /\b(orbit|orbits|orbiting|orbital resonance|gravity bends?|gravitational|trajectory|barycenter|accretion)\b/i, ['orbital', 'motion'], ['visual.operator.orbital-gravity.v1'], []),
  rubricSignal('electromagnetic', /\b(magnet|magnetic|electric|charge|current|voltage|coil|plasma|field|flux|transformer|grid|battery)\b/i, ['electromagnetic', 'emission', 'signal'], ['visual.operator.electromagnetic-field.v1'], []),
  rubricSignal('optical', /\b(light|laser|lens|prism|mirror|photon|caustic|refraction|interference|ray|spectral|thin film|soap film|iridescent|glass (?:refracts?|focuses?|splits?|scatters?))\b/i, ['optical', 'phase', 'emission', 'surface'], ['visual.operator.optical-ray.v1', 'visual.operator.thin-film-interference.v1'], []),
  rubricSignal('quantum', /\b(quantum|qubit|superconducting|microwave|resonator|spin|ion trap|readout)\b/i, ['quantum', 'measurement', 'instrument', 'signal'], ['visual.operator.quantum-phase-readout.v1'], ['atomQuantumFringes']),
  rubricSignal('acoustic', /\b(acoustic|sound|speaker|membrane|frequency|vibration|pressure ring|standing wave)\b/i, ['acoustic', 'motion'], ['visual.operator.acoustic-wave.v1'], []),
  rubricSignal('biological', /\b(growth|grow|grows|growing|germinate|germinates|sprout|sprouts|bloom|blooms|bleach|bleaches|bleaching|decay|fermentation|cell division|population expands?)\b/i, ['biological', 'density', 'surface'], ['visual.operator.biological-growth.v1'], []),
  rubricSignal('chemical', /\b(reaction|reacts?|diffusion|diffuses?|concentration gradient|corrodes?|oxidizes?|catalyzes?|fermentation|metabolites? (?:exchange|exchanges|exchanging))\b/i, ['chemical', 'density', 'phase'], ['visual.operator.chemical-diffusion.v1'], []),
  rubricSignal('network', /\b(routing|routes?|network flow|traffic flows?|queue grows?|dispatch|redistribute|redistributes|redistributing|packet travels?|loads? index|meters? intersection|stabilizes? (?:grid|load)|feedback amplifies?)\b/i, ['network', 'signal', 'constraint'], ['visual.operator.network-flow.v1'], ['atomNetworkPressure']),
  rubricSignal('granular', /\b(erosion|erodes?|sediment settles?|grains? flow|sandblasts?|avalanche|powder compacts?|hail grows?|debris flow)\b/i, ['granular', 'density', 'surface'], ['visual.operator.granular-erosion.v1'], []),
  rubricSignal('instrument', /\b(detector|sensor|readout|instrument|probe|meter|scope|camera|phototube|calorimeter|chip|chiplet|particle|collider|muon)\b/i, ['instrument', 'measurement', 'signal'], ['visual.operator.instrument-readout.v1', 'visual.operator.particle-track-detector.v1'], []),
  rubricSignal('robotic', /\b(contact force|gripper (?:grasps?|grips?|twists?|holds?)|robot (?:grasps?|grips?|twists?|holds?|pushes?)|pick and place)\b/i, ['robotic', 'feedback', 'constraint'], ['visual.operator.robot-contact.v1'], []),
]);

function rubricSignal(id, pattern, slots, mappingIds, wgslOperators, renderEvidence = null) {
  return Object.freeze({ id, pattern, slots, mappingIds, wgslOperators, renderEvidence });
}

function visualRubricForResult(result, prompt) {
  const expectedSignals = expectedVisualSignals(prompt);
  const uniformSlots = new Set(array(result.visualIRGraphicsUniformSlots));
  const mappingIds = new Set(array(result.visualIRGraphicsMappingIds));
  const wgslOperators = new Set(array(result.visualIRGraphicsWgslOperators));
  const languageSignals = array(result.visualIRGraphicsLanguageSignals)
    .flatMap((row) => [row.id, row.kind, row.text, ...array(row.slots)])
    .map((value) => String(value || '').toLowerCase());
  const matchedSignals = [];
  const missingSignals = [];
  for (const signal of expectedSignals) {
    const slotHits = signal.slots.filter((slot) => uniformSlots.has(slot));
    const mappingHits = signal.mappingIds.filter((id) => mappingIds.has(id));
    const wgslHits = signal.wgslOperators.filter((id) => wgslOperators.has(id));
    const languageHits = languageSignals.filter((value) => value.includes(signal.id)).slice(0, 3);
    const renderedEvidence = renderedSignalEvidence(signal, result);
    const strength = Math.min(1, slotHits.length * 0.45 + mappingHits.length * 0.4 +
      wgslHits.length * 0.3 + languageHits.length * 0.2 + renderedEvidence.strength);
    const row = {
      id: signal.id,
      strength: Number(strength.toFixed(3)),
      slotHits,
      mappingHits,
      wgslHits,
      languageHits,
      renderedEvidence,
    };
    if (strength >= 0.35) matchedSignals.push(row);
    else missingSignals.push(row);
  }
  const expectedCount = expectedSignals.length;
  const coverage = expectedCount ? matchedSignals.length / expectedCount : 1;
  const contrast = clamp01((Number(result.lumaStd || 0) - 8) / 36);
  const color = clamp01((Number(result.coloredRatio || 0) - 0.035) / 0.24);
  const atomRichness = clamp01(Number(result.visualIRGraphicsAtomCount || 0) / Math.max(8, expectedCount * 5));
  const representation = representationQualityForResult(result, expectedCount);
  const dynamicMagnitude = Math.max(
    clamp01(Number(result.canvasFrameLumaMeanDelta || 0) / 0.6),
    clamp01(Number(result.canvasFrameLumaStdDelta || 0) / 0.6),
    clamp01(Number(result.canvasFrameColoredRatioDelta || 0) / 0.006),
    clamp01(Number(result.canvasFrameMeanAbsolutePixelDelta || 0) / 3),
    clamp01(Number(result.canvasFrameChangedPixelRatio || 0) / 0.04)
  );
  // This is a whole-canvas ratio: compact moving subjects occupy far less of the
  // frame than fluid fields or crowds. The floor stays above static-frame noise while
  // accepting motion backed by a measurable pixel delta from a small rendered object.
  const dynamic = dynamicMagnitude >= 0.08 ? 1 : 0;
  const dynamicRequired = promptRequiresVisibleDynamics(prompt);
  const dynamicPass = dynamicRequired ? dynamic : 1;
  const incompleteGeometryPenalty = representation.realizedGeometry < 1 ? 0.18 : 0;
  const score = Math.max(0, Math.round(100 * (
    coverage * 0.42 +
    dynamicPass * 0.16 +
    representation.quality * 0.18 +
    atomRichness * 0.1 +
    contrast * 0.07 +
    color * 0.07 -
    incompleteGeometryPenalty
  )));
  return {
    schema: 'simulatte.visualPromptRubric.v1',
    policy: 'bound-geometry-v2',
    score,
    pass: score >= 72 &&
      coverage >= 0.66 &&
      dynamicPass > 0 &&
      representation.quality >= 0.5 &&
      representation.structuralProgramFit >= 0.75 &&
      representation.framing >= 0.75 &&
      missingSignals.length <= Math.max(1, Math.floor(expectedCount / 3)),
    expectedCount,
    coverage: Number(coverage.toFixed(3)),
    representationQuality: Number(representation.quality.toFixed(3)),
    representationQualityScope: 'render-contract-and-pixel-presence',
    recognizabilityStatus: 'human-adjudication-required',
    representation,
    dynamic: Boolean(dynamic),
    dynamicRequired,
    dynamicPass: Boolean(dynamicPass),
    dynamicMagnitude: Number(dynamicMagnitude.toFixed(3)),
    atomRichness: Number(atomRichness.toFixed(3)),
    contrast: Number(contrast.toFixed(3)),
    color: Number(color.toFixed(3)),
    expectedSignals: expectedSignals.map((row) => row.id),
    matchedSignals,
    missingSignals: missingSignals.map((row) => row.id),
  };
}

function promptRequiresVisibleDynamics(prompt = '') {
  return /\b(swim|swims|swimming|fly|flies|flying|orbit|orbits|orbiting|flow|flows|float|floats|floating|run|runs|running|move|moves|moving|spin|spins|rotate|rotates|rotating|fall|falls|falling|melt|melts|melting|grow|grows|growing|jump|jumps|crash|crashes|collide|collides|wave|waves|waving|pulse|pulses|pulsing|play|plays|playing|carve|carves|carving|sort|sorts|sorting|route|routes|routing)\b/i.test(prompt);
}

function representationQualityForResult(result, expectedCount) {
  const sceneKind = String(result.rendererSceneKind || result.visualIRSceneKind || '');
  const languageSignalCount = array(result.visualIRGraphicsLanguageSignals).length;
  const consumption = result.phase7RendererConsumption || {};
  const realization = result.webgpuObjectRealization || {};
  const entityCount = Math.max(1, Number(realization.entityCount || result.visualIRSceneRenderPacketEntityCount || 0));
  const requiredRelations = array(result.phase6CompositionObligations)
    .filter((row) => row.required === true && row.kind === 'relation');
  const surfaceContacts = array(result.sceneRenderPacketSurfaceContacts);
  const graspContacts = array(result.sceneRenderPacketGraspContacts);
  const provenRelations = requiredRelations.filter((row) => (
    row.status === 'preserved' && array(row.visualEvidence).length > 0 &&
    (!String(row.id || '').startsWith('relation:spatial:') ||
      array(row.visualEvidence).includes(`layout-relation:${row.id}`)) &&
    (!/^relation:spatial:[^:]+:(?:on|onto|seated-on|supports):/.test(String(row.id || '')) ||
      surfaceContacts.some((contact) => (
        contact.constraintId === row.id && contact.clearanceAfter >= -0.02 && contact.clearanceAfter <= 0.01
      ))) &&
    (!/^relation:[^:]+:(?:hold|holds|holding|grasp|grasps|grasping|carry|carries|carrying|clutch|clutches|clutching):/.test(String(row.id || '')) ||
      graspContacts.some((contact) => (
        contact.constraintId === row.id && array(contact.sourcePartIds).length > 0 &&
        contact.targetPartId && contact.endpointDistanceAfter <= 0.015
      )))
  ));
  const dimensions = {
    realizedGeometry: clamp01(Number(realization.realizedCount || 0) / entityCount),
    constructiveGrounding: clamp01(Number(consumption.modelEvaluatedConstructionCount || 0) / entityCount),
    structuralProgramFit: Math.min(
      clamp01(Number(realization.topologyVerifiedCount || 0) / entityCount),
      clamp01(Number(realization.semanticFitCount || 0) / entityCount)
    ),
    framing: realization.framingPass === true
      ? 1
      : clamp01(Number(realization.projectedArea || 0) / Math.min(0.16, entityCount * 0.045)),
    materialResponse: consumption.normalShading === true
      ? clamp01(Number(consumption.materialCountConsumed || 0) / entityCount) : 0,
    cameraResponse: consumption.cameraConsumed === true ? 1 : 0,
    lightResponse: Number(consumption.lightCountConsumed || 0) > 0 && consumption.normalShading === true ? 1 : 0,
    depthResponse: consumption.depthEnabled === true ? 1 : 0,
    spatialRelations: requiredRelations.length ? provenRelations.length / requiredRelations.length : 1,
    sceneSpecificity: sceneKind && !/^(generic|literal-composite|blank|mechanical|custom-world)$/.test(sceneKind) ? 1 : 0,
    promptBinding: clamp01(languageSignalCount / Math.max(6, expectedCount * 3)) *
      clamp01(Number(realization.realizedCount || 0) / entityCount),
  };
  const quality = (
    dimensions.realizedGeometry * 0.14 +
    dimensions.constructiveGrounding * 0.08 +
    dimensions.structuralProgramFit * 0.18 +
    dimensions.framing * 0.15 +
    dimensions.materialResponse * 0.09 +
    dimensions.cameraResponse * 0.08 +
    dimensions.lightResponse * 0.07 +
    dimensions.depthResponse * 0.07 +
    dimensions.spatialRelations * 0.07 +
    dimensions.sceneSpecificity * 0.035 +
    dimensions.promptBinding * 0.035
  );
  return {
    schema: 'simulatte.visualRepresentationQuality.v1',
    quality: Number(quality.toFixed(3)),
    scope: 'render-contract-and-pixel-presence',
    recognizabilityStatus: 'not-measured-by-machine-rubric',
    ...Object.fromEntries(Object.entries(dimensions).map(([key, value]) => [key, Number(value.toFixed(3))])),
  };
}

function expectedVisualSignals(prompt) {
  const text = positiveLanguageText(prompt);
  return VISUAL_RUBRIC_SIGNALS.filter((signal) => signal.pattern.test(text));
}

function positiveLanguageText(value = '') {
  const word = "[a-z0-9]+(?:[-'][a-z0-9]+)*";
  const stop = '(?:and|with|while|where|when|because|but|however|though|although|unless|inside|outside|near|around|between|against|across|during|through|then|so)';
  const negated = new RegExp(`\\b(?:no|not|never|none|without|cannot|can't|wont|won't|avoid|exclude|except)\\b(?:\\s+(?:a|an|the|any))?(?:\\s+(?!\\b${stop}\\b)${word}){1,6}`, 'gi');
  return String(value || '').toLowerCase().replace(negated, ' ').replace(/\s+/g, ' ').trim();
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function phase3ConstructionGate(result = {}) {
  const constructionRoles = new Set(['actor', 'concept', 'object', 'part', 'environment']);
  const slotEntryIds = new Map(array(result.phase3SlotEvidence).map((row) => [row.slotId, row.entryId]));
  const realizedIdentities = array(result.sceneRenderPacketIdentities);
  const requiredSlots = array(result.phase3SlotCandidates).filter((slot) => (
    slot.required !== false && constructionRoles.has(String(slot.slotRole || ''))
  ));
  const rows = requiredSlots.map((slot) => {
    const localGeometryGrammarId = String(slot.localGeometryGrammarId ||
      array(slot.candidates).find((candidate) => candidate.localGeometryGrammarId)?.localGeometryGrammarId || '');
    const targetId = constructionIdentityKey(slotEntryIds.get(slot.slotId) || slot.slotId);
    const realizedLocal = realizedIdentities.some((identity) => (
      [identity.type, identity.sourceLabel, identity.label]
        .some((value) => constructionIdentityKey(value) === targetId) &&
      identity.literal === true && identity.unsupportedIdentity !== true &&
      Number(identity.partCount || 0) >= 2 && /^object-grammar\.(?!object$)[a-z0-9.-]+$/.test(String(identity.grammarId || ''))
    ));
    const localProven = /^object-grammar\.(?!object$)[a-z0-9.-]+$/.test(localGeometryGrammarId) || realizedLocal;
    const modelEvaluated = array(slot.candidates).some((candidate) => (
      candidate.modelEvaluated === true && candidate.constructionEvidence === true
    ));
    return { slotId: slot.slotId || '', localGeometryGrammarId, realizedLocal, localProven, modelEvaluated };
  });
  return {
    requiredCount: rows.length,
    localProvenCount: rows.filter((row) => row.localProven).length,
    modelRequiredCount: rows.filter((row) => !row.localProven && row.modelEvaluated).length,
    missingSlots: rows.filter((row) => !row.localProven && !row.modelEvaluated),
  };
}

function constructionIdentityKey(value = '') {
  return String(value || '').toLowerCase().replace(/^(?:actor|concept|entity|environment|object|part|slot)[.:]/, '')
    .replace(/_/g, '-').replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
}

function analyze(results, options = {}) {
  const failures = [];
  const perceptualHashes = new Map();
  for (const result of results) {
    if (result.auditError) {
      result.visualRubric = {
        score: 0,
        pass: false,
        expectedSignals: [],
        missingSignals: ['audit-completion'],
        dynamicRequired: false,
        dynamic: false,
        representationQuality: 0,
      };
      failures.push(`${result.index}: prompt audit failed: ${result.auditError}`);
      continue;
    }
    const rubric = result.visualRubric || visualRubricForResult(result, result.prompt);
    result.visualRubric = rubric;
    if (!auditPromptMatches(result.prompt, result.compiledPrompt)) {
      failures.push(`${result.index}: compiled prompt does not match submitted prompt`);
    }
    if (options.intentMode === 'model') {
      for (const failure of modelPreparationFailures(result.modelExecutionReceipt)) {
        failures.push(`${result.index}: ${failure}`);
      }
    }
    const matchReceipt = result.phase4CandidateMatchReceipt || {};
    const expectedPairEvaluations = Number(matchReceipt.nodeCount || 0) *
      Number(matchReceipt.candidateRowCount || 0);
    if (matchReceipt.schema !== 'simulatte.groundingCandidateMatchReceipt.v1' ||
        matchReceipt.policy !== 'exact-identity-or-unqualified-label-overlap') {
      failures.push(`${result.index}: Phase 4 candidate-match receipt is missing or uses an unknown policy`);
    }
    if (Number(matchReceipt.nodeCount || 0) !== array(result.phase4AcceptedNodeIdentities).length) {
      failures.push(`${result.index}: Phase 4 candidate-match node count does not match accepted identities`);
    }
    if (Number(matchReceipt.pairEvaluationCount || 0) !== expectedPairEvaluations ||
        Number(matchReceipt.matchedRowCount || 0) > expectedPairEvaluations ||
        Number(matchReceipt.scanPasses || 0) !== 1) {
      failures.push(`${result.index}: Phase 4 candidate matching did not use one bounded node-candidate scan`);
    }
    if (result.runtimeState !== 'ready') failures.push(`${result.index}: runtime not ready`);
    if (!result.canvasWidth || !result.canvasHeight) failures.push(`${result.index}: missing canvas`);
    const phaseRail = result.phaseRailLayout;
    if (!phaseRail || phaseRail.buttonCount !== 8 || phaseRail.inspected !== true || phaseRail.visible !== true) {
      failures.push(`${result.index}: eight-phase rail is missing or incomplete`);
    } else {
      if (phaseRail.left < 0 || phaseRail.top < 0 ||
          phaseRail.right > result.viewportWidth || phaseRail.bottom > result.viewportHeight) {
        failures.push(`${result.index}: eight-phase rail overflows the viewport`);
      }
      if (!Number.isFinite(phaseRail.canvasOverlapRatio) || phaseRail.canvasOverlapRatio > 0.25) {
        failures.push(`${result.index}: eight-phase rail obstructs more than 25% of the canvas`);
      }
      if (!/input (?!—)/.test(phaseRail.detail) || !/output (?!—)/.test(phaseRail.detail)) {
        failures.push(`${result.index}: selected phase does not expose input or output identity`);
      }
    }
    const phase7Input = result.phase7RenderExecutionInput || result.phase7Input || result.renderExecutionInput || '';
    const scenePacketInput = result.phase7SceneRenderPacketInput || '';
    if (result.renderExecutionInput !== 'simulatte.renderExecutionInput.v1') {
      failures.push(`${result.index}: Phase 7 renderExecutionInput dataset is ${result.renderExecutionInput || 'missing'}, expected simulatte.renderExecutionInput.v1`);
    }
    if (phase7Input !== 'simulatte.renderExecutionInput.v1') {
      failures.push(`${result.index}: Phase 7 input is ${phase7Input || 'missing'}, expected simulatte.renderExecutionInput.v1`);
    }
    if (scenePacketInput !== 'simulatte.sceneRenderPacket.v1') {
      failures.push(`${result.index}: Phase 7 sceneRenderPacket input is ${scenePacketInput || 'missing'}, expected simulatte.sceneRenderPacket.v1`);
    }
    if (result.phase7Output !== 'simulatte.phase7.output.v2') {
      failures.push(`${result.index}: Phase 7 output envelope missing`);
    }
    if (result.phase7RenderData !== 'simulatte.phase7.compactRenderData.v1') {
      failures.push(`${result.index}: Phase 7 render data receipt missing`);
    }
    if (result.phase7RenderPath !== 'depth-lit-prompt-conditioned-contours-surfaces-and-atmospheres') {
      failures.push(`${result.index}: Phase 7 render data path is ${result.phase7RenderPath || 'missing'}`);
    }
    const consumption = result.phase7RendererConsumption || {};
    if (consumption.schema !== 'simulatte.phase7RendererConsumption.v1') {
      failures.push(`${result.index}: Phase 7 renderer-consumption receipt missing`);
    }
    if (consumption.cameraConsumed !== true) failures.push(`${result.index}: compiled camera was not consumed`);
    if (Number(consumption.lightCountConsumed || 0) < 1) failures.push(`${result.index}: compiled lights were not consumed`);
    if (Number(consumption.materialCountConsumed || 0) < 1) failures.push(`${result.index}: compiled materials were not consumed`);
    if (consumption.depthEnabled !== true) failures.push(`${result.index}: depth execution is not enabled`);
    if (consumption.normalShading !== true) failures.push(`${result.index}: material lighting does not use surface normals`);
    if (consumption.atmosphereConfigured === true && consumption.atmosphereConsumed !== true) {
      failures.push(`${result.index}: compiled atmosphere program was not consumed`);
    }
    const morphology = consumption.morphologySubmission || {};
    if (Number(consumption.objectPartCount || 0) > 0 &&
        (morphology.schema !== 'simulatte.phase7MorphologySubmission.v1' ||
          Number(morphology.contourProfileCount || 0) < 1 ||
          Number(morphology.surfacePatternCount || 0) < 1 ||
          Number(morphology.accentPatternCount || 0) < 1)) {
      failures.push(`${result.index}: submitted object parts lack the Phase 6 morphology contract`);
    }
    const constructionGate = phase3ConstructionGate(result);
    for (const slot of constructionGate.missingSlots) {
      failures.push(`${result.index}: required construction slot ${slot.slotId} has neither a proven local grammar nor model-evaluated construction evidence`);
    }
    if (options.intentMode === 'model' && constructionGate.modelRequiredCount > 0 &&
        Number(consumption.modelEvaluatedConstructionCount || 0) < 1) {
      failures.push(`${result.index}: model-evaluated construction evidence did not reach Phase 7`);
    }
    for (const slot of array(result.phase3SlotCandidates)) {
      if (slot.skipReason === 'exact-construction-scored-by-prompt-embedding') {
        const construction = array(slot.candidates).filter((candidate) => candidate.constructionEvidence === true);
        if (!construction.length || construction.some((candidate) => (
          candidate.modelEvaluated !== true || candidate.literalSlotMatch !== true
        ))) {
          failures.push(`${result.index}: exact construction slot ${slot.slotId} lacks literal prompt-embedding evidence`);
        }
        if (construction.some((candidate) => candidate.rerankEvaluated === true)) {
          failures.push(`${result.index}: exact construction slot ${slot.slotId} ran a redundant slot reranker`);
        }
      }
      for (const candidate of array(slot.candidates)) {
        if (candidate.type === 'prompt-literal' && candidate.modelEvaluated !== true &&
            Number(candidate.embeddingScore || 0) !== 0) {
          failures.push(`${result.index}: local prompt literal ${candidate.id} carries a fabricated model score`);
        }
      }
    }
    if (result.phase7PixelReadback !== 'pass') {
      failures.push(`${result.index}: Phase 7 pixel readback is ${result.phase7PixelReadback || 'missing'}${result.phase7PixelReadbackMessage ? `: ${result.phase7PixelReadbackMessage}` : ''}`);
    }
    if (result.phase7PixelProofStatus !== 'pass') {
      failures.push(`${result.index}: Phase 7 pixel proof status is ${result.phase7PixelProofStatus || 'missing'}`);
    }
    if (result.phase7PixelRequiredObligationCount < 1) {
      failures.push(`${result.index}: Phase 7 pixel proof has no required visual obligations`);
    }
    const settledVisualObligations = Number(
      result.phase7PixelSettledObligationCount ?? result.phase7PixelSampledObligationCount
    );
    if (settledVisualObligations !== result.phase7PixelRequiredObligationCount) {
      failures.push(`${result.index}: Phase 7 pixel proof settled ${settledVisualObligations}/${result.phase7PixelRequiredObligationCount} required obligations ` +
        `(${result.phase7PixelSampledObligationCount} pixel sampled, ${result.phase7SemanticAbsenceObligationCount || 0} semantic absence)`);
    }
    if (result.webgpuOptimizationPath !== 'background-plus-instanced-object-parts') {
      failures.push(`${result.index}: WebGPU optimization path is ${result.webgpuOptimizationPath || 'missing'}`);
    }
    if (result.webgpuSceneInstanceCapacity < 1) {
      failures.push(`${result.index}: WebGPU scene instance capacity is missing`);
    } else if (result.webgpuSceneInstanceCount > result.webgpuSceneInstanceCapacity) {
      failures.push(`${result.index}: WebGPU scene instances overflow capacity ` +
        `${result.webgpuSceneInstanceCount}/${result.webgpuSceneInstanceCapacity}`);
    }
    if (result.webgpuSceneInstanceCount < 1) {
      failures.push(`${result.index}: WebGPU object-part instance path is empty`);
    }
	    if (result.webgpuStorageBytes < 3000) {
	      failures.push(`${result.index}: WebGPU scene storage receipt is missing`);
	    }
    if (result.phase8Output !== 'simulatte.phase8.output.v2') {
      failures.push(`${result.index}: Phase 8 output is ${result.phase8Output || 'missing'}${result.sceneProofError ? `: ${result.sceneProofError}` : ''}`);
    }
    if (result.sceneProofVerdict !== 'pass') {
      const requiredFailures = parseJsonArray(result.sceneProofRequiredFailures);
      const failureSummary = requiredFailures.map((row) => (
        `${row.obligationId || 'unknown'} (${row.reason || row.status || 'failed'})`
      )).join(', ');
      failures.push(`${result.index}: Scene Proof verdict is ${result.sceneProofVerdict || 'missing'}` +
        `${result.sceneProofError ? `: ${result.sceneProofError}` : ''}` +
        `${failureSummary ? `: ${failureSummary}` : ''}`);
    }
	    for (const [key, expectedSchema] of Object.entries(EXPECTED_PHASE_OUTPUT_SCHEMAS)) {
	      if (!result.phaseArtifactSchemas || result.phaseArtifactSchemas[key] !== expectedSchema) {
	        failures.push(`${result.index}: ${key} artifact schema is ${result.phaseArtifactSchemas && result.phaseArtifactSchemas[key] || 'missing'}, expected ${expectedSchema}`);
	      }
	    }
    if (result.phaseArtifactSchemas && result.phaseArtifactSchemas.phase6 === 'simulatte.phase6.output.v2' &&
      result.visualIRSceneRenderPacketSchema !== 'simulatte.sceneRenderPacket.v1') {
      failures.push(`${result.index}: Phase 6 visualCompile sceneRenderPacket missing`);
    }
    if (result.lumaStd < 8) failures.push(`${result.index}: low visual contrast std=${result.lumaStd}`);
    if (result.coloredRatio < 0.035) failures.push(`${result.index}: low color diversity ratio=${result.coloredRatio}`);
    if (!rubric.pass) {
      failures.push(`${result.index}: visual rubric failed score=${rubric.score} coverage=${rubric.coverage} missing=${rubric.missingSignals.join(',') || 'none'} dynamic=${rubric.dynamic}`);
    }
    const requiredEntityCount = array(result.phase6CompositionObligations).filter((row) => (
      row.required === true && ['entity', 'object'].includes(row.kind) && row.status !== 'lost'
    )).length;
    const minimumEntityCount = Math.max(1, requiredEntityCount);
    if (result.visualIREntityCount < minimumEntityCount) {
      failures.push(`${result.index}: VisualIR has ${result.visualIREntityCount}/${minimumEntityCount} required entities`);
    }
    const requiredEnvironments = array(result.phase6CompositionObligations).filter((row) => (
      row.required === true && row.kind === 'environment' && row.status !== 'lost'
    ));
    const visualProofByObligation = new Map(parseJsonArray(result.phase7VisualObligationProof)
      .map((row) => [row.obligationId, row]));
    const passedVisualObligationIds = new Set(String(result.phase7PassedVisualObligationIds || '')
      .split(',').map((id) => id.trim()).filter(Boolean));
    const visibleEnvironmentProof = requiredEnvironments.length > 0 && requiredEnvironments.every((row) => {
      const proof = visualProofByObligation.get(row.id);
      return passedVisualObligationIds.has(row.id) ||
        Boolean(proof && proof.status === 'pass' && proof.pixelSatisfied === true);
    });
    if (requiredEnvironments.length && !result.visualIREnvironmentProgram && !visibleEnvironmentProof) {
      failures.push(`${result.index}: required environment has neither a rendered program nor live pixel proof`);
    }
    if (rubric.expectedCount > 0 && result.visualIRProcessCount < 1) {
      failures.push(`${result.index}: VisualIR has no process for an expected visual signal`);
    }
    const minimumRenderInstanceCount = Math.max(
      1,
      requiredEntityCount + Number(requiredEnvironments.length > 0)
    );
    if (result.visualIRRenderInstanceCount < minimumRenderInstanceCount) {
      failures.push(
        `${result.index}: VisualIR has ${result.visualIRRenderInstanceCount}/${minimumRenderInstanceCount} required render instances`
      );
    }
    if (result.visualIRReceiptCount < 4) failures.push(`${result.index}: VisualIR has too few receipts`);
    if (!result.visualIRGraphicsCompiler) failures.push(`${result.index}: VisualIR missing graphics atom compiler`);
    if (rubric.expectedCount > 0 && !(result.visualIRGraphicsUniformSlots || []).length &&
      rubric.missingSignals.length > 0) {
      failures.push(`${result.index}: VisualIR missing graphics atom uniform slots`);
    }
    if (result.kind === 'curated' && result.intentBriefSchema !== 'simulatte.intentBrief.v1') {
      failures.push(`${result.index}: curated prompt missing intent brief`);
    }
    if (result.kind === 'curated' && result.intentBriefEvidenceCount < 1) {
      failures.push(`${result.index}: curated prompt has no retrieved intent evidence`);
    }
    const needsCausalGraph = promptNeedsCausalGraph(result.prompt);
    if (result.kind === 'curated' && needsCausalGraph && result.intentBriefCausalEdgeCount < 1) {
      failures.push(`${result.index}: curated prompt has no causal intent edges`);
    }
    if (result.kind === 'curated' && needsCausalGraph && result.visualIRCausalAffordanceCount < 1) {
      failures.push(`${result.index}: curated VisualIR has no causal affordances`);
    }
    if (result.kind === 'curated' && /^(generic|literal-composite)$/.test(result.rendererSceneKind)) {
      failures.push(`${result.index}: curated prompt fell into ${result.rendererSceneKind}`);
    }
    if (result.kind === 'curated' && /^(generic|literal-composite)$/.test(result.visualIRSceneKind)) {
      failures.push(`${result.index}: curated VisualIR fell into ${result.visualIRSceneKind}`);
    }
    if (result.kind === 'broad' && /^(generic|literal-composite)$/.test(result.rendererSceneKind)) {
      failures.push(`${result.index}: broad prompt fell into ${result.rendererSceneKind}`);
    }
    if (result.kind === 'broad' && /^(generic|literal-composite)$/.test(result.visualIRSceneKind)) {
      failures.push(`${result.index}: broad VisualIR fell into ${result.visualIRSceneKind}`);
    }
    if (!result.canvasDiversityPerceptualHash) {
      failures.push(`${result.index}: frozen clean-canvas perceptual hash missing`);
    } else if (result.canvasDiversityFrameStable !== true) {
      failures.push(`${result.index}: frozen clean-canvas perceptual hash is not frame-stable`);
    } else {
      const duplicate = perceptualHashes.get(result.canvasDiversityPerceptualHash);
      if (duplicate) failures.push(`${result.index}: duplicate frozen clean-canvas perceptual hash with ${duplicate}`);
      perceptualHashes.set(result.canvasDiversityPerceptualHash, result.index);
    }
  }
  const broadResults = results.filter((result) => result.kind === 'broad');
  const broadSceneCount = new Set(broadResults.map((result) => result.rendererSceneKind).filter(Boolean)).size;
  if (broadResults.length >= 4 && broadSceneCount < Math.min(8, broadResults.length)) {
    failures.push(`broad prompts collapsed into ${broadSceneCount} scene kinds`);
  }
  return {
    ok: failures.length === 0,
    failures,
    promptCount: results.length,
    screenshotCount: results.filter((result) => result.screenshotHash).length,
    uniqueCanvasHashes: new Set(results.map((result) => result.canvasHash)).size,
    uniqueScreenshotHashes: new Set(results.map((result) => result.screenshotHash)).size,
    uniqueCanvasPerceptualHashes: new Set(results.map((result) => result.canvasPerceptualHash).filter(Boolean)).size,
    minCanvasPerceptualHashDistance: minPerceptualHashDistance(results),
    uniqueCanvasDiversityPerceptualHashes: new Set(results.map((result) => result.canvasDiversityPerceptualHash).filter(Boolean)).size,
    minCanvasDiversityPerceptualHashDistance: minPerceptualHashDistance(results, 'canvasDiversityPerceptualHash'),
    perceptualHashCalibration: perceptualHashCalibration(results),
    sceneKinds: [...new Set(results.map((result) => result.rendererSceneKind).filter(Boolean))].sort(),
    visualIRSceneKinds: [...new Set(results.map((result) => result.visualIRSceneKind).filter(Boolean))].sort(),
    visualIRCameras: [...new Set(results.map((result) => result.visualIRCamera).filter(Boolean))].sort(),
    graphicsAtoms: {
      totalAtoms: results.reduce((sum, result) => sum + (result.visualIRGraphicsAtomCount || 0), 0),
      mappingIds: [...new Set(results.flatMap((result) => result.visualIRGraphicsMappingIds || []))].sort(),
      uniformSlots: [...new Set(results.flatMap((result) => result.visualIRGraphicsUniformSlots || []))].sort(),
      wgslOperators: [...new Set(results.flatMap((result) => result.visualIRGraphicsWgslOperators || []))].sort(),
    },
    visualRubric: {
      scope: 'machine-structural-and-pixel-presence',
      recognizabilityStatus: 'human-adjudication-required',
      averageScore: Number((results.reduce((sum, result) => sum + (result.visualRubric ? result.visualRubric.score : 0), 0) / Math.max(1, results.length)).toFixed(2)),
      passCount: results.filter((result) => result.visualRubric && result.visualRubric.pass).length,
      failCount: results.filter((result) => result.visualRubric && !result.visualRubric.pass).length,
      expectedSignals: [...new Set(results.flatMap((result) => result.visualRubric ? result.visualRubric.expectedSignals : []))].sort(),
      missingSignals: [...new Set(results.flatMap((result) => result.visualRubric ? result.visualRubric.missingSignals : []))].sort(),
      dynamicFailures: results
        .filter((result) => result.visualRubric && result.visualRubric.dynamicRequired && !result.visualRubric.dynamic)
        .map((result) => result.index),
      representationFailures: results
        .filter((result) => result.visualRubric && Number(result.visualRubric.representationQuality || 0) < 0.5)
        .map((result) => result.index),
      averageRepresentationQuality: Number((results.reduce((sum, result) => {
        return sum + (result.visualRubric ? Number(result.visualRubric.representationQuality || 0) : 0);
      }, 0) / Math.max(1, results.length)).toFixed(3)),
    },
    intentBriefs: {
      totalEvidence: results.reduce((sum, result) => sum + (result.intentBriefEvidenceCount || 0), 0),
      totalCausalEdges: results.reduce((sum, result) => sum + (result.intentBriefCausalEdgeCount || 0), 0),
      totalAffordances: results.reduce((sum, result) => sum + (result.intentBriefAffordanceCount || 0), 0),
      totalDegraded: results.reduce((sum, result) => sum + (result.intentBriefDegradedCount || 0), 0),
    },
    physicalReceipts: {
      totalIntentEvidence: results.reduce((sum, result) => sum + (result.physicalReceiptIntentEvidenceCount || 0), 0),
      totalCausalEdges: results.reduce((sum, result) => sum + (result.physicalReceiptCausalEdgeCount || 0), 0),
      totalCausalAffordances: results.reduce((sum, result) => sum + (result.physicalReceiptCausalAffordanceCount || 0), 0),
      totalAssumptions: results.reduce((sum, result) => sum + (result.physicalReceiptAssumptionCount || 0), 0),
      totalUnsupported: results.reduce((sum, result) => sum + (result.physicalReceiptUnsupportedCount || 0), 0),
      totalDegraded: results.reduce((sum, result) => sum + (result.physicalReceiptDegradedCount || 0), 0),
    },
    causalRequirements: {
      promptCount: results.filter((result) => promptNeedsCausalGraph(result.prompt)).length,
      promptsMissingAffordances: results
        .filter((result) => promptNeedsCausalGraph(result.prompt) && result.visualIRCausalAffordanceCount < 1)
        .map((result) => result.index),
    },
    templateIds: [...new Set(results.map((result) => result.templateId).filter(Boolean))].sort(),
  };
}

function browserDiagnosticText(event = {}) {
  const params = event.params || {};
  const consoleText = (params.args || []).map((arg) => arg.value || arg.description || '').join(' ');
  return [consoleText, params.entry && params.entry.text || '', params.exceptionDetails && params.exceptionDetails.text || '']
    .filter(Boolean)
    .join(' ');
}

function webGpuValidationFailures(events = []) {
  return events.map(browserDiagnosticText).filter((message) => (
    /GPUValidationError|Invalid CommandBuffer|associated with \[Device\].*cannot be used|CreateBindGroup.*invalid|device lost/i
      .test(message)
  ));
}

function promptNeedsCausalGraph(prompt) {
  return /\b(heat|heats|cool|cools|melt|melts|freeze|freezes|drive|drives|push|pushes|pull|pulls|erode|erodes|collide|collides|impact|fracture|diffuse|diffuses|flow|flows|orbit|orbits|feedback|load|loads|pressure|wave|waves|burn|burns|grow|grows|stabilize|stabilizes)\b/i
    .test(String(prompt || ''));
}

function withAutoRating(summary) {
  const promptCount = Math.max(1, Number(summary.promptCount || summary.screenshotCount || 0));
  const rubric = summary.visualRubric || {};
  const causal = summary.causalRequirements || {};
  const passRate = Number(rubric.passCount || 0) / promptCount;
  const sceneDiversity = Math.min(1, (summary.sceneKinds || []).length / promptCount);
  const screenshotDiversity = Math.min(1, Number(summary.uniqueScreenshotHashes || 0) / promptCount);
  const canvasDiversity = Math.min(1, Number(summary.uniqueCanvasDiversityPerceptualHashes || 0) / promptCount);
  const representationQuality = clamp01(Number(rubric.averageRepresentationQuality || 0));
  const causalCoverage = causal.promptCount
    ? 1 - ((causal.promptsMissingAffordances || []).length / Math.max(1, causal.promptCount))
    : 1;
  const failurePenalty = Math.min(0.35, (summary.failures || []).length * 0.035);
  const dynamicPenalty = Math.min(0.2, (rubric.dynamicFailures || []).length * 0.05);
  const representationPenalty = Math.min(0.18, (rubric.representationFailures || []).length * 0.045);
  const missingPenalty = Math.min(0.2, (rubric.missingSignals || []).length * 0.04);
  const score = Math.round(100 * clamp01(
    Number(rubric.averageScore || 0) / 100 * 0.5 +
    passRate * 0.24 +
    representationQuality * 0.14 +
    causalCoverage * 0.12 -
    failurePenalty -
    dynamicPenalty -
    representationPenalty -
    missingPenalty
  ));
  return {
    ...summary,
    autoRating: {
      schema: 'simulatte.liveVisualAutoRating.v1',
      scope: 'machine-structural-and-pixel-presence',
      recognizabilityVerified: false,
      humanAdjudicationRequired: true,
      score,
      grade: 'unverified',
      verdict: 'not-proven',
      machineStructuralVerdict: summary.ok && score >= 85 ? 'pass' : 'fail',
      promptCount,
      passRate: Number(passRate.toFixed(3)),
      sceneDiversity: Number(sceneDiversity.toFixed(3)),
      screenshotDiversity: Number(screenshotDiversity.toFixed(3)),
      canvasDiversity: Number(canvasDiversity.toFixed(3)),
      diversityTelemetryOnly: true,
      causalCoverage: Number(causalCoverage.toFixed(3)),
      failureCount: (summary.failures || []).length,
      dynamicFailureCount: (rubric.dynamicFailures || []).length,
      representationFailureCount: (rubric.representationFailures || []).length,
      averageRepresentationQuality: Number(rubric.averageRepresentationQuality || 0),
      missingSignals: rubric.missingSignals || [],
    },
  };
}

function minPerceptualHashDistance(results = [], key = 'canvasPerceptualHash') {
  const hashes = results
    .map((result) => ({ index: result.index, hash: String(result[key] || '') }))
    .filter((row) => row.hash.length === 16);
  let minimum = null;
  for (let left = 0; left < hashes.length; left += 1) {
    for (let right = left + 1; right < hashes.length; right += 1) {
      const distance = perceptualHashDistance(hashes[left].hash, hashes[right].hash);
      if (!Number.isFinite(distance) || (minimum && distance >= minimum.distance)) continue;
      minimum = { left: hashes[left].index, right: hashes[right].index, bits: perceptualHashBits(hashes[left].hash, hashes[right].hash), distance: Number(distance.toFixed(4)) };
    }
  }
  return minimum;
}

function perceptualHashCalibration(results = []) {
  const hashBits = 64;
  const bitMargin = 1;
  const rows = (results || []).filter((result) => (
    /^[0-9a-f]{16}$/i.test(String(result.canvasDiversityPerceptualHash || '')) &&
    /^[0-9a-f]{16}$/i.test(String(result.canvasDiversityPerceptualHashLater || ''))
  ));
  const temporalBits = rows.map((result) => perceptualHashBits(
    result.canvasDiversityPerceptualHash,
    result.canvasDiversityPerceptualHashLater
  ));
  const maxTemporalBits = temporalBits.length ? Math.max(...temporalBits) : null;
  const minimum = minPerceptualHashDistance(rows, 'canvasDiversityPerceptualHash');
  const floorBits = Number.isFinite(maxTemporalBits) ? maxTemporalBits + bitMargin : null;
  return {
    schema: 'simulatte.cleanCanvasPerceptualHashCalibration.v1',
    hashKind: 'audit:visual-clean-canvas-dhash-64',
    hashBits,
    promptCount: (results || []).length,
    usablePromptCount: rows.length,
    bitMargin,
    maxTemporalBits,
    maxTemporalDistance: Number.isFinite(maxTemporalBits) ? Number((maxTemporalBits / hashBits).toFixed(4)) : null,
    minPairwiseBits: minimum && minimum.bits || null,
    minPairwiseDistance: minimum && minimum.distance || null,
    closestPair: minimum ? { left: minimum.left, right: minimum.right } : null,
    recommendedHashFloorBits: floorBits,
    recommendedHashFloor: Number.isFinite(floorBits) ? Number((floorBits / hashBits).toFixed(4)) : null,
    calibrated: Boolean(floorBits && minimum && minimum.bits > floorBits && rows.length === (results || []).length),
  };
}

function perceptualHashDistance(left = '', right = '') {
  if (!/^[0-9a-f]{16}$/i.test(left) || !/^[0-9a-f]{16}$/i.test(right)) return NaN;
  return perceptualHashBits(left, right) / 64;
}

function perceptualHashBits(left = '', right = '') {
  if (!/^[0-9a-f]{16}$/i.test(left) || !/^[0-9a-f]{16}$/i.test(right)) return NaN;
  let value = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let bits = 0;
  while (value) {
    bits += Number(value & 1n);
    value >>= 1n;
  }
  return bits;
}

function gradeForScore(score) {
  if (score >= 94) return 'A';
  if (score >= 86) return 'B';
  if (score >= 76) return 'C';
  if (score >= 66) return 'D';
  return 'F';
}


export { analyze, visualRubricForResult, withAutoRating, webGpuValidationFailures };
