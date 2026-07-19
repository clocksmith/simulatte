(function attachPipelineJobInterface(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePipelineJobs = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPipelineJobInterface() {
  const REGISTRY_SCHEMA = 'simulatte.pipelineJobRegistry.v1';
  const STRATEGY_STATUSES = Object.freeze([
    'required',
    'default',
    'optional',
    'fallback',
    'disabled',
    'evaluation-only',
  ]);

  function validateRegistry(registry, options = {}) {
    requireValue(registry && registry.schema === REGISTRY_SCHEMA, `expected ${REGISTRY_SCHEMA}`);
    requireText(registry.$schema, 'registry $schema');
    requireText(registry.id, 'registry id');
    const jobs = requireArray(registry.jobs, 'jobs');
    const strategies = requireArray(registry.strategies, 'strategies');
    const evidenceSources = requireArray(registry.evidenceSources, 'evidenceSources');
    const surfaces = requireArray(registry.surfaces, 'surfaces');
    requireValue(jobs.length === 8, `expected 8 jobs, received ${jobs.length}`);
    requireValue(surfaces.length === 2, `expected 2 surfaces, received ${surfaces.length}`);

    const jobsById = uniqueRows(jobs, 'job');
    jobs.forEach((job, index) => {
      requireValue(job.order === index + 1, `${job.id} order must be ${index + 1}`);
      requireText(job.label, `${job.id} label`);
      requireText(job.contract, `${job.id} contract`);
      requireValue(Array.isArray(job.sharedStrategies), `${job.id} sharedStrategies must be an array`);
    });

    const evidenceById = uniqueRows(evidenceSources, 'evidence source');
    for (const source of evidenceSources) {
      requireText(source.path, `${source.id} path`);
      requireValue(['frontier', 'lane-diagnostic'].includes(source.kind), `${source.id} kind is unsupported`);
      requirePath(source.path, options, `${source.id} evidence`);
    }

    const strategiesById = uniqueRows(strategies, 'strategy');
    for (const strategy of strategies) {
      requireValue(jobsById.has(strategy.jobId), `${strategy.id} references unknown job ${strategy.jobId}`);
      requireText(strategy.label, `${strategy.id} label`);
      requireValue(['deterministic', 'model', 'runtime', 'renderer'].includes(strategy.kind), `${strategy.id} kind is unsupported`);
      if (strategy.modelLockPath) requirePath(strategy.modelLockPath, options, `${strategy.id} model lock`);
      for (const reference of strategy.performanceRefs || []) {
        requireValue(evidenceById.has(reference.sourceId), `${strategy.id} references unknown evidence ${reference.sourceId}`);
        requireValue(['candidate', 'lane'].includes(reference.recordType), `${strategy.id} performance record type is unsupported`);
        requireText(reference.recordId, `${strategy.id} performance record id`);
      }
    }
    for (const job of jobs) validateSelections(job.sharedStrategies, job, strategiesById, `shared.${job.id}`);

    const surfacesById = uniqueRows(surfaces, 'surface');
    requireValue(surfacesById.has('autonomy'), 'autonomy surface is required');
    requireValue(surfacesById.has('blank'), 'blank surface is required');
    for (const surface of surfaces) validateSurface(surface, jobs, jobsById, strategiesById, options);

    return Object.freeze({
      schema: 'simulatte.pipelineJobRegistryValidation.v1',
      registryId: registry.id,
      jobCount: jobs.length,
      strategyCount: strategies.length,
      evidenceSourceCount: evidenceSources.length,
      surfaces: Object.freeze(surfaces.map((surface) => surface.id)),
    });
  }

  function validateSurface(surface, jobs, jobsById, strategiesById, options) {
    requireText(surface.route, `${surface.id} route`);
    requireText(surface.label, `${surface.id} label`);
    const bindings = requireArray(surface.bindings, `${surface.id} bindings`);
    requireValue(bindings.length === jobs.length, `${surface.id} must bind all ${jobs.length} jobs`);
    const bindingsByJob = new Map();
    for (const binding of bindings) {
      requireValue(jobsById.has(binding.jobId), `${surface.id} references unknown job ${binding.jobId}`);
      requireValue(!bindingsByJob.has(binding.jobId), `${surface.id} duplicates job ${binding.jobId}`);
      bindingsByJob.set(binding.jobId, binding);
      requireText(binding.boundary, `${surface.id}.${binding.jobId} boundary`);
      if (surface.id === 'blank') {
        requireValue(binding.phase === jobsById.get(binding.jobId).order, `${surface.id}.${binding.jobId} phase must match job order`);
      } else {
        requireValue(binding.phase === null, `${surface.id}.${binding.jobId} phase must be null`);
      }
      const owners = requireArray(binding.owners, `${surface.id}.${binding.jobId} owners`);
      owners.forEach((owner) => requirePath(owner, options, `${surface.id}.${binding.jobId} owner`));
      requireValue(Array.isArray(binding.surfaceStrategies), `${surface.id}.${binding.jobId} surfaceStrategies must be an array`);
      validateSelections(binding.surfaceStrategies, jobsById.get(binding.jobId), strategiesById, `${surface.id}.${binding.jobId}`);
      const sharedIds = new Set(jobsById.get(binding.jobId).sharedStrategies.map((selection) => selection.id));
      for (const selection of binding.surfaceStrategies) {
        requireValue(!sharedIds.has(selection.id), `${surface.id}.${binding.jobId} repeats shared strategy ${selection.id}`);
      }
    }
    for (const job of jobs) requireValue(bindingsByJob.has(job.id), `${surface.id} does not bind ${job.id}`);
  }

  function resolveSurface(registry, surfaceId) {
    const surface = registry.surfaces.find((row) => row.id === surfaceId);
    requireValue(surface, `unknown surface ${surfaceId}`);
    const jobsById = new Map(registry.jobs.map((job) => [job.id, job]));
    const strategiesById = new Map(registry.strategies.map((strategy) => [strategy.id, strategy]));
    return Object.freeze({
      ...surface,
      bindings: Object.freeze(surface.bindings.map((binding) => Object.freeze({
        ...binding,
        job: jobsById.get(binding.jobId),
        strategies: Object.freeze([...jobsById.get(binding.jobId).sharedStrategies, ...binding.surfaceStrategies].map((selection) => Object.freeze({
          ...selection,
          strategy: strategiesById.get(selection.id),
        }))),
      }))),
    });
  }

  function buildJobMatrix(registry) {
    const resolved = registry.surfaces.map((surface) => resolveSurface(registry, surface.id));
    return Object.freeze(registry.jobs.map((job) => Object.freeze({
      job,
      surfaces: Object.freeze(Object.fromEntries(resolved.map((surface) => [
        surface.id,
        surface.bindings.find((binding) => binding.jobId === job.id),
      ]))),
    })));
  }

  function uniqueRows(rows, label) {
    const byId = new Map();
    for (const row of rows) {
      const id = requireText(row && row.id, `${label} id`);
      requireValue(!byId.has(id), `${label} id is duplicated: ${id}`);
      byId.set(id, row);
    }
    return byId;
  }

  function validateSelections(selections, job, strategiesById, label) {
    const selectedIds = new Set();
    for (const selection of selections) {
      requireValue(!selectedIds.has(selection.id), `${label} duplicates strategy ${selection.id}`);
      selectedIds.add(selection.id);
      const strategy = strategiesById.get(selection.id);
      requireValue(strategy, `${label} references unknown strategy ${selection.id}`);
      requireValue(strategy.jobId === job.id, `${selection.id} belongs to ${strategy.jobId}, not ${job.id}`);
      requireValue(STRATEGY_STATUSES.includes(selection.status), `${label}.${selection.id} status is unsupported`);
    }
  }

  function requireArray(value, label) {
    requireValue(Array.isArray(value) && value.length > 0, `${label} must be a non-empty array`);
    return value;
  }

  function requirePath(value, options, label) {
    const candidate = requireText(value, label);
    if (typeof options.pathExists === 'function') {
      requireValue(options.pathExists(candidate), `${label} does not exist: ${candidate}`);
    }
    return candidate;
  }

  function requireText(value, label) {
    const text = String(value || '').trim();
    requireValue(Boolean(text), `${label} is required`);
    return text;
  }

  function requireValue(value, message) {
    if (!value) throw new Error(`Pipeline job registry invalid: ${message}`);
    return value;
  }

  return Object.freeze({
    REGISTRY_SCHEMA,
    STRATEGY_STATUSES,
    validateRegistry,
    resolveSurface,
    buildJobMatrix,
  });
});
