(function activationCloudModule(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SimulatteActivationCloud = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function activationCloudFactory() {
  'use strict';

  function buildActivationCloud(options) {
    const languageEvidence = options && options.languageEvidence ? options.languageEvidence : {};
    const evidenceRows = Array.isArray(options && options.evidenceRows) ? options.evidenceRows : [];
    const maxActivations = Number.isFinite(options && options.maxActivations) ? options.maxActivations : 1500;
    const spans = languageSpans(languageEvidence);
    const activations = [];

    spans.forEach((span) => {
      evidenceRows.forEach((candidate) => {
        const score = activationScore(span, candidate);
        if (score < 0.12) return;
        activations.push({
          id: `activation.${String(activations.length + 1).padStart(4, '0')}`,
          spanId: span.id,
          spanKind: span.kind,
          spanText: span.text,
          candidateId: candidate.id || candidate.label || 'candidate.unknown',
          candidateLabel: candidate.label || candidate.id || 'unknown candidate',
          candidateKind: candidateKind(candidate),
          candidateIndex: candidate.indexName || null,
          score,
          evidenceScore: numeric(candidate.score, 0),
          support: {
            lexicalOverlap: lexicalOverlap(span.text, candidateText(candidate)),
            spanContainsCandidate: containsAny(span.text, [candidate.label, candidate.id]),
            candidateContainsSpan: containsAny(candidateText(candidate), [span.text])
          },
          hints: {
            primitive: array(candidate.primitiveHints),
            operator: array(candidate.operatorHints),
            visual: array(candidate.visualHints)
          },
          source: 'span-retrieval'
        });
      });
    });

    return activations
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, maxActivations)
      .map((row, index) => ({ ...row, rank: index + 1 }));
  }

  function summarizeActivationCloud(activations) {
    const rows = Array.isArray(activations) ? activations : [];
    const byKind = {};
    const bySpanKind = {};
    rows.forEach((row) => {
      byKind[row.candidateKind] = (byKind[row.candidateKind] || 0) + 1;
      bySpanKind[row.spanKind] = (bySpanKind[row.spanKind] || 0) + 1;
    });
    return {
      schema: 'simulatte.activationCloudSummary.v1',
      activationCount: rows.length,
      candidateKindCount: Object.keys(byKind).length,
      spanKindCount: Object.keys(bySpanKind).length,
      byKind,
      bySpanKind,
      topCandidates: rows.slice(0, 12).map((row) => ({
        id: row.candidateId,
        label: row.candidateLabel,
        kind: row.candidateKind,
        score: row.score,
        span: row.spanText
      }))
    };
  }

  function languageSpans(languageEvidence) {
    const rows = [];
    array(languageEvidence.spans).forEach((span) => {
      rows.push({ id: span.id, kind: span.kind || 'span', text: span.text });
    });
    array(languageEvidence.predicateFrames).forEach((frame) => {
      [
        ['subject', frame.subject],
        ['predicate', frame.predicate],
        ['object', frame.object],
        ['result', frame.result],
        ['predicate-frame', frame.text]
      ].forEach(([kind, text]) => {
        if (!text) return;
        rows.push({
          id: `${frame.id}.${kind}`,
          kind,
          text
        });
      });
    });
    return dedupeSpans(rows);
  }

  function dedupeSpans(rows) {
    const seen = new Set();
    return rows.filter((row) => {
      const key = `${row.kind}:${normalize(row.text)}`;
      if (!row.text || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function activationScore(span, candidate) {
    const evidenceScore = numeric(candidate.score, 0.35);
    const overlap = lexicalOverlap(span.text, candidateText(candidate));
    const containsBoost = containsAny(span.text, [candidate.label, candidate.id]) ? 0.22 : 0;
    const reverseBoost = containsAny(candidateText(candidate), [span.text]) ? 0.18 : 0;
    const predicateBoost = span.kind === 'predicate' || span.kind === 'predicate-frame' ? 0.08 : 0;
    const frameBoost = span.kind === 'subject' || span.kind === 'object' || span.kind === 'result' ? 0.04 : 0;
    return round(clamp((evidenceScore * 0.46) + (overlap * 0.34) + containsBoost + reverseBoost + predicateBoost + frameBoost, 0, 1));
  }

  function candidateText(candidate) {
    return [
      candidate.id,
      candidate.label,
      candidate.indexName,
      array(candidate.primitiveHints).join(' '),
      array(candidate.operatorHints).join(' '),
      array(candidate.visualHints).join(' ')
    ].filter(Boolean).join(' ');
  }

  function candidateKind(candidate) {
    const index = String(candidate.indexName || '').toLowerCase();
    const id = String(candidate.id || '').toLowerCase();
    if (index.includes('material') || id.startsWith('material.')) return 'material-candidate';
    if (index.includes('operator') || id.startsWith('operator.')) return 'operator-candidate';
    if (index.includes('causal') || id.includes('causal') || id.includes('relation.')) return 'causal-candidate';
    if (index.includes('visual') || id.includes('affordance')) return 'visual-candidate';
    if (index.includes('environment') || id.startsWith('environment.')) return 'environment-candidate';
    if (index.includes('primitive') || id.startsWith('primitive.')) return 'primitive-candidate';
    if (index.includes('concept') || id.startsWith('concept.')) return 'concept-candidate';
    return 'catalog-candidate';
  }

  function lexicalOverlap(a, b) {
    const left = termSet(a);
    const right = termSet(b);
    if (!left.size || !right.size) return 0;
    let matches = 0;
    left.forEach((term) => {
      if (right.has(term)) matches += 1;
    });
    return matches / Math.max(1, Math.min(left.size, right.size));
  }

  function containsAny(text, values) {
    const haystack = normalize(text);
    return array(values).some((value) => {
      const needle = normalize(value);
      return needle.length > 1 && haystack.includes(needle);
    });
  }

  function termSet(value) {
    const stop = new Set(['the', 'and', 'with', 'into', 'from', 'that', 'this', 'while', 'where', 'when', 'show', 'render', 'simulate']);
    return new Set(normalize(value).split(/\s+/).filter((term) => term.length > 1 && !stop.has(term)));
  }

  function normalize(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function array(value) {
    return Array.isArray(value) ? value.filter((item) => item !== undefined && item !== null) : [];
  }

  function numeric(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function round(value) {
    return Math.round(value * 10000) / 10000;
  }

  return {
    buildActivationCloud,
    summarizeActivationCloud,
    activationScore
  };
});
