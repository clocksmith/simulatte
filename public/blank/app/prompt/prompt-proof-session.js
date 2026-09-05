(function attachPromptProofSession(root, factory) {
  const construction = typeof module === 'object' && module.exports ? require('./prompt-controller-construction-search.js') : root.SimulatteConstructionSearch;
  const api = factory(construction);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePromptProofSession = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createProofSessionModule(construction) {
  if (!construction) throw new Error('prompt_proof_session_construction_missing');
  const { createConstructionSearchState, observeConstructionSceneProof, syncConstructionSearchDataset, constructionSearchSpec } = construction;
  function create({ root, canvas, compilerProof, worldImprovementSession, trainingRun, runView,
    getSpec, getBuildSerial, getSimulationReceipt, refreshRender, setSpec, publishRuntime, onImprovement }) {
    const worldProofPreview = root.getElementById('world-proof-preview');
    const replayWorldSpecButton = root.getElementById('replay-world-spec');
    let generation = 0;
    let requestedCompilerProofKey = '';
    let constructionRetryPending = false;
    let latestReplayBaseline = null;
    let pendingReplayBaseline = null;
    let improvementReportDiagnostics = null;
    const improvementReportDiagnosticHistory = [];
  function observe(report) {
    const spec = getSpec();
    const buildSerial = getBuildSerial();
    const token = generation;
          const phase8Artifact = report && report.phase8Output && report.phase8Output.artifact || {};
          const renderExecution = report && report.phase7Output && report.phase7Output.artifact &&
            report.phase7Output.artifact.renderExecution || {};
          const worldProofApi = root.defaultView && root.defaultView.SimulatteWorldProof;
          const binding = renderExecution.worldProofBinding || null;
          const reportMatchesSpec = Boolean(
            binding && binding.worldSpec && binding.worldSpec.contentHash === spec.contentHash
          );
          if (!reportMatchesSpec) return;
          runView?.recordSceneProof(report);
          improvementReportDiagnostics = {
            schema: 'simulatte.worldImprovementReportDiagnostic.v1',
            final: report && report.final === true,
            reportMatchesSpec,
            activeWorldSpecContentHash: String(spec && spec.contentHash || ''),
            reportWorldSpecContentHash: String(binding && binding.worldSpec && binding.worldSpec.contentHash || ''),
            sceneProofVerdict: String(phase8Artifact.sceneProof && phase8Artifact.sceneProof.verdict || ''),
            worldProofVerdict: String(phase8Artifact.worldProof && phase8Artifact.worldProof.verdict || ''),
            replayStatus: String(phase8Artifact.worldProof && phase8Artifact.worldProof.proofClasses &&
              phase8Artifact.worldProof.proofClasses.replay &&
              phase8Artifact.worldProof.proofClasses.replay.status || ''),
          };
          improvementReportDiagnosticHistory.push(improvementReportDiagnostics);
          if (improvementReportDiagnosticHistory.length > 16) {
            improvementReportDiagnosticHistory.shift();
          }
          if (reportMatchesSpec) {
            try {
              const improvementRecord = worldImprovementSession.observeProof(spec, report);
              if (improvementRecord) onImprovement(improvementRecord);
            } catch (error) {
              improvementReportDiagnostics.sessionError = error && error.message
                ? error.message
                : String(error || 'improvement session rejected report');
            }
          }
          if (report && report.final === true && phase8Artifact.worldProof && worldProofApi &&
              typeof worldProofApi.createReplayBaseline === 'function' && reportMatchesSpec) {
            const compilerDeterminismReceipt = compilerProof.receiptFor(spec);
            if (compilerProof.required(spec) && !compilerDeterminismReceipt) {
              const proofKey = `${spec.contentHash}:${binding.replayIdentity && binding.replayIdentity.buildId || ''}`;
              if (requestedCompilerProofKey !== proofKey) {
                requestedCompilerProofKey = proofKey;
                compilerProof.verify(spec, binding).then((receipt) => {
                  if (!receipt || token !== generation || binding.worldSpec.contentHash !== getSpec()?.contentHash) return;
                  requestedCompilerProofKey = '';
                  refreshRender();
                }).catch((error) => {
                  if (token !== generation) return;
                  requestedCompilerProofKey = '';
                  publishRuntime({
                    state: 'error',
                    blocking: false,
                    stage: 'compiler-proof',
                    percent: 100,
                    message: 'Compiler determinism proof failed',
                    detail: error && error.message ? error.message : String(error || ''),
                    canvasLoading: false,
                  });
                });
              }
            } else {
              latestReplayBaseline = worldProofApi.createReplayBaseline({
                binding,
                sceneProof: phase8Artifact.sceneProof,
                intentReceipt: phase8Artifact.worldProof.evidence &&
                  phase8Artifact.worldProof.evidence.intentReceipt || null,
                semanticReceipt: phase8Artifact.worldProof.evidence &&
                  phase8Artifact.worldProof.evidence.semanticReceipt || null,
                simulationReceipt: renderExecution.simulationReceipt,
                interactionProofReceipt: phase8Artifact.sceneProof.interactionProof,
                safetyReceipt: phase8Artifact.worldProof.evidence &&
                  phase8Artifact.worldProof.evidence.safetyReceipt || null,
                compilerDeterminismReceipt,
                simulationReproducibilityReceipt: getSimulationReceipt(),
                deviceClass: renderExecution.optimization && renderExecution.optimization.deviceClass || '',
              });
              pendingReplayBaseline = null;
              if (replayWorldSpecButton) replayWorldSpecButton.disabled = false;
            }
          }
          if (worldProofPreview) {
            worldProofPreview.textContent = JSON.stringify(
              report && report.phase8Output && report.phase8Output.artifact &&
                report.phase8Output.artifact.worldProof || {},
              null,
              2
            );
          }
          if (!report || report.final !== true || !trainingRun.runId || !trainingRun.prompt) return;
          const search = trainingRun.constructionSearch || createConstructionSearchState({ buildSerial });
          trainingRun.constructionSearch = search;
          const decision = observeConstructionSceneProof(report, spec, search);
          syncConstructionSearchDataset(canvas, decision);
          if (decision.action === 'duplicate' || decision.action === 'wait' || decision.action === 'ignore') return;
          if (decision.action === 'accept') {
            publishRuntime({
              state: 'ready',
              blocking: false,
              stage: 'construction-proof',
              percent: 100,
              message: 'Scene obligations proven',
              detail: `${search.attempts.length} construction attempt${search.attempts.length === 1 ? '' : 's'} receipted`,
              canvasLoading: false,
            });
            return;
          }
          if (decision.action !== 'retry' || constructionRetryPending) {
            publishRuntime({
              state: phase8Artifact.sceneProof?.verdict === 'fail' ? 'failed' : 'not-proven',
              blocking: false,
              stage: 'construction-proof',
              percent: 100,
              message: 'Scene obligations not proven',
              detail: decision.reason || search.terminalReason || 'construction search stopped',
              canvasLoading: false,
            });
            return;
          }
          constructionRetryPending = true;
          const retrySerial = buildSerial;
          publishRuntime({
            state: 'active',
            allowAfterReady: true,
            blocking: false,
            stage: 'construction-search',
            taskPercent: 0,
            progressScope: 'task',
            percent: 99,
            message: `Trying construction ${decision.nextApproach.attempt + 1}`,
            detail: `rejected ${decision.nextApproach.rejectedGrammarIds.join(', ')}`,
            canvasLoading: false,
          });
          Promise.resolve().then(() => {
            if (token !== generation || retrySerial !== getBuildSerial() || trainingRun.serial !== retrySerial) return;
            const nextSpec = constructionSearchSpec(spec, decision.nextApproach);
            setSpec(nextSpec, { visible: true });
            publishRuntime({
              state: 'active',
              allowAfterReady: true,
              blocking: false,
              stage: 'construction-search',
              percent: 100,
              message: 'Construction candidate rendered',
              detail: `attempt ${decision.nextApproach.attempt + 1} awaiting screenshot proof`,
              canvasLoading: false,
            });
          }).catch((error) => {
            if (token !== generation) return;
            search.status = 'failed';
            search.terminalReason = error && error.message ? error.message : String(error || 'construction retry failed');
            syncConstructionSearchDataset(canvas, {
              ...decision,
              action: 'error',
              reason: search.terminalReason,
            });
            publishRuntime({
              state: 'error',
              blocking: false,
              stage: 'construction-search',
              percent: 100,
              message: 'Construction search failed',
              detail: search.terminalReason,
              canvasLoading: false,
            });
          }).finally(() => {
            if (token === generation) constructionRetryPending = false;
          });
  }

    function invalidate() {
      generation += 1;
      compilerProof.invalidate();
      requestedCompilerProofKey = '';
      constructionRetryPending = false;
      latestReplayBaseline = null;
      pendingReplayBaseline = null;
      if (replayWorldSpecButton) replayWorldSpecButton.disabled = true;
    }
    function beginReplay() {
      if (!latestReplayBaseline) return false;
      pendingReplayBaseline = latestReplayBaseline;
      return true;
    }
    return Object.freeze({
      observe, invalidate, beginReplay,
      pendingBaseline: () => pendingReplayBaseline,
      diagnostics: () => ({
        report: improvementReportDiagnostics && { ...improvementReportDiagnostics },
        reportHistory: improvementReportDiagnosticHistory.map((entry) => ({ ...entry })),
      }),
    });
  }
  return Object.freeze({ create });
});
