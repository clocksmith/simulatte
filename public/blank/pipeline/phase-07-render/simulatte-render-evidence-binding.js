(function attachSimulatteRenderEvidenceBinding(root, factory) {
  const deterministicValues = typeof module === 'object' && module.exports
    ? require('../../../shared/deterministic-values.js')
    : root.SimulatteDeterministicValues;
  const api = factory(deterministicValues);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteRenderEvidenceBinding = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createRenderEvidenceBindingApi(
  deterministicValues = {}
) {
  const fnv1a32 = deterministicValues.fnv1a32;
  if (typeof fnv1a32 !== 'function') {
    throw new Error('SimulatteRenderEvidenceBinding requires deterministic value hashing');
  }

  function stableRenderEvidenceValue(value) {
    if (Array.isArray(value)) return value.map((entry) => stableRenderEvidenceValue(entry));
    if (!value || typeof value !== 'object') {
      return Number.isFinite(value) ? Number(value) : value == null ? null : String(value);
    }
    const output = {};
    for (const key of Object.keys(value).sort()) {
      const entry = value[key];
      if (typeof entry === 'function' || entry === undefined) continue;
      output[key] = stableRenderEvidenceValue(entry);
    }
    return output;
  }

  function scenePacketRenderEvidenceHash(sceneRenderPacket = {}) {
    const text = JSON.stringify(stableRenderEvidenceValue(sceneRenderPacket));
    return fnv1a32(text).toString(16).padStart(8, '0');
  }

  function immutableRenderEvidence(value) {
    if (Array.isArray(value)) return Object.freeze(value.map((entry) => immutableRenderEvidence(entry)));
    if (!value || typeof value !== 'object') {
      if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
      return value == null || typeof value === 'string' || typeof value === 'boolean' ? value : String(value);
    }
    const snapshot = {};
    for (const key of Object.keys(value).sort()) {
      if (typeof value[key] === 'function' || value[key] === undefined) continue;
      snapshot[key] = immutableRenderEvidence(value[key]);
    }
    return Object.freeze(snapshot);
  }

  function phase7PixelSampleSource(renderData = null, canvas = null) {
    return renderData && (renderData.pixelSamples || renderData.livePixelSamples) ||
      canvas && canvas.__simulattePixelSamples || null;
  }

  function phase7PixelSampleSetValidation(sceneRenderPacket = {}, renderData = null, source = null) {
    const packetHash = scenePacketRenderEvidenceHash(sceneRenderPacket);
    const renderDataKey = String(renderData && renderData.packetKey || '');
    const samplePacketKey = String(source && !Array.isArray(source) && source.packetKey || '');
    let reason = '';
    if (!renderDataKey || !renderDataKey.endsWith(`:${packetHash}`)) reason = 'render data is not bound to the current scene packet';
    else if (!source) reason = 'required visual obligation has no live pixel readback';
    else if (Array.isArray(source) || source.schema !== 'simulatte.phase7PixelSampleSet.v1') {
      reason = 'pixel samples require the strict Phase 7 sample-set envelope';
    } else if (!samplePacketKey || samplePacketKey !== renderDataKey) reason = 'pixel samples are stale for the current render data';
    else if (!Array.isArray(source.samples)) reason = 'pixel sample-set envelope has no samples array';
    return Object.freeze({
      schema: 'simulatte.phase7PixelSampleBinding.v1',
      status: reason ? 'fail' : 'pass',
      valid: !reason,
      reason,
      packetHash,
      renderDataKey,
      samplePacketKey,
    });
  }

  function phase7SemanticAbsenceProof(obligation = {}, sceneRenderPacket = {}, renderData = null) {
    const targetIdentity = normalizeSemanticIdentity(obligation.targetIdentity || obligation.target || '');
    const targetSemanticCode = Number(obligation.targetSemanticCode || 0);
    const source = phase7PixelSampleSource(renderData);
    const pixelBinding = phase7PixelSampleSetValidation(sceneRenderPacket, renderData, source);
    const packetRows = ['entities', 'fields', 'effects']
      .flatMap((key) => Array.isArray(sceneRenderPacket && sceneRenderPacket[key]) ? sceneRenderPacket[key] : []);
    const drawables = Array.isArray(renderData && renderData.drawables) ? renderData.drawables : [];
    const objectParts = Array.isArray(renderData && renderData.objectParts) ? renderData.objectParts : [];
    const rendererConsumption = renderData && renderData.rendererConsumption || {};
    const packetMatches = semanticIdentityMatches(packetRows, targetIdentity);
    const drawableMatches = semanticIdentityMatches(drawables, targetIdentity);
    const objectPartMatches = semanticIdentityMatches(objectParts, targetIdentity);
    const submittedSemanticCodes = submittedObjectPartSemanticCodes(renderData);
    const targetCodeMatches = submittedSemanticCodes.filter((code) => (
      targetSemanticCode > 0 && Math.abs(code - targetSemanticCode) < 0.001
    ));
    const checks = [
      detectorCheck('target-identity-bound', Boolean(targetIdentity), true),
      detectorCheck('target-semantic-code-bound', targetSemanticCode > 0, true),
      detectorCheck('scene-packet-binding', pixelBinding.valid, true),
      detectorCheck('texture-readback-source', source && source.source === 'webgpu-texture-copy-readback', true),
      detectorCheck('texture-readback-serial', Number(source && source.readbackSerial || 0) > 0, true),
      detectorCheck('renderer-consumption-schema', rendererConsumption.schema === 'simulatte.phase7RendererConsumption.v1', true),
      detectorCheck('object-submission-consumed', rendererConsumption.objectSubmissionConsumed === true, true),
      detectorCheck('semantic-codes-consumed', rendererConsumption.semanticCodesConsumed === true, true),
      detectorCheck('object-part-submission-complete', Number(renderData && renderData.sourceObjectPartCount || 0) === objectParts.length && renderData && renderData.objectPartTruncated === false, true),
      detectorCheck('object-part-vector-bound', submittedSemanticCodes.length === objectParts.length && submittedSemanticCodes.every((code, index) => Math.abs(code - Number(objectParts[index] && objectParts[index].semanticCode || 0)) < 0.001), true),
      detectorCheck('semantic-drawables-complete', Number(renderData && renderData.semanticDrawableCount || 0) === drawables.length, true),
      detectorCheck('forbidden-packet-identities', packetMatches.length, 0),
      detectorCheck('forbidden-render-drawables', drawableMatches.length, 0),
      detectorCheck('forbidden-object-parts', objectPartMatches.length, 0),
      detectorCheck('forbidden-semantic-codes', targetCodeMatches.length, 0),
    ];
    const failed = checks.find((check) => check.pass !== true);
    return immutableRenderEvidence({
      schema: 'simulatte.phase7SemanticAbsenceProof.v1',
      method: 'closed-world-semantic-submission-with-texture-readback-binding',
      status: failed ? 'fail' : 'pass',
      satisfied: !failed,
      targetIdentity,
      targetSemanticCode,
      detectorPolicy: 'compiled-semantic-identity-exclusion.v1',
      inspectedRegion: 'full-canvas-render-submission',
      packetKey: renderData && renderData.packetKey || '',
      readbackSerial: Number(source && source.readbackSerial || 0),
      pixelBinding,
      sourceObjectPartCount: Number(renderData && renderData.sourceObjectPartCount || 0),
      submittedObjectPartCount: objectParts.length,
      semanticDrawableCount: drawables.length,
      forbiddenMatchCount: packetMatches.length + drawableMatches.length + objectPartMatches.length + targetCodeMatches.length,
      checks,
      reason: failed ? `semantic absence detector failed: ${failed.id}` : '',
    });
  }

  function submittedObjectPartSemanticCodes(renderData = null) {
    const count = Number(renderData && renderData.objectPartCount || 0);
    const stride = Number(renderData && renderData.objectPartFloatStride || 0);
    const vector = renderData && renderData.objectPartData;
    if (!vector || !Number.isInteger(stride) || stride < 13 || count < 0) return [];
    return Array.from({ length: count }, (_, index) => Number(vector[index * stride + 12] || 0));
  }

  function semanticIdentityMatches(rows = [], target = '') {
    if (!target) return [];
    return rows.filter((row) => semanticIdentityValues(row).includes(target));
  }

  function semanticIdentityValues(row = {}) {
    const identity = row && row.identity || {};
    return Array.from(new Set([
      identity.type,
      identity.label,
      identity.sourceLabel,
      row && row.identityType,
      row && row.targetIdentity,
      row && row.label,
      ...(row && row.representedEntityIds || []),
    ].map(normalizeSemanticIdentity).filter(Boolean)));
  }

  function normalizeSemanticIdentity(value = '') {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function detectorCheck(id, actual, expected) {
    return { id, actual, expected, pass: actual === expected };
  }

  return Object.freeze({
    stableRenderEvidenceValue,
    immutableRenderEvidence,
    scenePacketRenderEvidenceHash,
    phase7PixelSampleSource,
    phase7PixelSampleSetValidation,
    phase7SemanticAbsenceProof,
  });
});
