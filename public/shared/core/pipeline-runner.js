// Generated from Blank core factories. Edit the library, not this compatibility build.
(function attach(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = require("../blank-core/compat/pipeline-adapter.js");
    root.SimulattePipelineRunner = module.exports;
    return;
  }
  root.SimulattePipelineRunner = factory(() => import("../blank-core/index.js"));
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPipelineRunner(loadRuntime) {
  // Compatibility only: classic consumers delegate scheduling to the ESM package.
  function create({ onProgress = () => {}, yieldTask = () => new Promise(resolve => setTimeout(resolve, 0)) } = {}) {
    let loading = null;
    let runtime = null;
    let pending = null;
    let disposed = false;
    const load = () => loading ||= loadRuntime().then(({ createRuntime }) => {
      runtime = createRuntime({ ports: { onProgress, yieldTask } });
      return runtime;
    });
    function cancel(reason) {
      pending?.abort(reason);
      pending = null;
      runtime?.cancel(reason);
    }
    async function run(input, stages, { signal } = {}) {
      if (disposed) throw new Error('pipeline_disposed');
      if (!Array.isArray(stages) || !stages.length || stages.some(stage => !stage || !stage.id ||
          typeof stage.run !== 'function' || typeof stage.validate !== 'function') ||
          new Set(stages.map(stage => stage.id)).size !== stages.length) {
        throw new Error('pipeline_stages_invalid: each stage needs a unique id, run, and output validator');
      }
      const plugins = stages.map(stage => ({
        id: stage.id,
        validateInput: stage.validateInput ? stage.validateInput.bind(stage) : () => {},
        run: stage.run.bind(stage),
        validateOutput: stage.validate.bind(stage),
      }));
      cancel();
      const controller = new AbortController();
      pending = controller;
      const forwardAbort = () => controller.abort(signal.reason);
      signal?.addEventListener('abort', forwardAbort, { once: true });
      if (signal?.aborted) forwardAbort();
      try {
        const engine = await load();
        if (disposed || controller.signal.aborted) {
          const error = new Error('Pipeline cancelled or superseded');
          error.code = 'pipeline_cancelled';
          error.stageId = '';
          error.artifacts = Object.freeze([]);
          throw error;
        }
        return await engine.run(input, plugins, { signal: controller.signal });
      } finally {
        signal?.removeEventListener('abort', forwardAbort);
        if (pending === controller) pending = null;
      }
    }
    function dispose() {
      disposed = true;
      cancel();
      return loading ? loading.then(engine => engine.close()) : Promise.resolve();
    }
    return Object.freeze({ run, cancel, dispose });
  }
  return Object.freeze({ create });
});
