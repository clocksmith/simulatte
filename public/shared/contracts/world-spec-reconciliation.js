(function attachSimulatteWorldSpecReconciliation(root, factory) {
  const worldSpec = typeof module === 'object' && module.exports
    ? require('./world-spec.js')
    : root.SimulatteWorldSpec;
  if (!worldSpec) throw new Error('WorldSpec reconciliation requires the WorldSpec contract');
  const api = factory(worldSpec);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteWorldSpecReconciliation = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createReconciliationApi(worldSpec) {
  const PLAN_SCHEMA = 'simulatte.worldSpecReconciliationPlan.v1';
  const RECEIPT_SCHEMA = 'simulatte.worldSpecReconciliationReceipt.v1';
  const ABSENT_SCHEMA = 'simulatte.absentValue.v1';
  const DECISIONS = Object.freeze(['preserve-overrides', 'accept-recompiled']);
  const DECISION_SET = new Set(DECISIONS);
  const PROHIBITED_POINTER_TOKENS = new Set(['__proto__', 'prototype', 'constructor']);

  class WorldSpecReconciliationError extends Error {
    constructor(message, code = 'SIMULATTE_WORLD_SPEC_RECONCILIATION_INVALID') {
      super(message);
      this.name = 'WorldSpecReconciliationError';
      this.code = code;
    }
  }

  function needsReconciliation(spec) {
    return Boolean(
      spec && spec.authorship && Number(spec.authorship.revision || 0) > 0 &&
      Array.isArray(spec.authorship.patches) && spec.authorship.patches.length
    );
  }

  function createPlan(authoredSpec, compiledSpec) {
    worldSpec.validateWorldSpec(authoredSpec);
    worldSpec.validateWorldSpec(compiledSpec);
    if (!needsReconciliation(authoredSpec)) {
      throw new WorldSpecReconciliationError('Reconciliation requires accepted user overrides');
    }
    if (Number(compiledSpec.authorship.revision || 0) !== 0 || compiledSpec.authorship.patches.length ||
        compiledSpec.authorship.reconciliations.length) {
      throw new WorldSpecReconciliationError('Recompiled candidate must be an unedited compiler baseline');
    }
    const effectiveOverrides = effectivePatchRows(authoredSpec.authorship.patches).map((row) => {
      const compiled = readPointer(compiledSpec, row.targetPath);
      const accepted = decodedPatchValue(row.acceptedValue);
      const prior = decodedPatchValue(row.priorCompilerValue);
      const canWrite = canWritePointer(compiledSpec, row.targetPath, accepted.exists);
      const status = !canWrite
        ? 'unavailable'
        : samePointerValue(compiled, accepted)
          ? 'already-applied'
          : samePointerValue(compiled, prior)
            ? 'unchanged-baseline'
            : 'compiler-conflict';
      return {
        targetPath: row.targetPath,
        priorCompilerValue: cloneValue(row.priorCompilerValue),
        acceptedValue: cloneValue(row.acceptedValue),
        recompiledValue: encodedPointerValue(compiled),
        status,
      };
    });
    const identity = {
      authoredWorldSpec: specIdentity(authoredSpec),
      compiledWorldSpec: specIdentity(compiledSpec),
      patchIds: authoredSpec.authorship.patches.map((patch) => patch.id),
      effectiveOverrides,
    };
    return Object.freeze({
      schema: PLAN_SCHEMA,
      id: `reconciliation-plan:${hashValue(identity)}`,
      authoredWorldSpec: identity.authoredWorldSpec,
      compiledWorldSpec: identity.compiledWorldSpec,
      acceptedPatchIds: identity.patchIds,
      effectiveOverrides,
      conflictCount: effectiveOverrides.filter((row) => row.status === 'compiler-conflict').length,
      unavailableCount: effectiveOverrides.filter((row) => row.status === 'unavailable').length,
      preserveAllowed: effectiveOverrides.every((row) => row.status !== 'unavailable'),
    });
  }

  function applyDecision(authoredSpec, compiledSpec, decision, options = {}) {
    if (!DECISION_SET.has(decision)) {
      throw new WorldSpecReconciliationError(`Unknown reconciliation decision ${String(decision || 'missing')}`);
    }
    const plan = createPlan(authoredSpec, compiledSpec);
    if (options.planId && options.planId !== plan.id) {
      throw new WorldSpecReconciliationError('Reconciliation plan no longer matches the compiled candidate');
    }
    if (decision === 'preserve-overrides' && !plan.preserveAllowed) {
      throw new WorldSpecReconciliationError(
        'Accepted overrides cannot be applied to the recompiled structure',
        'SIMULATTE_WORLD_SPEC_RECONCILIATION_CONFLICT'
      );
    }
    const decidedBy = String(options.decidedBy || 'local-user').trim();
    if (!decidedBy) throw new WorldSpecReconciliationError('Reconciliation decision requires an author');
    const record = reconciliationRecord(plan, decision, decidedBy);
    let reconciled = compiledSpec;
    if (decision === 'preserve-overrides') {
      const candidate = cloneValue(compiledSpec);
      const operations = plan.effectiveOverrides
        .filter((row) => row.status !== 'already-applied')
        .slice()
        .sort(comparePointerOperations);
      operations.forEach((row) => writePointer(candidate, row.targetPath, decodedPatchValue(row.acceptedValue)));
      if (worldSpec.canonicalJson(candidate) !== worldSpec.canonicalJson(compiledSpec)) {
        reconciled = worldSpec.prepareUserEdit(compiledSpec, candidate, {
          author: decidedBy,
          rationale: `Preserve accepted overrides during recompile from ${authoredSpec.contentHash}`,
        });
      }
    }
    reconciled = worldSpec.finalizeWorldSpec({
      ...reconciled,
      authorship: {
        ...reconciled.authorship,
        reconciliations: [
          ...(authoredSpec.authorship.reconciliations || []).map(cloneValue),
          record,
        ],
      },
    });
    return Object.freeze({
      worldSpec: reconciled,
      receipt: Object.freeze({
        schema: RECEIPT_SCHEMA,
        id: record.id,
        planId: plan.id,
        decision,
        decidedBy,
        previousWorldSpecContentHash: authoredSpec.contentHash,
        compiledWorldSpecContentHash: compiledSpec.contentHash,
        resultWorldSpecContentHash: reconciled.contentHash,
        acceptedPatchIds: plan.acceptedPatchIds.slice(),
        effectiveOverrideCount: plan.effectiveOverrides.length,
        conflictCount: plan.conflictCount,
        unavailableCount: plan.unavailableCount,
        preservedTargetPaths: decision === 'preserve-overrides'
          ? plan.effectiveOverrides.map((row) => row.targetPath)
          : [],
      }),
    });
  }

  function effectivePatchRows(patches) {
    const byPath = new Map();
    patches.forEach((patch) => {
      const existing = byPath.get(patch.targetPath);
      if (!existing) {
        byPath.set(patch.targetPath, {
          targetPath: patch.targetPath,
          priorCompilerValue: cloneValue(patch.previousValue),
          acceptedValue: cloneValue(patch.newValue),
        });
      } else {
        existing.acceptedValue = cloneValue(patch.newValue);
      }
    });
    return Array.from(byPath.values()).sort((a, b) => a.targetPath.localeCompare(b.targetPath));
  }

  function reconciliationRecord(plan, decision, decidedBy) {
    const effectiveOverrides = plan.effectiveOverrides.map((row) => ({
      targetPath: row.targetPath,
      priorCompilerValue: cloneValue(row.priorCompilerValue),
      acceptedValue: cloneValue(row.acceptedValue),
      recompiledValue: cloneValue(row.recompiledValue),
      status: row.status,
    }));
    const content = {
      schema: worldSpec.RECONCILIATION_SCHEMA,
      decision,
      decidedBy,
      previousWorldSpec: {
        id: plan.authoredWorldSpec.id,
        contentHash: plan.authoredWorldSpec.contentHash,
        revision: plan.authoredWorldSpec.revision,
        patchIds: plan.acceptedPatchIds.slice(),
      },
      compiledWorldSpec: {
        id: plan.compiledWorldSpec.id,
        contentHash: plan.compiledWorldSpec.contentHash,
        revision: plan.compiledWorldSpec.revision,
      },
      effectiveOverrides,
    };
    return {
      ...content,
      id: `reconciliation:${hashValue(content)}`,
    };
  }

  function specIdentity(spec) {
    return {
      id: spec.id,
      contentHash: spec.contentHash,
      revision: Number(spec.authorship.revision || 0),
    };
  }

  function readPointer(value, pointer) {
    const tokens = pointerTokens(pointer);
    let current = value;
    for (const token of tokens) {
      if (!current || typeof current !== 'object' || !Object.hasOwn(current, token)) {
        return { exists: false, value: undefined };
      }
      current = current[token];
    }
    return { exists: true, value: cloneValue(current) };
  }

  function canWritePointer(value, pointer, acceptedExists) {
    const tokens = pointerTokens(pointer);
    const key = tokens.pop();
    let parent = value;
    for (const token of tokens) {
      if (!parent || typeof parent !== 'object' || !Object.hasOwn(parent, token)) return !acceptedExists;
      parent = parent[token];
    }
    if (!parent || typeof parent !== 'object') return !acceptedExists;
    if (!Array.isArray(parent)) return true;
    if (!/^\d+$/.test(key)) return false;
    const index = Number(key);
    return acceptedExists ? index <= parent.length : index < parent.length || index === parent.length;
  }

  function writePointer(value, pointer, next) {
    const tokens = pointerTokens(pointer);
    const key = tokens.pop();
    let parent = value;
    for (const token of tokens) parent = parent[token];
    if (Array.isArray(parent)) {
      const index = Number(key);
      if (next.exists) {
        if (index === parent.length) parent.push(cloneValue(next.value));
        else parent[index] = cloneValue(next.value);
      } else if (index < parent.length) parent.splice(index, 1);
    } else if (next.exists) {
      parent[key] = cloneValue(next.value);
    } else {
      delete parent[key];
    }
  }

  function pointerTokens(pointer) {
    if (typeof pointer !== 'string' || !pointer.startsWith('/') || pointer === '/') {
      throw new WorldSpecReconciliationError('Override target must be a non-root JSON pointer');
    }
    const encoded = pointer.slice(1).split('/');
    if (encoded.some((token) => /~(?![01])/u.test(token))) {
      throw new WorldSpecReconciliationError('Override target contains an invalid JSON pointer escape');
    }
    const tokens = encoded.map((token) => token.replace(/~1/g, '/').replace(/~0/g, '~'));
    if (tokens.some((token) => PROHIBITED_POINTER_TOKENS.has(token))) {
      throw new WorldSpecReconciliationError('Override target contains a prohibited path segment');
    }
    return tokens;
  }

  function comparePointerOperations(a, b) {
    const aAbsent = !decodedPatchValue(a.acceptedValue).exists;
    const bAbsent = !decodedPatchValue(b.acceptedValue).exists;
    if (aAbsent !== bAbsent) return aAbsent ? -1 : 1;
    if (aAbsent) {
      const aTokens = pointerTokens(a.targetPath);
      const bTokens = pointerTokens(b.targetPath);
      const aParent = aTokens.slice(0, -1).join('/');
      const bParent = bTokens.slice(0, -1).join('/');
      if (aParent === bParent && /^\d+$/.test(aTokens.at(-1)) && /^\d+$/.test(bTokens.at(-1))) {
        return Number(bTokens.at(-1)) - Number(aTokens.at(-1));
      }
    }
    return a.targetPath.localeCompare(b.targetPath);
  }

  function decodedPatchValue(value) {
    return isAbsent(value)
      ? { exists: false, value: undefined }
      : { exists: true, value: cloneValue(value) };
  }

  function encodedPointerValue(pointerValue) {
    return pointerValue.exists ? cloneValue(pointerValue.value) : { schema: ABSENT_SCHEMA };
  }

  function samePointerValue(a, b) {
    return a.exists === b.exists && (!a.exists || worldSpec.canonicalJson(a.value) === worldSpec.canonicalJson(b.value));
  }

  function isAbsent(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
      value.schema === ABSENT_SCHEMA && Object.keys(value).length === 1);
  }

  function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function hashValue(value) {
    const text = worldSpec.canonicalJson(value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  return Object.freeze({
    PLAN_SCHEMA,
    RECEIPT_SCHEMA,
    DECISIONS,
    WorldSpecReconciliationError,
    needsReconciliation,
    createPlan,
    applyDecision,
  });
});
