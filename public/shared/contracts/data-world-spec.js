(function attachDataWorldSpec(root, factory) {
  const world = typeof module === 'object' && module.exports ? require('./world-spec.js') : root.SimulatteWorldSpec;
  const api = factory(world);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteDataWorldSpec = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createDataWorldSpec(world) {
  if (!world) throw new Error('data_world_spec_dependency_missing');
  const KIND = 'data-points-v1';
  const LIMITS = Object.freeze({ rows: 10000, coordinate: 1e9, duration: 3600, steps: 600, work: 1000000 });
  const FIELDS = Object.freeze(['id', 'label', 'x', 'y', 'vx', 'vy']);
  function error(message) {
    const value = new Error(message);
    value.code = 'data_world_spec_invalid';
    return value;
  }
  function keys(value, expected, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== expected.length || expected.some((key) => !Object.hasOwn(value, key))) {
      throw error(`${label}: expected exactly ${expected.join(', ')}`);
    }
  }
  function bounded(value, maximum, label) {
    if (!Number.isFinite(value) || Math.abs(value) > maximum) throw error(`${label}: expected a finite number within ±${maximum}`);
    return value;
  }
  function validate(spec) {
    world.validateWorldSpec(spec);
    if (spec.kind !== KIND || spec.templateId !== KIND) throw error(`This adapter executes ${KIND}, not ${spec.kind}; use the program's declared prompt or profile runtime`);
    keys(spec.params, ['duration', 'steps', 'units'], 'params');
    bounded(spec.params.duration, LIMITS.duration, 'duration');
    if (spec.params.duration < 0 || !Number.isInteger(spec.params.steps) || spec.params.steps < 1 || spec.params.steps > LIMITS.steps) throw error(`Use a nonnegative duration and 1–${LIMITS.steps} steps`);
    if (typeof spec.params.units !== 'string' || !spec.params.units.trim() || spec.params.units.length > 80) throw error('Declare the coordinate units');
    if (!spec.objects.length || spec.objects.length > LIMITS.rows || spec.objects.length * (spec.params.steps + 1) > LIMITS.work) throw error(`Dataset exceeds the ${LIMITS.work} point-state budget`);
    const ids = new Set();
    spec.objects.forEach((row, index) => {
      keys(row, FIELDS, `Object ${index + 1}`);
      if (typeof row.id !== 'string' || !row.id || row.id.length > 128 || ids.has(row.id)) throw error(`Object ${index + 1}: id must be unique, nonempty, and at most 128 characters`);
      ids.add(row.id);
      if (typeof row.label !== 'string' || row.label.length > 256) throw error(`Object ${row.id}: label must be text up to 256 characters`);
      ['x', 'y', 'vx', 'vy'].forEach((key) => bounded(row[key], LIMITS.coordinate, `${row.id}.${key}`));
      bounded(row.x + row.vx * spec.params.duration, LIMITS.coordinate, `${row.id}.finalX`);
      bounded(row.y + row.vy * spec.params.duration, LIMITS.coordinate, `${row.id}.finalY`);
    });
    if (spec.modules.length || spec.controls.length || spec.dependencies.plugins.length || spec.dependencies.governedPacks.length || spec.dependencies.assets.length ||
      spec.safety.status !== 'not-declared' || spec.safety.rules.length || spec.unsupportedRequirements.length || spec.unresolvedAmbiguities.length) {
      throw error('The point adapter cannot execute additional modules, dependencies, safety rules, or unresolved requirements');
    }
    const supported = new Set(['schema', 'schemaVersion', 'id', 'templateId', 'name', 'description', 'kind', 'modules', 'objects', 'controls', 'params', 'source', 'authorship', 'determinism', 'dependencies', 'safety', 'unsupportedRequirements', 'unresolvedAmbiguities', 'contentHash']);
    if (Object.keys(spec).some((key) => spec[key] !== undefined && !supported.has(key))) throw error('The point adapter received unsupported program fields');
    if (world.canonicalJson(spec.determinism) !== world.canonicalJson(determinism())) throw error('The point adapter requires its declared deterministic execution policy');
    const config = spec.source.compilerConfig;
    keys(config, ['schema', 'adapter', 'input', 'mapping'], 'Data compiler configuration');
    if (config.schema !== 'simulatte.dataCompiler.v1' || config.adapter !== KIND || !/^[a-f0-9]{64}$/.test(config.input?.sha256 || '')) throw error('Data source identity or compiler version is missing');
    keys(config.mapping, FIELDS, 'Field mapping');
    if (FIELDS.some((key) => config.mapping[key] !== null && (typeof config.mapping[key] !== 'string' || !config.mapping[key])) || config.mapping.x === null || config.mapping.y === null) throw error('Source mapping must declare x/y columns and optional string columns');
    keys(config.input, ['schema', 'name', 'format', 'origin', 'byteLength', 'sha256'], 'Input source');
    if (config.input.schema !== 'simulatte.inputSource.v1' || !['csv', 'json'].includes(config.input.format) || typeof config.input.name !== 'string' || typeof config.input.origin !== 'string' || !Number.isInteger(config.input.byteLength) || config.input.byteLength < 1 || config.input.byteLength > 8 * 1024 * 1024) throw error('Invalid bounded input source receipt');
    return spec;
  }
  function determinism() {
    return { schema: 'simulatte.worldSpecDeterminism.v1', requiredClasses: ['simulation-reproducible', 'replay-identified'], seed: null, simulationTolerance: 0, pixelPolicy: null };
  }
  function compile(input, { mapping, duration, steps, units }) {
    if (input?.kind !== 'table') throw error('The data compiler requires a decoded table');
    keys(mapping, FIELDS, 'Field mapping');
    for (const key of FIELDS) {
      if (mapping[key] !== null && !input.columns.includes(mapping[key])) throw error(`Mapping ${key}: column ${mapping[key]} does not exist`);
    }
    if (mapping.x === null || mapping.y === null) throw error('Select explicit x and y columns');
    function cell(row, key, fallback) {
      if (mapping[key] === null) return fallback;
      if (!Object.hasOwn(row, mapping[key]) || row[mapping[key]] === null || String(row[mapping[key]]).trim() === '') throw error(`Column ${mapping[key]} has a missing value`);
      return row[mapping[key]];
    }
    const objects = input.rows.map((row, index) => {
      const id = String(cell(row, 'id', `row-${index + 1}`));
      const result = { id, label: String(cell(row, 'label', id)) };
      for (const key of ['x', 'y', 'vx', 'vy']) {
        const value = cell(row, key, 0);
        if (typeof value === 'boolean' || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(String(value).trim())) throw error(`Row ${index + 1}, ${mapping[key] || key}: expected a decimal number`);
        result[key] = Number(value);
      }
      return result;
    });
    const sourceId = `source:data:${input.source.sha256}`;
    return validate(world.finalizeWorldSpec({
      id: `data:${input.source.sha256.slice(0, 16)}`, kind: KIND, templateId: KIND,
      name: input.source.name, description: 'Declared 2D point positions with constant velocity; no forces, collisions, or scientific validity inferred.',
      modules: [], objects, controls: [], params: { duration, steps, units },
      source: { schema: world.SOURCE_SCHEMA, prompt: '', compilerConfig: { schema: 'simulatte.dataCompiler.v1', adapter: KIND, input: input.source, mapping } },
      authorship: { schema: world.AUTHORING_SCHEMA, revision: 0,
        sources: [{ id: sourceId, authority: 'userOverride', label: input.source.name }],
        fieldProvenance: [{ path: '/', authority: 'userOverride', sourceId }], patches: [], reconciliations: [] },
      determinism: determinism(),
      dependencies: { schema: 'simulatte.worldSpecDependencies.v1', governedPacks: [], plugins: [], assets: [] },
      safety: { schema: 'simulatte.worldSpecSafety.v1', rules: [], status: 'not-declared' },
    }));
  }
  return Object.freeze({ KIND, LIMITS, FIELDS, compile, validate });
});
