(function attachPipelineRunner(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePipelineRunner = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPipelineRunner() {
  function create({ onProgress = () => {}, yieldTask = () => new Promise((resolve) => setTimeout(resolve, 0)) } = {}) {
    let active = null;
    let serial = 0;
    let disposed = false;
    function cancel() { active?.abort(); active = null; }
    async function run(input, stages) {
      if (disposed) throw new Error('pipeline_disposed');
      if (!Array.isArray(stages) || !stages.length || new Set(stages.map((stage) => stage.id)).size !== stages.length ||
        stages.some((stage) => !stage.id || typeof stage.run !== 'function' || typeof stage.validate !== 'function')) {
        throw new Error('pipeline_stages_invalid: each stage needs a unique id, run, and output validator');
      }
      cancel();
      const controller = new AbortController();
      active = controller;
      const runId = ++serial;
      const artifacts = [];
      const context = Object.freeze({ runId, signal: controller.signal });
      const assertCurrent = () => {
        if (active !== controller || controller.signal.aborted) {
          const error = new Error('Pipeline cancelled or superseded');
          error.code = 'pipeline_cancelled';
          throw error;
        }
      };
      let stageId = '';
      try {
        let output = input;
        for (let index = 0; index < stages.length; index += 1) {
          assertCurrent();
          const stage = stages[index];
          stageId = stage.id;
          onProgress({ runId, stageId, status: 'running', completed: index, total: stages.length });
          await yieldTask();
          assertCurrent();
          output = await stage.run(output, context);
          assertCurrent();
          stage.validate(output);
          artifacts.push(Object.freeze({ stageId, output }));
        }
        onProgress({ runId, stageId, status: 'completed', completed: stages.length, total: stages.length });
        return Object.freeze({ runId, output, artifacts: Object.freeze(artifacts) });
      } catch (error) {
        error.stageId = stageId;
        error.artifacts = Object.freeze([...artifacts]);
        if (active === controller) onProgress({ runId, stageId, status: 'failed', code: error.code || 'pipeline_stage_failed', message: error.message });
        throw error;
      } finally { if (active === controller) active = null; }
    }
    function dispose() { cancel(); disposed = true; }
    return Object.freeze({ run, cancel, dispose });
  }
  return Object.freeze({ create });
});
