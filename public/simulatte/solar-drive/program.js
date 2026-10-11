(function attachSolarDriveProgram(root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = factory(isNode ? require('../../shared/contracts/world-spec.js') : root.SimulatteWorldSpec,
    isNode ? require('../../shared/core/simulation/solar-drive.js') : root.SimulatteSolarDriveModel,
    isNode ? require('./route.js') : root.SimulatteSolarRoute);
  if (isNode) api.registerRoute(require('../../data/solar-drive/union-square-route-v1.json'));
  if (isNode) api.registerReference(require('../../data/solar-drive/published-ride-reference-v1.json'));
  if (isNode) module.exports = api;
  root.SimulatteSolarDriveProgram = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function solarProgram(world, model, routeApi) {
  'use strict';
  if (!world || !model) throw new Error('solar_program_dependencies_missing');
  const MODEL_VERSION = 'solar-longitudinal-1.1.0';
  const routes = new Map();
  let referenceData=null;
  function registerReference(data){if(!data||data.schema!=='simulatte.solarRideReference.v1'||!Array.isArray(data.rows)||data.rows.length<20
    ||!data.configuration||!['panelRatedW','batteryWh','unloadedVehicleKg'].every(key=>Number.isFinite(data.configuration[key])&&data.configuration[key]>0))throw Error('solar_reference_invalid');referenceData=structuredClone(data);}
  function referenceBinding(){if(!referenceData)throw Error('solar_reference_unavailable');return {id:referenceData.id,contentHash:world.contentHash(referenceData)};}
  function rideDependencies(base){return {...base,assets:[...base.assets,
    {id:'union-square-washington-square-v1',path:'../../data/solar-drive/union-square-route-v1.json'},
    {id:'sun-trip-stephane-bujadoux-2021',path:'../../data/solar-drive/published-ride-reference-v1.json'},
    {id:'solar-route-v1',path:'./route.js'}, {id:'sun-exposure',path:'../../shared/plugins/sun-walker/sun-exposure.js'}]};}
  function referenceComparison(spec,state){if(!referenceData)return null;const evaluation=new Set(referenceData.split.evaluationDates);
    const rows=referenceData.rows.filter(row=>evaluation.has(row.date)),values=rows.map(row=>row.consumptionWhKm).sort((a,b)=>a-b);
    return {schema:'simulatte.solarRideReferenceComparison.v1',reference:referenceBinding(),evaluationCount:rows.length,calibration:'not-performed',
      publishedMedianWhKm:(values[Math.floor((values.length-1)/2)]+values[Math.floor(values.length/2)])/2,
      publishedRangeWhKm:[values[0],values.at(-1)],modeledElectricalWhKm:state.distanceM>1?state.ledger.electricalLoadJ/3600/(state.distanceM/1000):null,
      source:referenceData.source.url,scope:'Consumption context from different routes and a different vehicle; not a matched accuracy test.'};}
  function registerRoute(data) { const route = routeApi.create(data); routes.set(data.id, route); return { id:data.id,contentHash:data.contentHash }; }
  function routeFor(spec) { if(spec.params.route!=='identified')return null;const row=spec.contract?.route;const route=routes.get(row?.id);
    if(!route||route.contentHash!==row.contentHash)throw Error('solar_route_reference_unavailable');return route; }
  function environment(spec,state){return routeFor(spec)?.sample(spec.params,state)||null;}
  function telemetry(spec,state){return model.telemetry(spec.params,state,environment(spec,state));}
  function step(spec,state){if(state.status==='complete')return state;const route=routeFor(spec),next=model.step(spec.params,state,route?.sample(spec.params,state)||null);return route?route.afterStep(state,next):next;}
  function createRide(vehicle='bicycle') {
    const route = routes.get('union-square-washington-square-v1');if(!route)throw Error('solar_route_reference_unavailable');
    const config=referenceData?.configuration;if(!config)throw Error('solar_reference_unavailable');
    const spec=create(vehicle);spec.params={...spec.params,route:'identified',flywheel:false,
      ...(vehicle==='bicycle'?{panelArea:config.panelRatedW/(1000*BASE.pvEfficiency),batteryWh:config.batteryWh,
        chassisKg:config.unloadedVehicleKg-BASE.wheelMassKg-config.batteryWh/BASE.batteryWhKg-config.panelRatedW/(1000*BASE.pvEfficiency)*BASE.panelKgM2}:{})};
    spec.contract={schema:'simulatte.solarRideBinding.v1',route:{id:route.id,contentHash:route.contentHash},reference:referenceBinding()};
    spec.dependencies=rideDependencies(spec.dependencies);
    return validate(world.finalizeWorldSpec(spec));
  }
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
    { label: 'Published Sun Trip 2021 configuration and recorded rides', url: 'https://www.thesuntrip.com/les-donnees-du-tour-deurope-2021-de-stephane-bujadoux/' },
    { label: 'USGS elevation reference', url: 'https://epqs.nationalmap.gov/v1/docs' },
  ]);

  function create(vehicle = 'bicycle') {
    if (!Object.hasOwn(PRESETS, vehicle)) throw new Error('solar_preset_unknown');
    const params = { ...BASE, ...PRESETS[vehicle] };
    const sources = [{ id: 'source:solar-engineering', authority: 'governedPack', label: 'Repository engineering assumptions; not calibrated hardware' }];
    return world.finalizeWorldSpec({
      id: 'solar-drive-v1', templateId: 'solar-drive-v1', kind: 'solar-longitudinal',
      name: `Solar drive / ${vehicle}`, description: 'Solar mobility and magnetic storage engineering instance',
      modules: [{ id: MODEL_VERSION, backend: 'fixed-step-longitudinal', version: '1.1.0' }],
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
    const legacy=spec.modules?.[0]?.id==='solar-longitudinal-1.0.0'&&spec.params?.route!=='identified';
    if (spec.id !== 'solar-drive-v1' || spec.kind !== 'solar-longitudinal' || spec.templateId !== 'solar-drive-v1'
      || spec.modules.length !== 1 || !(spec.modules[0].id === MODEL_VERSION||legacy)) throw new Error('solar_program_backend_mismatch');
    if (world.canonicalJson(spec.objects) !== world.canonicalJson(COMPONENTS)) throw new Error('solar_component_contract_mismatch');
    if (world.canonicalJson(spec.controls) !== world.canonicalJson(Object.keys(BASE).map((id) => ({ id, parameterPath: `/params/${id}` })))) {
      throw new Error('solar_control_contract_mismatch');
    }
    model.validate(spec.params);
    if(spec.params.route==='identified'){
      if(spec.params.grade!==0)throw Error('solar_route_grade_offset_unsupported');
      const route=routeFor(spec);if(spec.params.durationS>route.maximumTimeS)throw Error('solar_route_duration_outside_coverage');
      if(world.canonicalJson(spec.contract)!==world.canonicalJson({schema:'simulatte.solarRideBinding.v1',route:{id:route.id,contentHash:route.contentHash},reference:referenceBinding()}))throw Error('solar_route_binding_invalid');
    }
    const reference = create(spec.params.vehicle);
    if(spec.params.route==='identified')reference.dependencies=rideDependencies(reference.dependencies);
    if(legacy){reference.modules[0].id='solar-longitudinal-1.0.0';reference.modules[0].version='1.0.0';reference.dependencies.assets[0].id='solar-longitudinal-1.0.0';reference.source.compilerConfig.adapter='solar-longitudinal-1.0.0';}
    for (const key of ['modules', 'dependencies', 'safety']) {
      if (world.canonicalJson(spec[key]) !== world.canonicalJson(reference[key])) throw new Error('solar_contract_not_supported: ' + key);
    }
    if (world.canonicalJson(spec.determinism.requiredClasses) !== world.canonicalJson(reference.determinism.requiredClasses)
      || spec.source.compilerConfig.adapter !== reference.source.compilerConfig.adapter) throw new Error('solar_execution_contract_mismatch');
    for (const key of Object.keys(spec)) if (spec[key] !== undefined && !Object.hasOwn(reference, key) && !(key==='contract'&&spec.params.route==='identified')) throw new Error('solar_field_not_supported: ' + key);
    return spec;
  }

  function edit(spec, changes) {
    const draft = JSON.parse(world.serializeWorldSpec(spec));
    draft.params = { ...draft.params, ...changes };
    if(Object.hasOwn(changes,'route')){
      const reference=create(draft.params.vehicle);
      if(changes.route==='identified'){const route=routes.get('union-square-washington-square-v1');if(!route)throw Error('solar_route_reference_unavailable');
        draft.contract={schema:'simulatte.solarRideBinding.v1',route:{id:route.id,contentHash:route.contentHash},reference:referenceBinding()};draft.dependencies=rideDependencies(reference.dependencies);
      }else {delete draft.contract;draft.dependencies=reference.dependencies;}
    }
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
        calibration: 'not-performed', route:environment(spec,state), referenceComparison:referenceComparison(spec,state), renderer: gpu, humanVisualReview: 'pending' },
    };
  }
  function execution(initialSpec,actions=[]) {
    validate(initialSpec);if(!Array.isArray(actions)||actions.length>500)throw Error('solar_actions_invalid');
    const records=structuredClone(actions);let checked=initialSpec,last=-1;
    for(const action of records){if(!Number.isInteger(action.step)||action.step<last||action.step<0||action.step>1728000
      ||!action.changes||Object.keys(action.changes).length!==1||!Object.hasOwn(action.changes,'shade'))throw Error('solar_action_invalid');
      checked=edit(checked,action.changes);last=action.step;}
    let active=structuredClone(initialSpec),state=model.initial(active.params),cursor=0;
    function settle(){while(records[cursor]?.step===state.step)active=edit(active,records[cursor++].changes);}
    return Object.freeze({advance(){settle();if(state.status!=='complete')state=step(active,state);return state.step;},
      snapshot(){settle();return {worldSpec:structuredClone(active),state:structuredClone(state)};},finalSpec:()=>structuredClone(checked)});
  }
  return Object.freeze({ create, createRide, registerRoute, registerReference, referenceComparison, routeFor, environment, telemetry, step, execution, validate, edit, receipt, COMPONENTS, SOURCES, BASE, PRESETS, MODEL_VERSION });
});
