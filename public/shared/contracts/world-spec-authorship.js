(function attachSimulatteWorldSpecAuthorship(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteWorldSpecAuthorship = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createWorldSpecAuthorshipApi() {
  const PROHIBITED_POINTER_TOKENS = new Set(['__proto__', 'prototype', 'constructor']);

  function validateAuthorship(authorship, options = {}) {
    const fail = requiredFunction(options.fail, 'WorldSpec authorship validation requires fail');
    const authorities = new Set(options.authorities || []);
    const currentPatchSchema = String(options.currentPatchSchema || '');
    const legacyPatchSchema = String(options.legacyPatchSchema || '');
    const contentHashPrefix = String(options.contentHashPrefix || '');
    requireObject(authorship, '$.authorship', fail);
    requireExactKeys(
      authorship,
      ['schema', 'revision', 'sources', 'fieldProvenance', 'patches', 'reconciliations'],
      '$.authorship',
      fail
    );
    if (authorship.schema !== options.authoringSchema) fail(`Expected ${options.authoringSchema}`, '$.authorship.schema');
    if (!Number.isInteger(authorship.revision) || authorship.revision < 0) {
      fail('Authorship revision must be a nonnegative integer', '$.authorship.revision');
    }
    requireArray(authorship.sources, '$.authorship.sources', fail);
    requireArray(authorship.fieldProvenance, '$.authorship.fieldProvenance', fail);
    requireArray(authorship.patches, '$.authorship.patches', fail);
    requireArray(authorship.reconciliations, '$.authorship.reconciliations', fail);

    const sourceAuthorities = new Map();
    authorship.sources.forEach((source, index) => {
      const path = `$.authorship.sources[${index}]`;
      requireObject(source, path, fail);
      requireExactKeys(source, ['id', 'authority', 'label'], path, fail);
      requireString(source.id, `${path}.id`, fail);
      requireString(source.authority, `${path}.authority`, fail);
      requireString(source.label, `${path}.label`, fail);
      if (!authorities.has(source.authority)) fail('Unknown field authority', `${path}.authority`);
      if (sourceAuthorities.has(source.id)) fail('Authorship source ids must be unique', `${path}.id`);
      sourceAuthorities.set(source.id, source.authority);
    });

    authorship.fieldProvenance.forEach((row, index) => {
      const path = `$.authorship.fieldProvenance[${index}]`;
      requireObject(row, path, fail);
      requireExactKeys(row, ['path', 'authority', 'sourceId'], path, fail);
      requireString(row.path, `${path}.path`, fail);
      requireString(row.authority, `${path}.authority`, fail);
      requireString(row.sourceId, `${path}.sourceId`, fail);
      if (!authorities.has(row.authority)) fail('Unknown field authority', `${path}.authority`);
      pointerTokens(row.path, { allowRoot: true, path: `${path}.path`, fail });
    });

    const patchAuthorities = new Map();
    const patchRevisions = new Set();
    let previousPatchRevision = 0;
    authorship.patches.forEach((patch, index) => {
      const path = `$.authorship.patches[${index}]`;
      requireObject(patch, path, fail);
      const isCurrent = patch.schema === currentPatchSchema;
      if (!isCurrent && patch.schema !== legacyPatchSchema) {
        fail(`Expected ${currentPatchSchema} or ${legacyPatchSchema}`, `${path}.schema`);
      }
      requireExactKeys(patch, [
        'schema', 'id', 'revision', 'authority', 'author', 'targetPath', 'previousValue',
        'newValue', 'rationale', 'affectedObligationIds',
        ...(isCurrent ? ['compilerBaselineContentHash'] : []),
      ], path, fail);
      for (const key of ['id', 'authority', 'author', 'targetPath', 'rationale']) {
        requireString(patch[key], `${path}.${key}`, fail);
      }
      if (isCurrent && patch.compilerBaselineContentHash !== null && (
        typeof patch.compilerBaselineContentHash !== 'string' ||
        !patch.compilerBaselineContentHash.startsWith(contentHashPrefix)
      )) fail('Patch compiler baseline must be content-addressed or null', `${path}.compilerBaselineContentHash`);
      requireArray(patch.affectedObligationIds, `${path}.affectedObligationIds`, fail);
      if (patch.authority !== 'userOverride') fail('Patch authority must be userOverride', `${path}.authority`);
      if (!Number.isInteger(patch.revision) || patch.revision < 1) {
        fail('Patch revision must be a positive integer', `${path}.revision`);
      }
      if (patch.revision > authorship.revision) fail('Patch revision exceeds authorship revision', `${path}.revision`);
      if (patch.revision < previousPatchRevision) fail('Patch revisions must be append-only', `${path}.revision`);
      if (patchAuthorities.has(patch.id)) fail('Patch ids must be unique', `${path}.id`);
      patchAuthorities.set(patch.id, patch.authority);
      patchRevisions.add(patch.revision);
      previousPatchRevision = patch.revision;
      pointerTokens(patch.targetPath, { allowRoot: false, path: `${path}.targetPath`, fail });
    });

    const missingRevision = Array.from({ length: authorship.revision }, (_, index) => index + 1)
      .find((revision) => !patchRevisions.has(revision));
    if (patchRevisions.size !== authorship.revision || missingRevision) {
      fail('Authorship revision does not match patch history', '$.authorship.revision');
    }
    const provenanceKeys = new Set();
    authorship.fieldProvenance.forEach((row, index) => {
      const path = `$.authorship.fieldProvenance[${index}]`;
      const referenceAuthority = sourceAuthorities.has(row.sourceId)
        ? sourceAuthorities.get(row.sourceId)
        : patchAuthorities.get(row.sourceId);
      if (!referenceAuthority) fail('Field provenance sourceId does not resolve', `${path}.sourceId`);
      if (row.authority !== referenceAuthority) {
        fail('Field provenance authority does not match its source', `${path}.authority`);
      }
      const key = `${row.path}\u0000${row.sourceId}`;
      if (provenanceKeys.has(key)) fail('Field provenance rows must be unique', path);
      provenanceKeys.add(key);
    });
    authorship.patches.forEach((patch, index) => {
      const hasProvenance = authorship.fieldProvenance.some((row) => (
        row.path === patch.targetPath && row.sourceId === patch.id && row.authority === patch.authority
      ));
      if (!hasProvenance) fail('Patch is missing field provenance', `$.authorship.patches[${index}]`);
    });
    const baselines = authorship.patches
      .filter((patch) => patch.schema === currentPatchSchema)
      .map((patch) => patch.compilerBaselineContentHash);
    if (new Set(baselines).size > 1) fail('All patches must retain one compiler baseline', '$.authorship.patches');
    validateReconciliations(authorship.reconciliations, {
      contentHashPrefix,
      reconciliationSchema: String(options.reconciliationSchema || ''),
      fail,
    });
    return authorship;
  }

  function validateReconciliations(rows, options) {
    const ids = new Set();
    rows.forEach((row, index) => {
      const path = `$.authorship.reconciliations[${index}]`;
      requireObject(row, path, options.fail);
      requireExactKeys(row, [
        'schema', 'id', 'decision', 'decidedBy', 'previousWorldSpec',
        'compiledWorldSpec', 'effectiveOverrides',
      ], path, options.fail);
      if (row.schema !== options.reconciliationSchema) {
        options.fail(`Expected ${options.reconciliationSchema}`, `${path}.schema`);
      }
      for (const key of ['id', 'decision', 'decidedBy']) {
        requireString(row[key], `${path}.${key}`, options.fail);
      }
      if (!['preserve-overrides', 'accept-recompiled'].includes(row.decision)) {
        options.fail('Unknown reconciliation decision', `${path}.decision`);
      }
      if (ids.has(row.id)) options.fail('Reconciliation ids must be unique', `${path}.id`);
      ids.add(row.id);
      validatePreviousWorldSpec(row.previousWorldSpec, `${path}.previousWorldSpec`, options);
      validateCompiledWorldSpec(row.compiledWorldSpec, `${path}.compiledWorldSpec`, options);
      requireArray(row.effectiveOverrides, `${path}.effectiveOverrides`, options.fail);
      const targets = new Set();
      row.effectiveOverrides.forEach((override, overrideIndex) => {
        const overridePath = `${path}.effectiveOverrides[${overrideIndex}]`;
        requireObject(override, overridePath, options.fail);
        requireExactKeys(override, [
          'targetPath', 'priorCompilerValue', 'acceptedValue', 'recompiledValue', 'status',
        ], overridePath, options.fail);
        requireString(override.targetPath, `${overridePath}.targetPath`, options.fail);
        pointerTokens(override.targetPath, {
          allowRoot: false,
          path: `${overridePath}.targetPath`,
          fail: options.fail,
        });
        if (!['unchanged-baseline', 'already-applied', 'compiler-conflict', 'unavailable'].includes(override.status)) {
          options.fail('Unknown reconciliation override status', `${overridePath}.status`);
        }
        if (targets.has(override.targetPath)) {
          options.fail('Reconciliation target paths must be unique', `${overridePath}.targetPath`);
        }
        targets.add(override.targetPath);
      });
    });
  }

  function validatePreviousWorldSpec(value, path, options) {
    requireObject(value, path, options.fail);
    requireExactKeys(value, ['id', 'contentHash', 'revision', 'patchIds'], path, options.fail);
    requireString(value.id, `${path}.id`, options.fail);
    requireContentHash(value.contentHash, `${path}.contentHash`, options);
    if (!Number.isInteger(value.revision) || value.revision < 1) {
      options.fail('Previous WorldSpec revision must be positive', `${path}.revision`);
    }
    requireArray(value.patchIds, `${path}.patchIds`, options.fail);
    if (!value.patchIds.length || new Set(value.patchIds).size !== value.patchIds.length) {
      options.fail('Previous WorldSpec patchIds must be nonempty and unique', `${path}.patchIds`);
    }
    value.patchIds.forEach((id, index) => requireString(id, `${path}.patchIds[${index}]`, options.fail));
  }

  function validateCompiledWorldSpec(value, path, options) {
    requireObject(value, path, options.fail);
    requireExactKeys(value, ['id', 'contentHash', 'revision'], path, options.fail);
    requireString(value.id, `${path}.id`, options.fail);
    requireContentHash(value.contentHash, `${path}.contentHash`, options);
    if (value.revision !== 0) options.fail('Compiled WorldSpec revision must be zero', `${path}.revision`);
  }

  function requireContentHash(value, path, options) {
    if (typeof value !== 'string' || !value.startsWith(options.contentHashPrefix)) {
      options.fail('WorldSpec identity must be content-addressed', path);
    }
  }

  function pointerTokens(pointer, options = {}) {
    const fail = requiredFunction(options.fail, 'WorldSpec pointer validation requires fail');
    const path = String(options.path || '$');
    const allowRoot = options.allowRoot === true;
    if (typeof pointer !== 'string' || !pointer.startsWith('/') || (!allowRoot && pointer === '/')) {
      fail(allowRoot
        ? 'Field provenance path must be a JSON pointer'
        : 'Patch targetPath must be a non-root JSON pointer', path);
    }
    if (pointer === '/') return [];
    const encoded = pointer.slice(1).split('/');
    if (encoded.some((token) => /~(?![01])/u.test(token))) fail('JSON pointer contains an invalid escape', path);
    const tokens = encoded.map((token) => token.replace(/~1/g, '/').replace(/~0/g, '~'));
    if (tokens.some((token) => PROHIBITED_POINTER_TOKENS.has(token))) {
      fail('JSON pointer contains a prohibited segment', path);
    }
    return tokens;
  }

  function requireObject(value, path, fail) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Expected an object', path);
  }

  function requireArray(value, path, fail) {
    if (!Array.isArray(value)) fail('Expected an array', path);
  }

  function requireString(value, path, fail) {
    if (typeof value !== 'string' || !value.trim()) fail('Expected a nonempty string', path);
  }

  function requireExactKeys(value, allowed, path, fail) {
    const names = new Set(allowed);
    for (const key of Object.keys(value || {})) if (!names.has(key)) fail(`Unknown field ${key}`, `${path}.${key}`);
    for (const key of allowed) if (!Object.hasOwn(value, key)) fail(`Missing field ${key}`, `${path}.${key}`);
  }

  function requiredFunction(value, message) {
    if (typeof value !== 'function') throw new Error(message);
    return value;
  }

  return Object.freeze({ validateAuthorship, pointerTokens });
});
