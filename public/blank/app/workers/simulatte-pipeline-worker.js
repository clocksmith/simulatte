(function attachSimulattePipelineWorker(root) {
  const WORKER_SEARCH = root && root.location && root.location.search || '';
  let manifestLoadError = null;
  try {
    if (typeof importScripts !== 'function') throw new Error('Worker importScripts unavailable');
    importScripts(versionedScriptPath('../runtime-script-manifest.js'));
  } catch (error) {
    manifestLoadError = error;
  }
  const runtimeManifest = root.SimulatteRuntimeScriptManifest;
  const SCRIPT_ORDER = Object.freeze(runtimeManifest
    ? runtimeManifest.pipelineWorker.map((src) => `../../${src}`)
    : []);

  function loadCompilerScripts() {
    if (typeof importScripts !== 'function') {
      throw new Error('Worker importScripts unavailable');
    }
    if (!SCRIPT_ORDER.length) throw new Error('Pipeline worker script manifest unavailable');
    importScripts(...versionedScriptOrder());
    if (!root.SimulattePhysicsModel || !root.SimulattePhysicsModel.createSpecFromPrompt) {
      throw new Error('SimulattePhysicsModel unavailable in pipeline worker');
    }
  }

  function versionedScriptOrder() {
    return SCRIPT_ORDER.map((script) => versionedScriptPath(script));
  }

  function versionedScriptPath(script) {
    if (!WORKER_SEARCH || WORKER_SEARCH === '?') return script;
    const suffix = WORKER_SEARCH.startsWith('?') ? WORKER_SEARCH : `?${WORKER_SEARCH}`;
    return `${script}${suffix}`;
  }

  function errorMessage(error) {
    if (!error) return 'Pipeline worker compile failed';
    return error && error.message ? error.message : String(error);
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
    if (manifestLoadError) throw manifestLoadError;
    loadCompilerScripts();
    ready = true;
  } catch (error) {
    loadError = error;
  }

  root.addEventListener('message', (event) => {
    const data = event && event.data || {};
    if (data.type !== 'simulatte:pipeline-worker:compile') return;
    if (!ready) {
      postResult(data.id, { ok: false, error: errorMessage(loadError) });
      return;
    }
    try {
      const model = root.SimulattePhysicsModel;
      const spec = model.createSpecFromPrompt(data.prompt || '', {
        ...(data.options || {}),
        onPhaseProgress: compilePhaseReporter(data.id),
      });
      postResult(data.id, { ok: true, spec });
    } catch (error) {
      postResult(data.id, { ok: false, error: errorMessage(error) });
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : self);
