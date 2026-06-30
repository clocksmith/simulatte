(function activationCloudModule(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SimulatteActivationCloud = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function activationCloudFactory() {
  'use strict';

  const LANGUAGE_VISUAL_SIGNAL_RULES = Object.freeze([
    signalRule('thermal', 'thermal operator signal', /\b(heat|thermal|temperature|cooling|coolant|steam|lava|hot|cold|melt|freeze|phase|fire|flame|smoke)\b/, ['heat', 'thermal', 'phase'], ['thermal-gradient', 'phase-boundary', 'emission'], ['temperature', 'heat_transfer']),
    signalRule('fluid', 'fluid operator signal', /\b(flow|fluid|water|river|wind|airflow|coolant|pump|channel|droplet|pressure|velocity|turbulence|vortex)\b/, ['flow', 'pressure', 'advection'], ['streamline', 'flow-ribbon', 'tracer'], ['flowVelocity', 'pressure']),
    signalRule('stress', 'stress operator signal', /\b(stress|strain|fracture|crack|impact|collision|load|buckling|contact|deform|shear|torque)\b/, ['stress', 'contact', 'constraint'], ['crack-network', 'strain-field', 'contact-pad'], ['stress', 'damage']),
    signalRule('feedback', 'feedback operator signal', /\b(control|controller|feedback|sensor|setpoint|regulate|stabilize|actuator|valve|loop|throttle)\b/, ['feedback', 'control', 'signal'], ['feedback-arc', 'sensor-probe', 'setpoint-band'], ['control', 'signalDelay']),
    signalRule('orbital', 'orbital operator signal', /\b(orbit|orbital|gravity|planet|moon|asteroid|rocket|space|barycenter|trajectory)\b/, ['orbit', 'gravity', 'trajectory'], ['gravity-well', 'trajectory-arc', 'orbital-body'], ['position', 'velocity']),
    signalRule('electromagnetic', 'electromagnetic operator signal', /\b(magnet|magnetic|electric|charge|current|voltage|coil|plasma|field|flux|inverter|transformer)\b/, ['field', 'charge', 'electromagnetic'], ['flux-line', 'charged-node', 'coil-loop'], ['fieldStrength', 'voltage']),
    signalRule('optical', 'optical operator signal', /\b(light|laser|lens|prism|mirror|photon|caustic|refraction|interference|ray|spectral)\b/, ['optical', 'ray', 'phase'], ['ray-cone', 'caustic-field', 'spectral-prism'], ['amplitude', 'phase']),
    signalRule('quantum', 'quantum operator signal', /\b(quantum|qubit|superconducting|microwave|resonator|spin|ion trap|readout)\b/, ['quantum', 'phase', 'measurement'], ['resonator-loop', 'phase-fringe', 'readout-strip'], ['phase', 'amplitude']),
    signalRule('acoustic', 'acoustic operator signal', /\b(acoustic|sound|wave|resonance|standing|frequency|speaker|vibration|pressure ring)\b/, ['wave', 'pressure', 'resonance'], ['pressure-ring', 'standing-node', 'waveguide'], ['amplitude', 'pressure']),
    signalRule('biological', 'biological operator signal', /\b(growth|cell|protein|root|coral|algae|mycelium|membrane|neuron|tissue|microbiome|enzyme)\b/, ['growth', 'diffusion', 'density'], ['branching-network', 'membrane-sheet', 'cell-cluster'], ['density', 'nutrient']),
    signalRule('chemical', 'chemical operator signal', /\b(reaction|chemical|acid|crystal|concentration|electrolyte|solvent|catalyst|reagent|diffusion|dose)\b/, ['reaction', 'diffusion', 'concentration'], ['reaction-front', 'diffusion-cloud', 'crystal-facet'], ['reactionProgress', 'concentration']),
    signalRule('network', 'network operator signal', /\b(network|queue|market|traffic|route|packet|server|parcel|zoning|agent|dispatch|supply|demand|crowd)\b/, ['network', 'queue', 'routing'], ['node-link-graph', 'parcel-grid', 'agent-token'], ['backlog', 'throughput']),
    signalRule('granular', 'granular operator signal', /\b(grain|sand|soil|sediment|erosion|terrain|slope|dust|powder|silo|avalanche|bead|sieve)\b/, ['granular', 'erosion', 'settling'], ['grain-pile', 'heightfield-strata', 'erosion-channel'], ['density', 'slope']),
    signalRule('instrument', 'instrument operator signal', /\b(detector|sensor|readout|instrument|probe|meter|scope|camera|phototube|calorimeter)\b/, ['measurement', 'readout', 'instrument'], ['probe-array', 'readout-strip', 'instrument-panel'], ['measurement', 'signal']),
    signalRule('robotic', 'robotic operator signal', /\b(robot|robotic|gripper|servo|workcell|manipulator|warehouse|sort|pick|place|armature)\b/, ['robotic', 'contact', 'control'], ['robot-armature', 'force-cone', 'workcell-grid'], ['contactForce', 'taskQueue'])
  ]);

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
      spanNativeVisualActivations(span, activations.length).forEach((activation) => {
        activations.push({
          ...activation,
          id: `activation.${String(activations.length + 1).padStart(4, '0')}`
        });
      });
    });

    return activations
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, maxActivations)
      .map((row, index) => ({ ...row, rank: index + 1 }));
  }

  function spanNativeVisualActivations(span, offset = 0) {
    const text = normalize(span.text);
    if (!text) return [];
    return LANGUAGE_VISUAL_SIGNAL_RULES
      .filter((rule) => rule.pattern.test(text))
      .slice(0, 4)
      .map((rule, index) => {
        const score = nativeSignalScore(span, rule, index);
        return {
          id: `activation.${String(offset + index + 1).padStart(4, '0')}`,
          spanId: span.id,
          spanKind: span.kind,
          spanText: span.text,
          candidateId: `language.visual.${rule.id}.${safeId(span.id)}`,
          candidateLabel: rule.label,
          candidateKind: 'visual-candidate',
          candidateIndex: 'language-evidence-visual-signal',
          score,
          evidenceScore: score,
          support: {
            lexicalOverlap: 1,
            spanContainsCandidate: true,
            candidateContainsSpan: false,
            compiledSpanSignal: true
          },
          hints: {
            primitive: rule.primitiveHints,
            operator: rule.operatorHints,
            visual: rule.visualHints
          },
          source: 'language-evidence-visual-signal'
        };
      });
  }

  function nativeSignalScore(span, rule, index) {
    const predicateBoost = span.kind === 'predicate' || span.kind === 'predicate-frame' ? 0.11 : 0;
    const frameBoost = span.kind === 'subject' || span.kind === 'object' || span.kind === 'result' ? 0.06 : 0;
    const termCount = termSet(span.text).size;
    const specificityBoost = Math.min(0.12, termCount * 0.012);
    return round(clamp(0.5 + predicateBoost + frameBoost + specificityBoost - index * 0.035, 0.42, 0.82));
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

  function signalRule(id, label, pattern, operatorHints, visualHints, primitiveHints) {
    return Object.freeze({
      id,
      label,
      pattern,
      operatorHints: Object.freeze(operatorHints || []),
      visualHints: Object.freeze(visualHints || []),
      primitiveHints: Object.freeze(primitiveHints || [])
    });
  }

  function safeId(value) {
    return normalize(value).replace(/\s+/g, '-') || 'span';
  }

  return {
    buildActivationCloud,
    summarizeActivationCloud,
    activationScore
  };
});
