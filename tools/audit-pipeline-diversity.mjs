const DIVERSITY_SCHEMA = 'simulatte.pipelineDiversityAudit.v1';
const DEFAULT_DIVERSITY_FLOOR = 38;
const DEFAULT_HASH_DISTANCE_FLOOR = 0.22;

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
  return {
    schema: 'simulatte.pipelineDiversitySignature.v1',
    prompt: context.prompt || '',
    sceneKind: visual.sceneKind || packet.sceneKind || '',
    sceneMix: numericVector(packet.uniforms && packet.uniforms.sceneMix || []),
    visualLayers: numericVector(packet.uniforms && packet.uniforms.visualLayers || []),
    atomUniforms: numericVector(atoms.uniforms && atoms.uniforms.values || []),
    objectUniforms: numericVector(packet.uniforms && packet.uniforms.objectUniforms || []),
    animationCodes: numericVector(drawables.map((row) => row.renderCodes && row.renderCodes.animationCode)),
    semanticCodes: numericVector(drawables.map((row) => row.renderCodes && row.renderCodes.semanticCode)),
    categoryCodes: numericVector(drawables.map((row) => row.renderCodes && row.renderCodes.categoryCode)),
    variantCodes: numericVector(drawables.map((row) => row.renderCodes && row.renderCodes.variantCode)),
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
    genome: {
      id: genome.id || '',
      seed: Number(genome.seed || 0),
      palette: genome.palette || {},
      morphology: genome.morphology || {},
      motifs: genome.motifs || [],
      semanticSignature: genome.semanticVisuals && genome.semanticVisuals.signature || 0,
    },
    live: liveDiversityReceipt(liveResult),
  };
}

export function scoreDiversity(rows = [], options = {}) {
  const signatures = rows
    .map((row) => row.diversitySignature || null)
    .filter(Boolean);
  const floor = Number(options.floor || DEFAULT_DIVERSITY_FLOOR);
  const hashFloor = Number(options.hashFloor || DEFAULT_HASH_DISTANCE_FLOOR);
  const pairs = [];
  for (let a = 0; a < signatures.length; a += 1) {
    for (let b = a + 1; b < signatures.length; b += 1) {
      pairs.push(pairDistance(rows[a], rows[b], signatures[a], signatures[b]));
    }
  }
  pairs.sort((left, right) => left.distance - right.distance || left.promptA.localeCompare(right.promptA));
  const minPair = pairs[0] || null;
  const hashPairs = pairs.filter((row) => Number.isFinite(row.hashDistance));
  const minHashPair = hashPairs.sort((left, right) => left.hashDistance - right.hashDistance)[0] || null;
  const closePairs = pairs
    .filter((row) => row.distance < floor || (Number.isFinite(row.hashDistance) && row.hashDistance < hashFloor))
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
    verdict: score >= floor && !closePairs.length ? 'pass' : 'fail',
    minPairwiseDistance: minPair ? round(minPair.distance) : 100,
    minPerceptualHashDistance: minHashPair ? round(minHashPair.hashDistance) : null,
    perceptualHashAvailable: hashPairs.length > 0,
    closestPairs: pairs.slice(0, 8),
    closePairs,
  };
}

function pairDistance(rowA, rowB, a, b) {
  const vectorDistance = average([
    vectorDistance01(a.sceneMix, b.sceneMix),
    vectorDistance01(a.visualLayers, b.visualLayers),
    vectorDistance01(a.atomUniforms, b.atomUniforms),
    vectorDistance01(a.objectUniforms, b.objectUniforms),
    vectorDistance01(a.animationCodes, b.animationCodes),
    vectorDistance01(a.semanticCodes, b.semanticCodes),
    vectorDistance01(a.categoryCodes, b.categoryCodes),
    vectorDistance01(a.variantCodes, b.variantCodes),
  ]) * 42;
  const setDistance = average([
    jaccardDistance(a.layerSlots, b.layerSlots),
    jaccardDistance(a.identities, b.identities),
    jaccardDistance(a.operatorTypes, b.operatorTypes),
    jaccardDistance(a.behaviorProcesses, b.behaviorProcesses),
    jaccardDistance(a.atomIds, b.atomIds),
    jaccardDistance(a.motionAtoms, b.motionAtoms),
    jaccardDistance(a.genome.motifs, b.genome.motifs),
  ]) * 36;
  const sceneDistance = a.sceneKind && b.sceneKind && a.sceneKind !== b.sceneKind ? 10 : 0;
  const genomeDistance = average([
    paletteDistance(a.genome.palette, b.genome.palette),
    morphologyDistance(a.genome.morphology, b.genome.morphology),
    a.genome.semanticSignature !== b.genome.semanticSignature ? 1 : 0,
  ]) * 12;
  const hashDistance = liveHashDistance(a.live, b.live);
  return {
    promptA: rowA && rowA.prompt || a.prompt,
    promptB: rowB && rowB.prompt || b.prompt,
    distance: round(clamp(vectorDistance + setDistance + sceneDistance + genomeDistance, 0, 100)),
    hashDistance: Number.isFinite(hashDistance) ? round(hashDistance) : null,
    sceneA: a.sceneKind,
    sceneB: b.sceneKind,
    sharedLayers: intersection(a.layerSlots, b.layerSlots).slice(0, 8),
    sharedIdentities: intersection(a.identities, b.identities).slice(0, 8),
    sharedOperators: intersection(a.operatorTypes, b.operatorTypes).slice(0, 8),
    sharedAtoms: intersection(a.atomIds, b.atomIds).slice(0, 8),
  };
}

function liveDiversityReceipt(liveResult = null) {
  if (!liveResult) return { hash: '', hashKind: '', canvasHash: '' };
  const hash = String(
    liveResult.canvasScreenshotHash ||
    liveResult.canvasScreenshotLaterHash ||
    liveResult.screenshotHash ||
    ''
  );
  return {
    hash,
    hashKind: hash ? 'audit:visual-screenshot-hash' : '',
    canvasHash: String(liveResult.canvasHash || ''),
    sceneObjectUniforms: String(liveResult.sceneObjectUniforms || ''),
    sceneObjectIdentities: String(liveResult.sceneObjectIdentities || ''),
  };
}

function liveHashDistance(a = {}, b = {}) {
  const hashA = a.hash || a.canvasHash || '';
  const hashB = b.hash || b.canvasHash || '';
  if (!hashA || !hashB || hashA.length !== hashB.length) return NaN;
  return hammingDistance(hashA, hashB) / Math.max(1, hashA.length);
}

function hammingDistance(a, b) {
  let out = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) out += 1;
  }
  return out + Math.abs(a.length - b.length);
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
    Math.abs(Number(a.particleDensity || 0) - Number(b.particleDensity || 0)) / 96,
    Math.abs(Number(a.fieldComplexity || 0) - Number(b.fieldComplexity || 0)) / 12,
    Math.abs(Number(a.asymmetry || 0) - Number(b.asymmetry || 0)),
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
