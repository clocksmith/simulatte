(function attachSimulatteWorldSpec(root, factory) {
  const authorship = typeof module === 'object' && module.exports
    ? require('./world-spec-authorship.js')
    : root.SimulatteWorldSpecAuthorship;
  if (!authorship) throw new Error('SimulatteWorldSpec requires WorldSpec authorship validation');
  const api = factory(authorship);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteWorldSpec = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createWorldSpecApi(authorshipContract) {

  const WORLD_SPEC_SCHEMA = 'simulatte.worldSpec.v1';
  const WORLD_SPEC_VERSION = '1.2.0';
  const PREVIOUS_WORLD_SPEC_VERSION = '1.1.0';
  const LEGACY_WORLD_SPEC_VERSION = '1.0.0';
  const LEGACY_SPEC_SCHEMA = 'simulatte.simulationSpec.v1';
  const AUTHORING_SCHEMA = 'simulatte.worldSpecAuthoring.v2';
  const RECONCILIATION_SCHEMA = 'simulatte.worldSpecReconciliation.v1';
  const SOURCE_SCHEMA = 'simulatte.worldSpecSource.v1';
  const PATCH_SCHEMA = 'simulatte.worldSpecPatch.v2';
  const LEGACY_PATCH_SCHEMA = 'simulatte.worldSpecPatch.v1';
  const CONTENT_HASH_PREFIX = 'fnv1a32:';
  const MAX_PATCHES_PER_EDIT = 256;
  const DETERMINISM_CLASSES = Object.freeze([
    'compiler-deterministic',
    'decision-deterministic',
    'simulation-reproducible',
    'semantic-render-reproducible',
    'pixel-bounded',
    'replay-identified',
  ]);
  const DETERMINISM_CLASS_SET = new Set(DETERMINISM_CLASSES);
  const AUTHORITIES = new Set([
    'prompt', 'compilerInference', 'userOverride', 'governedPack', 'plugin', 'runtimeState',
  ]);
  const COMPILER_EVIDENCE_ROOTS = Object.freeze([
    'intent',
    'promptParse',
    'validationReceipt',
    'phaseArtifacts',
  ]);
  const IMMUTABLE_EDIT_ROOTS = Object.freeze([
    'schema',
    'schemaVersion',
    'id',
    'kind',
    'contentHash',
    'source',
    'authorship',
    'intent',
    'promptParse',
    'physicsIR',
    'validationReceipt',
    'solverGraph',
    'renderIR',
    'interactionIR',
    'phaseArtifacts',
    'compositionGraph',
    'renderProgram',
    'physicalSpec',
    'createdAt',
    'remixOf',
    'unsupportedRequirements',
    'unresolvedAmbiguities',
  ]);
  const EDITABLE_ROOTS = Object.freeze([
    'templateId',
    'name',
    'description',
    'modules',
    'objects',
    'controls',
    'params',
    'contract',
    'universeGraph',
    'determinism',
    'dependencies',
    'safety',
  ]);
  const GRAPH_EDIT_COLLECTIONS = new Set(['nodes', 'edges']);
  const GRAPH_EVIDENCE_FIELDS = new Set([
    'id', 'schema', 'authorship', 'evidence', 'provenance', 'confidence', 'rankSignals',
    'spanId', 'sourceLabel', 'canonicalId', 'conceptIds', 'indexName', 'directlyGrounded',
    'supportOnly', 'constructionHypotheses', 'constructionProvenance', 'sourceSpanIds',
    'sourceCardIds', 'sourceLabels', 'groundingIds', 'basisIds', 'hypothesisId',
    'hypothesisRank', 'candidateId', 'modelScore', 'modelRerankScore', 'modelRerankRank',
    'modelEvaluated', 'rerankEvaluated', 'literalSlotMatch', 'exactTargetMatch',
    'targetIdentityBound', 'vectorHash',
  ]);
  const KNOWN_ROOTS = new Set([...IMMUTABLE_EDIT_ROOTS, ...EDITABLE_ROOTS]);

  class WorldSpecError extends Error {
    constructor(message, path = '$') {
      super(`${message} at ${path}`);
      this.name = 'WorldSpecError';
      this.code = 'SIMULATTE_WORLD_SPEC_INVALID';
      this.path = path;
    }
  }

  function canonicalValue(value) {
    if (Array.isArray(value)) return value.map((row) => canonicalValue(row));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().flatMap((key) => {
      if (value[key] === undefined) return [];
      return [[key, canonicalValue(value[key])]];
    }));
  }

  function canonicalJson(value, spacing = 0) {
    return JSON.stringify(canonicalValue(value), null, spacing);
  }

  function withoutContentHash(value) {
    const copy = { ...(value || {}) };
    delete copy.contentHash;
    COMPILER_EVIDENCE_ROOTS.forEach((key) => delete copy[key]);
    return copy;
  }

  function contentHash(value) {
    const hash = fnv1a32(canonicalJson(withoutContentHash(value)));
    return `${CONTENT_HASH_PREFIX}${hash.toString(16).padStart(8, '0')}`;
  }

  function exactPrompt(spec = {}) {
    return String(
      spec.source && spec.source.prompt ||
      spec.phaseArtifacts && spec.phaseArtifacts.phase2 &&
        spec.phaseArtifacts.phase2.artifact &&
        spec.phaseArtifacts.phase2.artifact.languageGraph &&
        spec.phaseArtifacts.phase2.artifact.languageGraph.sourceText ||
      spec.intent && spec.intent.prompt ||
      spec.universeGraph && spec.universeGraph.prompt ||
      spec.renderIR && spec.renderIR.prompt ||
      ''
    );
  }

  function normalizeSource(spec = {}, options = {}) {
    const existing = spec.source && typeof spec.source === 'object' ? spec.source : {};
    const compilerConfig = options.compilerConfig && typeof options.compilerConfig === 'object'
      ? options.compilerConfig
      : existing.compilerConfig && typeof existing.compilerConfig === 'object'
        ? existing.compilerConfig
        : {};
    return {
      schema: SOURCE_SCHEMA,
      prompt: Object.hasOwn(options, 'prompt') ? String(options.prompt || '') : exactPrompt(spec),
      compilerConfig: canonicalValue(compilerConfig),
    };
  }

  function defaultAuthorship(source) {
    return {
      schema: AUTHORING_SCHEMA,
      revision: 0,
      sources: [
        {
          id: 'source:prompt',
          authority: 'prompt',
          label: source.prompt ? 'Source brief' : 'No source brief',
        },
        {
          id: 'source:compiler',
          authority: 'compilerInference',
          label: 'Simulatte compiler',
        },
      ],
      fieldProvenance: [
        {
          path: '/source/prompt',
          authority: 'prompt',
          sourceId: 'source:prompt',
        },
        {
          path: '/',
          authority: 'compilerInference',
          sourceId: 'source:compiler',
        },
      ],
      patches: [],
      reconciliations: [],
    };
  }

  function normalizeAuthorship(value, source) {
    if (!value || typeof value !== 'object') return defaultAuthorship(source);
    return {
      schema: AUTHORING_SCHEMA,
      revision: nonnegativeInteger(value.revision, 0),
      sources: arrayOfObjects(value.sources, defaultAuthorship(source).sources),
      fieldProvenance: arrayOfObjects(value.fieldProvenance, defaultAuthorship(source).fieldProvenance),
      patches: arrayOfObjects(value.patches, []),
      reconciliations: arrayOfObjects(value.reconciliations, []),
    };
  }

  function nonnegativeInteger(value, fallback) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 ? number : fallback;
  }

  function arrayOfObjects(value, fallback) {
    if (!Array.isArray(value)) return fallback.map((row) => ({ ...row }));
    return value.filter((row) => row && typeof row === 'object').map((row) => canonicalValue(row));
  }

  function unsupportedRows(spec = {}) {
    const validation = spec.validationReceipt || {};
    const graph = spec.universeGraph || {};
    return uniqueRows([
      ...(Array.isArray(spec.unsupportedRequirements) ? spec.unsupportedRequirements : []),
      ...(Array.isArray(validation.unsupported) ? validation.unsupported : []),
      ...(Array.isArray(graph.unsupported) ? graph.unsupported : []),
    ]);
  }

  function ambiguityRows(spec = {}) {
    const validation = spec.validationReceipt || {};
    const graph = spec.universeGraph || {};
    return uniqueRows([
      ...(Array.isArray(spec.unresolvedAmbiguities) ? spec.unresolvedAmbiguities : []),
      ...(Array.isArray(validation.unresolved) ? validation.unresolved : []),
      ...(Array.isArray(graph.unresolved) ? graph.unresolved : []),
    ]);
  }

  function uniqueRows(rows) {
    const seen = new Set();
    return rows.flatMap((row) => {
      const normalized = row && typeof row === 'object' ? canonicalValue(row) : { value: row };
      const identity = canonicalJson(normalized);
      if (seen.has(identity)) return [];
      seen.add(identity);
      return [normalized];
    });
  }

  function normalizeDeterminism(spec = {}) {
    if (spec.determinism && typeof spec.determinism === 'object') {
      return canonicalValue(spec.determinism);
    }
    return spec.determinism || null;
  }

  function normalizeDependencies(spec = {}) {
    if (spec.dependencies && typeof spec.dependencies === 'object') {
      return canonicalValue(spec.dependencies);
    }
    return spec.dependencies || null;
  }

  function normalizeSafety(spec = {}) {
    if (spec.safety && typeof spec.safety === 'object') return canonicalValue(spec.safety);
    return spec.safety || null;
  }

  function finalizeWorldSpec(raw, options = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new WorldSpecError('WorldSpec must be an object');
    }
    const source = normalizeSource(raw, options);
    const next = {
      ...raw,
      schema: WORLD_SPEC_SCHEMA,
      schemaVersion: WORLD_SPEC_VERSION,
      source,
      authorship: normalizeAuthorship(raw.authorship, source),
      determinism: normalizeDeterminism(raw),
      dependencies: normalizeDependencies(raw),
      safety: normalizeSafety(raw),
      unsupportedRequirements: unsupportedRows(raw),
      unresolvedAmbiguities: ambiguityRows(raw),
    };
    next.contentHash = contentHash(next);
    validateWorldSpec(next);
    return next;
  }

  function validateWorldSpec(spec, options = {}) {
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
      throw new WorldSpecError('WorldSpec must be an object');
    }
    if (spec.schema !== WORLD_SPEC_SCHEMA) {
      throw new WorldSpecError(`Expected ${WORLD_SPEC_SCHEMA}, received ${String(spec.schema || 'missing')}`, '$.schema');
    }
    if (spec.schemaVersion !== WORLD_SPEC_VERSION) {
      throw new WorldSpecError(`Expected schema version ${WORLD_SPEC_VERSION}`, '$.schemaVersion');
    }
    for (const key of Object.keys(spec)) {
      if (!KNOWN_ROOTS.has(key)) throw new WorldSpecError(`Unknown WorldSpec field ${key}`, `$.${key}`);
    }
    requireString(spec.id, '$.id');
    requireString(spec.templateId, '$.templateId');
    requireString(spec.name, '$.name');
    requireString(spec.kind, '$.kind');
    requireString(spec.description, '$.description', true);
    requireArray(spec.modules, '$.modules');
    requireArray(spec.objects, '$.objects');
    requireArray(spec.controls, '$.controls');
    requireObject(spec.params, '$.params');
    validateSource(spec.source);
    validateAuthorship(spec.authorship);
    validateDeterminism(spec.determinism);
    validateDependencies(spec.dependencies);
    validateSafety(spec.safety);
    requireArray(spec.unsupportedRequirements, '$.unsupportedRequirements');
    requireArray(spec.unresolvedAmbiguities, '$.unresolvedAmbiguities');
    if (typeof spec.contentHash !== 'string' || !spec.contentHash.startsWith(CONTENT_HASH_PREFIX)) {
      throw new WorldSpecError('WorldSpec contentHash must name its algorithm', '$.contentHash');
    }
    if (options.verifyHash !== false && spec.contentHash !== contentHash(spec)) {
      throw new WorldSpecError('WorldSpec contentHash does not match canonical content', '$.contentHash');
    }
    return spec;
  }

  function validateSource(source) {
    requireObject(source, '$.source');
    requireExactKeys(source, ['schema', 'prompt', 'compilerConfig'], '$.source');
    if (source.schema !== SOURCE_SCHEMA) throw new WorldSpecError(`Expected ${SOURCE_SCHEMA}`, '$.source.schema');
    if (typeof source.prompt !== 'string') throw new WorldSpecError('Source prompt must be a string', '$.source.prompt');
    requireObject(source.compilerConfig, '$.source.compilerConfig');
  }

  function validateAuthorship(authorship) {
    return authorshipContract.validateAuthorship(authorship, {
      authoringSchema: AUTHORING_SCHEMA,
      currentPatchSchema: PATCH_SCHEMA,
      legacyPatchSchema: LEGACY_PATCH_SCHEMA,
      contentHashPrefix: CONTENT_HASH_PREFIX,
      reconciliationSchema: RECONCILIATION_SCHEMA,
      authorities: AUTHORITIES,
      fail(message, path) { throw new WorldSpecError(message, path); },
    });
  }

  function validateDeterminism(value) {
    requireObject(value, '$.determinism');
    requireExactKeys(value, ['schema', 'requiredClasses', 'seed', 'simulationTolerance', 'pixelPolicy'], '$.determinism');
    if (value.schema !== 'simulatte.worldSpecDeterminism.v1') {
      throw new WorldSpecError('Unexpected determinism schema', '$.determinism.schema');
    }
    requireArray(value.requiredClasses, '$.determinism.requiredClasses');
    const seenClasses = new Set();
    value.requiredClasses.forEach((className, index) => {
      const path = `$.determinism.requiredClasses[${index}]`;
      if (typeof className !== 'string' || !DETERMINISM_CLASS_SET.has(className)) {
        throw new WorldSpecError('Unknown determinism class', path);
      }
      if (seenClasses.has(className)) throw new WorldSpecError('Duplicate determinism class', path);
      seenClasses.add(className);
    });
    if (value.seed !== null && !Number.isFinite(value.seed)) {
      throw new WorldSpecError('Determinism seed must be finite or null', '$.determinism.seed');
    }
    if (value.simulationTolerance !== null && (!Number.isFinite(value.simulationTolerance) || value.simulationTolerance < 0)) {
      throw new WorldSpecError('Simulation tolerance must be nonnegative or null', '$.determinism.simulationTolerance');
    }
    if (value.pixelPolicy !== null && (!value.pixelPolicy || typeof value.pixelPolicy !== 'object' || Array.isArray(value.pixelPolicy))) {
      throw new WorldSpecError('Pixel policy must be an object or null', '$.determinism.pixelPolicy');
    }
    if (seenClasses.has('pixel-bounded') && value.pixelPolicy === null) {
      throw new WorldSpecError('Pixel-bounded determinism requires a pixel policy', '$.determinism.pixelPolicy');
    }
  }

  function validateDependencies(value) {
    requireObject(value, '$.dependencies');
    requireExactKeys(value, ['schema', 'governedPacks', 'plugins', 'assets'], '$.dependencies');
    if (value.schema !== 'simulatte.worldSpecDependencies.v1') {
      throw new WorldSpecError('Unexpected dependencies schema', '$.dependencies.schema');
    }
    requireArray(value.governedPacks, '$.dependencies.governedPacks');
    requireArray(value.plugins, '$.dependencies.plugins');
    requireArray(value.assets, '$.dependencies.assets');
  }

  function validateSafety(value) {
    requireObject(value, '$.safety');
    requireExactKeys(value, ['schema', 'rules', 'status'], '$.safety');
    if (value.schema !== 'simulatte.worldSpecSafety.v1') {
      throw new WorldSpecError('Unexpected safety schema', '$.safety.schema');
    }
    requireArray(value.rules, '$.safety.rules');
    if (value.rules.length > 64) {
      throw new WorldSpecError('Safety rules exceed the supported limit of 64', '$.safety.rules');
    }
    const ruleIds = new Set();
    value.rules.forEach((rule, index) => {
      validateSafetyRule(rule, `$.safety.rules[${index}]`);
      if (ruleIds.has(rule.id)) {
        throw new WorldSpecError('Safety rule ids must be unique', `$.safety.rules[${index}].id`);
      }
      ruleIds.add(rule.id);
    });
    if (!['not-declared', 'declared', 'unsupported'].includes(value.status)) {
      throw new WorldSpecError('Unexpected safety status', '$.safety.status');
    }
    if (value.status === 'declared' && value.rules.length === 0) {
      throw new WorldSpecError('Declared safety requires at least one executable rule', '$.safety.rules');
    }
    if (value.status !== 'declared' && value.rules.length > 0) {
      throw new WorldSpecError('Only declared safety may contain executable rules', '$.safety.rules');
    }
  }

  function validateSafetyRule(rule, path) {
    requireObject(rule, path);
    requireExactKeys(rule, [
      'schema', 'id', 'description', 'statePath', 'operator', 'minimum',
      'maximum', 'expected', 'tolerance', 'severity',
    ], path);
    if (rule.schema !== 'simulatte.worldSpecSafetyRule.v1') {
      throw new WorldSpecError('Unexpected safety rule schema', `${path}.schema`);
    }
    requireString(rule.id, `${path}.id`);
    requireString(rule.description, `${path}.description`);
    requireString(rule.statePath, `${path}.statePath`);
    if (!rule.statePath.startsWith('/') || rule.statePath.length > 512) {
      throw new WorldSpecError('Safety statePath must be a bounded JSON pointer', `${path}.statePath`);
    }
    const pathSegments = rule.statePath.slice(1).split('/').map((row) => (
      row.replace(/~1/g, '/').replace(/~0/g, '~')
    ));
    if (pathSegments.some((row) => ['__proto__', 'prototype', 'constructor'].includes(row))) {
      throw new WorldSpecError('Safety statePath contains a prohibited segment', `${path}.statePath`);
    }
    if (!['finite', 'gte', 'lte', 'between', 'equals'].includes(rule.operator)) {
      throw new WorldSpecError('Unexpected safety operator', `${path}.operator`);
    }
    for (const key of ['minimum', 'maximum', 'expected']) {
      if (rule[key] !== null && !Number.isFinite(rule[key])) {
        throw new WorldSpecError(`Safety ${key} must be finite or null`, `${path}.${key}`);
      }
    }
    if (!Number.isFinite(rule.tolerance) || rule.tolerance < 0) {
      throw new WorldSpecError('Safety tolerance must be nonnegative', `${path}.tolerance`);
    }
    if (!['block', 'warn'].includes(rule.severity)) {
      throw new WorldSpecError('Unexpected safety severity', `${path}.severity`);
    }
    const hasMinimum = rule.minimum !== null;
    const hasMaximum = rule.maximum !== null;
    const hasExpected = rule.expected !== null;
    const shapeValid = rule.operator === 'finite'
      ? !hasMinimum && !hasMaximum && !hasExpected
      : rule.operator === 'gte'
        ? hasMinimum && !hasMaximum && !hasExpected
        : rule.operator === 'lte'
          ? !hasMinimum && hasMaximum && !hasExpected
          : rule.operator === 'between'
            ? hasMinimum && hasMaximum && !hasExpected && rule.minimum <= rule.maximum
            : !hasMinimum && !hasMaximum && hasExpected;
    if (!shapeValid) {
      throw new WorldSpecError('Safety bounds do not match the declared operator', path);
    }
  }

  function requireExactKeys(value, allowed, path) {
    const names = new Set(allowed);
    for (const key of Object.keys(value || {})) {
      if (!names.has(key)) throw new WorldSpecError(`Unknown field ${key}`, `${path}.${key}`);
    }
    for (const key of allowed) {
      if (!Object.hasOwn(value, key)) throw new WorldSpecError(`Missing field ${key}`, `${path}.${key}`);
    }
  }

  function requireString(value, path, allowEmpty = false) {
    if (typeof value !== 'string' || (!allowEmpty && !value.trim())) {
      throw new WorldSpecError('Expected a nonempty string', path);
    }
  }

  function requireArray(value, path) {
    if (!Array.isArray(value)) throw new WorldSpecError('Expected an array', path);
  }

  function requireObject(value, path) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new WorldSpecError('Expected an object', path);
    }
  }

  function parseWorldSpec(text, options = {}) {
    let parsed;
    try {
      parsed = JSON.parse(String(text || ''));
    } catch (error) {
      throw new WorldSpecError(`Invalid JSON: ${error.message}`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new WorldSpecError('Imported WorldSpec must be an object');
    }
    if (![WORLD_SPEC_SCHEMA, LEGACY_SPEC_SCHEMA].includes(parsed.schema)) {
      throw new WorldSpecError(`Unsupported spec schema ${String(parsed.schema || 'missing')}`, '$.schema');
    }
    if (parsed.schema !== WORLD_SPEC_SCHEMA) return parsed;
    if ([LEGACY_WORLD_SPEC_VERSION, PREVIOUS_WORLD_SPEC_VERSION].includes(parsed.schemaVersion)) {
      return migrateWorldSpec(parsed);
    }
    validateWorldSpec(parsed, { verifyHash: options.verifyHash !== false });
    return parsed;
  }

  function parseWorldSpecEditCandidate(text) {
    return parseWorldSpec(text, { verifyHash: false });
  }

  function migrateWorldSpec(spec) {
    if (spec.schema !== WORLD_SPEC_SCHEMA ||
        ![LEGACY_WORLD_SPEC_VERSION, PREVIOUS_WORLD_SPEC_VERSION].includes(spec.schemaVersion)) {
      throw new WorldSpecError('No WorldSpec migration is available', '$.schemaVersion');
    }
    if (spec.contentHash !== contentHash(spec)) {
      throw new WorldSpecError('Legacy WorldSpec contentHash does not match canonical content', '$.contentHash');
    }
    const migrated = {
      ...spec,
      schemaVersion: WORLD_SPEC_VERSION,
      authorship: {
        ...spec.authorship,
        schema: AUTHORING_SCHEMA,
        reconciliations: Array.isArray(spec.authorship && spec.authorship.reconciliations)
          ? spec.authorship.reconciliations
          : [],
      },
    };
    migrated.contentHash = contentHash(migrated);
    validateWorldSpec(migrated);
    return migrated;
  }

  function serializeWorldSpec(spec) {
    validateWorldSpec(spec);
    const exported = { ...spec };
    COMPILER_EVIDENCE_ROOTS.forEach((key) => delete exported[key]);
    exported.contentHash = contentHash(exported);
    return canonicalJson(exported, 2);
  }

  function prepareUserEdit(current, input, options = {}) {
    validateWorldSpec(current);
    const parsedCandidate = typeof input === 'string'
      ? parseWorldSpecEditCandidate(input)
      : input;
    const candidate = {
      ...current,
      ...(parsedCandidate || {}),
    };
    COMPILER_EVIDENCE_ROOTS.forEach((key) => {
      if (!Object.hasOwn(parsedCandidate || {}, key)) candidate[key] = current[key];
    });
    if (!candidate || candidate.schema !== WORLD_SPEC_SCHEMA) {
      throw new WorldSpecError('User edits require the current WorldSpec schema', '$.schema');
    }
    assertKnownRoots(candidate);
    for (const key of IMMUTABLE_EDIT_ROOTS) {
      if (key === 'contentHash') continue;
      if (canonicalJson(candidate[key]) !== canonicalJson(current[key])) {
        throw new WorldSpecError(`Field ${key} is compiler evidence or immutable identity`, `$.${key}`);
      }
    }
    const editableCurrent = Object.fromEntries(EDITABLE_ROOTS.map((key) => [key, current[key]]));
    const editableCandidate = Object.fromEntries(EDITABLE_ROOTS.map((key) => [key, candidate[key]]));
    const changes = diffValues(editableCurrent, editableCandidate, '');
    if (!changes.length) throw new WorldSpecError('WorldSpec edit did not change an editable field');
    changes.forEach(assertEditableChange);
    if (changes.length > MAX_PATCHES_PER_EDIT) {
      throw new WorldSpecError(`WorldSpec edit exceeds ${MAX_PATCHES_PER_EDIT} atomic changes`);
    }
    const rationale = String(options.rationale || 'User edited WorldSpec in Create').trim();
    if (!rationale) throw new WorldSpecError('WorldSpec edit rationale is required', '$.authorship.patches');
    const revision = current.authorship.revision + 1;
    const baselineContentHash = compilerBaselineContentHash(current) || null;
    const patches = changes.map((change, index) => ({
      schema: PATCH_SCHEMA,
      id: patchId(current.id, revision, index, change),
      revision,
      authority: 'userOverride',
      author: String(options.author || 'local-user'),
      targetPath: change.path || '/',
      previousValue: patchValue(change.previousValue),
      newValue: patchValue(change.newValue),
      rationale,
      affectedObligationIds: affectedObligations(current, change),
      compilerBaselineContentHash: baselineContentHash,
    }));
    const fieldProvenance = [
      ...current.authorship.fieldProvenance,
      ...patches.map((patch) => ({
        path: patch.targetPath,
        authority: 'userOverride',
        sourceId: patch.id,
      })),
    ];
    return finalizeWorldSpec({
      ...current,
      ...editableCandidate,
      authorship: {
        ...current.authorship,
        revision,
        fieldProvenance,
        patches: [...current.authorship.patches, ...patches],
      },
    });
  }

  function assertKnownRoots(candidate) {
    for (const key of Object.keys(candidate || {})) {
      if (!KNOWN_ROOTS.has(key)) throw new WorldSpecError(`Unknown WorldSpec field ${key}`, `$.${key}`);
    }
  }

  function assertEditableChange(change) {
    const tokens = pointerTokens(change.path);
    if (tokens[0] !== 'universeGraph') return;
    const collection = tokens[1];
    if (!GRAPH_EDIT_COLLECTIONS.has(collection) || !/^\d+$/.test(tokens[2] || '')) {
      throw immutableEditError(change.path);
    }
    if (tokens.length === 3) {
      const added = change.previousValue === undefined && change.newValue !== undefined;
      const removed = change.previousValue !== undefined && change.newValue === undefined;
      if (!added && !removed) throw immutableEditError(change.path);
      if (added) assertNoInjectedEvidence(change.newValue, change.path);
      return;
    }
    if (tokens.slice(3).some((token) => GRAPH_EVIDENCE_FIELDS.has(token))) {
      throw immutableEditError(change.path);
    }
  }

  function assertNoInjectedEvidence(value, path) {
    if (Array.isArray(value)) {
      value.forEach((row, index) => assertNoInjectedEvidence(row, `${path}/${index}`));
      return;
    }
    if (!isPlainObject(value)) return;
    for (const [key, row] of Object.entries(value)) {
      if (key !== 'id' && key !== 'schema' && GRAPH_EVIDENCE_FIELDS.has(key)) {
        throw immutableEditError(`${path}/${escapePointerToken(key)}`);
      }
      assertNoInjectedEvidence(row, `${path}/${escapePointerToken(key)}`);
    }
  }

  function immutableEditError(path) {
    return new WorldSpecError('Field is compiler evidence or immutable identity', path);
  }

  function diffValues(previousValue, newValue, path) {
    if (canonicalJson(previousValue) === canonicalJson(newValue)) return [];
    if (Array.isArray(previousValue) && Array.isArray(newValue)) {
      const count = Math.max(previousValue.length, newValue.length);
      return Array.from({ length: count }, (_, index) => (
        diffValues(previousValue[index], newValue[index], `${path}/${index}`)
      )).flat();
    }
    if (isPlainObject(previousValue) && isPlainObject(newValue)) {
      const keys = Array.from(new Set([...Object.keys(previousValue), ...Object.keys(newValue)])).sort();
      return keys.flatMap((key) => diffValues(
        previousValue[key],
        newValue[key],
        `${path}/${escapePointerToken(key)}`
      ));
    }
    return [{ path: path || '/', previousValue, newValue }];
  }

  function isPlainObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }

  function escapePointerToken(value) {
    return String(value).replace(/~/g, '~0').replace(/\//g, '~1');
  }

  function patchId(specId, revision, index, change) {
    const identity = canonicalJson({ specId, revision, index, change });
    return `patch:${revision}:${fnv1a32(identity).toString(16).padStart(8, '0')}`;
  }

  function fnv1a32(value) {
    let hash = 2166136261;
    const text = String(value);
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function patchValue(value) {
    return value === undefined
      ? { schema: 'simulatte.absentValue.v1' }
      : canonicalValue(value);
  }

  function validateCompilerPatchChain(spec) {
    validateWorldSpec(spec);
    const baseline = JSON.parse(canonicalJson(spec));
    const patches = baseline.authorship.patches.slice().reverse();
    for (const patch of patches) {
      const currentValue = valueAtPointer(baseline, patch.targetPath);
      if (canonicalJson(patchValue(currentValue)) !== canonicalJson(patch.newValue)) {
        throw new WorldSpecError('Patch chain does not match the authored WorldSpec', patch.targetPath);
      }
      restorePointerValue(baseline, patch.targetPath, patch.previousValue);
    }
    return true;
  }

  function compilerBaselineContentHash(spec) {
    validateWorldSpec(spec);
    const patches = spec.authorship.patches;
    if (!patches.length) {
      const latestReconciliation = (spec.authorship.reconciliations || []).at(-1);
      return latestReconciliation && latestReconciliation.compiledWorldSpec
        ? latestReconciliation.compiledWorldSpec.contentHash
        : spec.contentHash;
    }
    validateCompilerPatchChain(spec);
    if (patches.some((patch) => patch.schema === LEGACY_PATCH_SCHEMA)) return '';
    return patches[0].compilerBaselineContentHash || '';
  }

  function pointerTokens(pointer) {
    return authorshipContract.pointerTokens(pointer, {
      allowRoot: false,
      path: '$.authorship.patches',
      fail(message, path) { throw new WorldSpecError(message, path); },
    });
  }

  function pointerParent(root, pointer) {
    const tokens = pointerTokens(pointer);
    const key = tokens.pop();
    let parent = root;
    for (const token of tokens) {
      if (!parent || typeof parent !== 'object' || !Object.hasOwn(parent, token)) {
        throw new WorldSpecError('Patch pointer does not resolve', pointer);
      }
      parent = parent[token];
    }
    if (!parent || typeof parent !== 'object') {
      throw new WorldSpecError('Patch pointer parent is not an object', pointer);
    }
    return { parent, key };
  }

  function valueAtPointer(root, pointer) {
    const { parent, key } = pointerParent(root, pointer);
    return parent[key];
  }

  function restorePointerValue(root, pointer, previousValue) {
    const { parent, key } = pointerParent(root, pointer);
    const isAbsent = previousValue && previousValue.schema === 'simulatte.absentValue.v1' &&
      Object.keys(previousValue).length === 1;
    if (isAbsent) {
      if (Array.isArray(parent)) {
        const index = Number(key);
        if (!Number.isInteger(index) || index < 0 || index >= parent.length) {
          throw new WorldSpecError('Array patch pointer is out of bounds', pointer);
        }
        parent.splice(index, 1);
      } else {
        delete parent[key];
      }
      return;
    }
    if (Array.isArray(parent)) {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0) {
        throw new WorldSpecError('Array patch pointer is invalid', pointer);
      }
      parent[index] = canonicalValue(previousValue);
      return;
    }
    parent[key] = canonicalValue(previousValue);
  }

  function affectedObligations(spec = {}, change = {}) {
    const graph = spec.universeGraph && typeof spec.universeGraph === 'object'
      ? spec.universeGraph
      : {};
    const phase4Artifact = spec.phaseArtifacts && spec.phaseArtifacts.phase4 &&
      spec.phaseArtifacts.phase4.artifact || {};
    const groundedGraph = phase4Artifact.groundedIntent &&
      phase4Artifact.groundedIntent.acceptedGraph || {};
    const obligations = uniqueObligations([
      ...(phase4Artifact.compositionLedger && phase4Artifact.compositionLedger.obligations || []),
      ...(groundedGraph.promptVisualObligations || []),
      ...(groundedGraph.compositionLedger && groundedGraph.compositionLedger.obligations || []),
      ...(graph.promptVisualObligations || []),
      ...(graph.compositionLedger && graph.compositionLedger.obligations || []),
    ]);
    const path = String(change.path || '');
    const nodeMatch = /^\/universeGraph\/nodes\/(\d+)(?:\/(.*))?$/.exec(path);
    if (nodeMatch) {
      const node = (graph.nodes || [])[Number(nodeMatch[1])];
      const propertyMatch = /^properties\/(\d+)/.exec(nodeMatch[2] || '');
      const property = node && propertyMatch
        ? (node.properties || [])[Number(propertyMatch[1])]
        : null;
      return obligationIds(obligations.filter((row) => (
        obligationTargetsNode(row, node) &&
        (!property || row.constraintKind !== 'property' || row.propertyKind === property.kind)
      )));
    }
    const edgeMatch = /^\/universeGraph\/edges\/(\d+)/.exec(path);
    if (edgeMatch) {
      const edge = (graph.edges || [])[Number(edgeMatch[1])];
      const from = (graph.nodes || []).find((node) => edge && node.id === edge.from);
      const to = (graph.nodes || []).find((node) => edge && node.id === edge.to);
      const related = obligations.filter((row) => row.kind === 'relation' && (
        obligationContainsIdentity(row, from) || obligationContainsIdentity(row, to)
      ));
      return obligationIds(related.length ? related : obligations.filter((row) => row.kind === 'relation'));
    }
    return obligationIds(obligations);
  }

  function uniqueObligations(rows = []) {
    return Array.from(new Map(rows
      .filter((row) => row && row.required === true && row.id)
      .map((row) => [String(row.id), row])).values());
  }

  function obligationIds(rows = []) {
    return rows.map((row) => String(row.id)).sort();
  }

  function obligationTargetsNode(row = {}, node = null) {
    if (!node) return false;
    if (row.targetNodeId === node.id) return true;
    return obligationContainsIdentity(row, node);
  }

  function obligationContainsIdentity(row = {}, node = null) {
    if (!node) return false;
    const identity = normalizeIdentity(node.sourceLabel || node.label || node.semanticClass || node.id);
    if (!identity) return false;
    const rowIdentity = normalizeIdentity([
      row.id,
      row.target,
      row.targetIdentity,
      row.sourceRelationId,
      ...(row.mustPreserveIds || []),
    ].filter(Boolean).join(' '));
    return ` ${rowIdentity} `.includes(` ${identity} `);
  }

  function normalizeIdentity(value = '') {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
      .split(/\s+/).map((token) => token.length > 3 && token.endsWith('s') && !/(?:ss|us|is)$/.test(token)
        ? token.slice(0, -1) : token).join(' ');
  }

  return Object.freeze({
    WORLD_SPEC_SCHEMA,
    WORLD_SPEC_VERSION,
    PREVIOUS_WORLD_SPEC_VERSION,
    LEGACY_WORLD_SPEC_VERSION,
    LEGACY_SPEC_SCHEMA,
    AUTHORING_SCHEMA,
    RECONCILIATION_SCHEMA,
    SOURCE_SCHEMA,
    PATCH_SCHEMA,
    LEGACY_PATCH_SCHEMA,
    DETERMINISM_CLASSES,
    COMPILER_EVIDENCE_ROOTS,
    EDITABLE_ROOTS,
    IMMUTABLE_EDIT_ROOTS,
    WorldSpecError,
    canonicalJson,
    contentHash,
    finalizeWorldSpec,
    validateWorldSpec,
    parseWorldSpec,
    parseWorldSpecEditCandidate,
    serializeWorldSpec,
    prepareUserEdit,
    compilerBaselineContentHash,
  });
});
