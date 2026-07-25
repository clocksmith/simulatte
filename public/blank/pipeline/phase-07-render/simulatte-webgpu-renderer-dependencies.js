(function initSimulatteWebGpuRendererDependencies(root) {
  const moduleRegistry = typeof module === 'object' && module.exports
    ? require('../../app/runtime/phase-module-registry.js')
    : root.SimulattePhaseModuleRegistry;
  const scope = moduleRegistry.family('webGpuRenderer');
  if (scope.initialized) return;

  const renderProof = typeof module === 'object' && module.exports
    ? require('./simulatte-render-proof.js')
    : root.SimulatteRenderProof;
  const scenePacketContract = typeof module === 'object' && module.exports
    ? require('../phase-06-visual/simulatte-scene-packet-contract.js')
    : root.SimulatteScenePacketContract;
  const deterministicValues = typeof module === 'object' && module.exports
    ? require('../../../shared/deterministic-values.js')
    : root.SimulatteDeterministicValues;

  moduleRegistry.define('webGpuRenderer', 'simulatte-webgpu-renderer-dependencies.js', {
    root,
    ...scenePacketContract,
    ...deterministicValues,
    addSceneKindMix: scenePacketContract.scenePacketAddSceneKindMix,
    addSceneMixSlot: scenePacketContract.scenePacketAddSlot,
    addScenePacketLayerMix: scenePacketContract.scenePacketAddLayerSceneMix,
    compressSceneMixVector(input) {
      const vector = Float32Array.from(
        scenePacketContract.scenePacketCompressVector(input, 0.08, scenePacketContract.SCENE_MIX_SLOTS.length)
      );
      if (!scenePacketContract.activeSceneMixSlots(vector, 0.08)) {
        scenePacketContract.scenePacketAddSlot(vector, 'mechanical', 0.42);
      }
      return vector;
    },
    activeSceneMixSlots: (vector) => scenePacketContract.activeSceneMixSlots(vector, 0.08),
    ...(renderProof || {}),
    scenePacketObjectRealization: renderProof.objectRealizationForScenePacket,
    initialized: true,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
