(function attachSimulatteSceneProof(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteSceneProof = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSceneProofApi() {
  const SCENE_PROOF_SCHEMA = 'simulatte.sceneProof.v1';
  const PHASE7_OUTPUT_SCHEMA = 'simulatte.phase7.output.v2';
  const PHASE8_OUTPUT_SCHEMA = 'simulatte.phase8.output.v2';
  const PHASE_RECEIPT_SCHEMA = 'simulatte.phaseReceipt.v1';
  const LEDGER_FAILURE_STATUSES = Object.freeze(new Set(['lost', 'failed', 'wrong-identity', 'not-proven']));
  const SETTLED_STATUSES = Object.freeze(['preserved', 'lost', 'unsupported', 'not-proven']);

  function settleSceneProof(phase7Output, options = {}) {
    validatePhase7Input(phase7Output);
    const renderExecution = phase7Output.artifact.renderExecution;
    const sourceLedger = phase7Output.artifact.compositionLedger || { obligations: [], entries: [] };
    const rendered = renderExecution.rendered === true && Number(renderExecution.renderCount || 0) > 0;
    const packetIdentitySummary = normalizePacketIdentitySummary(renderExecution.packetIdentitySummary);
    const identities = new Set(packetIdentitySummary
      .map((value) => normalizeProofText(value))
      .filter(Boolean));
    const visualProofByObligation = new Map((renderExecution.visualObligationProof || [])
      .map((row) => [String(row.obligationId || ''), row]));
    const passedVisualTargets = (renderExecution.visualObligationProof || [])
      .filter((row) => row.status === 'pass')
      .map((row) => normalizeProofText(row.target || row.obligationId || ''));
    const settledObligations = (sourceLedger.obligations || []).map((row) => settleObligation(row, {
      rendered,
      identities,
      visualProofByObligation,
      passedVisualTargets,
    }));
    const requiredLost = settledObligations.filter((row) => row.required === true && row.status === 'lost');
    const requiredNotProven = settledObligations.filter((row) => row.required === true && row.status === 'not-proven');
    const verdict = !rendered ? 'not-proven' : requiredLost.length ? 'fail' : 'pass';
    const summary = {
      obligationCount: settledObligations.length,
      preservedCount: countByStatus(settledObligations, 'preserved'),
      lostCount: countByStatus(settledObligations, 'lost'),
      unsupportedCount: countByStatus(settledObligations, 'unsupported'),
      notProvenCount: countByStatus(settledObligations, 'not-proven'),
      requiredLostIds: requiredLost.map((row) => row.obligationId),
      requiredNotProvenIds: requiredNotProven.map((row) => row.obligationId),
    };
    const sceneProof = {
      schema: SCENE_PROOF_SCHEMA,
      verdict,
      rendered,
      settledObligations,
      summary,
      evidence: {
        packetIdentitySummary,
        pixelAuditStatus: renderExecution.pixelAudit && renderExecution.pixelAudit.status || '',
        renderCount: Number(renderExecution.renderCount || 0),
        visualObligationProofSummary: renderExecution.visualObligationProofSummary || null,
      },
      nowIso: options.nowIso || new Date().toISOString(),
    };
    return {
      schema: PHASE8_OUTPUT_SCHEMA,
      phase: 8,
      inputSchema: phase7Output.schema,
      runtimeReceiptId: String(phase7Output.runtimeReceiptId || 'runtime:unknown'),
      artifact: {
        sceneProof,
        compositionLedger: settleLedger(sourceLedger, settledObligations),
      },
      receipts: [
        {
          id: 'phase8-scene-proof',
          schema: PHASE_RECEIPT_SCHEMA,
          verdict,
          rendered,
          obligationCount: summary.obligationCount,
          preservedCount: summary.preservedCount,
          lostCount: summary.lostCount,
          unsupportedCount: summary.unsupportedCount,
          notProvenCount: summary.notProvenCount,
          requiredLostIds: summary.requiredLostIds.slice(0, 12),
          requiredNotProvenIds: summary.requiredNotProvenIds.slice(0, 12),
          pixelAuditStatus: sceneProof.evidence.pixelAuditStatus,
        },
      ],
    };
  }

	  function validatePhase7Input(phase7Output) {
    if (!phase7Output || phase7Output.schema !== PHASE7_OUTPUT_SCHEMA || Number(phase7Output.phase) !== 7) {
      const received = phase7Output && phase7Output.schema ? phase7Output.schema : typeof phase7Output;
      throw new Error(`Phase 8 input expected ${PHASE7_OUTPUT_SCHEMA}, received ${received}`);
    }
    const artifact = phase7Output.artifact;
    if (!artifact || typeof artifact !== 'object' || !artifact.renderExecution) {
      throw new Error('Phase 8 input expected artifact.renderExecution from the render phase');
    }
    if (!artifact.compositionLedger || !Array.isArray(artifact.compositionLedger.obligations)) {
      throw new Error('Phase 8 input expected artifact.compositionLedger.obligations to settle');
    }
	    return phase7Output;
	  }

  function normalizePacketIdentitySummary(source = null) {
    const values = [];
    collectIdentitySummaryValues(source, values);
    return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
  }

  function collectIdentitySummaryValues(source, values) {
    if (!source) return;
    if (Array.isArray(source)) {
      for (const item of source) collectIdentitySummaryValues(item, values);
      return;
    }
    if (typeof source === 'string' || typeof source === 'number') {
      values.push(source);
      return;
    }
    if (typeof source !== 'object') return;
    for (const key of ['label', 'type', 'identity', 'target', 'id']) {
      if (source[key] && typeof source[key] !== 'object') values.push(source[key]);
    }
    for (const key of ['identities', 'identitySummary', 'rows', 'items', 'values', 'labels']) {
      if (source[key]) collectIdentitySummaryValues(source[key], values);
    }
  }

  function settleObligation(row = {}, context = {}) {
    const obligationId = String(row.obligationId || row.id || '');
    const target = String(row.target || obligationId.replace(/^[a-z]+:/, '') || '');
    const base = {
      schema: 'simulatte.sceneProofObligation.v1',
      obligationId,
      kind: row.kind || '',
      target,
      required: row.required === true,
      sourceStatus: row.status || '',
      evidence: [],
    };
    const carriedFailure = LEDGER_FAILURE_STATUSES.has(String(row.status || ''));
    if (!context.rendered) {
      return { ...base, status: 'not-proven', reason: 'no rendered frame to settle against' };
    }
    if (String(row.status || '') === 'unsupported') {
      return { ...base, status: 'unsupported', reason: 'carried unsupported status' };
    }
    if (row.kind === 'visual') {
      const proof = context.visualProofByObligation.get(obligationId);
      if (proof && proof.status === 'pass') {
        return { ...base, status: 'preserved', reason: 'visual pixel proof passed', evidence: ['visualObligationProof'] };
      }
      if (carriedFailure) {
        return { ...base, status: 'lost', reason: `carried failure status ${row.status}` };
      }
      if (proof && proof.status === 'fail') {
        return { ...base, status: base.required ? 'lost' : 'unsupported', reason: 'visual pixel proof failed', evidence: ['visualObligationProof'] };
      }
      return { ...base, status: 'not-proven', reason: 'no visual pixel proof row for obligation' };
    }
    if (row.kind === 'entity' || row.kind === 'object' || row.kind === 'environment' || row.kind === 'medium') {
      const identityTarget = normalizeProofText(target);
      if (identityTarget && hasIdentityEvidence(context.identities, identityTarget)) {
        return { ...base, status: 'preserved', reason: 'identity present in scene render packet', evidence: ['packetIdentitySummary'] };
      }
      if (carriedFailure) {
        return { ...base, status: 'lost', reason: `carried failure status ${row.status}` };
      }
      return {
        ...base,
        status: base.required ? 'lost' : 'unsupported',
        reason: `identity ${identityTarget || 'unknown'} missing from scene render packet`,
      };
    }
    if (row.kind === 'relation') {
      const endpoints = relationEndpoints(row, obligationId);
      const present = endpoints.filter((endpoint) => endpoint === 'world' || hasIdentityEvidence(context.identities, endpoint));
      if (endpoints.length && present.length === endpoints.length) {
        return { ...base, status: 'preserved', reason: 'relation endpoint identities present', evidence: ['packetIdentitySummary'] };
      }
      if (carriedFailure) {
        return { ...base, status: 'lost', reason: `carried failure status ${row.status}` };
      }
      if (endpoints.length && present.length === 0) {
        return { ...base, status: base.required ? 'lost' : 'unsupported', reason: 'relation endpoint identities missing' };
      }
      return { ...base, status: 'not-proven', reason: 'relation endpoints only partially observable in render receipts' };
    }
    if (row.kind === 'action') {
      const actionTarget = normalizeProofText(target);
      const visualMatch = context.passedVisualTargets.some((visualTarget) => (
        visualTarget && actionTarget && (visualTarget.includes(actionTarget) || actionTarget.includes(visualTarget))
      ));
      if (visualMatch) {
        return { ...base, status: 'preserved', reason: 'action proven through passing visual obligation targets', evidence: ['visualObligationProof'] };
      }
      if (actionTarget && hasIdentityEvidence(context.identities, actionTarget)) {
        return { ...base, status: 'preserved', reason: 'action target present in scene render packet', evidence: ['packetIdentitySummary'] };
      }
      if (carriedFailure) {
        return { ...base, status: 'lost', reason: `carried failure status ${row.status}` };
      }
      return { ...base, status: 'not-proven', reason: 'no render evidence channel for action motion yet' };
    }
    if (carriedFailure) {
      return { ...base, status: 'lost', reason: `carried failure status ${row.status}` };
    }
    return { ...base, status: 'preserved', reason: 'carried non-failure status with rendered frame' };
  }

  function hasIdentityEvidence(identities, target) {
    if (!target) return false;
    for (const identity of identities || []) {
      if (!identity) continue;
      if (identity === target || identity.includes(target) || target.includes(identity)) return true;
      const identityTerms = new Set(String(identity).split(/\s+/).filter((term) => term.length > 3));
      const targetTerms = String(target).split(/\s+/).filter((term) => term.length > 3);
      if (targetTerms.some((term) => identityTerms.has(term))) return true;
    }
    return false;
  }

  function relationEndpoints(row = {}, obligationId = '') {
    const explicit = [row.subject, row.object]
      .map((value) => normalizeProofText(value))
      .filter(Boolean);
    if (explicit.length) return explicit;
    const parts = String(obligationId || '').split(':');
    if (parts.length >= 4 && parts[0] === 'relation') {
      return [normalizeProofText(parts[1]), normalizeProofText(parts[parts.length - 1])].filter(Boolean);
    }
    return [];
  }

  function settleLedger(sourceLedger = {}, settledObligations = []) {
    const settledById = new Map(settledObligations.map((row) => [row.obligationId, row]));
    const obligations = (sourceLedger.obligations || []).map((row) => {
      const settled = settledById.get(String(row.obligationId || row.id || ''));
      if (!settled) return row;
      return {
        ...row,
        status: settled.status,
        phase: 8,
        receiptId: 'phase8-scene-proof',
        settlementReason: settled.reason,
      };
    });
    const losses = [
      ...(sourceLedger.losses || []),
      ...settledObligations
        .filter((row) => row.status === 'lost')
        .map((row) => ({
          id: `loss:phase8:${row.obligationId}`,
          phase: 8,
          entryId: row.obligationId,
          reason: row.reason,
          sourceReceiptId: 'phase8-scene-proof',
        })),
    ];
    return {
      ...sourceLedger,
      currentPhase: 8,
      obligations,
      phaseDeltas: [
        ...(sourceLedger.phaseDeltas || []),
        ...settledObligations.map((row) => ({
          phase: 8,
          entryId: row.obligationId,
          operation: row.status,
          receiptId: 'phase8-scene-proof',
        })),
      ],
      losses,
      summary: {
        ...(sourceLedger.summary || {}),
        obligationCount: obligations.length,
        failedCount: obligations.filter((row) => LEDGER_FAILURE_STATUSES.has(String(row.status || ''))).length,
      },
    };
  }

  function countByStatus(rows = [], status = '') {
    return rows.filter((row) => row.status === status).length;
  }

  function normalizeProofText(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  return {
    SCENE_PROOF_SCHEMA,
    PHASE8_OUTPUT_SCHEMA,
    SETTLED_STATUSES,
    settleSceneProof,
  };
});
