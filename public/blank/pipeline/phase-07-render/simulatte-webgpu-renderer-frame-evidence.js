(function attachRenderFrameEvidence(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('webGpuRenderer');

  function simulationEvidenceKey(input) {
    const receipt = input?.simulationState?.solverState?.executionReceipt;
    return JSON.stringify([receipt?.status, receipt?.finiteChannels,
      receipt?.expectedOperatorIds, receipt?.executedOperatorIds, receipt?.missingOperatorIds]);
  }

  function capturePixelReadbackFrame(renderer, renderCount, frameMs) {
    const canvas = { width: renderer.canvas.width, height: renderer.canvas.height };
    // The compatibility input contains a canvas handle. Project only its dimensions;
    // all remaining fields describe the submitted program, state, or evidence.
    return scope.immutableRenderEvidence({
      schema: 'simulatte.renderFrameSnapshot.v1',
      renderInputSerial: renderer.renderInputSerial,
      generation: renderer.pixelReadbackGeneration,
      renderCount, frameMs,
      renderTimeMs: renderer.renderData.pixelReadbackTimeMs,
      input: { ...renderer.renderExecutionInput, canvas },
      packet: renderer.sceneRenderPacket,
      data: renderer.renderData,
      canvas,
      optimization: renderer.webgpuOptimizationReceipt(),
    });
  }

  function readbackFrameIsCurrent(renderer, readback) {
    const frame = readback?.frame;
    return !renderer.disposed && Boolean(renderer.renderData) &&
      renderer.renderData.packetKey === readback?.packetKey &&
      renderer.pixelReadbackGeneration === readback?.generation &&
      (!frame || (frame.renderInputSerial === renderer.renderInputSerial &&
        frame.canvas.width === renderer.canvas.width && frame.canvas.height === renderer.canvas.height));
  }

  function outputFromReadbackFrame(frame, sampleSet) {
    const data = { ...frame.data, livePixelSamples: sampleSet, livePixelReadbackFailed: false };
    const output = scope.phase7OutputEnvelope(frame.input, frame.packet, frame.renderCount,
      frame.frameMs, frame.canvas, data, frame.optimization);
    output.artifact.renderExecution.frame = {
      schema: 'simulatte.renderFrameEvidence.v1',
      renderInputSerial: frame.renderInputSerial,
      readbackSerial: sampleSet.readbackSerial,
      renderCount: frame.renderCount,
      renderTimeMs: frame.renderTimeMs,
      simulationSnapshot: frame.input.simulationState,
      viewport: frame.canvas,
    };
    return scope.immutableRenderEvidence(output);
  }

  root.SimulattePhaseModuleRegistry.define('webGpuRenderer', 'simulatte-webgpu-renderer-frame-evidence.js', {
    simulationEvidenceKey, capturePixelReadbackFrame, readbackFrameIsCurrent, outputFromReadbackFrame,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
