(function attachSimulatteWebGpuRenderer(root) {
  if (typeof module === 'object' && module.exports) {
    require('./simulatte-webgpu-renderer-dependencies.js');
    require('./simulatte-webgpu-renderer-constants.js');
    require('./simulatte-webgpu-renderer-pixel-plan.js');
    require('./simulatte-webgpu-renderer-scene-proof-observer.js');
    require('./simulatte-webgpu-renderer-proof-datasets.js');
    require('./simulatte-webgpu-renderer-lifecycle.js');
    require('./simulatte-webgpu-renderer-frame-evidence.js');
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
  const sessions = typeof module === 'object' && module.exports
    ? require('../../../shared/render/renderer-session.js') : root.SimulatteRendererSession;
  if (!sessions) throw new Error('renderer_session_dependency_missing');
  function createSession({ canvas, signal, renderer: existing, ...options } = {}) {
    return sessions.create({
      backend: 'create-webgpu', signal,
      capabilities: ['setScene', 'render', 'resize', 'pick', 'receipt'],
      async initialize({ signal: lifetime, fail }) {
        const renderer = existing || scope.create(canvas, { ...options, onFailure: fail });
        if (!renderer) throw Object.assign(new Error('Create requires a WebGPU canvas'), { code: 'webgpu_unavailable' });
        renderer.onFailure = fail;
        lifetime.addEventListener('abort', () => renderer.dispose(), { once: true });
        await renderer.initPromise;
        if (!renderer.isReady()) throw renderer.initializationError || new Error('Create renderer initialization did not complete');
        return {
          setScene: input => renderer.setRenderExecutionInput(input),
          render: ({ scene, timeMs } = {}) => renderer.render(scene, timeMs),
          resize: () => renderer.resize(),
          pick: ({ x, y }) => renderer.pick(x, y),
          receipt: () => renderer.phase7Output,
          dispose: () => renderer.dispose(),
        };
      },
    });
  }
  function create(canvas, options) {
    const renderer = scope.create(canvas, options);
    if (renderer) {
      renderer.session = createSession({ canvas, renderer, signal: options?.signal });
      renderer.session.ready.catch(() => renderer.dispose());
    }
    return renderer;
  }
  const api = { create, createSession };
  root.SimulattePhaseModuleRegistry.finalize('webGpuRenderer', {
    requiredExports: ['create'],
  });
  Object.freeze(api);
  if (typeof module === 'object' && module.exports) {
      module.exports = api;
    }
  root.SimulatteWebGpuRenderer = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
