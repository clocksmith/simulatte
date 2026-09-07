(function attachRendererPhase(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('webGpuRenderer');
  const contracts = typeof module === 'object' && module.exports
    ? require('../simulatte-phase-contracts.js') : root.SimulattePhaseContracts;
  const inputs = typeof module === 'object' && module.exports
    ? require('./simulatte-render-execution-input.js') : root.SimulatteRenderExecutionInput;
  if (!contracts || !inputs) throw new Error('Renderer phase requires phase and render input contracts');

  function phaseError(code, message) { return Object.assign(new Error(message), { code }); }

  async function executeRenderPhase(renderer, previous, suppliedInvocation, signal) {
    contracts.assertPhaseEnvelope(previous, 6, 'Managed render predecessor');
    previous = contracts.immutableArtifact(previous);
    const invocation = contracts.immutableArtifact(contracts.validateInvocation(7, suppliedInvocation));
    if (renderer.phaseInvocation) throw phaseError('SIMULATTE_RENDER_BUSY', 'Renderer already owns an active phase');
    const token = { invocation, input: null, cancelled: false };
    renderer.phaseInvocation = token;
    const abort = () => {
      token.cancelled = true;
      renderer.resetPixelReadbackForPacket(renderer.sceneRenderPacketKey);
    };
    const assertCurrent = () => {
      if (token.cancelled || signal?.aborted || renderer.phaseInvocation !== token) {
        throw phaseError('SIMULATTE_PIPELINE_ABORTED', 'Render phase cancelled');
      }
      renderer.assertAlive();
    };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      assertCurrent();
      const snapshot = await inputs.resolveSimulationSnapshot(invocation.simulationSnapshot, previous);
      if (snapshot.state.t !== invocation.frame.simulationTime) {
        throw phaseError('SIMULATTE_PHASE_INVALID', 'Simulation snapshot t contradicts the declared frame time');
      }
      assertCurrent();
      await renderer.initPromise;
      assertCurrent();
      if (!renderer.isReady()) throw renderer.initializationError || phaseError('webgpu_unavailable', 'Renderer is not ready');
      const device = renderer.device;
      const maximum = device?.limits?.maxTextureDimension2D;
      if (!Number.isSafeInteger(maximum) || invocation.viewport.width > maximum || invocation.viewport.height > maximum) {
        throw phaseError('SIMULATTE_RESOURCE_EXHAUSTED', 'Viewport exceeds the qualified device texture limit');
      }
      token.input = contracts.immutableArtifact({ ...inputs.createRenderExecutionInput(previous,
        snapshot.state, invocation.viewport), worldProofBinding: snapshot.worldProofBinding });
      renderer.setRenderExecutionInput(token.input);
      const started = performance.now();
      let attempts = 0;
      for (; attempts < scope.PHASE7_PIXEL_READBACK_MAX_ATTEMPTS; attempts++) {
        assertCurrent();
        let drawError;
        try {
          if (!renderer.render(token.input, invocation.frame.simulationTime * 1000)) {
            throw phaseError('webgpu_unavailable', 'Render phase did not submit a frame');
          }
        } catch (error) { drawError = error; }
        // Keep the owning resource lease until submitted GPU work and mapped buffers
        // settle, including when cancellation or a synchronous draw failure occurs.
        const settled = await Promise.allSettled([
          Promise.resolve().then(() => device.queue.onSubmittedWorkDone()),
          renderer.pendingPixelReadbackPromise,
        ]);
        assertCurrent();
        if (drawError) throw drawError;
        const failed = settled.find(result => result.status === 'rejected');
        if (failed) throw failed.reason;
        if (renderer.device !== device || !renderer.isReady()) {
          throw phaseError('webgpu_device_lost', 'Render device changed or failed during submission');
        }
        if (renderer.canvas.width !== invocation.viewport.width || renderer.canvas.height !== invocation.viewport.height) {
          throw phaseError('SIMULATTE_PHASE_INVALID', 'Submitted viewport changed during the render phase');
        }
        if (renderer.lastPixelReadbackReceipt?.status === 'fail' ||
            renderer.renderData.livePixelSamplesStatus === 'pass' ||
            renderer.renderData.requireLivePixelSamples !== true) break;
      }
      const output = renderer.phase7Output;
      if (!output) throw phaseError('SIMULATTE_PHASE_INVALID', 'Render phase has no completed output');
      const invocationDigest = await contracts.artifactDigest(invocation);
      assertCurrent();
      const result = contracts.immutableArtifact({ ...output,
        artifact: { ...output.artifact, renderExecution: { ...output.artifact.renderExecution,
          frameInvocation: invocation,
          gpuCompletion: { status: 'completed', submissions: Math.min(attempts + 1, scope.PHASE7_PIXEL_READBACK_MAX_ATTEMPTS),
            durationMs: performance.now() - started },
        } },
        receipts: [...output.receipts, { id: 'phase7-declared-frame', schema: 'simulatte.phaseReceipt.v1', invocationDigest }],
      });
      renderer.phase7Output = result;
      return result;
    } catch (error) {
      renderer.resetPixelReadbackForPacket(renderer.sceneRenderPacketKey);
      throw error;
    } finally {
      signal?.removeEventListener('abort', abort);
      if (renderer.phaseInvocation === token) renderer.phaseInvocation = null;
    }
  }

  root.SimulattePhaseModuleRegistry.define('webGpuRenderer', 'simulatte-webgpu-renderer-phase.js', { executeRenderPhase });
})(typeof globalThis !== 'undefined' ? globalThis : window);
