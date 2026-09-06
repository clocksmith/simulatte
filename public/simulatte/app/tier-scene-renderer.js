(function attachTierSceneRenderer(root, factory) {
  const common = typeof module === 'object' && module.exports;
  const api = factory(
    common ? require('../../shared/render/renderer-session.js') : root.SimulatteRendererSession,
    common ? require('./tier-renderers.js') : root.SimulatteTierRenderers,
    common ? require('./tier-registry.js') : root.SimulatteTierRegistry
  );
  if (common) module.exports = api;
  root.SimulatteTierSceneRenderer = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createTierSceneRendererApi(sessions, methods, tiers) {
  // No data acquisition, HUD, input listeners, or simulation clock in drawing.
  function createSession({ canvas, signal } = {}) {
    return sessions.create({
      backend: 'tier-canvas2d', signal,
      capabilities: ['setScene', 'render', 'resize', 'setCamera', 'capture', 'receipt'],
      initialize() {
        const ctx = canvas?.getContext('2d');
        if (!ctx) throw new Error('tier_canvas2d_context_missing');
        let scene = null;
        let frameCount = 0;
        const frameCpuMs = [];
        const receipt = () => ({ backend: 'canvas2d', frameCount, renderCpu: {
          basis: 'main-thread-canvas2d-render', sampleCount: frameCpuMs.length,
          totalMs: frameCpuMs.reduce((sum, value) => sum + value, 0), maxMs: Math.max(0, ...frameCpuMs),
        } });
        return {
          setScene(next) {
            const tier = tiers.tierDefinition(next?.tier);
            if (!tier || (tier.rendererMethod && typeof methods[tier.rendererMethod] !== 'function')) throw new Error('tier_scene_invalid');
            scene = { ...next, draw: methods[tier.rendererMethod], view: { ...next.view } };
          },
          render() {
            if (!scene) throw new Error('tier_scene_missing');
            const started = performance.now();
            const { width = canvas.width, height = canvas.height } = scene.view;
            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = '#060606';
            ctx.fillRect(0, 0, width, height);
            if (scene.data) {
              ctx.save();
              try {
                scene.draw?.({ ...scene.view, currentTier: scene.tier, ctx, data: scene.data });
                scene.drawOverlay?.(ctx);
              } finally { ctx.restore(); }
            }
            frameCount++;
            if (frameCpuMs.length >= 512) frameCpuMs.shift();
            frameCpuMs.push(performance.now() - started);
            return receipt();
          },
          resize({ width, height }) {
            if (![width, height].every(value => Number.isInteger(value) && value > 0)) throw new Error('tier_viewport_invalid');
            canvas.width = width; canvas.height = height;
            if (scene) scene.view = { ...scene.view, width, height };
          },
          setCamera(view) {
            if (!scene) throw new Error('tier_scene_missing');
            const allowed = ['zoom', 'panX', 'panY', 'rotX', 'rotY', 'rotZ'];
            if (!view || Object.keys(view).some(key => !allowed.includes(key) || !Number.isFinite(view[key])) || (view.zoom !== undefined && view.zoom <= 0)) throw new Error('tier_camera_invalid');
            scene.view = { ...scene.view, ...view };
          },
          capture: () => ({ schema: 'simulatte.tierRenderPixels.v1', width: canvas.width, height: canvas.height,
            sourceBackend: 'canvas2d', sourceFrameCount: frameCount, format: 'rgba8unorm', rgbaBytes: ctx.getImageData(0, 0, canvas.width, canvas.height).data }),
          receipt,
          dispose() { scene = null; },
        };
      },
    });
  }
  return Object.freeze({ createSession });
});
