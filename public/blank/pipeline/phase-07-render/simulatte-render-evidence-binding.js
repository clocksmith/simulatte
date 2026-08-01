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

  return Object.freeze({
    stableRenderEvidenceValue,
    immutableRenderEvidence,
    scenePacketRenderEvidenceHash,
    phase7PixelSampleSource,
    phase7PixelSampleSetValidation,
  });
});
