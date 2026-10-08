(function registerActivityCapabilities(root) {
  const registry = typeof module === 'object' && module.exports
    ? require('../../app/runtime/phase-module-registry.js') : root.SimulattePhaseModuleRegistry;
  const scope = registry.family('physicsModel');
  const components = [
    ['walk', ['root', 'legs'], ['ground-support'], 'locomotion'],
    ['sit', ['root', 'legs'], ['seat-support'], 'support'],
    ['hold', ['hand'], ['graspable-object'], 'attachment'],
    ['drink', ['hand'], ['cup'], 'attachment'],
    ['place', ['hand'], ['graspable-object', 'support-surface'], 'release'],
  ].map(([id, writes, preconditions, effect]) => ({
    schema: 'simulatte.activityComponent.v1', id, version: 2,
    participants: id === 'walk' ? ['actor'] : ['actor', 'object'],
    ports: [{ name: 'pose', type: 'joint-position', units: 'm', frame: 'world' }],
    reads: ['actor-rig', 'object-geometry', 'simulation-time'], writes,
    preconditions, effects: [effect], completion: id === 'place' ? 'released-on-support' : 'duration',
    cancellation: 'release-ownership', stateOwner: 'phase5-activity-runtime',
    resourceLimits: { maxActors: 16, maxActions: 64, maxJointsPerActor: 16 },
    provenance: { source: 'simulatte-procedural-activity-and-constrained-dynamics', revision: 2 },
    execution: { supported: id !== 'place', reason: id === 'place' ? 'support placement and release trajectory are not qualified' : 'qualified procedural primitive' },
  }));
  function activityCapabilityInventory() {
    const inventory = { schema: 'simulatte.activityCapabilities.v2', components,
      skeleton: { id: 'simulatte.planar-human.v1', units: 'm', height: 1.7,
        solver: 'analytic-two-bone-ik', motionProvider: 'procedural', dimensions: 2 },
      coverage: { contacts: 'holonomic-constraints', forces: true, liquidTransfer: true,
        forceModel: 'driven-lumped-bodies', liquidModel: 'rectangular-depth-averaged-finite-volume', dimensions: 2 },
      motionProviders: [{ id: 'procedural', status: 'available' }, { id: 'cosmi', status: 'unavailable',
        reason: 'official code and model artifacts are not released', source: 'https://github.com/ptrvilya/cosmi' }],
      dynamics: { schema: 'simulatte.activityDynamicsPolicy.v1', gravityMetersPerSecondSquared: 9.80665,
        maxStepSeconds: 1 / 240, maxPhysicsSubsteps: 256, liquidCells: 128, liquidVisualCells: 16, cfl: 0.35, maxLiquidSubsteps: 4096,
        liquidDensityKgPerCubicMeter: 998.2, liquidDragPerSecond: 2, dryDepthMeters: 1e-10,
        mouthCaptureRadiusMeters: 0.09, mouthHorizontalHeightFraction: 0.04, mouthVerticalHeightFraction: 0.015,
        maxLiquidTransferEventsPerFrame: 2048, defaultActorMassKg: 70, defaultObjectMassKg: 0.2,
        defaultGripForceNewtons: 500, defaultGripTorqueNewtonMeters: 15,
        defaultSeatCapacityNewtons: 2500, groundCapacityNewtons: 100000, frictionCoefficient: 0.8, supportMomentArmMeters: 0.15,
        momentumToleranceKgMetersPerSecond: 1e-7, angularMomentumToleranceKgSquareMetersPerSecond: 1e-7, massToleranceKg: 1e-9 },
      limits: { maxActors: 16, maxActions: 64, maxDurationSeconds: 120 } };
    return scope.phaseContracts.immutableArtifact(inventory);
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
  registry.define('physicsModel', 'simulatte-activity-capabilities.js', { activityCapabilityInventory, requireActivityMotionProvider });
})(typeof globalThis !== 'undefined' ? globalThis : window);
