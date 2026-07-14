function array(value) {
  return Array.isArray(value) ? value : [];
}

function parseRows(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function normalized(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function phraseInText(text, phrase) {
  const value = normalized(phrase);
  return Boolean(value) && ` ${text} `.includes(` ${value} `);
}

export function renderedSignalEvidence(signal = {}, result = {}) {
  const contract = signal.renderEvidence || {};
  const availableLayers = new Set(array(result.visualIRSceneRenderPacketLayers));
  const layerHits = array(contract.layerSlots).filter((slot) => availableLayers.has(slot));
  const proofRows = parseRows(result.phase7VisualObligationProof).filter((row) => (
    row && row.status === 'pass' && row.pixelSatisfied === true
  ));
  const proofHits = proofRows.filter((row) => {
    const text = normalized([row.obligationId, row.target].filter(Boolean).join(' '));
    return array(contract.proofTerms).some((term) => phraseInText(text, term));
  }).map((row) => row.obligationId || row.target).filter(Boolean);
  const bound = layerHits.length > 0 && proofHits.length > 0;
  return {
    strength: bound ? 0.5 : 0,
    layerHits,
    proofHits: proofHits.slice(0, 6),
    pixelBound: bound,
  };
}
