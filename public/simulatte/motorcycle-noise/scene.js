(function (root, factory) {
  const world = typeof module === 'object' && module.exports ? require('../../shared/contracts/world-spec.js') : root.SimulatteWorldSpec;
  const api = factory(world);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MotorcycleScene = api;
})(globalThis, function (world) {
  const MODEL = 'motorcycle-image-paths-v1';
  const RANGES = Object.freeze({ seed: [1, 2147483647], duration: [1, 6], sampleRate: [8000, 16000], count: [1, 6], rpm: [1200, 9000],
    speed: [0, 25], acceleration: [-1, 1], load: [0.1, 1], referenceDbZ: [60, 118], soundSpeed: [330, 355], reflectionOrder: [0, 3],
    groundReflection: [0, 1], wallReflection: [0, 1], airLoss: [0, 0.02], latencyMs: [0, 20], sensorNoisePa: [0, 0.1],
    sensorClipPa: [0.01, 20], speakerLimitPa: [0.01, 10], controllerTaps: [16, 128], controllerStep: [0.001, 0.2],
    streetHalfWidth: [10, 20], barrierHeight: [0, 4], facadeAbsorption: [0, 0.95], pathStepSamples: [16, 128],
    gridColumns: [5, 21], gridRows: [3, 11], clockSkewMs: [0, 1], cameraOffsetMs: [-300, 300], platePixels: [12, 120], plateBlur: [0, 4], plateNoise: [0, 0.3] });
  const INTEGERS = ['seed', 'count', 'reflectionOrder', 'controllerTaps', 'pathStepSamples', 'gridColumns', 'gridRows', 'platePixels'];
  const FIRING = Object.freeze({ 'twin-270': [0, 270], 'twin-360': [0, 360], 'inline-four': [0, 180, 360, 540] });
  function validateParams(p) {
    const keys = ['schema', ...Object.keys(RANGES), 'engine', 'mitigation', 'controller', 'receiver', 'speaker', 'reference'];
    if (!p || Object.keys(p).length !== keys.length || keys.some(key => !Object.hasOwn(p, key)) || p.schema !== 'simulatte.motorcycleNoiseScenario.v1') throw new Error('Motorcycle scenario fields or schema differ');
    for (const [key, [min, max]] of Object.entries(RANGES)) if (!Number.isFinite(p[key]) || p[key] < min || p[key] > max) throw new Error(`Scenario ${key} must be between ${min} and ${max}`);
    for (const key of INTEGERS) if (!Number.isInteger(p[key])) throw new Error(`Scenario ${key} must be an integer`);
    if (![8000, 16000].includes(p.sampleRate) || !Object.hasOwn(FIRING, p.engine)
      || !['none', 'barrier', 'facade', 'active'].includes(p.mitigation) || !['causal', 'ideal'].includes(p.controller)) throw new Error('Unsupported solver or mitigation');
    for (const key of ['receiver', 'speaker', 'reference']) if (!Array.isArray(p[key]) || p[key].length !== 3 || p[key].some(n => !Number.isFinite(n))
      || Math.abs(p[key][0]) > 20 || Math.abs(p[key][1]) > p.streetHalfWidth - 0.2 || p[key][2] < 0.5 || p[key][2] > 5) throw new Error(`Invalid ${key} position`);
    if (p.speed + Math.min(0, p.acceleration * p.duration) < 0 || p.speed + Math.max(0, p.acceleration * p.duration) > 30) throw new Error('Trajectory speed exceeds 0–30 m/s');
    if (Math.hypot(...p.receiver.map((v, i) => v - p.speaker[i])) < 0.25) throw new Error('Receiver must remain at least 0.25 m from the speaker');
    if (p.sampleRate * p.duration * (p.gridColumns * p.gridRows + (p.mitigation === 'active' ? 81 : 0)) * p.count > 35000000) throw new Error('Scenario exceeds the bounded sample workload');
    return p;
  }
  function sources(p) {
    return Array.from({ length: p.count }, (_, i) => ({ id: `bike-${i + 1}`, x: -p.speed * p.duration / 2 - i * 3.5,
      y: i % 2 ? -1.1 : 1.1, z: 0.7, speed: p.speed, acceleration: p.acceleration,
      rpm: p.rpm * (1 + i * 0.007), phase: ((p.seed * (i + 17) * 0.61803398875) % 1) * 720, seed: p.seed + i * 7919,
      firingAngles: [...FIRING[p.engine]], exhaustCutoffHz: 700 + p.load * 1200 }));
  }
  function create(p) {
    validateParams(p);
    const sourceId = 'source:motorcycle-scenario';
    return world.finalizeWorldSpec({ id: 'motorcycle-noise', kind: MODEL, templateId: MODEL, name: 'Motorcycle Noise',
      description: 'Bounded calm-air image-path acoustics; synthetic emissions and sensing, no field calibration.',
      params: JSON.parse(JSON.stringify(p)), objects: sources(p), modules: [], controls: [],
      source: { schema: world.SOURCE_SCHEMA, prompt: '', compilerConfig: { adapter: MODEL } },
      authorship: { schema: world.AUTHORING_SCHEMA, revision: 0, sources: [{ id: sourceId, authority: 'userOverride', label: 'Declared scenario' }],
        fieldProvenance: [{ path: '/', authority: 'userOverride', sourceId }], patches: [], reconciliations: [] },
      determinism: { schema: 'simulatte.worldSpecDeterminism.v1', requiredClasses: ['simulation-reproducible', 'replay-identified'], seed: p.seed,
        simulationTolerance: 1e-8, pixelPolicy: null },
      dependencies: { schema: 'simulatte.worldSpecDependencies.v1', governedPacks: [], plugins: [], assets: [] },
      safety: { schema: 'simulatte.worldSpecSafety.v1', rules: [], status: 'not-declared' },
      unsupportedRequirements: ['Measured urban accuracy', 'Full wave diffraction', 'Physical playback SPL', 'Enforcement identity'], unresolvedAmbiguities: [] });
  }
  function edit(current, p) {
    validate(current); validateParams(p);
    if (world.canonicalJson(current.params) === world.canonicalJson(p)) return current;
    return validate(world.prepareUserEdit(current, { params: p, objects: sources(p),
      determinism: { ...current.determinism, seed: p.seed } }, { rationale: 'Edited Motorcycle Noise scenario controls' }));
  }
  function validate(spec) {
    world.validateWorldSpec(spec); validateParams(spec.params);
    if (spec.kind !== MODEL || spec.templateId !== MODEL || world.canonicalJson(spec.objects) !== world.canonicalJson(sources(spec.params))
      || spec.determinism.seed !== spec.params.seed || spec.source.compilerConfig.adapter !== MODEL) throw new Error('WorldSpec does not bind this acoustic model and its sources');
    return spec;
  }
  const position = (source, time) => [source.x + source.speed * time + 0.5 * source.acceleration * time * time, source.y, source.z];
  const firingRate = (rpm, cylinders) => rpm * cylinders / 120;
  return { MODEL, RANGES, FIRING, create, edit, validate, validateParams, sources, position, firingRate };
});
