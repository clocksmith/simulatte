const DIVERSITY_SCHEMA = 'simulatte.pipelineDiversityAudit.v1';
const DEFAULT_DIVERSITY_FLOOR = 0;

export function diversitySignatureForContext(context = {}, liveResult = null) {
  const visual = context.visualIR || {};
  const atoms = context.graphicsAtoms || {};
  const packet = context.visualCompile && context.visualCompile.sceneRenderPacket || {};
  const ir = context.physicsIR || {};
  const genome = visual.visualGenome ||
    context.renderProgram && context.renderProgram.visualGenome ||
    context.visualCompile && context.visualCompile.visualGenome ||
    {};
  const drawables = [
    ...(packet.entities || []),
    ...(packet.fields || []),
    ...(packet.effects || []),
  ];
  const evidence = groundingEvidenceSignature(context);
  return {
    schema: 'simulatte.pipelineDiversitySignature.v1',
    prompt: context.prompt || '',
    sceneKind: visual.sceneKind || packet.sceneKind || '',
    sceneMix: numericVector(packet.uniforms && packet.uniforms.sceneMix || []),
    visualLayers: numericVector(packet.uniforms && packet.uniforms.visualLayers || []),
    atomUniforms: numericVector(atoms.uniforms && atoms.uniforms.values || []),
    spatialLayout: numericVector(drawables.flatMap((row) => {
      const transform = row.transform || {};
      return [
        ...((transform.position || []).slice(0, 2).map((value) => Math.round(Number(value || 0) * 4) / 4)),
        ...((transform.scale || []).slice(0, 2).map((value) => Math.round(Number(value || 0) * 4) / 4)),
      ];
    })),
    drawableCount: drawables.length,
    animationKinds: uniqueStrings(drawables.map((row) => row.animation && row.animation.kind)),
    identityCategories: uniqueStrings(drawables.map((row) => row.identity && row.identity.category)),
    renderClasses: uniqueStrings(drawables.map((row) => row.identity && row.identity.renderClass)),
    layerSlots: uniqueStrings(drawables.map((row) => row.layerSlot)),
    identities: uniqueStrings(drawables.map((row) => row.identity && (
      row.identity.type || row.identity.sourceLabel || row.identity.label
    ))),
    operatorTypes: uniqueStrings((ir.operators || []).map((row) => row.type)),
    behaviorProcesses: uniqueStrings((ir.behaviorRelations || []).map((row) => row.process)),
    atomIds: uniqueStrings([
      ...(atoms.mappings || []).map((row) => row.id),
      ...(atoms.geometry || []).map((row) => row.id),
      ...(atoms.fields || []).map((row) => row.id),
      ...(atoms.materials || []).map((row) => row.id),
      ...(atoms.processes || []).map((row) => row.id),
      ...(atoms.motion || []).map((row) => row.id),
    ]),
    motionAtoms: uniqueStrings((atoms.motion || []).map((row) => row.id)),
    evidence,
    genome: {
      id: genome.id || '',
      seed: Number(genome.seed || 0),
      palette: genome.palette || {},
      morphology: genome.morphology || {},
      motifs: genome.motifs || [],
      semanticVisualIds: uniqueStrings([
        ...((genome.semanticVisuals && genome.semanticVisuals.archetypes) || []).map((row) => row.id),
        ...((genome.semanticVisuals && genome.semanticVisuals.materials) || []).map((row) => row.id),
        ...((genome.semanticVisuals && genome.semanticVisuals.processes) || []).map((row) => row.id),
      ]),
      visualDialect: genome.visualDialect || '',
      compositionTopology: genome.compositionTopology || genome.morphology && genome.morphology.compositionTopology || '',
      cameraArchetype: genome.cameraArchetype || genome.morphology && genome.morphology.cameraArchetype || '',
      scaleTier: genome.scaleTier || genome.morphology && genome.morphology.scaleTier || '',
    },
    live: liveDiversityReceipt(liveResult),
  };
}

export function scoreDiversity(rows = [], options = {}) {
  // Keep each signature paired with its source row. Filtering bare signatures
  // can otherwise associate a closest-pair receipt with the wrong prompts.
  const entries = rows
    .map((row) => ({ row, signature: row && row.diversitySignature || null }))
    .filter((entry) => Boolean(entry.signature));
  const signatures = entries.map((entry) => entry.signature);
  const floor = Number.isFinite(Number(options.floor)) ? Number(options.floor) : DEFAULT_DIVERSITY_FLOOR;
  const hashFloor = options.hashFloor === null || options.hashFloor === undefined
    ? null
    : Number.isFinite(Number(options.hashFloor)) ? Number(options.hashFloor) : null;
  const pairs = [];
  for (let a = 0; a < signatures.length; a += 1) {
    for (let b = a + 1; b < signatures.length; b += 1) {
      pairs.push(pairDistance(entries[a].row, entries[b].row, signatures[a], signatures[b]));
    }
  }
  pairs.sort((left, right) => left.distance - right.distance || left.promptA.localeCompare(right.promptA));
  const minPair = pairs[0] || null;
  const hashPairs = pairs.filter((row) => Number.isFinite(row.hashDistance));
  const minHashPair = hashPairs.sort((left, right) => left.hashDistance - right.hashDistance)[0] || null;
  const hashEvidenceRequired = options.requireLiveHash === true;
  const missingHashEvidence = hashEvidenceRequired && (!hashPairs.length || !Number.isFinite(hashFloor));
  const closePairs = pairs
    .filter((row) => row.distance < floor || (Number.isFinite(hashFloor) && Number.isFinite(row.hashDistance) && row.hashDistance < hashFloor))
    .slice(0, 12);
  const score = pairs.length
    ? clamp(Math.min(
      minPair ? minPair.distance : 100,
      minHashPair ? minHashPair.hashDistance * 100 : 100
    ), 0, 100)
    : 100;
  return {
    schema: DIVERSITY_SCHEMA,
    signatureCount: signatures.length,
    pairCount: pairs.length,
    floor,
    hashFloor,
    score: round(score),
    verdict: score >= floor && !closePairs.length && !missingHashEvidence ? 'pass' : 'fail',
    minPairwiseDistance: minPair ? round(minPair.distance) : 100,
    minPerceptualHashDistance: minHashPair ? round(minHashPair.hashDistance) : null,
    perceptualHashAvailable: hashPairs.length > 0,
    hashEvidenceRequired,
    hashEvidenceReady: !missingHashEvidence,
    closestPairs: pairs.slice(0, 8),
    closePairs,
  };
}

function pairDistance(rowA, rowB, a, b) {
  const vectorDistance = average([
    vectorDistance01(a.sceneMix, b.sceneMix),
    vectorDistance01(a.visualLayers, b.visualLayers),
    vectorDistance01(a.atomUniforms, b.atomUniforms),
    vectorDistance01(a.spatialLayout, b.spatialLayout),
    Math.abs(a.drawableCount - b.drawableCount) / Math.max(1, Math.max(a.drawableCount, b.drawableCount)),
  ]) * 32;
  const setDistance = average([
    jaccardDistance(a.layerSlots, b.layerSlots),
    jaccardDistance(a.identities, b.identities),
    jaccardDistance(a.operatorTypes, b.operatorTypes),
    jaccardDistance(a.behaviorProcesses, b.behaviorProcesses),
    jaccardDistance(a.atomIds, b.atomIds),
    jaccardDistance(a.motionAtoms, b.motionAtoms),
    jaccardDistance(a.genome.motifs, b.genome.motifs),
    jaccardDistance(a.animationKinds, b.animationKinds),
    jaccardDistance(a.identityCategories, b.identityCategories),
    jaccardDistance(a.renderClasses, b.renderClasses),
    jaccardDistance(a.genome.semanticVisualIds, b.genome.semanticVisualIds),
  ]) * 28;
  const sceneDistance = a.sceneKind && b.sceneKind && a.sceneKind !== b.sceneKind ? 8 : 0;
  // Structure (topology/camera/scale) is what a viewer reads first, so it earns real
  // weight as a first-class axis instead of being one term inside the genome bucket.
  const structureDistance = average([
    structuralAxisDistance(a.genome.visualDialect, b.genome.visualDialect),
    structuralAxisDistance(a.genome.compositionTopology, b.genome.compositionTopology),
    structuralAxisDistance(a.genome.cameraArchetype, b.genome.cameraArchetype),
    structuralAxisDistance(a.genome.scaleTier, b.genome.scaleTier),
  ]) * 24;
  const genomeDistance = average([
    paletteDistance(a.genome.palette, b.genome.palette),
    morphologyDistance(a.genome.morphology, b.genome.morphology),
  ]) * 12;
  const hashDistance = liveHashDistance(a.live, b.live);
  return {
    promptA: rowA && rowA.prompt || a.prompt,
    promptB: rowB && rowB.prompt || b.prompt,
    distance: round(clamp(vectorDistance + setDistance + sceneDistance + structureDistance + genomeDistance, 0, 100)),
    hashDistance: Number.isFinite(hashDistance) ? round(hashDistance) : null,
    sceneA: a.sceneKind,
    sceneB: b.sceneKind,
    topologyA: a.genome.compositionTopology,
    topologyB: b.genome.compositionTopology,
    dialectA: a.genome.visualDialect,
    dialectB: b.genome.visualDialect,
    cameraA: a.genome.cameraArchetype,
    cameraB: b.genome.cameraArchetype,
    scaleA: a.genome.scaleTier,
    scaleB: b.genome.scaleTier,
    sharedLayers: intersection(a.layerSlots, b.layerSlots).slice(0, 8),
    sharedIdentities: intersection(a.identities, b.identities).slice(0, 8),
    sharedOperators: intersection(a.operatorTypes, b.operatorTypes).slice(0, 8),
    sharedAtoms: intersection(a.atomIds, b.atomIds).slice(0, 8),
    sharedSemanticVisuals: intersection(a.genome.semanticVisualIds, b.genome.semanticVisualIds).slice(0, 8),
    sharedAxes: sharedDiversityAxes(a, b),
    groundingDiagnostic: groundingCollisionDiagnostic(a.evidence, b.evidence),
  };
}

function groundingEvidenceSignature(context = {}) {
  const language = context.languageEvidence || {};
  const spans = language.spans || [];
  const components = context.groundedIntent && context.groundedIntent.components || [];
  return {
    phase2Terms: uniqueStrings([
      ...spans.map(evidenceLabel),
      ...((language.predicateFrames || language.predicates || []).map(evidenceLabel)),
    ]),
    phase3PromptCandidates: uniqueStrings((context.retrievalRows || [])
      .filter(isPromptCandidate)
      .map(evidenceLabel)),
    phase4GroundedComponents: uniqueStrings(components
      .filter(isPromptCandidate)
      .map(evidenceLabel)),
  };
}

function groundingCollisionDiagnostic(left = {}, right = {}) {
  const phase2 = evidenceDifference(left.phase2Terms, right.phase2Terms);
  const phase3 = evidenceDifference(left.phase3PromptCandidates, right.phase3PromptCandidates);
  const phase4 = evidenceDifference(left.phase4GroundedComponents, right.phase4GroundedComponents);
  const collapsedStages = [
    ['phase2', phase2],
    ['phase3', phase3],
    ['phase4', phase4],
  ].filter(([, detail]) => detail.collapsed).map(([stage]) => stage);
  return {
    schema: 'simulatte.diversityGroundingCollisionDiagnostic.v1',
    auditOnly: true,
    phase2,
    phase3,
    phase4,
    collapsedStages,
    nextInspection: collapsedStages[0] === 'phase2'
      ? 'phase2-lexicon-or-parser'
      : collapsedStages[0] === 'phase3'
        ? 'phase3-retrieval-depth'
        : collapsedStages[0] === 'phase4'
          ? 'phase4-evidence-fusion'
          : 'phase6-dialect-or-rendering',
  };
}

function evidenceDifference(left = [], right = []) {
  const shared = intersection(left, right);
  const leftOnly = left.filter((value) => !shared.includes(value));
  const rightOnly = right.filter((value) => !shared.includes(value));
  return {
    shared: shared.slice(0, 8),
    leftOnly: leftOnly.slice(0, 8),
    rightOnly: rightOnly.slice(0, 8),
    collapsed: Boolean(left.length && right.length && !leftOnly.length && !rightOnly.length),
  };
}

function isPromptCandidate(row = {}) {
  return row && row.supportOnly !== true && row.retrievalRole !== 'support';
}

function evidenceLabel(row = {}) {
  if (typeof row === 'string') return row;
  return row && (
    row.phrase || row.text || row.label || row.process || row.targetText || row.implicitObject || row.id
  ) || '';
}

function sharedDiversityAxes(a, b) {
  return [
    ['sceneKind', a.sceneKind, b.sceneKind],
    ['visualDialect', a.genome.visualDialect, b.genome.visualDialect],
    ['compositionTopology', a.genome.compositionTopology, b.genome.compositionTopology],
    ['cameraArchetype', a.genome.cameraArchetype, b.genome.cameraArchetype],
    ['scaleTier', a.genome.scaleTier, b.genome.scaleTier],
  ].filter(([, left, right]) => left && left === right).map(([axis]) => axis);
}

function liveDiversityReceipt(liveResult = null) {
  if (!liveResult) return { hash: '', hashKind: '', canvasHash: '' };
  const hash = liveResult.canvasDiversityFrameStable === true
    ? String(liveResult.canvasDiversityPerceptualHash || '')
    : '';
  return {
    hash,
    hashKind: hash ? 'audit:visual-clean-canvas-dhash-64' : '',
    canvasHash: String(liveResult.canvasHash || ''),
    sceneObjectUniforms: String(liveResult.sceneObjectUniforms || ''),
    sceneObjectIdentities: String(liveResult.sceneObjectIdentities || ''),
  };
}

function liveHashDistance(a = {}, b = {}) {
  // Screenshot SHA values only prove byte-level non-identity. The diversity
  // gate must use the clean-canvas perceptual hash captured by the visual
  // audit, otherwise UI chrome or a one-pixel change can manufacture distance.
  const hashA = a.hash || '';
  const hashB = b.hash || '';
  if (!hashA || !hashB || hashA.length !== hashB.length) return NaN;
  if (/^[0-9a-f]+$/i.test(hashA) && /^[0-9a-f]+$/i.test(hashB)) {
    return hexadecimalHammingDistance(hashA, hashB) / Math.max(1, hashA.length * 4);
  }
  return NaN;
}

function hexadecimalHammingDistance(a, b) {
  let out = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    let value = Number.parseInt(a[i], 16) ^ Number.parseInt(b[i], 16);
    while (value) {
      out += value & 1;
      value >>>= 1;
    }
  }
  return out + Math.abs(a.length - b.length) * 4;
}

function numericVector(values) {
  return Array.from(values || []).map((value) => {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number : 0;
  });
}

function vectorDistance01(a, b) {
  const length = Math.max(a.length, b.length, 1);
  let sum = 0;
  for (let index = 0; index < length; index += 1) {
    sum += Math.abs(Number(a[index] || 0) - Number(b[index] || 0));
  }
  return clamp(sum / length, 0, 1);
}

function structuralAxisDistance(a, b) {
  if (!a && !b) return 0;
  return String(a || '') === String(b || '') ? 0 : 1;
}

function jaccardDistance(a = [], b = []) {
  const setA = new Set(a || []);
  const setB = new Set(b || []);
  if (!setA.size && !setB.size) return 0;
  const union = new Set([...setA, ...setB]);
  return 1 - intersection([...setA], [...setB]).length / Math.max(1, union.size);
}

function paletteDistance(a = {}, b = {}) {
  const hue = circularDistance(a.hue, b.hue) / 180;
  const accent = circularDistance(a.accentHue, b.accentHue) / 180;
  const contrast = Math.abs(Number(a.contrast || 0) - Number(b.contrast || 0));
  const lightness = Math.abs(Number(a.lightness || 0) - Number(b.lightness || 0));
  return clamp(average([hue, accent, contrast, lightness]), 0, 1);
}

function morphologyDistance(a = {}, b = {}) {
  return clamp(average([
    a.layoutMode === b.layoutMode ? 0 : 1,
    a.textureKind === b.textureKind ? 0 : 1,
  ]), 0, 1);
}

function circularDistance(a, b) {
  const left = Number(a || 0);
  const right = Number(b || 0);
  const diff = Math.abs(left - right) % 360;
  return Math.min(diff, 360 - diff);
}

function uniqueStrings(values) {
  return Array.from(new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))).sort();
}

function intersection(a = [], b = []) {
  const setB = new Set(b);
  return (a || []).filter((value) => setB.has(value));
}

function average(values) {
  const numbers = values.map(Number).filter(Number.isFinite);
  if (!numbers.length) return 0;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function round(value) {
  return Number(Number(value || 0).toFixed(3));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}
