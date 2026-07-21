(function attachNeuralPlaceResolutionCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteNeuralPlaceResolutionCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createNeuralPlaceResolutionCore() {
  const POLICY = Object.freeze({
    id: 'qwen-place-cosine-policy-v1',
    minimumSimilarity: 0.775,
    minimumMargin: 0.005,
    maximumCandidates: 5,
  });
  const TYPO_POLICY = Object.freeze({ id: 'damerau-place-typo-policy-v1', maximumDistanceRatio: 0.4, maximumDistanceCap: 5, minimumDistanceMargin: 2 });

  function extractPlaceQuery(sourceText, role) {
    const text = String(sourceText || '');
    const tokens = [...text.matchAll(/\b(from|to)\b/gi)];
    if (role === 'origin') {
      const from = tokens.find((row) => row[1].toLowerCase() === 'from');
      const to = tokens.find((row) => row[1].toLowerCase() === 'to' && row.index > (from?.index ?? -1));
      if (!from || !to) return '';
      return cleanQuery(text.slice(from.index + from[0].length, to.index));
    }
    const to = [...tokens].reverse().find((row) => row[1].toLowerCase() === 'to');
    if (!to) return '';
    const tail = text.slice(to.index + to[0].length);
    const boundary = /[!?;]|\.(?=\s+(?:prefer|avoid|yield)|\s*$)|\b(?:prefer|avoid|yield|while|without|using|and\s+(?:yield|avoid|prefer))\b/i.exec(tail);
    return cleanQuery(tail.slice(0, boundary ? boundary.index : tail.length));
  }

  function cleanQuery(value) {
    return String(value || '')
      .replace(/^\s*(?:the\s+)?/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function decodeIndex(index) {
    if (index?.schema !== 'simulatte.autonomyPlaceEmbeddingIndex.v1') throw new Error(`Unexpected place index schema ${index?.schema || 'missing'}`);
    if (index.encoding !== 'float32_little_endian_base64') throw new Error(`Unsupported place index encoding ${index.encoding}`);
    const bytes = decodeBase64(index.embeddingsPackedBase64);
    const expectedBytes = index.documentCount * index.embeddingDim * 4;
    if (bytes.byteLength !== expectedBytes) throw new Error(`Place index expected ${expectedBytes} vector bytes, received ${bytes.byteLength}`);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const vectors = Array.from({ length: index.documentCount }, (_, vectorIndex) => {
      const vector = new Float32Array(index.embeddingDim);
      for (let dimension = 0; dimension < index.embeddingDim; dimension += 1) {
        vector[dimension] = view.getFloat32((vectorIndex * index.embeddingDim + dimension) * 4, true);
      }
      return vector;
    });
    return {
      id: index.id,
      indexSha256: index.indexSha256,
      model: structuredClone(index.model),
      documents: index.documents.map((row) => structuredClone(row)),
      vectors,
      embeddingDim: index.embeddingDim,
    };
  }

  function rankVector(queryVector, decodedIndex, maximumCandidates = POLICY.maximumCandidates, eligibleNodeIds = null) {
    const normalized = normalizeVector(queryVector);
    if (normalized.length !== decodedIndex.embeddingDim) throw new Error(`Query embedding expected ${decodedIndex.embeddingDim} dimensions, received ${normalized.length}`);
    const eligible = eligibleNodeIds ? new Set(eligibleNodeIds) : null;
    return decodedIndex.vectors.map((vector, index) => ({
      placeId: decodedIndex.documents[index].placeId,
      nodeId: decodedIndex.documents[index].nodeId,
      label: decodedIndex.documents[index].label,
      similarity: round(dot(normalized, vector)),
    })).filter((row) => !eligible || eligible.has(row.nodeId))
      .sort((left, right) => right.similarity - left.similarity || left.placeId.localeCompare(right.placeId))
      .slice(0, maximumCandidates);
  }

  function decideRanking(ranking, policy = POLICY) {
    const first = ranking[0] || null;
    const second = ranking[1] || null;
    const margin = first ? round(first.similarity - (second?.similarity ?? -1)) : 0;
    let refusalReason = null;
    if (!first) refusalReason = 'no_candidates';
    else if (first.similarity < policy.minimumSimilarity) refusalReason = 'similarity_below_threshold';
    else if (margin < policy.minimumMargin) refusalReason = 'margin_below_threshold';
    return {
      outcome: refusalReason ? 'refuse' : 'resolve',
      nodeId: refusalReason ? null : first.nodeId,
      placeId: refusalReason ? null : first.placeId,
      label: refusalReason ? null : first.label,
      refusalReason,
      topSimilarity: first?.similarity ?? null,
      margin,
      ranking,
    };
  }

  function resolveExtendedTypo(queryText, documents, policy = TYPO_POLICY) {
    const query = normalizePlaceText(queryText);
    if (!query) return { outcome: 'refuse', refusalReason: 'empty_query', ranking: [] };
    const ranking = documents.map((row) => {
      const label = normalizePlaceText(row.label);
      return {
        placeId: row.placeId,
        nodeId: row.nodeId,
        label: row.label,
        distance: damerauLevenshtein(query, label),
        labelLength: label.length,
      };
    }).sort((left, right) => left.distance - right.distance || left.placeId.localeCompare(right.placeId));
    const first = ranking[0] || null;
    const second = ranking[1] || null;
    const maximumDistance = first
      ? Math.min(policy.maximumDistanceCap, Math.max(2, Math.floor(first.labelLength * policy.maximumDistanceRatio)))
      : 0;
    const distanceMargin = first && second ? second.distance - first.distance : 0;
    const accepted = first && first.distance <= maximumDistance && distanceMargin >= policy.minimumDistanceMargin;
    return {
      outcome: accepted ? 'resolve' : 'refuse',
      nodeId: accepted ? first.nodeId : null,
      placeId: accepted ? first.placeId : null,
      label: accepted ? first.label : null,
      refusalReason: accepted ? null : first?.distance > maximumDistance ? 'edit_distance_above_threshold' : 'edit_distance_margin_below_threshold',
      maximumDistance,
      distanceMargin,
      ranking: ranking.slice(0, 5),
    };
  }

  function normalizePlaceText(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function damerauLevenshtein(leftValue, rightValue) {
    const left = String(leftValue || '');
    const right = String(rightValue || '');
    const rows = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
    for (let leftIndex = 0; leftIndex <= left.length; leftIndex += 1) rows[leftIndex][0] = leftIndex;
    for (let rightIndex = 0; rightIndex <= right.length; rightIndex += 1) rows[0][rightIndex] = rightIndex;
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
        const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
        rows[leftIndex][rightIndex] = Math.min(
          rows[leftIndex - 1][rightIndex] + 1,
          rows[leftIndex][rightIndex - 1] + 1,
          rows[leftIndex - 1][rightIndex - 1] + cost
        );
        if (leftIndex > 1 && rightIndex > 1 && left[leftIndex - 1] === right[rightIndex - 2] && left[leftIndex - 2] === right[rightIndex - 1]) {
          rows[leftIndex][rightIndex] = Math.min(rows[leftIndex][rightIndex], rows[leftIndex - 2][rightIndex - 2] + cost);
        }
      }
    }
    return rows[left.length][right.length];
  }

  function normalizeVector(value) {
    const vector = value instanceof Float32Array ? value : Float32Array.from(value || []);
    let squared = 0;
    for (const row of vector) {
      if (!Number.isFinite(row)) throw new Error('Query embedding contains a non-finite value');
      squared += row * row;
    }
    const norm = Math.sqrt(squared);
    if (!(norm > 0)) throw new Error('Query embedding has zero norm');
    return Float32Array.from(vector, (row) => row / norm);
  }

  function dot(left, right) {
    let value = 0;
    for (let index = 0; index < left.length; index += 1) value += left[index] * right[index];
    return value;
  }

  function decodeBase64(value) {
    if (typeof Buffer !== 'undefined') {
      const bytes = Buffer.from(String(value || ''), 'base64');
      return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    }
    const binary = atob(String(value || ''));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  function round(value) {
    return Number(value.toFixed(8));
  }

  return {
    POLICY,
    TYPO_POLICY,
    cleanQuery,
    damerauLevenshtein,
    decodeIndex,
    decideRanking,
    extractPlaceQuery,
    normalizePlaceText,
    normalizeVector,
    rankVector,
    resolveExtendedTypo,
  };
});
