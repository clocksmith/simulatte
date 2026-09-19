(function attachPhaseRunner(root, factory) {
  const common = typeof module === 'object' && module.exports;
  const contracts = common ? require('../../pipeline/simulatte-phase-contracts.js') : root.SimulattePhaseContracts;
  const engine = common ? require('../../../shared/blank-core/compat/compiler.js') : root.SimulatteCompilerCore;
  const api = factory(contracts, engine);
  if (common) module.exports = api;
  root.SimulattePhaseRunner = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPhaseRunnerApi(contracts, engine) {
  if (!contracts || !engine) throw new Error('Phase adapter requires library contracts and compiler execution');
  // Migration adapters call the existing transformations. Projection changes only
  // envelope versions; the exact predecessor artifact remains immutable.
  function localPhaseAdapters(model, { workerResourceId = '', sourceMode = 'prompt' } = {}) {
    if (!['prompt', 'authored'].includes(sourceMode)) throw new Error('Unsupported phase source mode');
    const authored = sourceMode === 'authored';
    const operations = [
      (call, resources) => model.runPhase1RuntimeGate(call.previous.request.text, resources['compiler-options']),
      call => model.runPhase2LanguageGraph(call.previous),
      (call, resources) => model.retrieveIntentCandidates(call.previous,
        model.runtimeContextFromOptions(resources['compiler-options']), resources['compiler-options']).phase3Output,
      call => model.runPhase4GroundedIntent(call.previous),
      call => model.runPhase5SimulationCompile(call.previous),
      call => model.runPhase6VisualCompile(call.previous),
      (call, resources, signal) => resources.renderer.renderPhase(call.previous, call.invocation, signal),
      call => model.runPhase8SceneProof(call.previous),
    ];
    return operations.map((operation, index) => Object.freeze({
      phase: index + 1,
      resourceIds: [...(index === 0 || index === 2 && !authored ? ['compiler-options'] : index === 6 ? ['renderer'] : []),
        ...(authored && index < 6 ? [`authored-phase-${index + 1}`] : []),
        ...(workerResourceId && index !== 6 ? [workerResourceId] : [])],
      validateInput(call) {
        if (index === 0) {
          if (call.previous.schema !== contracts.PHASE_ZERO_INPUT_SCHEMA || call.previous.request.kind !== (authored ? 'world-spec' : 'prompt')) throw new Error('Phase source mode contradicts request ingress');
          contracts.createRequestEnvelope(call.previous);
          if (authored ? call.previous.authoredInputs.length !== 1 : call.previous.authoredInputs.length !== 0) throw new Error('Phase source mode does not admit these authored inputs');
        } else contracts.assertPhaseEnvelope(call.previous, index);
      },
      validateOutput(output) { contracts.assertPhaseEnvelope(output, index + 1); },
      run(call, resources, signal) {
        if (index === 0 && contracts.canonicalJson(call.previous.configuration) !==
            contracts.canonicalJson(resources['compiler-options'])) {
          throw new Error('Compiler resource options contradict request configuration');
        }
        if (workerResourceId && index !== 6) {
          const worker = resources[workerResourceId];
          if (!worker || typeof worker.runPhase !== 'function') throw new Error('Declared pipeline worker requires runPhase');
          const permitted = Object.fromEntries(Object.entries(resources).filter(([id]) => id !== workerResourceId));
          return worker.runPhase(index + 1, call, permitted, { signal, sourceMode });
        }
        if (authored && index < 6) return model.runAuthoredPhase(index + 1, call, resources);
        const compatible = index === 0 || index === 6 ? call : { ...call, previous: contracts.legacyPhaseProjection(call.previous) };
        return operation(compatible, resources, signal);
      },
    }));
  }

  return Object.freeze({ create: engine.create, validatePolicy: engine.validatePolicy, localPhaseAdapters });
});
