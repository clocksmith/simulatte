(function attachSimulatteWorldImprovementRecord(root, factory) {
  const worldSpec = typeof module === 'object' && module.exports
    ? require('./world-spec.js')
    : root.SimulatteWorldSpec;
  const worldProof = typeof module === 'object' && module.exports
    ? require('./world-proof.js')
    : root.SimulatteWorldProof;
  if (!worldSpec || !worldProof) {
    throw new Error('SimulatteWorldImprovementRecord requires WorldSpec and WorldProof');
  }
  const api = factory(worldSpec, worldProof);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteWorldImprovementRecord = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createWorldImprovementRecordApi(
  worldSpecContract,
  worldProofContract
) {
  const WORLD_IMPROVEMENT_RECORD_SCHEMA = 'simulatte.worldImprovementRecord.v1';
  const FAILURE_BOUNDARY_SCHEMA = 'simulatte.worldImprovementFailureBoundary.v1';
  const WORLD_SPEC_SNAPSHOT_SCHEMA = 'simulatte.worldImprovementWorldSpec.v1';
  const COMPILER_TRACE_SCHEMA = 'simulatte.worldImprovementCompilerTrace.v1';
  const COMPILER_PHASE_SCHEMA = 'simulatte.worldImprovementCompilerPhase.v1';
  const EXECUTION_SCHEMA = 'simulatte.worldImprovementExecution.v1';
  const SUCCESS_SCHEMA = 'simulatte.worldImprovementSuccess.v1';
  const INTERVENTION_SCHEMA = 'simulatte.worldImprovementIntervention.v1';
  const DIAGNOSIS_SCHEMA = 'simulatte.worldImprovementDiagnosis.v1';
  const DIVERGENCE_SCHEMA = 'simulatte.worldImprovementDivergence.v1';
  const CAUSAL_ATTRIBUTION_SCHEMA = 'simulatte.worldImprovementCausalAttribution.v1';
  const ADJUDICATION_SCHEMA = 'simulatte.worldImprovementAdjudication.v1';
  const REVIEW_SCHEMA = 'simulatte.worldImprovementHumanReview.v1';
  const POPULATION_SCHEMA = 'simulatte.worldImprovementPopulation.v1';
  const GENERALIZATION_SCHEMA = 'simulatte.worldImprovementGeneralization.v1';
  const HASH_PREFIX = 'fnv1a32:';
  const MAX_RECORD_BYTES = 16 * 1024 * 1024;
  const PROOF_PHASES = Object.freeze({
    intent: 2,
    semantic: 4,
    compilation: 5,
    simulation: 5,
    interaction: 5,
    safety: 5,
    visual: 8,
    replay: 8,
  });

  class WorldImprovementRecordError extends Error {
    constructor(message, path = '$') {
      super(`${message} at ${path}`);
      this.name = 'WorldImprovementRecordError';
      this.code = 'SIMULATTE_WORLD_IMPROVEMENT_RECORD_INVALID';
      this.path = path;
    }
  }

  function canonicalValue(value) {
    if (Array.isArray(value)) return value.map(canonicalValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().flatMap((key) => (
      value[key] === undefined ? [] : [[key, canonicalValue(value[key])]]
    )));
  }

  function canonicalJson(value, spacing = 0) {
    return JSON.stringify(canonicalValue(value), null, spacing);
  }

  function fnv1a32(value) {
    let hash = 0x811c9dc5;
    const bytes = new TextEncoder().encode(String(value || ''));
    for (const byte of bytes) {
      hash ^= byte;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
  }

  function contentHash(value) {
    const copy = canonicalValue(value || {});
    delete copy.contentHash;
    return `${HASH_PREFIX}${fnv1a32(canonicalJson(copy)).toString(16).padStart(8, '0')}`;
  }

  function clone(value) {
    return JSON.parse(canonicalJson(value));
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  function createWorldSpecSnapshot(spec) {
    worldSpecContract.validateWorldSpec(spec);
    const program = JSON.parse(worldSpecContract.serializeWorldSpec(spec));
    return {
      schema: WORLD_SPEC_SNAPSHOT_SCHEMA,
      id: String(spec.id || ''),
      contentHash: String(spec.contentHash || ''),
      revision: Number(spec.authorship && spec.authorship.revision || 0),
      program,
    };
  }

  function createCompilerTrace(spec) {
    const phases = [1, 2, 3, 4, 5, 6].map((phase) => {
      const envelope = spec.phaseArtifacts && spec.phaseArtifacts[`phase${phase}`];
      if (!envelope || typeof envelope !== 'object') {
        throw new WorldImprovementRecordError('Compiler trace is missing a phase envelope', `$.phaseArtifacts.phase${phase}`);
      }
      const snapshot = clone(envelope);
      return {
        schema: COMPILER_PHASE_SCHEMA,
        phase,
        outputSchema: String(snapshot.schema || ''),
        contentHash: contentHash(snapshot),
        runtimeReceiptId: String(snapshot.runtimeReceiptId || ''),
        receiptIds: (Array.isArray(snapshot.receipts) ? snapshot.receipts : [])
          .map((row) => String(row && row.id || ''))
          .filter(Boolean),
        envelope: snapshot,
      };
    });
    const trace = {
      schema: COMPILER_TRACE_SCHEMA,
      contentHash: '',
      phases,
    };
    trace.contentHash = contentHash(trace);
    return trace;
  }

  function createExecution(spec, report) {
    const phase7 = report && report.phase7Output;
    const phase8 = report && report.phase8Output;
    const renderExecution = phase7 && phase7.artifact && phase7.artifact.renderExecution;
    const phase8Artifact = phase8 && phase8.artifact;
    const proof = phase8Artifact && phase8Artifact.worldProof;
    const sceneProof = phase8Artifact && phase8Artifact.sceneProof;
    const binding = renderExecution && renderExecution.worldProofBinding;
    if (!phase7 || !phase8 || !renderExecution || !proof || !sceneProof || !binding) {
      throw new WorldImprovementRecordError('Execution requires bound Phase 7 and Phase 8 evidence', '$.report');
    }
    worldProofContract.validateWorldProof(proof);
    if (proof.worldSpec.contentHash !== spec.contentHash) {
      throw new WorldImprovementRecordError('WorldProof does not bind the supplied WorldSpec', '$.report.phase8Output.artifact.worldProof.worldSpec');
    }
    return {
      schema: EXECUTION_SCHEMA,
      runtimeReceiptId: String(phase7.runtimeReceiptId || ''),
      buildId: String(binding.replayIdentity && binding.replayIdentity.buildId || ''),
      runtimeId: String(binding.replayIdentity && binding.replayIdentity.runtimeId || ''),
      deviceClass: String(renderExecution.optimization && renderExecution.optimization.deviceClass || ''),
      renderDataKey: String(renderExecution.renderDataKey || ''),
      worldProofBinding: clone(binding),
      sceneProof: clone(sceneProof),
      worldProof: clone(proof),
    };
  }

  function promptHash(prompt) {
    return `${HASH_PREFIX}${fnv1a32(String(prompt || '')).toString(16).padStart(8, '0')}`;
  }

  function captureFailureBoundary(spec, report, options = {}) {
    if (!report || report.final !== true) {
      throw new WorldImprovementRecordError('Failure capture requires a final Phase 8 report', '$.report.final');
    }
    const execution = createExecution(spec, report);
    const repairableFailure = execution.sceneProof.verdict === 'fail' ||
      execution.worldProof.criticalFailures.some((row) => ['fail', 'unsupported'].includes(row.status));
    if (!repairableFailure) {
      throw new WorldImprovementRecordError('Failure boundary has no failed or unsupported critical obligation', '$.execution.worldProof');
    }
    const prompt = String(spec.source && spec.source.prompt || '');
    const boundary = {
      schema: FAILURE_BOUNDARY_SCHEMA,
      brief: {
        prompt,
        promptHash: promptHash(prompt),
      },
      worldSpec: createWorldSpecSnapshot(spec),
      compilerTrace: createCompilerTrace(spec),
      execution,
      capturedAt: requiredIso(options.nowIso || execution.worldProof.createdAt, '$.capturedAt'),
    };
    validateFailureBoundary(boundary);
    return deepFreeze(boundary);
  }

  function createWorldImprovementRecord(options = {}) {
    const boundary = clone(options.failureBoundary);
    validateFailureBoundary(boundary);
    const successfulSpec = options.successfulSpec;
    const successfulReport = options.successfulReport;
    const successExecution = createExecution(successfulSpec, successfulReport);
    if (successExecution.sceneProof.verdict !== 'pass' || successExecution.worldProof.verdict !== 'pass' ||
        successExecution.worldProof.proofClasses.replay.status !== 'pass') {
      throw new WorldImprovementRecordError('Improvement success requires passing scene, WorldProof, and replay verdicts', '$.successfulReplay.execution');
    }
    const successSpec = createWorldSpecSnapshot(successfulSpec);
    const successPrompt = String(successSpec.program.source && successSpec.program.source.prompt || '');
    if (successPrompt !== boundary.brief.prompt) {
      throw new WorldImprovementRecordError('Improvement success changed the source brief', '$.successfulReplay.worldSpec.program.source.prompt');
    }
    if (successSpec.revision <= boundary.worldSpec.revision) {
      throw new WorldImprovementRecordError('Improvement success requires a later authored WorldSpec revision', '$.successfulReplay.worldSpec.revision');
    }
    const initialPatchIds = new Set((boundary.worldSpec.program.authorship.patches || []).map((row) => row.id));
    const patches = (successSpec.program.authorship.patches || [])
      .filter((row) => !initialPatchIds.has(row.id))
      .map(clone);
    if (!patches.length) {
      throw new WorldImprovementRecordError('Improvement success requires at least one append-only user patch', '$.intervention.patches');
    }
    const record = {
      schema: WORLD_IMPROVEMENT_RECORD_SCHEMA,
      contentHash: '',
      status: 'successful-replay',
      brief: clone(boundary.brief),
      failureBoundary: boundary,
      intervention: {
        schema: INTERVENTION_SCHEMA,
        fromRevision: boundary.worldSpec.revision,
        toRevision: successSpec.revision,
        patchIds: patches.map((row) => row.id),
        affectedObligationIds: Array.from(new Set(patches.flatMap((row) => row.affectedObligationIds || []))).sort(),
        patches,
      },
      successfulReplay: {
        schema: SUCCESS_SCHEMA,
        worldSpec: successSpec,
        compilerTrace: createCompilerTrace(successfulSpec),
        execution: successExecution,
        capturedAt: requiredIso(options.nowIso || successExecution.worldProof.createdAt, '$.successfulReplay.capturedAt'),
      },
      diagnosis: createDiagnosis(boundary.execution.worldProof),
      adjudication: {
        schema: ADJUDICATION_SCHEMA,
        status: 'pending',
        review: null,
      },
      population: {
        schema: POPULATION_SCHEMA,
        partition: 'unassigned',
        suiteId: '',
        rowId: '',
      },
      generalization: {
        schema: GENERALIZATION_SCHEMA,
        status: 'not-evaluated',
        suiteId: '',
        receiptIds: [],
      },
      corpusDisposition: 'diagnostic-only',
      createdAt: requiredIso(options.nowIso || successExecution.worldProof.createdAt, '$.createdAt'),
    };
    record.contentHash = contentHash(record);
    return deepFreeze(validateWorldImprovementRecord(record));
  }

  function createDiagnosis(proof) {
    const criticalFailures = proof.criticalFailures || [];
    const observedFailures = criticalFailures.filter((row) => ['fail', 'unsupported'].includes(row.status));
    const rows = (observedFailures.length ? observedFailures : criticalFailures).map((row) => ({
      schema: DIVERGENCE_SCHEMA,
      phase: PROOF_PHASES[row.class] || 8,
      proofClass: String(row.class || ''),
      status: String(row.status || ''),
      failure: String(row.failures && row.failures[0] || 'critical proof failure'),
    })).sort((a, b) => a.phase - b.phase || a.proofClass.localeCompare(b.proofClass));
    return {
      schema: DIAGNOSIS_SCHEMA,
      earliestObservableDivergence: rows[0] || null,
      causalAttribution: {
        schema: CAUSAL_ATTRIBUTION_SCHEMA,
        status: 'not-attributed',
        ownerPhase: null,
        evidenceIds: [],
      },
    };
  }

  function adjudicateWorldImprovementRecord(record, reviewInput = {}) {
    validateWorldImprovementRecord(record);
    if (record.adjudication.status !== 'pending') {
      throw new WorldImprovementRecordError('Adjudication is append-only and already settled', '$.adjudication.status');
    }
    const status = String(reviewInput.status || '');
    if (!['accepted', 'rejected'].includes(status)) {
      throw new WorldImprovementRecordError('Human review status must be accepted or rejected', '$.adjudication.review.status');
    }
    const feedback = String(reviewInput.feedback || '').trim();
    const tags = Array.from(new Set((reviewInput.tags || []).map(String).filter(Boolean))).sort();
    if (!feedback && !tags.length) {
      throw new WorldImprovementRecordError('Human adjudication requires feedback or a review label', '$.adjudication.review');
    }
    const success = record.successfulReplay.execution;
    const review = {
      schema: REVIEW_SCHEMA,
      id: requiredString(reviewInput.id, '$.adjudication.review.id'),
      status,
      reviewer: requiredString(reviewInput.reviewer || 'local-human-reviewer', '$.adjudication.review.reviewer'),
      reviewedAt: requiredIso(reviewInput.reviewedAt, '$.adjudication.review.reviewedAt'),
      targetPhase: 'final',
      feedback,
      tags,
      buildId: requiredString(reviewInput.buildId, '$.adjudication.review.buildId'),
      artifactHash: requiredString(reviewInput.artifactHash, '$.adjudication.review.artifactHash'),
      screenshotHash: requiredString(reviewInput.screenshotHash, '$.adjudication.review.screenshotHash'),
      worldProofContentHash: requiredString(reviewInput.worldProofContentHash, '$.adjudication.review.worldProofContentHash'),
      priorRecordContentHash: record.contentHash,
    };
    if (review.buildId !== success.buildId) {
      throw new WorldImprovementRecordError('Human review build does not match the successful replay', '$.adjudication.review.buildId');
    }
    if (review.worldProofContentHash !== success.worldProof.contentHash) {
      throw new WorldImprovementRecordError('Human review does not bind the successful WorldProof', '$.adjudication.review.worldProofContentHash');
    }
    const next = clone(record);
    next.adjudication = { schema: ADJUDICATION_SCHEMA, status, review };
    next.corpusDisposition = status === 'accepted' ? 'adjudicated-positive' : 'adjudicated-negative';
    next.contentHash = contentHash(next);
    return deepFreeze(validateWorldImprovementRecord(next));
  }

  function validateWorldImprovementRecord(record) {
    requireObject(record, '$');
    requireExactKeys(record, [
      'schema', 'contentHash', 'status', 'brief', 'failureBoundary', 'intervention',
      'successfulReplay', 'diagnosis', 'adjudication', 'population', 'generalization',
      'corpusDisposition', 'createdAt',
    ], '$');
    if (record.schema !== WORLD_IMPROVEMENT_RECORD_SCHEMA) fail('Unexpected improvement record schema', '$.schema');
    if (record.status !== 'successful-replay') fail('Improvement record is not a successful replay', '$.status');
    validateBrief(record.brief, '$.brief');
    validateFailureBoundary(record.failureBoundary);
    if (canonicalJson(record.brief) !== canonicalJson(record.failureBoundary.brief)) {
      fail('Top-level brief does not match the failure boundary', '$.brief');
    }
    validateIntervention(record.intervention, record.failureBoundary, record.successfulReplay);
    validateSuccess(record.successfulReplay, record.brief);
    validateDiagnosis(record.diagnosis);
    validateAdjudication(record.adjudication, record.successfulReplay, record.contentHash);
    validatePopulation(record.population);
    validateGeneralization(record.generalization);
    const expectedDisposition = record.adjudication.status === 'pending'
      ? 'diagnostic-only'
      : record.adjudication.status === 'accepted'
        ? 'adjudicated-positive'
        : 'adjudicated-negative';
    if (record.corpusDisposition !== expectedDisposition) fail('Corpus disposition does not match adjudication', '$.corpusDisposition');
    requiredIso(record.createdAt, '$.createdAt');
    if (record.contentHash !== contentHash(record)) fail('Improvement record contentHash does not match canonical content', '$.contentHash');
    const byteLength = new TextEncoder().encode(canonicalJson(record)).byteLength;
    if (byteLength > MAX_RECORD_BYTES) fail(`Improvement record exceeds ${MAX_RECORD_BYTES} bytes`, '$');
    return record;
  }

  function validateFailureBoundary(boundary) {
    requireObject(boundary, '$.failureBoundary');
    requireExactKeys(boundary, ['schema', 'brief', 'worldSpec', 'compilerTrace', 'execution', 'capturedAt'], '$.failureBoundary');
    if (boundary.schema !== FAILURE_BOUNDARY_SCHEMA) fail('Unexpected failure boundary schema', '$.failureBoundary.schema');
    validateBrief(boundary.brief, '$.failureBoundary.brief');
    validateWorldSpecSnapshot(boundary.worldSpec, '$.failureBoundary.worldSpec');
    validateCompilerTrace(boundary.compilerTrace, '$.failureBoundary.compilerTrace');
    validateExecution(boundary.execution, boundary.worldSpec, '$.failureBoundary.execution');
    if (boundary.execution.sceneProof.verdict !== 'fail' &&
        !boundary.execution.worldProof.criticalFailures.some((row) => ['fail', 'unsupported'].includes(row.status))) {
      fail('Failure boundary has no failed or unsupported critical obligation', '$.failureBoundary.execution');
    }
    requiredIso(boundary.capturedAt, '$.failureBoundary.capturedAt');
    return boundary;
  }

  function validateSuccess(success, brief) {
    requireObject(success, '$.successfulReplay');
    requireExactKeys(success, ['schema', 'worldSpec', 'compilerTrace', 'execution', 'capturedAt'], '$.successfulReplay');
    if (success.schema !== SUCCESS_SCHEMA) fail('Unexpected success schema', '$.successfulReplay.schema');
    validateWorldSpecSnapshot(success.worldSpec, '$.successfulReplay.worldSpec');
    validateCompilerTrace(success.compilerTrace, '$.successfulReplay.compilerTrace');
    validateExecution(success.execution, success.worldSpec, '$.successfulReplay.execution');
    if (success.worldSpec.program.source.prompt !== brief.prompt) fail('Successful replay changed the brief', '$.successfulReplay.worldSpec.program.source.prompt');
    if (success.execution.sceneProof.verdict !== 'pass' || success.execution.worldProof.verdict !== 'pass' ||
        success.execution.worldProof.proofClasses.replay.status !== 'pass') {
      fail('Successful replay does not pass scene, aggregate, and replay proof', '$.successfulReplay.execution');
    }
    requiredIso(success.capturedAt, '$.successfulReplay.capturedAt');
  }

  function validateBrief(brief, path) {
    requireObject(brief, path);
    requireExactKeys(brief, ['prompt', 'promptHash'], path);
    if (typeof brief.prompt !== 'string' || !brief.prompt.trim()) fail('Improvement brief must be nonempty', `${path}.prompt`);
    if (brief.promptHash !== promptHash(brief.prompt)) fail('Improvement brief hash does not match', `${path}.promptHash`);
  }

  function validateWorldSpecSnapshot(snapshot, path) {
    requireObject(snapshot, path);
    requireExactKeys(snapshot, ['schema', 'id', 'contentHash', 'revision', 'program'], path);
    if (snapshot.schema !== WORLD_SPEC_SNAPSHOT_SCHEMA) fail('Unexpected WorldSpec snapshot schema', `${path}.schema`);
    const parsed = worldSpecContract.parseWorldSpec(canonicalJson(snapshot.program));
    if (parsed.id !== snapshot.id || parsed.contentHash !== snapshot.contentHash ||
        Number(parsed.authorship.revision || 0) !== snapshot.revision) {
      fail('WorldSpec snapshot identity does not match its program', path);
    }
  }

  function validateCompilerTrace(trace, path) {
    requireObject(trace, path);
    requireExactKeys(trace, ['schema', 'contentHash', 'phases'], path);
    if (trace.schema !== COMPILER_TRACE_SCHEMA) fail('Unexpected compiler trace schema', `${path}.schema`);
    requireArray(trace.phases, `${path}.phases`);
    if (trace.phases.length !== 6) fail('Compiler trace must contain exactly six compiled phase envelopes', `${path}.phases`);
    trace.phases.forEach((row, index) => {
      const rowPath = `${path}.phases[${index}]`;
      requireObject(row, rowPath);
      requireExactKeys(row, [
        'schema', 'phase', 'outputSchema', 'contentHash', 'runtimeReceiptId', 'receiptIds', 'envelope',
      ], rowPath);
      if (row.schema !== COMPILER_PHASE_SCHEMA || row.phase !== index + 1) fail('Compiler phases must be sequential', rowPath);
      if (!row.outputSchema || row.outputSchema !== row.envelope.schema) fail('Compiler phase output schema does not match its envelope', `${rowPath}.outputSchema`);
      if (row.contentHash !== contentHash(row.envelope)) fail('Compiler phase contentHash does not match its envelope', `${rowPath}.contentHash`);
      requireArray(row.receiptIds, `${rowPath}.receiptIds`);
    });
    if (trace.contentHash !== contentHash(trace)) fail('Compiler trace contentHash does not match', `${path}.contentHash`);
  }

  function validateExecution(execution, snapshot, path) {
    requireObject(execution, path);
    requireExactKeys(execution, [
      'schema', 'runtimeReceiptId', 'buildId', 'runtimeId', 'deviceClass', 'renderDataKey',
      'worldProofBinding', 'sceneProof', 'worldProof',
    ], path);
    if (execution.schema !== EXECUTION_SCHEMA) fail('Unexpected execution schema', `${path}.schema`);
    requireObject(execution.worldProofBinding, `${path}.worldProofBinding`);
    requireObject(execution.sceneProof, `${path}.sceneProof`);
    if (typeof execution.sceneProof.schema !== 'string' || !['pass', 'fail', 'not-proven'].includes(execution.sceneProof.verdict)) {
      fail('Execution scene proof is invalid', `${path}.sceneProof`);
    }
    worldProofContract.validateWorldProof(execution.worldProof);
    if (execution.worldProof.worldSpec.contentHash !== snapshot.contentHash ||
        execution.worldProof.worldSpec.revision !== snapshot.revision ||
        execution.worldProofBinding.worldSpec.contentHash !== snapshot.contentHash) {
      fail('Execution evidence does not bind its WorldSpec snapshot', path);
    }
    if (execution.buildId !== String(execution.worldProofBinding.replayIdentity && execution.worldProofBinding.replayIdentity.buildId || '')) {
      fail('Execution build identity does not match WorldProof binding', `${path}.buildId`);
    }
  }

  function validateIntervention(intervention, failure, success) {
    const path = '$.intervention';
    requireObject(intervention, path);
    requireExactKeys(intervention, [
      'schema', 'fromRevision', 'toRevision', 'patchIds', 'affectedObligationIds', 'patches',
    ], path);
    if (intervention.schema !== INTERVENTION_SCHEMA) fail('Unexpected intervention schema', `${path}.schema`);
    if (intervention.fromRevision !== failure.worldSpec.revision ||
        intervention.toRevision !== success.worldSpec.revision ||
        intervention.toRevision <= intervention.fromRevision) fail('Intervention revisions do not bind the two WorldSpecs', path);
    requireArray(intervention.patchIds, `${path}.patchIds`);
    requireArray(intervention.affectedObligationIds, `${path}.affectedObligationIds`);
    requireArray(intervention.patches, `${path}.patches`);
    if (!intervention.patches.length || canonicalJson(intervention.patchIds) !==
        canonicalJson(intervention.patches.map((row) => row.id))) fail('Intervention patch identities are incomplete', path);
    const finalPatches = new Map(success.worldSpec.program.authorship.patches.map((row) => [row.id, row]));
    intervention.patches.forEach((patch) => {
      if (!finalPatches.has(patch.id) || canonicalJson(finalPatches.get(patch.id)) !== canonicalJson(patch)) {
        fail('Intervention patch does not match final WorldSpec authorship', `${path}.patches`);
      }
    });
  }

  function validateDiagnosis(diagnosis) {
    requireObject(diagnosis, '$.diagnosis');
    requireExactKeys(diagnosis, ['schema', 'earliestObservableDivergence', 'causalAttribution'], '$.diagnosis');
    if (diagnosis.schema !== DIAGNOSIS_SCHEMA) fail('Unexpected diagnosis schema', '$.diagnosis.schema');
    if (diagnosis.earliestObservableDivergence !== null) {
      const row = diagnosis.earliestObservableDivergence;
      requireExactKeys(row, ['schema', 'phase', 'proofClass', 'status', 'failure'], '$.diagnosis.earliestObservableDivergence');
      if (row.schema !== DIVERGENCE_SCHEMA || !Number.isInteger(row.phase) || row.phase < 1 || row.phase > 8) {
        fail('Earliest observable divergence is invalid', '$.diagnosis.earliestObservableDivergence');
      }
    }
    const causal = diagnosis.causalAttribution;
    requireExactKeys(causal, ['schema', 'status', 'ownerPhase', 'evidenceIds'], '$.diagnosis.causalAttribution');
    if (causal.schema !== CAUSAL_ATTRIBUTION_SCHEMA || causal.status !== 'not-attributed' || causal.ownerPhase !== null) {
      fail('Runtime correction records cannot claim causal ownership without substitution evidence', '$.diagnosis.causalAttribution');
    }
    requireArray(causal.evidenceIds, '$.diagnosis.causalAttribution.evidenceIds');
  }

  function validateAdjudication(adjudication, success) {
    requireObject(adjudication, '$.adjudication');
    requireExactKeys(adjudication, ['schema', 'status', 'review'], '$.adjudication');
    if (adjudication.schema !== ADJUDICATION_SCHEMA || !['pending', 'accepted', 'rejected'].includes(adjudication.status)) {
      fail('Unexpected adjudication state', '$.adjudication');
    }
    if (adjudication.status === 'pending') {
      if (adjudication.review !== null) fail('Pending adjudication cannot contain a review', '$.adjudication.review');
      return;
    }
    const review = adjudication.review;
    requireObject(review, '$.adjudication.review');
    requireExactKeys(review, [
      'schema', 'id', 'status', 'reviewer', 'reviewedAt', 'targetPhase', 'feedback', 'tags',
      'buildId', 'artifactHash', 'screenshotHash', 'worldProofContentHash', 'priorRecordContentHash',
    ], '$.adjudication.review');
    if (review.schema !== REVIEW_SCHEMA || review.status !== adjudication.status || review.targetPhase !== 'final') {
      fail('Human review does not match adjudication state', '$.adjudication.review');
    }
    for (const key of ['id', 'reviewer', 'buildId', 'artifactHash', 'screenshotHash', 'worldProofContentHash', 'priorRecordContentHash']) {
      requiredString(review[key], `$.adjudication.review.${key}`);
    }
    requiredIso(review.reviewedAt, '$.adjudication.review.reviewedAt');
    requireArray(review.tags, '$.adjudication.review.tags');
    if (!String(review.feedback || '').trim() && !review.tags.length) fail('Human review has no judgment', '$.adjudication.review');
    if (review.buildId !== success.execution.buildId ||
        review.worldProofContentHash !== success.execution.worldProof.contentHash) {
      fail('Human review is not bound to successful execution evidence', '$.adjudication.review');
    }
  }

  function validatePopulation(population) {
    requireObject(population, '$.population');
    requireExactKeys(population, ['schema', 'partition', 'suiteId', 'rowId'], '$.population');
    if (population.schema !== POPULATION_SCHEMA || population.partition !== 'unassigned' ||
        population.suiteId !== '' || population.rowId !== '') {
      fail('Browser-created records must remain outside train, selection, and held-out populations', '$.population');
    }
  }

  function validateGeneralization(generalization) {
    requireObject(generalization, '$.generalization');
    requireExactKeys(generalization, ['schema', 'status', 'suiteId', 'receiptIds'], '$.generalization');
    if (generalization.schema !== GENERALIZATION_SCHEMA || generalization.status !== 'not-evaluated' ||
        generalization.suiteId !== '') fail('Runtime record cannot claim unevaluated generalization', '$.generalization');
    requireArray(generalization.receiptIds, '$.generalization.receiptIds');
  }

  function serializeWorldImprovementRecord(record) {
    validateWorldImprovementRecord(record);
    return canonicalJson(record, 2);
  }

  function requiredString(value, path) {
    if (typeof value !== 'string' || !value.trim()) fail('Expected a nonempty string', path);
    return value;
  }

  function requiredIso(value, path) {
    requiredString(value, path);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || Number.isNaN(Date.parse(value))) {
      fail('Expected an ISO-8601 UTC timestamp', path);
    }
    return value;
  }

  function requireExactKeys(value, allowed, path) {
    requireObject(value, path);
    const names = new Set(allowed);
    for (const key of Object.keys(value)) if (!names.has(key)) fail(`Unknown field ${key}`, `${path}.${key}`);
    for (const key of allowed) if (!Object.hasOwn(value, key)) fail(`Missing field ${key}`, `${path}.${key}`);
  }

  function requireObject(value, path) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Expected an object', path);
  }

  function requireArray(value, path) {
    if (!Array.isArray(value)) fail('Expected an array', path);
  }

  function fail(message, path) {
    throw new WorldImprovementRecordError(message, path);
  }

  return Object.freeze({
    WORLD_IMPROVEMENT_RECORD_SCHEMA,
    FAILURE_BOUNDARY_SCHEMA,
    WORLD_SPEC_SNAPSHOT_SCHEMA,
    COMPILER_TRACE_SCHEMA,
    EXECUTION_SCHEMA,
    REVIEW_SCHEMA,
    MAX_RECORD_BYTES,
    WorldImprovementRecordError,
    canonicalJson,
    contentHash,
    captureFailureBoundary,
    createWorldImprovementRecord,
    adjudicateWorldImprovementRecord,
    validateWorldImprovementRecord,
    serializeWorldImprovementRecord,
  });
});
