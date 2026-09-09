(function attachSolarDriveProgram(root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = factory(isNode ? require('../../shared/contracts/world-spec.js') : root.SimulatteWorldSpec,
    isNode ? require('../../shared/core/simulation/solar-drive.js') : root.SimulatteSolarDriveModel);
  if (isNode) module.exports = api;
  root.SimulatteSolarDriveProgram = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function solarProgram(world, model) {
  'use strict';
  if (!world || !model) throw new Error('solar_program_dependencies_missing');
  const MODEL_VERSION = 'solar-longitudinal-1.0.0';
  const BASE = Object.freeze({
    vehicle: 'bicycle', route: 'rolling', flywheel: true,
    stepS: 0.05, durationS: 1800, targetKph: 25, irradiance: 950, ambient: 25,
    cloud: 0.08, shade: 0, sunElevation: 65, tilt: 0, wind: 1, grade: 0,
    panelArea: 1.4, pvEfficiency: 0.225, pvTempCoeff: -0.0035, mpptEfficiency: 0.97,
    panelKgM2: 3, canopyCdA: 0.045, riderKg: 80, chassisKg: 20, wheelMassKg: 2.5,
    wheelRadius: 0.34, cdA: 0.4, crr: 0.006, motorRatedW: 750, torqueNm: 60, motorEffPeak: 0.93,
    batteryWh: 480, batterySoc: 0.65, batteryW: 1200, batteryChargeW: 450,
    batteryEfficiency: 0.97, batteryWhKg: 150, flywheelMass: 5, flywheelRadius: 0.18,
    flywheelTip: 200, flywheelMinFraction: 0.5, flywheelInitialFraction: 0.8,
    flywheelW: 1000, flywheelEfficiency: 0.92, housingKg: 5, windageW: 2,
    bearingW: 3, auxW: 5, thermalCapacity: 1500, cooling: 8, throttleC: 100, cutoffC: 130,
  });
  const PRESETS = Object.freeze({
    bicycle: Object.freeze({}),
    scooter: Object.freeze({ vehicle: 'scooter', chassisKg: 38, wheelMassKg: 5, wheelRadius: 0.19,
      cdA: 0.5, crr: 0.012, motorRatedW: 2000, torqueNm: 90, targetKph: 35,
      panelArea: 1.8, batteryWh: 1400, batteryW: 3500, batteryChargeW: 1000,
      flywheelW: 2000, auxW: 12, thermalCapacity: 4000, cooling: 15 }),
    car: Object.freeze({ vehicle: 'car', chassisKg: 1050, wheelMassKg: 48, wheelRadius: 0.31,
      cdA: 0.57, crr: 0.01, canopyCdA: 0.006, motorRatedW: 60000, torqueNm: 900,
      targetKph: 60, panelArea: 4.5, batteryWh: 30000, batteryW: 80000,
      batteryChargeW: 30000, flywheelMass: 20, flywheelRadius: 0.23, housingKg: 20,
      flywheelW: 18000, windageW: 8, bearingW: 12, auxW: 350,
      thermalCapacity: 24000, cooling: 70 }),
  });
  const COMPONENTS = Object.freeze([
    { id: 'solar', label: 'Solar canopy', role: 'source', detail: 'Silicon cells / segmented collector', color: '#b48b24' },
    { id: 'controller', label: 'Power electronics', role: 'converter', detail: 'MPPT / DC bus / traction inverter', color: '#667e6e' },
    { id: 'battery', label: 'Battery pack', role: 'storage', detail: 'Energy reserve / DC bus support', color: '#439b82' },
    { id: 'flywheel', label: 'Flywheel module', role: 'storage', detail: 'Opposing rotors / magnetic bearings', color: '#c58545' },
    { id: 'motor', label: 'Traction motor', role: 'converter', detail: 'Permanent magnets / copper stator', color: '#be7548' },
    { id: 'chassis', label: 'Vehicle & contact', role: 'load', detail: 'Frame / tires / mechanical output', color: '#687378' },
  ]);
  const SOURCES = Object.freeze([
    { label: 'PVWatts DC power relationship', url: 'https://pvpmc.sandia.gov/modeling-guide/2-dc-module-iv/point-value-models/pvwatts/' },
    { label: 'NASA magnetic bearing flywheel testbed', url: 'https://ntrs.nasa.gov/api/citations/20050019225/downloads/20050019225.pdf' },
  ]);

  function create(vehicle = 'bicycle') {
    if (!Object.hasOwn(PRESETS, vehicle)) throw new Error('solar_preset_unknown');
    const params = { ...BASE, ...PRESETS[vehicle] };
    const sources = [{ id: 'source:solar-engineering', authority: 'governedPack', label: 'Repository engineering assumptions; not calibrated hardware' }];
    return world.finalizeWorldSpec({
      id: 'solar-drive-v1', templateId: 'solar-drive-v1', kind: 'solar-longitudinal',
      name: `Solar drive / ${vehicle}`, description: 'Solar mobility and magnetic storage engineering instance',
      modules: [{ id: MODEL_VERSION, backend: 'fixed-step-longitudinal', version: '1.0.0' }],
      objects: COMPONENTS.map((row) => ({ ...row })),
      controls: Object.keys(BASE).map((id) => ({ id, parameterPath: `/params/${id}` })), params,
      source: { schema: 'simulatte.worldSpecSource.v1', prompt: 'Inspect and simulate a solar magnetic vehicle with explicit energy accounting.',
        compilerConfig: { adapter: MODEL_VERSION, sourceReferences: SOURCES } },
      authorship: { schema: 'simulatte.worldSpecAuthoring.v2', revision: 0, sources,
        fieldProvenance: [{ path: '/', authority: 'governedPack', sourceId: sources[0].id }], patches: [], reconciliations: [] },
      determinism: { schema: 'simulatte.worldSpecDeterminism.v1', requiredClasses: ['simulation-reproducible', 'replay-identified'],
        seed: 17, simulationTolerance: 0.001, pixelPolicy: null },
      dependencies: { schema: 'simulatte.worldSpecDependencies.v1', governedPacks: [], plugins: [],
        assets: [{ id: MODEL_VERSION, path: '../../shared/core/simulation/solar-drive.js' }] },
      safety: { schema: 'simulatte.worldSpecSafety.v1', rules: [], status: 'not-declared' },
      unsupportedRequirements: [{ id: 'hardware-validation', reason: 'No measured efficiency maps, rotor FEA, crash containment certification, or electrochemical aging model.' }],
      unresolvedAmbiguities: [],
    });
  }

  function validate(spec) {
    world.validateWorldSpec(spec);
    if (spec.id !== 'solar-drive-v1' || spec.kind !== 'solar-longitudinal' || spec.templateId !== 'solar-drive-v1'
      || spec.modules.length !== 1 || spec.modules[0].id !== MODEL_VERSION) throw new Error('solar_program_backend_mismatch');
    if (world.canonicalJson(spec.objects) !== world.canonicalJson(COMPONENTS)) throw new Error('solar_component_contract_mismatch');
    if (world.canonicalJson(spec.controls) !== world.canonicalJson(Object.keys(BASE).map((id) => ({ id, parameterPath: `/params/${id}` })))) {
      throw new Error('solar_control_contract_mismatch');
    }
    model.validate(spec.params);
    const reference = create(spec.params.vehicle);
    for (const key of ['modules', 'dependencies', 'safety']) {
      if (world.canonicalJson(spec[key]) !== world.canonicalJson(reference[key])) throw new Error('solar_contract_not_supported: ' + key);
    }
    if (world.canonicalJson(spec.determinism.requiredClasses) !== world.canonicalJson(reference.determinism.requiredClasses)
      || spec.source.compilerConfig.adapter !== MODEL_VERSION) throw new Error('solar_execution_contract_mismatch');
    for (const key of Object.keys(spec)) if (spec[key] !== undefined && !Object.hasOwn(reference, key)) throw new Error('solar_field_not_supported: ' + key);
    return spec;
  }

  function edit(spec, changes) {
    const draft = JSON.parse(world.serializeWorldSpec(spec));
    draft.params = { ...draft.params, ...changes };
    return validate(world.prepareUserEdit(spec, draft, { rationale: 'Solar drive control edit' }));
  }

  function receipt(spec, state, gpu = null) {
    validate(spec);
    return {
      schema: 'simulatte.solarDriveRun.v1', modelVersion: MODEL_VERSION, worldSpecHash: spec.contentHash,
      revision: spec.authorship.revision, seed: spec.determinism.seed,
      step: state.step, simulationTimeS: state.timeS, stateHash: world.contentHash(state),
      energyResidualJ: state.residualJ, state: structuredClone(state),
      evidence: { simulation: Math.abs(state.residualJ) <= 0.001 ? 'energy-balance-within-tolerance' : 'energy-balance-failed',
        calibration: 'not-performed', renderer: gpu, humanVisualReview: 'pending' },
    };
  }
  return Object.freeze({ create, validate, edit, receipt, COMPONENTS, SOURCES, BASE, PRESETS, MODEL_VERSION });
});
