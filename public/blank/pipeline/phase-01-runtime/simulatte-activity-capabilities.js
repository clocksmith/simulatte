(function registerActivityCapabilities(root) {
  const registry = typeof module === 'object' && module.exports
    ? require('../../app/runtime/phase-module-registry.js') : root.SimulattePhaseModuleRegistry;
  const scope = registry.family('physicsModel');
  const components = [
    ['walk', ['root', 'legs'], ['ground-support'], 'locomotion'],
    ['sit', ['root', 'legs'], ['seat-support'], 'support'],
    ['stand', ['root', 'legs'], ['ground-support'], 'support-transition'],
    ['hold', ['hand'], ['graspable-object'], 'attachment'],
    ['drink', ['hand'], ['graspable-object', 'liquid-container'], 'attachment'],
    ['place', ['hand'], ['graspable-object', 'support-surface'], 'release'],
  ].map(([id, writes, preconditions, effect]) => ({
    schema: 'simulatte.activityComponent.v1', id, version: 3,
    participants: ['walk','stand'].includes(id) ? ['actor'] : ['actor', 'object'],
    ports: [{ name: 'pose', type: 'joint-position', units: 'm', frame: 'world' }],
    reads: ['actor-rig', 'object-geometry', 'simulation-time'], writes,
    preconditions, effects: [effect], completion: id === 'place' ? 'released-on-support' : 'duration',
    cancellation: 'release-ownership', stateOwner: 'phase5-activity-runtime',
    resourceLimits: { maxActors: 16, maxActions: 64, maxJointsPerActor: 16 },
    provenance: { source: 'simulatte-procedural-activity-and-constrained-dynamics', revision: 3 },
    execution: { supported: true, reason: 'bounded procedural primitive with validated participant and support bindings' },
  }));
  const forms = { walk: ['walk','walks','walking'], sit: ['sit','sits','sitting'], stand: ['stand','stands','standing'],
    hold: ['hold','holds','holding','carry','carries','carrying'], drink: ['drink','drinks','drinking'], place: ['place','places','placing'] };
  const owner = '{objectId}:owner';
  const grip = '{actorId}:{hand}:held-object', posture = '{actorId}:posture';
  for (const component of components) {
    const primitive = component.id, hand = component.writes.includes('hand');
    component.languageForms = forms[primitive];
    component.execution.primitive = primitive;
    component.contract = { schema: 'simulatte.interactionContract.v1',
      participants: [{ slot: 'actorId', label: 'Actor', capabilities: [], editable: false },
        ...(['walk','stand'].includes(primitive) ? [] : [{ slot: 'objectId', label: 'Uses object', editable: true, capabilities:
          primitive === 'sit' ? ['seat-support'] : ['graspable-object', ...(primitive === 'drink' ? ['liquid-container'] : [])],
          ...(primitive === 'sit' ? { reason: 'sitting requires qualified seat support' } : {}) }]),
        ...(primitive === 'place' ? [{ slot: 'supportObjectId', label: 'Place on', editable: true, capabilities: ['support-surface'], reason: 'placement requires ownership and a qualified support surface' }] : [])],
      resources: [...component.writes.map(channel => ({ kind: 'channel', key: `{actorId}:${channel === 'hand' ? '{hand}-hand' : channel}` })),
        ...(hand ? [{ kind: 'ownership', key: '{objectId}:ownership' }] : [])],
      requirements: [],
      entry: hand ? [{ key: grip, operator: primitive === 'place' ? 'equals' : 'empty-or-equals', value: '{objectId}',
        reason: primitive === 'place' ? 'placement requires ownership and a qualified support surface' : 'hand transition requires an explicit qualified release' },
        { key: owner, operator: primitive === 'place' ? 'equals' : 'empty-or-equals', value: '{actorId}:{hand}',
          reason: 'object acquisition requires release from its previous owner' }]
        : primitive === 'walk' ? [{ key: posture, operator: 'not-equals', value: 'seated', reason: 'walking from a seat requires an explicit stand transition' }] : [],
      exit: hand ? [{ key: grip, value: primitive === 'place' ? null : '{objectId}' },
        { key: owner, value: primitive === 'place' ? null : '{actorId}:{hand}' },
        ...(primitive === 'place' ? [{ key: '{objectId}:support', value: '{supportObjectId}' }] : [])]
        : [{ key: posture, value: primitive === 'sit' ? 'seated' : 'standing' },
          { key: '{actorId}:support', value: primitive === 'sit' ? '{objectId}' : 'ground' }],
      ...(primitive === 'hold' || primitive === 'drink' ? { overlap: { group: 'drink-controls-shared-hold',
        role: primitive === 'hold' ? 'maintain' : 'drive', same: ['actorId','objectId','hand'], resources: ['{actorId}:{hand}-hand','{objectId}:ownership'] } } : {}),
      parameters: hand ? [{ key: 'hand', label: 'Hand', type: 'choice', values: ['left','right'], default: 'right' }] : [],
    };
  }
  function qualifyActivityComponent(component) {
    scope.validateActivityComponent(component);
    const provider = components.find(row => row.id === component.execution.primitive), baseline = provider.contract;
    const same = (a, b) => a.key === b.key && a.value === b.value && a.operator === b.operator;
    if (component.contract.participants.length !== baseline.participants.length ||
        component.contract.participants.some(row => !baseline.participants.some(other => other.slot === row.slot && other.editable === row.editable)) ||
        baseline.parameters.some(row => !component.contract.parameters.some(other => other.key === row.key)) ||
        baseline.resources.some(row => !component.contract.resources.some(other => other.key === row.key && other.kind === row.kind)) ||
        component.completion !== provider.completion || component.stateOwner !== provider.stateOwner ||
        baseline.entry.some(row => !component.contract.entry.some(other => same(row, other))) ||
        baseline.exit.length !== component.contract.exit.length || baseline.exit.some(row => !component.contract.exit.some(other => same(row, other))) ||
        component.contract.parameters.some(row => !baseline.parameters.some(other => other.key === row.key && other.type === row.type && row.values.every(value => other.values.includes(value)) && row.values.includes(row.default))) ||
        component.contract.overlap && scope.phaseContracts.canonicalJson(component.contract.overlap) !== scope.phaseContracts.canonicalJson(baseline.overlap)) {
      throw new Error('Component exceeds its qualified motion provider contract');
    }
    return component;
  }
  let retainedInventory=null;
  function activityCapabilityInventory(library = null) {
    if(!library && retainedInventory)return retainedInventory;
    if (library && (library.schema !== 'simulatte.activityComponentLibrary.v1' || !library.id || !Array.isArray(library.components) || library.components.length > 64)) throw new Error('Invalid activity component library');
    const declared = library ? [...components, ...library.components] : components;
    const ids = new Set(), languageForms = new Set();
    for (const component of declared) {
      qualifyActivityComponent(component);
      if (ids.has(component.id)) throw new Error('Duplicate activity component identity');
      ids.add(component.id);
      for (const form of component.languageForms) {
        if (languageForms.has(form)) throw new Error('Ambiguous activity language form');
        languageForms.add(form);
      }
    }
    const inventory = { schema: 'simulatte.activityCapabilities.v3', components: declared,
      ...(library ? { componentLibrary: { id: library.id, schema: library.schema } } : {}),
      objectProperties: [{ key: 'radius', label: 'Radius (m)', path: ['radius'], min: 0 }],
      capabilityProperties: {
        'seat-support': [{ key: 'position', axis: 0, label: 'Position X (m)', path: ['position',0] },
          { key: 'seatHeight', label: 'Seat height (m)', path: ['seatHeight'], link: { key: 'position', axis: 1 } }],
        'support-surface': [{ key: 'position', axis: 0, label: 'Position X (m)', path: ['position',0] },
          { key: 'supportHeight', label: 'Surface height (m)', path: ['supportHeight'], link: { key: 'position', axis: 1 } }],
        'liquid-container': [{ key: 'liquidFillFraction', label: 'Cup fill (%)', path: ['liquidContainer','fillFraction'], scale: 100, min: 0, max: 100 }],
      },
      objectProfiles: [
        { archetypes: ['chair', 'seat', 'bench'], kind: 'seat', capabilities: ['seat-support'] },
        { archetypes: ['cup', 'mug'], kind: 'cup', capabilities: ['graspable-object', 'liquid-container'] },
        { archetypes: ['phone'], kind: 'phone', capabilities: ['graspable-object'] },
        { archetypes: ['ball', 'sphere', 'cube', 'box', 'book'], kind: 'object', capabilities: ['graspable-object'] },
        { archetypes: ['table', 'shelf', 'surface'], kind: 'support', capabilities: ['support-surface'] },
      ],
      objectCapabilityNames: ['graspable-object', 'seat-support', 'support-surface', 'liquid-container'],
      skeleton: { id: 'simulatte.planar-human.v1', units: 'm', height: 1.7,
        solver: 'analytic-two-bone-ik', motionProvider: 'procedural', dimensions: 2 },
      coverage: { contacts: 'holonomic-constraints', forces: true, liquidTransfer: true,
        forceModel: 'driven-lumped-bodies', liquidModel: 'rectangular-depth-averaged-finite-volume', dimensions: 2 },
      motionProviders: [{ id: 'procedural', status: 'available' }, { id: 'cosmi', status: 'unavailable',
        reason: 'official code and model artifacts are not released', source: 'https://github.com/ptrvilya/cosmi' }],
      dynamics: { schema: 'simulatte.activityDynamicsPolicy.v2', gravityMetersPerSecondSquared: 9.80665,
        maxStepSeconds: 1 / 240, maxPhysicsSubsteps: 256, liquidCells: 1280, liquidSpatialOrder: 2, liquidVisualCells: 16, cfl: 0.35, maxLiquidSubsteps: 4096,
        liquidDensityKgPerCubicMeter: 998.2, liquidDragPerSecond: 2, dryDepthMeters: 1e-10,
        mouthCaptureRadiusMeters: 0.09, mouthHorizontalHeightFraction: 0.04, mouthVerticalHeightFraction: 0.015,
        maxLiquidTransferEventsPerFrame: 32768, defaultActorMassKg: 70, defaultObjectMassKg: 0.2,
        defaultGripForceNewtons: 500, defaultGripTorqueNewtonMeters: 15,
        defaultSeatCapacityNewtons: 2500, groundCapacityNewtons: 100000, frictionCoefficient: 0.8, supportMomentArmMeters: 0.15,
        momentumToleranceKgMetersPerSecond: 1e-7, angularMomentumToleranceKgSquareMetersPerSecond: 1e-7, massToleranceKg: 1e-9 },
      limits: { maxActors: 16, maxActions: 64, maxDurationSeconds: 120, maxHistoryFrames: 8192 } };
    const accepted = scope.phaseContracts.immutableArtifact(inventory);
    if (!library) retainedInventory = accepted;
    return accepted;
  }
  function requireActivityMotionProvider(id) {
    const provider = activityCapabilityInventory().motionProviders.find(row => row.id === id);
    if (!provider || provider.status !== 'available') {
      const error = new Error(`Activity motion provider ${id} is unavailable: ${provider?.reason || 'undeclared provider'}`);
      error.code = id === 'cosmi' ? 'COSMI_ARTIFACTS_UNAVAILABLE' : 'ACTIVITY_PROVIDER_UNAVAILABLE';
      throw error;
    }
    return provider;
  }
  registry.define('physicsModel', 'simulatte-activity-capabilities.js', { activityCapabilityInventory, requireActivityMotionProvider, qualifyActivityComponent });
})(typeof globalThis !== 'undefined' ? globalThis : window);
