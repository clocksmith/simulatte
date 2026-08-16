(function attachSimulatteWebGpuRenderer(root) {
  if (typeof module === 'object' && module.exports) {
    require('./simulatte-webgpu-renderer-dependencies.js');
    require('./simulatte-webgpu-renderer-constants.js');
    require('./simulatte-webgpu-renderer-pixel-plan.js');
    require('./simulatte-webgpu-renderer-scene-proof-observer.js');
    require('./simulatte-webgpu-renderer-proof-datasets.js');
    require('./simulatte-webgpu-renderer-renderer-class.js');
    require('./simulatte-webgpu-renderer-part-segmentation.js');
    require('./simulatte-webgpu-renderer-morphology.js');
    require('./simulatte-webgpu-renderer-interaction.js');
    require('./simulatte-webgpu-renderer-packets.js');
    require('./simulatte-webgpu-renderer-pixel-proof.js');
    require('./simulatte-webgpu-renderer-gpu-data.js');
    require('./simulatte-webgpu-renderer-background-shader.js');
    require('./simulatte-webgpu-renderer-object-shader.js');
  }
  const scope = root.SimulattePhaseModuleRegistry.family('webGpuRenderer');
  const api = { create: scope.create };
  root.SimulattePhaseModuleRegistry.finalize('webGpuRenderer', {
    requiredExports: Object.keys(api),
  });
  Object.freeze(api);
  if (typeof module === 'object' && module.exports) {
      module.exports = api;
    }
  root.SimulatteWebGpuRenderer = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
