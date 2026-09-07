(function attachSimulatteConstructionSearch(root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('../../pipeline/simulatte-phase-contracts.js') : root.SimulattePhaseContracts;
  const api = factory(contracts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteConstructionSearch = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createConstructionSearchApi(contracts) {
  const DEFAULT_MAX_ATTEMPTS = 5;
  const FAILURE_STATUSES = new Set(['lost', 'failed', 'wrong-identity', 'not-proven']);

  function createConstructionSearchState(options = {}) {
    return {
      schema: 'simulatte.constructionSearchState.v1',
      status: 'idle',
      buildSerial: Number(options.buildSerial || 0),
      maxAttempts: boundedInteger(options.maxAttempts, 1, 8, DEFAULT_MAX_ATTEMPTS),
      handledPacketKeys: [],
      rejectedGrammarIds: [],
      attempts: [],
      terminalReason: '',
    };
  }

  function observeConstructionSceneProof(report = {}, spec = {}, state = null) {
    const search = state || createConstructionSearchState();
    if (report.final !== true) return constructionSearchDecision('wait', search, null);
    if (['accepted', 'failed', 'exhausted'].includes(search.status)) {
      return constructionSearchDecision(
        'ignore',
        search,
        null,
        `construction search is already ${search.status}`,
      );
    }
    const phase8 = report.phase8Output || null;
    const proof = phase8 && phase8.artifact && phase8.artifact.sceneProof || null;
    if (!proof) return constructionSearchDecision('ignore', search, null, 'missing Phase 8 scene proof');
    const packet = report.sceneRenderPacket || constructionScenePacket(spec);
    const packetKey = String(report.packetKey || constructionPacketIdentity(packet));
    if (packetKey && search.handledPacketKeys.includes(packetKey)) {
      return constructionSearchDecision('duplicate', search, null, 'scene packet already settled');
    }
    if (packetKey) search.handledPacketKeys.push(packetKey);

    const ledger = phase8.artifact.compositionLedger || {};
    const failed = constructionFailedObligations(proof, ledger);
    const programRows = constructionProgramRows(packet);
    const attemptNumber = constructionAttemptNumber(programRows, search);
    const selectedGrammarIds = uniqueStrings(programRows.map((row) => row.grammarId));
    const retryPrograms = constructionRetryPrograms(failed, programRows);
    const retryGrammarIds = uniqueStrings(retryPrograms.map((row) => row.grammarId));
    const attempt = {
      schema: 'simulatte.constructionSearchAttempt.v2',
      evidence: contracts.immutableArtifact({ phase7Output: report.phase7Output || null, phase8Output: phase8 }),
      attempt: attemptNumber,
      packetKey,
      verdict: proof.verdict || 'not-proven',
      pixelAuditStatus: proof.evidence && proof.evidence.pixelAuditStatus || '',
      selectedGrammarIds,
      rejectedGrammarIds: search.rejectedGrammarIds.slice(),
      failedObligationIds: failed.map((row) => row.id),
      retryGrammarIds,
      status: proof.verdict === 'pass' ? 'accepted' : 'rejected',
    };
    search.attempts.push(attempt);

    if (proof.verdict === 'pass') {
      search.status = 'accepted';
      search.terminalReason = 'all required render, morphology, and pixel obligations passed';
      return constructionSearchDecision('accept', search, attempt, search.terminalReason);
    }
    if (!retryGrammarIds.length) {
      search.status = 'failed';
      search.terminalReason = 'Phase 8 failed without an entity construction program that can be replaced';
      return constructionSearchDecision('stop', search, attempt, search.terminalReason);
    }

    const rejectedGrammarIds = uniqueStrings([
      ...search.rejectedGrammarIds,
      ...retryGrammarIds,
    ]).slice(0, 64);
    if (search.attempts.length >= search.maxAttempts) {
      search.status = 'exhausted';
      search.rejectedGrammarIds = rejectedGrammarIds;
      search.terminalReason = 'bounded construction search reached its attempt limit';
      return constructionSearchDecision('stop', search, attempt, search.terminalReason);
    }
    if (!constructionAlternativeExists(retryPrograms, rejectedGrammarIds)) {
      search.status = 'exhausted';
      search.rejectedGrammarIds = rejectedGrammarIds;
      search.terminalReason = 'every evidence-backed construction candidate for the failed entities was rejected';
      return constructionSearchDecision('stop', search, attempt, search.terminalReason);
    }

    search.status = 'retrying';
    search.rejectedGrammarIds = rejectedGrammarIds;
    search.terminalReason = '';
    const nextApproach = {
      schema: 'simulatte.constructionApproach.v2',
      id: 'prompt-obligation-coverage',
      seed: constructionApproachSeed(programRows) + 1,
      attempt: attemptNumber + 1,
      rejectedGrammarIds: rejectedGrammarIds.slice(),
      failedObligationIds: failed.map((row) => row.id).slice(0, 32),
    };
    return constructionSearchDecision('retry', search, attempt, '', nextApproach);
  }

  function constructionSearchDecision(action, state, attempt, reason = '', nextApproach = null) {
    return {
      schema: 'simulatte.constructionSearchDecision.v1',
      action,
      reason,
      attempt,
      nextApproach,
      state,
    };
  }

  function constructionFailedObligations(proof = {}, ledger = {}) {
    const settledById = new Map((proof.settledObligations || []).map((row) => [row.obligationId, row]));
    return (ledger.obligations || []).filter((row) => {
      const id = String(row.obligationId || row.id || '');
      const settled = settledById.get(id);
      const status = settled && settled.status || row.status || '';
      return row.required === true && FAILURE_STATUSES.has(String(status));
    }).map((row) => ({
      ...row,
      id: String(row.obligationId || row.id || ''),
      settledStatus: settledById.get(String(row.obligationId || row.id || ''))?.status || row.status || '',
    }));
  }

  function constructionProgramRows(packet = {}) {
    return (packet.entities || []).map((entity) => {
      const program = entity && entity.geometry && entity.geometry.program || {};
      const receipt = program.constructionSelectionReceipt || {};
      return {
        entityId: entity.id || '',
        sourceEntityId: entity.cardinalityReceipt && entity.cardinalityReceipt.sourceEntityId || entity.id || '',
        identity: entity.identity && entity.identity.type || program.identityType || '',
        grammarId: program.grammarId || '',
        attempt: Number(receipt.attempt || 0),
        seed: Number(receipt.seed || 0),
        candidates: (receipt.candidates || []).map((row) => row.grammarId).filter(Boolean),
      };
    }).filter((row) => row.grammarId);
  }

  function constructionRetryPrograms(failures = [], programs = []) {
    const matched = [];
    for (const failure of failures) {
      if (failure.constraintKind === 'environment' || failure.kind === 'environment') continue;
      const selected = String(failure.selectedGrammarId || '');
      const targetId = String(failure.targetEntityId || '');
      const targetIdentity = normalizeIdentity(
        failure.targetIdentity || failure.target || constructionIdentityFromObligationId(failure.id)
      );
      const rows = programs.filter((row) => (
        selected && row.grammarId === selected ||
        targetId && (row.entityId === targetId || row.sourceEntityId === targetId) ||
        targetIdentity && normalizeIdentity(row.identity) === targetIdentity
      ));
      matched.push(...rows);
    }
    return uniqueProgramRows(matched);
  }

  function constructionAlternativeExists(programs = [], rejectedGrammarIds = []) {
    const rejected = new Set(rejectedGrammarIds);
    return programs.some((program) => program.candidates.some((id) => !rejected.has(id)));
  }

  function constructionAttemptNumber(programs = [], state = {}) {
    const values = programs.map((row) => row.attempt).filter(Number.isFinite);
    return values.length ? Math.max(...values) : Math.max(0, (state.attempts || []).length);
  }

  function constructionApproachSeed(programs = []) {
    const values = programs.map((row) => row.seed).filter(Number.isFinite);
    return values.length ? Math.max(...values) : 0;
  }

  async function createConstructionRetryRequest(inputSpec, inputDecision, inputReport) {
    const { spec, decision, report } = contracts.immutableArtifact({
      spec: inputSpec, decision: inputDecision, report: inputReport,
    });
    const approach = decision.nextApproach;
    const search = decision.state;
    const binding = report.phase7Output?.artifact?.renderExecution?.worldProofBinding?.worldSpec;
    if (report.final !== true || binding?.contentHash !== spec.contentHash ||
        binding.revision !== spec.authorship.revision) {
      throw new Error('Construction retry failure does not bind the accepted WorldSpec');
    }
    if (decision.schema !== 'simulatte.constructionSearchDecision.v1' || decision.action !== 'retry' ||
        search?.status !== 'retrying' || !Number.isInteger(search.maxAttempts) || search.maxAttempts < 1 ||
        search.maxAttempts > 8 || !search.attempts.length || search.attempts.length >= search.maxAttempts ||
        contracts.canonicalJson(search.attempts.at(-1)) !== contracts.canonicalJson(decision.attempt)) {
      throw new Error('Construction retry requires a retained decision within its attempt budget');
    }
    const failed = constructionFailedObligations(report.phase8Output.artifact.sceneProof,
      report.phase8Output.artifact.compositionLedger).map(row => row.id).slice(0, 32);
    if (!approach || approach.schema !== 'simulatte.constructionApproach.v2' ||
        approach.id !== 'prompt-obligation-coverage' || !Number.isSafeInteger(approach.seed) || approach.seed < 0 ||
        approach.attempt !== decision.attempt.attempt + 1 || approach.attempt < 1 ||
        !failed.length || contracts.canonicalJson(failed) !== contracts.canonicalJson(approach.failedObligationIds) ||
        contracts.canonicalJson(search.rejectedGrammarIds) !== contracts.canonicalJson(approach.rejectedGrammarIds) ||
        report.phase8Output.artifact.sceneProof.verdict === 'pass') {
      throw new Error('Construction retry policy contradicts its retained failure');
    }
    if (contracts.canonicalJson(report.sceneRenderPacket) !== contracts.canonicalJson(constructionScenePacket(spec)) ||
        contracts.canonicalJson(decision.attempt.evidence) !== contracts.canonicalJson({
          phase7Output: report.phase7Output, phase8Output: report.phase8Output,
        })) throw new Error('Construction retry evidence differs from its retained attempt or source packet');
    const previousSearch = { ...search, status: 'idle', terminalReason: '',
      attempts: search.attempts.slice(0, -1),
      handledPacketKeys: search.handledPacketKeys.filter(key => key !== decision.attempt.packetKey),
      rejectedGrammarIds: decision.attempt.rejectedGrammarIds,
    };
    const expected = observeConstructionSceneProof(report, spec, previousSearch);
    if (contracts.canonicalJson(expected) !== contracts.canonicalJson(decision)) {
      throw new Error('Construction retry decision cannot be reproduced from its failure');
    }
    contracts.assertPhaseEnvelope(spec.phaseArtifacts.phase6, 6, 'Construction retry source');
    contracts.assertPhaseEnvelope(report.phase7Output, 7, 'Construction retry render evidence');
    contracts.assertPhaseEnvelope(report.phase8Output, 8, 'Construction retry failure evidence');
    return contracts.createRequestEnvelope({
      request: { kind: 'prompt', text: spec.source.prompt },
      configuration: { ...spec.source.compilerConfig, constructionApproach: approach, compilerLane: 'pipeline-worker' },
      authoredInputs: [],
      retryPolicy: {
        id: 'construction-search-v1', attempt: approach.attempt, maxAttempts: search.maxAttempts,
        priorAttemptCount: search.attempts.length,
        previousWorldSpecDigest: await contracts.artifactDigest(spec),
        previousPhase6Digest: await contracts.artifactDigest(spec.phaseArtifacts.phase6),
        renderEvidenceDigest: await contracts.artifactDigest(report.phase7Output),
        failureEvidenceDigest: await contracts.artifactDigest(report.phase8Output),
        decisionDigest: await contracts.artifactDigest(decision),
        rejectedGrammarIds: approach.rejectedGrammarIds, failedObligationIds: approach.failedObligationIds,
        acceptedEdits: spec.authorship.patches.length ? 'require-reconciliation' : 'none',
      },
    });
  }

  function constructionScenePacket(spec = {}) {
    return spec.phaseArtifacts && spec.phaseArtifacts.phase6 && spec.phaseArtifacts.phase6.artifact &&
      spec.phaseArtifacts.phase6.artifact.visualCompile &&
      spec.phaseArtifacts.phase6.artifact.visualCompile.sceneRenderPacket || null;
  }

  function constructionPacketIdentity(packet = {}) {
    return (packet.entities || []).map((row) => [
      row.id,
      row.geometry && row.geometry.program && row.geometry.program.grammarId,
    ].filter(Boolean).join(':')).join('|');
  }

  function syncConstructionSearchDataset(canvas, decision = {}) {
    if (!canvas || !canvas.dataset) return;
    const state = decision.state || {};
    canvas.dataset.constructionSearchSchema = state.schema || '';
    canvas.dataset.constructionSearchStatus = state.status || '';
    canvas.dataset.constructionSearchAttemptCount = String((state.attempts || []).length);
    canvas.dataset.constructionSearchRejectedGrammarIds = (state.rejectedGrammarIds || []).join(',');
    canvas.dataset.constructionSearchDecision = decision.action || '';
    const attempt = decision.attempt ? Object.fromEntries(Object.entries(decision.attempt).filter(([key]) => key !== 'evidence')) : null;
    canvas.dataset.constructionSearchReceipt = JSON.stringify({
      action: decision.action || '',
      reason: decision.reason || '',
      attempt,
      nextApproach: decision.nextApproach || null,
    }).slice(0, 4000);
  }

  function uniqueProgramRows(rows = []) {
    const seen = new Set();
    return rows.filter((row) => {
      const key = `${row.sourceEntityId}:${row.grammarId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function uniqueStrings(values = []) {
    return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
  }

  function normalizeIdentity(value = '') {
    const text = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return text.length > 3 && text.endsWith('s') && !/(?:ss|us|is)$/.test(text) ? text.slice(0, -1) : text;
  }

  function constructionIdentityFromObligationId(value = '') {
    const parts = String(value || '').split(':');
    if (parts[0] === 'entity' || parts[0] === 'object') return parts[1] || '';
    return '';
  }

  function boundedInteger(value, min, max, fallback) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
  }

  return Object.freeze({
    DEFAULT_MAX_ATTEMPTS,
    createConstructionSearchState,
    observeConstructionSceneProof,
    constructionFailedObligations,
    constructionProgramRows,
    constructionRetryPrograms,
    constructionAlternativeExists,
    createConstructionRetryRequest,
    syncConstructionSearchDataset,
  });
});
