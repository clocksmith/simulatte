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
    schema: 'simulatte.activityComponent.v1', id, version: 1,
    participants: id === 'walk' ? ['actor'] : ['actor', 'object'],
    ports: [{ name: 'pose', type: 'joint-position', units: 'm', frame: 'world' }],
    reads: ['actor-rig', 'object-geometry', 'simulation-time'], writes,
    preconditions, effects: [effect], completion: id === 'place' ? 'released-on-support' : 'duration',
    cancellation: 'release-ownership', stateOwner: 'phase5-activity-runtime',
    resourceLimits: { maxActors: 16, maxActions: 64, maxJointsPerActor: 16 },
    provenance: { source: 'simulatte-procedural-kinematics', revision: 1 },
    execution: { supported: id !== 'place', reason: id === 'place' ? 'support placement and release trajectory are not qualified' : 'qualified procedural primitive' },
  }));
  function activityCapabilityInventory() {
    const inventory = { schema: 'simulatte.activityCapabilities.v1', components,
      skeleton: { id: 'simulatte.planar-human.v1', units: 'm', height: 1.7,
        solver: 'analytic-two-bone-ik', motionProvider: 'procedural', dimensions: 2 },
      coverage: { contacts: 'kinematic', forces: false, liquidTransfer: false },
      limits: { maxActors: 16, maxActions: 64, maxDurationSeconds: 120 } };
    return scope.phaseContracts.immutableArtifact(inventory);
  }
  registry.define('physicsModel', 'simulatte-activity-capabilities.js', { activityCapabilityInventory });
})(typeof globalThis !== 'undefined' ? globalThis : window);
