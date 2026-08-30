(function attachSimulatteWorldImprovementSession(root, factory) {
  const recordContract = typeof module === 'object' && module.exports
    ? require('../../../shared/contracts/world-improvement-record.js')
    : root.SimulatteWorldImprovementRecord;
  if (!recordContract) {
    throw new Error('SimulatteWorldImprovementSession requires the improvement record contract');
  }
  const api = factory(recordContract);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteWorldImprovementSession = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createWorldImprovementSessionApi(
  recordContract
) {
  function create(options = {}) {
    let failureBoundaries = [];
    let currentRecord = null;
    let activePrompt = '';
    let diagnostics = diagnostic('idle');
    const diagnosticHistory = [diagnostics];
    const records = [];

    function recordDiagnostic(status, spec = null, proof = null, error = null) {
      diagnostics = diagnostic(status, spec, proof, failureBoundaries, error);
      diagnosticHistory.push(diagnostics);
      if (diagnosticHistory.length > 64) diagnosticHistory.shift();
    }

    function observeSpec(spec) {
      const prompt = sourcePrompt(spec);
      if (!prompt) return null;
      if (activePrompt && prompt !== activePrompt) {
        failureBoundaries = [];
        currentRecord = null;
        recordDiagnostic('prompt-changed', spec);
      }
      activePrompt = prompt;
      recordDiagnostic('spec-observed', spec);
      return currentRecord;
    }

    function observeProof(spec, report) {
      observeSpec(spec);
      const proof = report && report.phase8Output && report.phase8Output.artifact &&
        report.phase8Output.artifact.worldProof;
      const sceneProof = report && report.phase8Output && report.phase8Output.artifact &&
        report.phase8Output.artifact.sceneProof;
      if (!spec || !proof || !sceneProof || report.final !== true) return currentRecord;
      if (repairableFailure(proof, sceneProof)) {
        const nextKey = `${spec.contentHash}:${proof.contentHash}`;
        if (!failureBoundaries.some((entry) => entry.key === nextKey)) {
          let boundary;
          try {
            boundary = recordContract.captureFailureBoundary(spec, report, {
              nowIso: proof.createdAt,
            });
          } catch (error) {
            recordDiagnostic('failure-rejected', spec, proof, error);
            throw error;
          }
          failureBoundaries.push({ key: nextKey, boundary });
          currentRecord = null;
        }
        recordDiagnostic('failure-captured', spec, proof);
        return null;
      }
      if (!successfulReplay(proof, sceneProof)) {
        recordDiagnostic('replay-not-passing', spec, proof);
        return currentRecord;
      }
      const failureBoundary = matchingFailureBoundary(spec, failureBoundaries);
      if (!failureBoundary) {
        recordDiagnostic('failure-lineage-not-matched', spec, proof);
        return currentRecord;
      }
      let next;
      try {
        next = recordContract.createWorldImprovementRecord({
          failureBoundary,
          successfulSpec: spec,
          successfulReport: report,
          nowIso: proof.createdAt,
        });
      } catch (error) {
        recordDiagnostic('record-rejected', spec, proof, error);
        throw error;
      }
      currentRecord = next;
      records.push(next);
      failureBoundaries = [];
      recordDiagnostic('record-created', spec, proof);
      if (typeof options.onRecord === 'function') options.onRecord(next);
      return next;
    }

    function reset() {
      failureBoundaries = [];
      currentRecord = null;
      activePrompt = '';
      recordDiagnostic('reset');
    }

    return Object.freeze({
      observeSpec,
      observeProof,
      reset,
      getFailureBoundary: () => failureBoundaries.length
        ? failureBoundaries[failureBoundaries.length - 1].boundary
        : null,
      getCurrentRecord: () => currentRecord,
      getRecords: () => records.slice(),
      getDiagnostics: () => ({
        ...diagnostics,
        history: diagnosticHistory.map((entry) => ({ ...entry })),
      }),
    });
  }

  function diagnostic(status, spec = null, proof = null, entries = [], error = null) {
    return {
      schema: 'simulatte.worldImprovementSessionDiagnostic.v1',
      status,
      worldSpecContentHash: String(spec && spec.contentHash || ''),
      worldSpecRevision: Number(spec && spec.authorship && spec.authorship.revision || 0),
      sourcePrompt: sourcePrompt(spec),
      worldProofContentHash: String(proof && proof.contentHash || ''),
      worldProofVerdict: String(proof && proof.verdict || ''),
      replayStatus: String(proof && proof.proofClasses && proof.proofClasses.replay &&
        proof.proofClasses.replay.status || ''),
      retainedFailureCount: entries.length,
      retainedFailureContentHashes: entries.map((entry) => entry.boundary.worldSpec.contentHash),
      error: error && error.message ? error.message : '',
    };
  }

  function matchingFailureBoundary(spec, entries = []) {
    const prompt = sourcePrompt(spec);
    const revision = Number(spec && spec.authorship && spec.authorship.revision || 0);
    const successPatches = spec && spec.authorship && Array.isArray(spec.authorship.patches)
      ? spec.authorship.patches
      : [];
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const boundary = entries[index].boundary;
      if (boundary.brief.prompt !== prompt || revision <= boundary.worldSpec.revision) continue;
      const boundaryPatches = boundary.worldSpec.program.authorship.patches || [];
      const boundaryPatchIds = new Set(boundaryPatches.map((row) => row.id));
      const appendedPatches = successPatches.filter((row) => !boundaryPatchIds.has(row.id));
      const preservesPatchHistory = boundaryPatches.every((row, patchIndex) => (
        successPatches[patchIndex] && successPatches[patchIndex].id === row.id
      ));
      const bindsRevisionZeroBaseline = boundary.worldSpec.revision !== 0 || appendedPatches.some((row) => (
        row.compilerBaselineContentHash === boundary.worldSpec.contentHash
      ));
      if (preservesPatchHistory && appendedPatches.length && bindsRevisionZeroBaseline) return boundary;
    }
    return null;
  }

  function sourcePrompt(spec) {
    return String(spec && spec.source && spec.source.prompt || '');
  }

  function repairableFailure(proof, sceneProof) {
    return sceneProof.verdict === 'fail' || (proof.criticalFailures || [])
      .some((row) => ['fail', 'unsupported'].includes(row.status));
  }

  function successfulReplay(proof, sceneProof) {
    return sceneProof.verdict === 'pass' && proof.verdict === 'pass' &&
      proof.proofClasses && proof.proofClasses.replay &&
      proof.proofClasses.replay.status === 'pass';
  }

  return Object.freeze({
    create,
    matchingFailureBoundary,
    repairableFailure,
    successfulReplay,
    serializeRecord: recordContract.serializeWorldImprovementRecord,
  });
});
