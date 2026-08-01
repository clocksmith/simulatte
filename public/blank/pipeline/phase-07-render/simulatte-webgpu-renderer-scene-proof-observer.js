(function attachSimulatteWebGpuRendererSceneProofObserver(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('webGpuRenderer');

    function notifyRendererSceneProof(renderer) {
      if (!renderer || !renderer.phase8Output) return null;
      const renderData = renderer.renderData || {};
      const packetKey = String(renderData.packetKey || '');
      const suppliedSamples = renderData.pixelSamples || renderData.livePixelSamples || null;
      const sampleBinding = scope.phase7PixelSampleSetValidation(
        renderer.sceneRenderPacket || {}, renderData, suppliedSamples
      );
      const readbackFailure = renderer.lastPixelReadbackReceipt &&
        renderer.lastPixelReadbackReceipt.packetKey === packetKey &&
        renderer.lastPixelReadbackReceipt.status === 'fail';
      const final = renderData.requireLivePixelSamples !== true || sampleBinding.valid || Boolean(readbackFailure);
      const report = {
        schema: 'simulatte.rendererSceneProofReport.v1',
        packetKey,
        final,
        phase7Output: renderer.phase7Output,
        phase8Output: renderer.phase8Output,
        sceneRenderPacket: renderer.sceneRenderPacket,
        durationMs: Number(renderer.lastSceneProofMs || 0),
        pixelSampleSource: renderData.pixelSampleSource || suppliedSamples && suppliedSamples.source || '',
        pixelSampleBinding: sampleBinding,
        pixelReadbackReceipt: renderer.lastPixelReadbackReceipt || null,
      };
      if (renderer.canvas && renderer.canvas.dataset) {
        renderer.canvas.dataset.sceneProofFinal = final ? 'true' : 'false';
        renderer.canvas.dataset.sceneProofReport = report.schema;
      }
      if (typeof renderer.onSceneProof === 'function') renderer.onSceneProof(report);
      return report;
    }

    root.SimulattePhaseModuleRegistry.define('webGpuRenderer', 'simulatte-webgpu-renderer-scene-proof-observer.js', { notifyRendererSceneProof });

})(typeof globalThis !== 'undefined' ? globalThis : window);
