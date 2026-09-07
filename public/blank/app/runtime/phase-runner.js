(function attachPhaseRunner(root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('../../pipeline/simulatte-phase-contracts.js') : root.SimulattePhaseContracts;
  const api = factory(contracts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePhaseRunner = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPhaseRunnerApi(contracts) {
  if (!contracts) throw new Error('Phase runner requires phase contracts');

  function failure(code, message) {
    const error = new Error(message);
    error.code = code;
    if (code === 'SIMULATTE_PIPELINE_ABORTED') error.name = 'AbortError';
    return error;
  }

  function validatePolicy(policy) {
    if (!policy || policy.schema !== 'simulatte.phaseRunPolicy.v1' || !policy.id) throw new Error('Versioned phase run policy required');
    for (const key of ['maxInputBytes', 'maxEvidenceBytes']) {
      if (!Number.isSafeInteger(policy[key]) || policy[key] < 1) throw new Error(`Invalid ${key}`);
    }
    if (!Array.isArray(policy.phases) || policy.phases.length !== 8) throw new Error('Exactly eight phase budgets required');
    policy.phases.forEach((phase, index) => {
      if (phase.phase !== index + 1) throw new Error('Phase budgets must preserve order');
      for (const key of ['maxDurationMs', 'maxArtifactBytes', 'maxResidentBytes']) {
        if (!Number.isSafeInteger(phase[key]) || phase[key] < 1) throw new Error(`Invalid Phase ${index + 1} ${key}`);
      }
    });
    return contracts.immutableArtifact(policy);
  }

  const byteLength = value => new TextEncoder().encode(contracts.canonicalJson(value)).byteLength;

  function create({ phases, policy, producer, onPublish = () => {}, onAttempt = () => {} }) {
    const limits = validatePolicy(policy);
    const producerIdentity = contracts.immutableArtifact(producer);
    contracts.validateProducer(producerIdentity);
    if (!Array.isArray(phases) || phases.length !== 8) throw new Error('Exactly eight processing phases required');
    const implementations = phases.map((phase, index) => {
      if (phase.phase !== index + 1) throw new Error('Processing phase order mismatch');
      for (const name of ['run', 'validateInput', 'validateOutput']) if (typeof phase[name] !== 'function') throw new Error(`Phase ${index + 1} requires ${name}`);
      if (!Array.isArray(phase.resourceIds) || new Set(phase.resourceIds).size !== phase.resourceIds.length) throw new Error('Distinct declared resource IDs required');
      return Object.freeze({ ...phase, resourceIds: Object.freeze([...phase.resourceIds]) });
    });
    let revision = 0;
    let active = null;
    let disposed = false;

    function cancel(message = 'Pipeline superseded') {
      revision += 1;
      active?.abort(failure('SIMULATTE_PIPELINE_ABORTED', message));
      active = null;
    }

    async function run(request, { resources = {}, invocationForPhase = () => ({}), signal } = {}) {
      if (disposed) throw new Error('Phase runner disposed');
      cancel();
      const runRevision = revision;
      const controller = new AbortController();
      active = controller;
      const forwardAbort = () => controller.abort(failure('SIMULATTE_PIPELINE_ABORTED', 'Pipeline cancelled'));
      signal?.addEventListener('abort', forwardAbort, { once: true });
      if (signal?.aborted) forwardAbort();
      const assertCurrent = () => {
        if (disposed || runRevision !== revision || controller.signal.aborted) {
          throw controller.signal.reason || failure('SIMULATTE_PIPELINE_ABORTED', 'Stale pipeline revision');
        }
      };
      const outputs = [];
      let evidenceBytes = 0;
      let phaseNumber = 0;
      try {
        assertCurrent();
        let previous = contracts.createRequestEnvelope(request);
        if (byteLength(previous) > limits.maxInputBytes) throw failure('SIMULATTE_RESOURCE_EXHAUSTED', 'Request exceeds input byte budget');
        const runResources = Object.create(null);
        for (const id of new Set(implementations.flatMap(phase => phase.resourceIds))) {
          const resource = resources[id];
          if (!resource || resource.descriptor?.id !== id || !resource.handle) throw failure('SIMULATTE_DEPENDENCY_INVALID', `Missing declared resource: ${id}`);
          const descriptor = contracts.immutableArtifact(resource.descriptor);
          runResources[id] = Object.freeze({ descriptor,
            handle: descriptor.kind === 'artifact' ? contracts.immutableArtifact(resource.handle) : resource.handle,
            acquire: resource.acquire?.bind(resource),
          });
        }
        for (const implementation of implementations) {
          assertCurrent();
          phaseNumber = implementation.phase;
          const budget = limits.phases[phaseNumber - 1];
          const descriptors = [];
          const handles = Object.create(null);
          let residentBytes = 0;
          for (const id of implementation.resourceIds) {
            const resource = runResources[id];
            if (!resource || resource.descriptor?.id !== id || !resource.handle) throw failure('SIMULATTE_DEPENDENCY_INVALID', `Phase ${phaseNumber} requires ${id}`);
            const descriptor = contracts.immutableArtifact(resource.descriptor);
            if (!Number.isSafeInteger(descriptor.residentBytes) || descriptor.residentBytes < 0) throw failure('SIMULATTE_DEPENDENCY_INVALID', `Missing residency bound: ${id}`);
            residentBytes += descriptor.residentBytes;
            descriptors.push(descriptor);
            handles[id] = resource.handle;
          }
          if (residentBytes > budget.maxResidentBytes) throw failure('SIMULATTE_RESOURCE_EXHAUSTED', `Phase ${phaseNumber} residency budget exceeded`);
          descriptors.sort((a, b) => a.id.localeCompare(b.id));
          const dependencyIdentity = contracts.immutableArtifact(descriptors);
          contracts.validateDependencies(dependencyIdentity);
          const expected = { producer: producerIdentity, dependencies: dependencyIdentity, revision: runRevision };
          const started = performance.now();
          const phaseController = new AbortController();
          const abortPhase = () => phaseController.abort(controller.signal.reason);
          controller.signal.addEventListener('abort', abortPhase, { once: true });
          let timer;
          let abortListener;
          const interrupted = new Promise((_, reject) => {
            abortListener = () => reject(phaseController.signal.reason);
            phaseController.signal.addEventListener('abort', abortListener, { once: true });
            timer = setTimeout(() => phaseController.abort(failure('SIMULATTE_RESOURCE_EXHAUSTED', `Phase ${phaseNumber} deadline exceeded`)), budget.maxDurationMs);
          });
          // Resources belong to the invocation owner. A cancelled dispatch keeps its
          // lease until it settles; release cannot race an in-flight GPU submission.
          const work = (async () => {
            const releases = [];
            try {
              const invocation = contracts.immutableArtifact(await invocationForPhase(phaseNumber, previous, phaseController.signal));
              assertCurrent();
              if (phaseController.signal.aborted) throw phaseController.signal.reason;
              contracts.validateInvocation(phaseNumber, invocation);
              const call = Object.freeze({ previous, invocation });
              for (const id of implementation.resourceIds) {
                assertCurrent();
                if (phaseController.signal.aborted) throw phaseController.signal.reason;
                const resource = runResources[id];
                if (resource.descriptor.kind === 'artifact' && await contracts.artifactDigest(resource.handle) !== resource.descriptor.contentDigest) {
                  throw failure('SIMULATTE_DEPENDENCY_INVALID', `Artifact content identity mismatch: ${id}`);
                }
                if (resource.acquire) {
                  const release = await resource.acquire(phaseController.signal);
                  if (typeof release !== 'function') throw new Error(`Invalid release lease: ${id}`);
                  releases.push(release);
                }
              }
              if (phaseController.signal.aborted) throw phaseController.signal.reason;
              await implementation.validateInput(call, dependencyIdentity);
              assertCurrent();
              if (phaseController.signal.aborted) throw phaseController.signal.reason;
              const output = await implementation.run(call, Object.freeze(handles), phaseController.signal);
              assertCurrent();
              if (phaseController.signal.aborted) throw phaseController.signal.reason;
              if (output?.phase !== phaseNumber) throw new Error(`Phase ${phaseNumber} returned another phase`);
              await implementation.validateOutput(output, call);
              if (byteLength(output) > budget.maxArtifactBytes) throw failure('SIMULATTE_RESOURCE_EXHAUSTED', `Phase ${phaseNumber} artifact budget exceeded`);
              const bound = await contracts.bindPhaseOutput(output, call, expected);
              await contracts.validateBoundOutput(bound, call, expected);
              if (phaseController.signal.aborted) throw phaseController.signal.reason;
              if (performance.now() - started > budget.maxDurationMs) throw failure('SIMULATTE_RESOURCE_EXHAUSTED', `Phase ${phaseNumber} deadline exceeded`);
              return bound;
            } finally {
              const results = await Promise.allSettled(releases.reverse().map(release => Promise.resolve().then(release)));
              const rejected = results.find(result => result.status === 'rejected');
              if (rejected) throw rejected.reason;
            }
          })();
          try {
            const output = await Promise.race([work, interrupted]);
            assertCurrent();
            evidenceBytes += byteLength(output);
            if (evidenceBytes > limits.maxEvidenceBytes) throw failure('SIMULATTE_RESOURCE_EXHAUSTED', 'Evidence storage budget exceeded');
            outputs.push(output);
            previous = output;
            onPublish(output);
            assertCurrent();
          } finally {
            clearTimeout(timer);
            phaseController.signal.removeEventListener('abort', abortListener);
            controller.signal.removeEventListener('abort', abortPhase);
          }
        }
        assertCurrent();
        onAttempt(Object.freeze({ revision: runRevision, status: 'completed', phase: 8, evidenceBytes }));
        return Object.freeze(outputs);
      } catch (error) {
        onAttempt(Object.freeze({ revision: runRevision, status: controller.signal.aborted ? 'cancelled' : 'failed', phase: phaseNumber, code: error.code || 'SIMULATTE_PHASE_INVALID', message: error.message, evidenceBytes }));
        throw error;
      } finally {
        signal?.removeEventListener('abort', forwardAbort);
        if (active === controller) active = null;
      }
    }

    return Object.freeze({ run, cancel, dispose() { disposed = true; cancel('Pipeline disposed'); }, get revision() { return revision; } });
  }

  // Migration adapters call the existing transformations. Projection changes only
  // envelope versions; the exact predecessor artifact remains immutable.
  function localPhaseAdapters(model, { workerResourceId = '' } = {}) {
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
      resourceIds: [...(index === 0 || index === 2 ? ['compiler-options'] : index === 6 ? ['renderer'] : []),
        ...(workerResourceId && index !== 6 ? [workerResourceId] : [])],
      validateInput(call) {
        if (index === 0) {
          if (call.previous.schema !== contracts.PHASE_ZERO_INPUT_SCHEMA || call.previous.request.kind !== 'prompt') throw new Error('Local interpretation requires prompt ingress');
          contracts.createRequestEnvelope(call.previous);
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
          const permitted = index === 0 || index === 2 ? { 'compiler-options': resources['compiler-options'] } : {};
          return worker.runPhase(index + 1, call, permitted, { signal });
        }
        const compatible = index === 0 || index === 6 ? call : { ...call, previous: contracts.legacyPhaseProjection(call.previous) };
        return operation(compatible, resources, signal);
      },
    }));
  }

  return Object.freeze({ create, validatePolicy, localPhaseAdapters });
});
