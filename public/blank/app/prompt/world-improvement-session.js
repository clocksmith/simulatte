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
    let failureBoundary = null;
    let failureKey = '';
    let currentRecord = null;
    let activePrompt = '';
    const records = [];

    function observeSpec(spec) {
      const prompt = sourcePrompt(spec);
      if (!prompt) return null;
      if (activePrompt && prompt !== activePrompt) {
        failureBoundary = null;
        failureKey = '';
        currentRecord = null;
      }
      activePrompt = prompt;
      if (failureBoundary && Number(spec.authorship && spec.authorship.revision || 0) <=
          failureBoundary.worldSpec.revision && spec.contentHash !== failureBoundary.worldSpec.contentHash) {
        failureBoundary = null;
        failureKey = '';
      }
      return currentRecord;
    }

    function observeProof(spec, report) {
      observeSpec(spec);
      const proof = report && report.phase8Output && report.phase8Output.artifact &&
        report.phase8Output.artifact.worldProof;
      const sceneProof = report && report.phase8Output && report.phase8Output.artifact &&
        report.phase8Output.artifact.sceneProof;
      if (!spec || !proof || !sceneProof || report.final !== true) return currentRecord;
      if (!failureBoundary && repairableFailure(proof, sceneProof)) {
        const nextKey = `${spec.contentHash}:${proof.contentHash}`;
        if (nextKey !== failureKey) {
          failureBoundary = recordContract.captureFailureBoundary(spec, report, {
            nowIso: proof.createdAt,
          });
          failureKey = nextKey;
          currentRecord = null;
        }
        return null;
      }
      if (!failureBoundary || !successfulReplay(proof, sceneProof)) return currentRecord;
      if (sourcePrompt(spec) !== failureBoundary.brief.prompt ||
          Number(spec.authorship && spec.authorship.revision || 0) <= failureBoundary.worldSpec.revision) {
        return currentRecord;
      }
      const next = recordContract.createWorldImprovementRecord({
        failureBoundary,
        successfulSpec: spec,
        successfulReport: report,
        nowIso: proof.createdAt,
      });
      currentRecord = next;
      records.push(next);
      failureBoundary = null;
      failureKey = '';
      if (typeof options.onRecord === 'function') options.onRecord(next);
      return next;
    }

    function reset() {
      failureBoundary = null;
      failureKey = '';
      currentRecord = null;
      activePrompt = '';
    }

    return Object.freeze({
      observeSpec,
      observeProof,
      reset,
      getFailureBoundary: () => failureBoundary,
      getCurrentRecord: () => currentRecord,
      getRecords: () => records.slice(),
    });
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
    repairableFailure,
    successfulReplay,
    serializeRecord: recordContract.serializeWorldImprovementRecord,
  });
});
