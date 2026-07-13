(function attachSimulatteWebGpuRendererSceneProofObserver(root) {
  const scope = root.__SimulatteWebGpuRendererRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function notifyRendererSceneProof(renderer) {
      if (!renderer || !renderer.phase8Output) return null;
      const renderData = renderer.renderData || {};
      const packetKey = String(renderData.packetKey || '');
      const suppliedSamples = renderData.pixelSamples || renderData.livePixelSamples || null;
      const readbackFailure = renderer.lastPixelReadbackReceipt &&
        renderer.lastPixelReadbackReceipt.packetKey === packetKey &&
        renderer.lastPixelReadbackReceipt.status === 'fail';
      const final = renderData.requireLivePixelSamples !== true || Boolean(suppliedSamples) || Boolean(readbackFailure);
      const report = {
        schema: 'simulatte.rendererSceneProofReport.v1',
        packetKey,
        final,
        phase7Output: renderer.phase7Output,
        phase8Output: renderer.phase8Output,
        sceneRenderPacket: renderer.sceneRenderPacket,
        pixelSampleSource: renderData.pixelSampleSource || suppliedSamples && suppliedSamples.source || '',
        pixelReadbackReceipt: renderer.lastPixelReadbackReceipt || null,
      };
      if (renderer.canvas && renderer.canvas.dataset) {
        renderer.canvas.dataset.sceneProofFinal = final ? 'true' : 'false';
        renderer.canvas.dataset.sceneProofReport = report.schema;
      }
      if (typeof renderer.onSceneProof === 'function') renderer.onSceneProof(report);
      return report;
    }

    Object.assign(scope, { notifyRendererSceneProof });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
