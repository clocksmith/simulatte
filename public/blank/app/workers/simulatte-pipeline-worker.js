(function attachSimulattePipelineWorker(root) {
  importScripts(`./simulatte-worker-bootstrap.js${root.location && root.location.search || ''}`);
  const workerBootstrap = root.SimulatteWorkerBootstrap;
  const runtimeLoader = workerBootstrap.createRuntimeLoader({
    workerName: 'Pipeline worker',
    manifestEntry: 'pipelineWorker',
  });

  function loadCompilerScripts() {
    runtimeLoader.loadScripts();
    if (!root.SimulattePhysicsModel || !root.SimulattePhysicsModel.createSpecFromPrompt) {
      throw new Error('SimulattePhysicsModel unavailable in pipeline worker');
    }
  }

  function postResult(id, payload) {
    root.postMessage({
      type: 'simulatte:pipeline-worker:result',
      id,
      ...payload,
    });
  }

  function compilePhaseReporter(id) {
    const startedAtByStage = new Map();
    return (event = {}) => {
      const stage = String(event.stage || 'compile');
      const now = root.performance && typeof root.performance.now === 'function'
        ? root.performance.now()
        : Date.now();
      const taskPercent = Math.max(0, Math.min(100, Number(event.taskPercent || 0)));
      if (taskPercent <= 0 || !startedAtByStage.has(stage)) startedAtByStage.set(stage, now);
      const startedAt = startedAtByStage.get(stage) || now;
      root.postMessage({
        type: 'simulatte:pipeline-worker:progress',
        id,
        event: {
          ...event,
          taskPercent,
          durationMs: taskPercent >= 100 ? Math.max(0, now - startedAt) : 0,
          timestamp: new Date().toISOString(),
        },
      });
    };
  }

  let ready = false;
  let loadError = null;
  try {
    loadCompilerScripts();
    ready = true;
  } catch (error) {
    loadError = error;
  }

  root.addEventListener('message', async (event) => {
    const data = event && event.data || {};
    if (!['simulatte:pipeline-worker:compile', 'simulatte:pipeline-worker:phase'].includes(data.type)) return;
    if (!ready) {
      postResult(data.id, {
        ok: false,
        error: workerBootstrap.errorMessage(loadError, 'Pipeline worker compile failed'),
      });
      return;
    }
    try {
      const model = root.SimulattePhysicsModel;
      if (data.type === 'simulatte:pipeline-worker:phase') {
        const phase = data.phase;
        if (!Number.isInteger(phase) || phase < 1 || phase > 8 || phase === 7) {
          throw new Error('Pipeline worker supports phases 1–6 and 8; Phase 7 requires the graphics owner');
        }
        const contracts = root.SimulattePhaseContracts;
        const adapter = root.SimulattePhaseRunner.localPhaseAdapters(model)[phase - 1];
        const call = contracts.immutableArtifact(data.call);
        const resources = contracts.immutableArtifact(data.resources);
        if (Object.keys(resources).some(id => !adapter.resourceIds.includes(id)) ||
            adapter.resourceIds.some(id => !Object.hasOwn(resources, id))) {
          throw new Error(`Phase ${phase} worker resources do not match its declared dependencies`);
        }
        contracts.validateInvocation(phase, call.invocation);
        await adapter.validateInput(call);
        const output = await adapter.run(call, resources, new AbortController().signal);
        await adapter.validateOutput(output, call);
        postResult(data.id, { ok: true, output: contracts.immutableArtifact(output) });
        return;
      }
      const spec = model.createSpecFromPrompt(data.prompt || '', {
        ...(data.options || {}),
        onPhaseProgress: compilePhaseReporter(data.id),
      });
      postResult(data.id, { ok: true, spec });
    } catch (error) {
      postResult(data.id, {
        ok: false,
        error: workerBootstrap.errorMessage(error, 'Pipeline worker compile failed'),
      });
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : self);
