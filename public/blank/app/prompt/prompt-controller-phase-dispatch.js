(function attachCreatePhaseDispatch(root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('../../pipeline/simulatte-phase-contracts.js') : root.SimulattePhaseContracts;
  const runner = typeof module === 'object' && module.exports
    ? require('../runtime/phase-runner.js') : root.SimulattePhaseRunner;
  const api = factory(contracts, runner);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteCreatePhaseDispatch = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createDispatchApi(contracts, runner) {
  if (!contracts || !runner) throw new Error('Create dispatch requires the phase contracts and runner');
  const STAGES = ['manifest', 'language', 'retrieval', 'grounded-intent', 'simulation', 'visual', 'render', 'scene-proof'];
  function aborted(message = 'Create execution superseded') {
    return Object.assign(new Error(message), { name: 'AbortError', code: 'SIMULATTE_PIPELINE_ABORTED' });
  }
  const bytes = value => new TextEncoder().encode(contracts.canonicalJson(value)).byteLength;

  function awaitCancellable(work, signal) {
    return new Promise((resolve, reject) => {
      const abort = () => reject(signal.reason || aborted());
      if (signal.aborted) return abort();
      signal.addEventListener('abort', abort, { once: true });
      Promise.resolve().then(() => {
        if (signal.aborted) throw signal.reason || aborted();
        return work();
      }).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
  }

  function create({ model, worker, renderer, configuration, reconcileProgram, requiresReconciliation = () => false,
    invocationForProgram, publishRuntime = () => {} }) {
    if (!model || typeof invocationForProgram !== 'function') {
      throw new Error('Create phase dispatch requires compiler and invocation owner');
    }
    const resolvedConfiguration = Promise.resolve(configuration);
    resolvedConfiguration.catch(() => {});
    let generation = 0;
    let active = null;
    let latest = null;
    let disposed = false;
    function cancel(message) {
      generation += 1;
      active?.abort(aborted(message));
      active = null;
    }

    async function compile(prompt, options, event = {}, authoredInput = null) {
      if (disposed) throw aborted('Create execution disposed');
      cancel();
      const revision = generation;
      const controller = new AbortController();
      active = controller;
      let configurationInput;
      const assertCurrent = () => {
        if (disposed || revision !== generation || controller.signal.aborted) throw controller.signal.reason || aborted();
      };
      const attempts = [];
      let config;
      let program = null;
      const retain = (status, error = null) => {
        const record = contracts.immutableArtifact({ schema: 'simulatte.createPageExecution.v1', revision,
          status, producer: config?.producer || null, policy: config?.policy || null, attempts,
          worldSpecContentHash: program?.contentHash || '',
          error: error ? { code: error.code || 'SIMULATTE_PHASE_INVALID', message: error.message } : null });
        if (revision === generation || latest?.revision === revision) latest = record;
        return record;
      };
      retain('running');
      try {
        configurationInput = contracts.immutableArtifact({ ...options, compilerLane: 'pipeline-worker' });
        config = contracts.immutableArtifact(await awaitCancellable(() => resolvedConfiguration, controller.signal));
        assertCurrent();
        if (!worker?.runPhase || !renderer?.renderPhase) throw new Error('Create requires a compiler worker and WebGPU renderer');
        contracts.validateProducer(config.producer);
        runner.validatePolicy(config.policy);
        for (const key of ['workerResidentBytes', 'rendererResidentBytes']) {
          if (!Number.isSafeInteger(config[key]) || config[key] < 0) throw new Error(`Invalid declared ${key}`);
        }
        const optionsDigest = await contracts.artifactDigest(configurationInput);
        assertCurrent();
        const descriptor = (id, residentBytes, capabilities) => ({ id, residentBytes,
          contentDigest: config.producer.buildDigest, capabilities });
        const baseResources = {
          'compiler-options': { descriptor: { id: 'compiler-options', kind: 'artifact', contentDigest: optionsDigest,
            residentBytes: bytes(configurationInput), capabilities: ['declared-compiler-options'] }, handle: configurationInput },
          'pipeline-worker': { descriptor: descriptor('pipeline-worker', config.workerResidentBytes, ['phase-execution']), handle: worker },
          renderer: { descriptor: descriptor('renderer', config.rendererResidentBytes, ['declared-frame']), handle: renderer },
        };

        async function execute(request, source = null) {
          const outputs = [];
          let replacement = null;
          const attempt = { request, sourceMode: source ? 'authored' : 'prompt', status: 'running', outputs, error: null };
          attempts.push(attempt);
          const instance = runner.create({ phases: runner.localPhaseAdapters(model, {
            workerResourceId: 'pipeline-worker', sourceMode: attempt.sourceMode,
          }), policy: config.policy, producer: { ...config.producer, requestRevision: revision },
          onPublish(output) { assertCurrent(); outputs.push(output); },
          });
          try {
            const result = await instance.run(request, { signal: controller.signal,
              resources: { ...baseResources, ...source?.resources },
              invocationForPhase: async (phase, previous, signal) => {
                assertCurrent();
                publishRuntime({ ...event, state: 'active', blocking: true, stage: STAGES[phase - 1], phaseStep: phase,
                  percent: Math.round((phase - 1) * 100 / 8), message: contracts.PHASE_LABELS[phase - 1] });
                if (phase !== 7) return {};
                program = source && !source.recompile ? source.worldSpec : model.projectWorldSpec(Object.fromEntries(outputs.map(output => [`phase${output.phase}`, output])));
                if (!source && requiresReconciliation(program)) {
                  replacement = program;
                  throw Object.assign(new Error('Reconciliation is required before drawing this candidate'), { code: 'SIMULATTE_AUTHORED_RESTART' });
                }
                assertCurrent();
                return invocationForProgram(program, previous, signal, Boolean(source && !source.recompile));
              },
            });
            assertCurrent();
            attempt.status = 'completed';
            return { outputs: result, replacement: null };
          } catch (error) {
            attempt.status = replacement ? 'awaiting-reconciliation' : controller.signal.aborted ? 'cancelled' : 'failed';
            attempt.error = { code: error.code || 'SIMULATTE_PHASE_INVALID', message: error.message };
            if (replacement && error.code === 'SIMULATTE_AUTHORED_RESTART') return { outputs, replacement };
            throw error;
          } finally { instance.dispose(); }
        }

        const initialSource = authoredInput ? await model.createAuthoredPhaseResources(authoredInput.worldSpec,
          configurationInput, { recompile: authoredInput.recompile }) : null;
        assertCurrent();
        let result = await execute(initialSource?.request || contracts.createRequestEnvelope({ request: { kind: 'prompt', text: String(prompt) },
          configuration: configurationInput, authoredInputs: [], retryPolicy: null }), initialSource);
        assertCurrent();
        if (result.replacement) {
          if (typeof reconcileProgram !== 'function') throw new Error('Required reconciliation has no decision owner');
          retain('awaiting-reconciliation');
          const accepted = await awaitCancellable(() => reconcileProgram(result.replacement, controller.signal), controller.signal);
          assertCurrent();
          if (!accepted) throw aborted('WorldSpec reconciliation cancelled');
          const source = await model.createAuthoredPhaseResources(accepted, configurationInput, { recompile: true });
          assertCurrent();
          result = await execute({ ...source.request, retryPolicy: { id: 'authored-reconciliation-v1', attempt: 1,
            previousPhase6Digest: await contracts.artifactDigest(result.outputs[5]) } }, source);
        }
        assertCurrent();
        retain('completed');
        return program;
      } catch (error) {
        retain(controller.signal.aborted || error.code === 'SIMULATTE_PIPELINE_ABORTED' ? 'cancelled' : 'failed', error);
        throw error;
      } finally { if (active === controller) active = null; }
    }

    return Object.freeze({ compile, cancel, getLatest: () => latest,
      executeProgram(worldSpec, { recompile = false } = {}) {
        return compile(worldSpec.source.prompt, { deterministicRuntime: true }, {}, { worldSpec, recompile });
      },
      dispose() { disposed = true; cancel('Create execution disposed'); } });
  }
  async function loadConfiguration(documentRoot) {
    const buildDigest = documentRoot.querySelector('meta[name="simulatte-runtime-source"]')?.content;
    contracts.validateProducer({ id: 'create-page-source-closure', buildDigest });
    const response = await documentRoot.defaultView.fetch(new URL('../data/create-phase-run-policy.json', documentRoot.baseURI));
    if (!response.ok) throw new Error(`Create execution policy unavailable: HTTP ${response.status}`);
    const config = await response.json();
    if (config.schema !== 'simulatte.createPageExecutionPolicy.v1') throw new Error('Create execution policy schema mismatch');
    return contracts.immutableArtifact({ ...config, producer: { id: 'create-page-source-closure', buildDigest } });
  }
  return Object.freeze({ create, loadConfiguration });
});
