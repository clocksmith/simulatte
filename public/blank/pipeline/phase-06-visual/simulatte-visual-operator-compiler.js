(function attachSimulatteVisualOperatorCompiler(root, factory) {
  const atlas = typeof module === 'object' && module.exports
    ? require('./simulatte-visual-operator-atlas.js')
    : root.SimulatteVisualOperatorAtlas;
  const api = factory(atlas);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteVisualOperatorCompiler = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createVisualOperatorCompilerApi(atlas = {}) {
  const VISUAL_OPERATOR_COMPILER_SCHEMA = 'simulatte.visualOperatorCompiler.v1';
  const GRAPHICS_ATOM_PLAN_SCHEMA = atlas.GRAPHICS_ATOM_PLAN_SCHEMA || 'simulatte.graphicsAtomPlan.v1';
  const GRAPHICS_ATOM_UNIFORMS_SCHEMA = atlas.GRAPHICS_ATOM_UNIFORMS_SCHEMA || 'simulatte.graphicsAtomUniforms.v1';
  const VISUAL_ATOM_UNIFORM_SLOTS = Object.freeze(atlas.VISUAL_ATOM_UNIFORM_SLOTS || [
    'thermal',
    'fluid',
    'stress',
    'feedback',
    'orbital',
    'electromagnetic',
    'optical',
    'quantum',
    'acoustic',
    'biological',
    'chemical',
    'network',
    'granular',
    'instrument',
    'combustion',
    'phase',
    'robotic',
    'measurement',
    'motion',
    'density',
    'emission',
    'constraint',
    'signal',
    'surface',
  ]);

  function compileVisualGraphicsAtoms(context = {}) {
    const text = visualOperatorContextText(context);
    const normalized = normalizeText(text);
    const entries = (atlas.VISUAL_OPERATOR_MAPPINGS || [])
      .map((row, index) => scoreMapping(row, index, text, normalized, context));
    const accepted = selectDiverseMappings(entries, 10);
    const source = accepted.map(compiledMapping);
    const topologyAtoms = compositionTopologyAtoms(context);
    const uniforms = compileAtomUniforms(source);
    return {
      schema: GRAPHICS_ATOM_PLAN_SCHEMA,
      compiler: VISUAL_OPERATOR_COMPILER_SCHEMA,
      atlas: atlas.VISUAL_OPERATOR_ATLAS_SCHEMA || 'simulatte.visualOperatorAtlas.v1',
      atlasId: 'simulatte-visual-operator-atlas-v1',
      source: 'handwritten-operator-graphics-basis',
      contextHash: stableContextHash(text),
      mappings: source,
      geometry: uniqueAtomRows([
        ...atomsForCategory(source, 'geometryAtoms', 'geometry'),
        ...topologyAtoms,
      ]),
      fields: atomsForCategory(source, 'fieldAtoms', 'field'),
      materials: atomsForCategory(source, 'materialAtoms', 'material'),
      processes: atomsForCategory(source, 'processAtoms', 'process'),
      motion: atomsForCategory(source, 'motionAtoms', 'motion'),
      camera: atomsForCategory(source, 'cameraAtoms', 'camera'),
      languageSignals: compiledLanguageSignals(context),
      uniforms,
      wgslOperators: uniqueStrings(source.flatMap((row) => row.wgslOperators || [])),
      receipts: source.map((row) => ({
        id: `receipt:${row.id}`,
        reason: row.receiptText,
        score: row.score,
        matchedTerms: row.matchedTerms || [],
        uniformSlots: row.uniformSlots || [],
        wgslOperators: row.wgslOperators || [],
      })),
      rejections: entries
        .filter((entry) => !entry.accepted)
        .sort((a, b) => b.weightedScore - a.weightedScore || a.index - b.index)
        .slice(0, 10)
        .map((entry) => ({
          id: entry.row.id,
          score: Number(entry.rawScore.toFixed(3)),
          reason: entry.rejectionReason,
          matchedTerms: entry.matchedTerms,
        })),
    };
  }

  function compositionTopologyAtoms(context = {}) {
    const genome = context.visualGenome || {};
    const topology = normalizeText(genome.compositionTopology || '').replace(/\s+/g, '-');
    if (!topology) return [];
    return [{
      id: `composition-topology-${topology}`,
      category: 'geometry',
      label: `Composition topology ${topology}`,
      sourceMappingIds: [],
      evidence: [
        `visual-dialect:${genome.visualDialect || 'compiled-scene'}`,
        `composition-topology:${topology}`,
      ],
    }];
  }

  function uniqueAtomRows(rows = []) {
    const ids = new Set();
    return (rows || []).filter((row) => row && row.id && !ids.has(row.id) && ids.add(row.id));
  }

  function scoreMapping(row, index, text, normalized, context) {
    const matchedTerms = termsMatched(row.matchTerms || [], text, normalized);
    const directRequirements = passesRequires(row.requires || [], directRequirementEvidence(context));
    const solverRequirements = passesRequires(row.requires || [], solverRequirementEvidence(context));
    const requireResult = directRequirements.ok ? directRequirements : solverRequirements;
    const hasActivityEvidence = mappingHasActivityEvidence(row, context);
    const blockedTerms = termsMatched(row.excludes || [], text, normalized);
    const sceneGate = sceneAcceptsMapping(context, row);
    let score = 0;
    for (const term of matchedTerms) {
      score += /[_-]/.test(term) ? 0.36 : 0.24;
    }
    if (contextHasCausalAffordance(context, row)) score += 0.24;
    if (contextHasSolverFamily(context, row)) score += 0.18;
    if (contextHasObjectEvidence(context, row)) score += 0.14;
    if (contextHasAcceptedActivation(context, row)) score += 0.16;
    const priority = Number(row.priority || 1);
    const rawScore = score;
    const weightedScore = rawScore * priority;
    const minimum = Number(row.minimumScore || 0.5);
    let accepted = true;
    let rejectionReason = '';
    if (!hasActivityEvidence) {
      accepted = false;
      rejectionReason = 'missing-executable-or-causal-evidence';
    } else if (!requireResult.ok) {
      accepted = false;
      rejectionReason = 'missing-required-language-evidence';
    } else if (blockedTerms.length) {
      accepted = false;
      rejectionReason = `excluded-by:${blockedTerms.join(',')}`;
    } else if (!sceneGate.ok) {
      accepted = false;
      rejectionReason = sceneGate.reason;
    } else if (weightedScore < minimum) {
      accepted = false;
      rejectionReason = `below-minimum:${minimum}`;
    }
    return {
      row,
      index,
      accepted,
      rejectionReason,
      rawScore,
      weightedScore,
      matchedTerms,
      requiredGroups: requireResult.matchedGroups,
    };
  }

  function mappingHasActivityEvidence(row = {}, context = {}) {
    const executableTypes = new Set([
      ...((context.solverPlan && context.solverPlan.steps) || []),
      ...((context.solverPlan && context.solverPlan.executableSteps) || []),
    ].map(solverStepText));
    return (row.operatorTypes || []).some((type) => executableTypes.has(type));
  }

  function solverRequirementEvidence(context = {}) {
    return uniqueStrings([
      ...((context.solverPlan && context.solverPlan.steps) || []).map(solverStepText),
      ...((context.solverPlan && context.solverPlan.executableSteps) || []).map(solverStepText),
    ]).map((text) => ({ text, negationText: '' }));
  }

  function compiledMapping(entry) {
    return {
      id: entry.row.id,
      score: Number(entry.weightedScore.toFixed(3)),
      matchedTerms: entry.matchedTerms,
      requiredGroups: entry.requiredGroups,
      uniformSlots: entry.row.uniformSlots || [],
      operatorTypes: entry.row.operatorTypes || [],
      wgslOperators: entry.row.wgslOperators || [],
      receiptText: entry.row.receiptText,
    };
  }

  function selectDiverseMappings(entries, limit) {
    const sorted = (entries || [])
      .filter((entry) => entry.accepted)
      .sort((a, b) => b.weightedScore - a.weightedScore || a.index - b.index);
    const selected = [];
    const slots = new Set();
    for (const entry of sorted) {
      const primary = primaryUniformSlot(entry.row);
      if (primary && slots.has(primary)) continue;
      selected.push(entry);
      if (primary) slots.add(primary);
      if (selected.length >= limit) return selected;
    }
    for (const entry of sorted) {
      if (selected.includes(entry)) continue;
      selected.push(entry);
      if (selected.length >= limit) return selected;
    }
    return selected;
  }

  function primaryUniformSlot(row) {
    return row && row.uniformSlots && row.uniformSlots[0] || '';
  }

  function atomsForCategory(matched, key, category) {
    const byId = new Map();
    for (const match of matched || []) {
      const row = (atlas.VISUAL_OPERATOR_MAPPINGS || []).find((item) => item.id === match.id);
      for (const atomId of row && row[key] || []) {
        if (!byId.has(atomId)) {
          byId.set(atomId, {
            id: atomId,
            category,
            label: labelize(atomId),
            uniformSlots: match.uniformSlots || row.uniformSlots || [],
            wgslOperators: match.wgslOperators || row.wgslOperators || [],
            sourceMappingIds: [],
            evidence: [],
          });
        }
        const atom = byId.get(atomId);
        atom.sourceMappingIds.push(match.id);
        atom.evidence.push(`mapping:${match.id}`);
      }
    }
    return Array.from(byId.values()).slice(0, 18);
  }

  function compileAtomUniforms(mappings = []) {
    const bySlot = Object.fromEntries(VISUAL_ATOM_UNIFORM_SLOTS.map((slot) => [slot, 0]));
    for (const mapping of mappings) {
      const signal = clamp01(Number(mapping.score || 0) / 1.4);
      (mapping.uniformSlots || []).forEach((slot, index) => {
        if (!(slot in bySlot)) return;
        const decay = 1 - index * 0.08;
        bySlot[slot] = Math.max(bySlot[slot], Number((signal * Math.max(0.64, decay)).toFixed(3)));
      });
    }
    const values = VISUAL_ATOM_UNIFORM_SLOTS.map((slot) => bySlot[slot] || 0);
    return {
      schema: GRAPHICS_ATOM_UNIFORMS_SCHEMA,
      order: VISUAL_ATOM_UNIFORM_SLOTS.slice(),
      values,
      bySlot,
    };
  }

  function graphicsAtomUniformVector(plan, width = 24) {
    const vector = new Float32Array(width);
    const values = plan && plan.uniforms && Array.isArray(plan.uniforms.values)
      ? plan.uniforms.values
      : [];
    for (let i = 0; i < Math.min(width, values.length); i += 1) {
      vector[i] = clamp01(Number(values[i] || 0));
    }
    return vector;
  }

  function passesRequires(groups, evidenceRows) {
    if (!groups || !groups.length) return { ok: true, matchedGroups: [] };
    const matchedGroups = [];
    for (const group of groups) {
      const matched = termsMatchedByEvidence(group, evidenceRows);
      if (matched.length) matchedGroups.push(matched);
    }
    return { ok: matchedGroups.length > 0, matchedGroups };
  }

  function termsMatchedByEvidence(terms, evidenceRows) {
    const rows = Array.isArray(evidenceRows) ? evidenceRows : [];
    return uniqueStrings((terms || []).filter((term) => rows.some((row) => {
      const text = String(row && row.text || '').toLowerCase();
      const normalized = normalizeText(text);
      return termsMatched([term], text, normalized).length > 0 &&
        !termNegatedInText(term, row && row.negationText || text);
    })));
  }

  function termsMatched(terms, text, normalized) {
    return uniqueStrings((terms || []).filter((term) => {
      return termMatchesText(term, text, normalized);
    }));
  }

  function termMatchesText(term, text, normalized) {
    const raw = String(term || '').toLowerCase();
    const plain = normalizeText(raw);
    if (!plain) return false;
    const normalizedText = normalizeText(normalized || text || '');
    if (phraseInText(normalizedText, plain)) return true;
    return /[_-]/.test(raw) && phraseInText(normalizedText, normalizeText(raw.replace(/[_-]+/g, ' ')));
  }

  function phraseInText(text, phrase) {
    if (!text || !phrase) return false;
    const escaped = phrase
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\s+/g, '\\s+');
    return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`).test(text);
  }

  function contextHasCausalAffordance(context, row) {
    const text = normalizeText((context.causalAffordances || []).map((item) => [
      item.id,
      item.causalRelationId,
      item.geometry,
      ...(item.shaderHints || []),
      ...(item.motionHints || []),
    ].filter(Boolean).join(' ')).join(' '));
    return termsMatched(row.matchTerms || [], text, text).length > 0;
  }

  function contextHasSolverFamily(context, row) {
    const solverText = normalizeText([
      ...((context.solverPlan && context.solverPlan.steps) || []).map(solverStepText),
      ...((context.solverPlan && context.solverPlan.executableSteps) || []).map(solverStepText),
    ].join(' '));
    return termsMatched(row.matchTerms || [], solverText, solverText).length > 0;
  }

  function contextHasObjectEvidence(context, row) {
    const objects = (context.objects || []).filter((object) => object && object.source !== 'catalog');
    const objectText = normalizeText(objects.map((object) => [
      object.id,
      object.role,
      object.phrase,
      object.assembly,
      object.visualRegime,
      object.semanticRef,
      object.physicalRef,
    ].filter(Boolean).join(' ')).join(' '));
    return termsMatched(row.matchTerms || [], objectText, objectText).length > 0;
  }

  function contextHasAcceptedActivation(context, row) {
    const text = compiledDirectLanguageText(context);
    return termsMatched(row.matchTerms || [], text, text).length > 0;
  }

  function visualOperatorContextText(context = {}) {
    const objects = (context.objects || []).filter(isEvidenceObject);
    return [
      context.sceneKind,
      compiledIntentBriefText(context),
      ...objects.map((object) => [
        object.id,
        object.shape,
        object.role,
        object.phrase,
        object.assembly,
        object.visualRegime,
        object.semanticRef,
        object.physicalRef,
      ].filter(Boolean).join(' ')),
      ...(context.fields || []).filter((field) => isSemanticField(field, context)).map((field) => [
        field.id,
        field.kind,
        field.channel,
        field.stateBinding,
        field.domainId,
      ].filter(Boolean).join(' ')),
      ...((context.solverPlan && context.solverPlan.steps) || []).map(solverStepText),
      ...((context.solverPlan && context.solverPlan.executableSteps) || []).map(solverStepText),
      ...((context.causalAffordances || []).map((row) => [
        row.id,
        row.causalRelationId,
        row.sceneKind,
        row.geometry,
        ...(row.shaderHints || []),
        ...(row.motionHints || []),
      ].filter(Boolean).join(' '))),
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function sceneAcceptsMapping(context = {}, row = {}) {
    const scene = normalizeText(context.sceneKind || '');
    const direct = directLanguageText(context);
    const id = String(row.id || '');
    const directHas = (pattern) => pattern.test(direct);
    if (/control-feedback/.test(id)) {
      const feedbackScene = directHas(/\b(control|controller|feedback|sensor|throttle|stabilize|regulate)\b/);
      if (!feedbackScene) return { ok: false, reason: 'scene-gate:no-direct-feedback-evidence' };
    }
    if (/robot-contact/.test(id)) {
      const robotScene = directHas(/\b(robot|robotic|gripper|servo|workcell|manipulator)\b|\bpick\s+and\s+place\b/);
      if (!robotScene) return { ok: false, reason: 'scene-gate:no-direct-robotics-evidence' };
    }
    if (/quantum-phase-readout/.test(id)) {
      const quantumScene = directHas(/\b(qubit|quantum|microwave|superconducting|resonator)\b/);
      if (!quantumScene) return { ok: false, reason: 'scene-gate:no-direct-quantum-evidence' };
    }
    if (/structural-stress/.test(id)) {
      const structuralScene = directHas(/\bbridge(?: deck)?\b/) &&
        directHas(/\b(cable tension|tension|stress|strain)\b/);
      if (!structuralScene) return { ok: false, reason: 'scene-gate:no-direct-bridge-stress-evidence' };
    }
    const watershedLike = /watershed|restoration water|ocean cryosphere|weather atmosphere|hazard atmosphere/.test(scene) ||
      /\b(watershed|river|rain|erosion|erodes|sediment|terrain|mountain|delta|aquifer|storm surge|glacier|ocean)\b/.test(direct);
    if (watershedLike) {
      if (/robot-contact/.test(id)) {
        return directHas(/\b(robot|robotic|gripper|servo|workcell|manipulator)\b/)
          ? { ok: true, reason: '' }
          : { ok: false, reason: 'scene-gate:no-direct-robotics-evidence' };
      }
      if (/orbital-gravity/.test(id)) {
        return directHas(/\b(orbit|orbital|planet|moon|asteroid|rocket|space|barycenter)\b/)
          ? { ok: true, reason: '' }
          : { ok: false, reason: 'scene-gate:no-direct-orbital-evidence' };
      }
      if (/electromagnetic-field/.test(id)) {
        return directHas(/\b(magnet|magnetic|coil|current|voltage|electric|charge|plasma)\b/)
          ? { ok: true, reason: '' }
          : { ok: false, reason: 'scene-gate:no-direct-electromagnetic-evidence' };
      }
      if (/quantum-phase-readout/.test(id)) {
        return directHas(/\b(qubit|quantum|microwave|superconducting|resonator)\b/)
          ? { ok: true, reason: '' }
          : { ok: false, reason: 'scene-gate:no-direct-quantum-evidence' };
      }
      if (/biological-growth/.test(id)) {
        return directHas(/\b(biology|biological|biofilm|cell|protein|root|coral|algae|mycelium|membrane|microbe|yeast|ferment|fermentation|sourdough|gluten|dough|compost|greenhouse|nutrient|biomass|crop|plant|plants|flower|flowers|tree|trees|leaf|leaves|dog|dogs|cat|cats|animal|animals|mammal|mammals|mangrove|kelp|plankton)\b/)
          ? { ok: true, reason: '' }
          : { ok: false, reason: 'scene-gate:no-direct-biological-evidence' };
      }
      if (/acoustic-wave/.test(id)) {
        return directHas(/\b(acoustic|sound|resonance|standing wave|standing waves|pressure wave|pressure waves|waveguide|speaker|frequency|vibration|pressure ring|levitator|brass tube)\b/)
          ? { ok: true, reason: '' }
          : { ok: false, reason: 'scene-gate:no-direct-acoustic-evidence' };
      }
      if (/network-flow/.test(id)) {
        return directHas(/\b(network|queue|market|traffic|route|packet|server|parcel|zoning|agent|dispatch)\b/)
          ? { ok: true, reason: '' }
          : { ok: false, reason: 'scene-gate:no-direct-network-evidence' };
      }
    }
    const networkLike = /civic market|digital network|venue crowd|city/.test(scene) ||
      /\b(market|parcel|parcels|zoning|queue|traffic|server|rack|racks|data center|service graph|warehouse)\b/.test(direct);
    if (!networkLike) return { ok: true, reason: '' };
    if (/fluid-advection/.test(id)) {
      const solverHasAdvection = solverRequirementEvidence(context)
        .some((row) => /\badvection\b/.test(normalizeText(row.text)));
      return directHas(/\b(water|river|wind|airflow|coolant|microfluidic|droplet|droplets|pump|channel|meniscus|fluid|swim|swims|swimming|underwater|pool)\b/) ||
        solverHasAdvection && directHas(/\b(flow|flows|cooling)\b/)
        ? { ok: true, reason: '' }
        : { ok: false, reason: 'scene-gate:no-direct-fluid-evidence' };
    }
    if (/heat-transfer|thermal-combustion|phase-transition/.test(id)) {
      return directHas(/\b(heat|heats|heated|thermal|cooling|coolant|temperature|fire|flame|smoke|lava|steam|phase|melt|freeze)\b/)
        ? { ok: true, reason: '' }
        : { ok: false, reason: 'scene-gate:no-direct-thermal-evidence' };
    }
    if (/electromagnetic-field/.test(id)) {
      return directHas(/\b(magnet|magnetic|coil|current|voltage|electric|charge|plasma|inverter|transformer|grid)\b/)
        ? { ok: true, reason: '' }
        : { ok: false, reason: 'scene-gate:no-direct-electromagnetic-evidence' };
    }
    if (/acoustic-wave/.test(id)) {
      return directHas(/\b(acoustic|sound|resonance|standing wave|standing waves|pressure wave|pressure waves|waveguide|speaker|frequency|vibration|pressure ring|levitator|brass tube)\b/)
        ? { ok: true, reason: '' }
        : { ok: false, reason: 'scene-gate:no-direct-acoustic-evidence' };
    }
    return { ok: true, reason: '' };
  }

  function directLanguageText(context = {}) {
    const objects = (context.objects || []).filter(isEvidenceObject);
    return normalizeText([
      compiledDirectLanguageText(context),
      ...objects.map((object) => [
        object.phrase,
      ].filter(Boolean).join(' ')),
    ].filter(Boolean).join(' '));
  }

  function compiledIntentBrief(context = {}) {
    return context && context.spec && context.spec.universeGraph && context.spec.universeGraph.intentBrief ||
      context && context.spec && context.spec.renderIR && context.spec.renderIR.intentBriefReceipt ||
      null;
  }

  function compiledIntentBriefText(context = {}) {
    const brief = compiledIntentBrief(context);
    if (!brief) return '';
    const negationContext = negationContextForBrief(brief);
    return normalizeText([
      brief.schema,
      ...(brief.causalEdgeIds || []),
      ...(brief.causalAffordanceIds || []),
      ...(brief.shaderHints || []),
      ...(brief.motionHints || []),
      ...((brief.acceptedActivations || []).map(positiveActivationVisualText)),
      ...((brief.languageSpans || []).map((row) => [
        row.id,
        row.kind,
        positiveSpanText(row, negationContext),
      ].filter(Boolean).join(' '))),
      ...((brief.visualAffordances || []).map((row) => [
        row.id,
        row.causalRelationId,
        row.sceneKind,
        row.geometry,
        ...(row.shaderHints || []),
        ...(row.motionHints || []),
      ].filter(Boolean).join(' '))),
    ].filter(Boolean).join(' '));
  }

  function compiledDirectLanguageText(context = {}) {
    const brief = compiledIntentBrief(context);
    if (!brief) return '';
    const negationContext = negationContextForBrief(brief);
    return normalizeText([
      ...((brief.acceptedActivations || []).map(positiveActivationVisualText)),
      ...((brief.languageSpans || []).map((row) => [
        row.kind,
        positiveSpanText(row, negationContext),
      ].filter(Boolean).join(' '))),
    ].filter(Boolean).join(' '));
  }

  function directRequirementEvidence(context = {}) {
    const brief = compiledIntentBrief(context);
    if (!brief) return directContextRequirementEvidence(context);
    const negationContext = negationContextForBrief(brief);
    return [
      ...((brief.acceptedActivations || []).map((row, index) => ({
        id: row.activationId || row.candidateId || `accepted.${index}`,
        text: positiveActivationVisualText(row),
        negationText: [row.spanText, negationContext].filter(Boolean).join(' '),
      }))),
      ...((brief.languageSpans || []).map((row, index) => ({
        id: row.id || `span.${index}`,
        text: [row.kind, positiveSpanText(row, negationContext)].filter(Boolean).join(' '),
        negationText: [row.text, negationContext].filter(Boolean).join(' '),
      }))),
    ].filter((row) => row.text);
  }

  function directContextRequirementEvidence(context = {}) {
    return [
      ...((context.objects || []).filter(isEvidenceObject).map((object, index) => ({
        id: object.id || `object.${index}`,
        text: positiveLanguageText([
          object.phrase,
          object.role,
        ].filter(Boolean).join(' ')),
        negationText: object.phrase || object.role || '',
      }))),
      ...((context.fields || []).map((field, index) => ({
        id: field.id || `field.${index}`,
        text: positiveLanguageText([
          field.kind,
          field.channel,
          field.stateBinding,
          field.domainId,
        ].filter(Boolean).join(' ')),
        negationText: '',
      }))),
      ...((context.causalAffordances || []).map((row, index) => ({
        id: row.id || `affordance.${index}`,
        text: positiveLanguageText([
          row.geometry,
          ...(row.shaderHints || []),
          ...(row.motionHints || []),
        ].filter(Boolean).join(' ')),
        negationText: row.geometry || '',
      }))),
    ].filter((row) => row.text);
  }

  function negationContextForBrief(brief = {}) {
    return (brief.languageSpans || [])
      .map((row) => row && row.text || '')
      .filter(containsNegation)
      .join(' ');
  }

  function positiveSpanText(row = {}, negationContext = '') {
    const text = String(row.text || '');
    if (!text) return '';
    if (phraseNegatedInText(text, negationContext)) return '';
    return positiveLanguageText(text);
  }

  function activationVisualText(row = {}) {
    const directSignal = row.source === 'language-evidence-visual-signal' ||
      /^language\.visual\./.test(String(row.candidateId || ''));
    return [
      row.spanKind,
      row.spanText,
      directSignal ? row.candidateId : '',
      directSignal ? row.candidateKind : '',
      directSignal ? row.candidateLabel : '',
      ...(directSignal ? row.operatorHints || [] : []),
    ].filter(Boolean).join(' ');
  }

  function positiveActivationVisualText(row = {}) {
    if (containsNegation(row.spanText)) {
      return [
        row.spanKind,
        positiveLanguageText(row.spanText),
      ].filter(Boolean).join(' ');
    }
    return positiveLanguageText(activationVisualText(row));
  }

  function positiveLanguageText(value = '') {
    let text = String(value || '');
    const word = "[a-z0-9]+(?:[-'][a-z0-9]+)*";
    const stop = '(?:and|with|while|where|when|because|but|however|though|although|unless|inside|outside|near|around|between|against|across|during|through|then|so)';
    const negated = new RegExp(`\\b(?:no|not|never|none|without|cannot|can't|wont|won't|avoid|exclude|except)\\b(?:\\s+(?:a|an|the|any))?(?:\\s+(?!\\b${stop}\\b)${word}){1,6}`, 'gi');
    text = text.replace(negated, ' ');
    return text.replace(/\s+/g, ' ').trim();
  }

  function containsNegation(value = '') {
    return /\b(no|not|never|none|without|cannot|can't|wont|won't|avoid|exclude|except)\b/i.test(String(value || ''));
  }

  function termNegatedInText(term, text) {
    const termTokens = tokensFor(term);
    const tokens = tokensFor(text);
    if (!termTokens.length || !tokens.length) return false;
    for (let index = 0; index <= tokens.length - termTokens.length; index += 1) {
      if (!termTokens.every((token, offset) => tokens[index + offset] === token)) continue;
      for (let cursor = index - 1, depth = 0; cursor >= 0 && depth < 6; cursor -= 1, depth += 1) {
        if (/^(and|with|while|where|when|because|but|however|though|although|unless|inside|outside|near|around|between|against|across|during|through|then|so)$/.test(tokens[cursor])) break;
        if (/^(no|not|never|none|without|cannot|can't|wont|won't|avoid|exclude|except)$/.test(tokens[cursor])) return true;
      }
    }
    return false;
  }

  function phraseNegatedInText(phrase, text) {
    return termNegatedInText(phrase, text);
  }

  function tokensFor(value = '') {
    return normalizeText(value).match(/[a-z0-9]+(?:['-][a-z0-9]+)*/g) || [];
  }

  function compiledLanguageSignals(context = {}) {
    const brief = compiledIntentBrief(context);
    if (!brief) return [];
    const rows = [];
    const push = (source, id, kind, text, score) => {
      const normalized = normalizeText(text);
      if (!normalized) return;
      const slots = VISUAL_ATOM_UNIFORM_SLOTS.filter((slot) => normalized.includes(slot));
      rows.push({
        id,
        source,
        kind,
        text: normalized,
        score: Number(score || 0),
        slots: uniqueStrings(slots),
      });
    };
    (brief.acceptedActivations || []).forEach((row, index) => {
      const text = positiveActivationVisualText(row);
      if (!text) return;
      push(
        'accepted-activation',
        row.activationId || row.candidateId || `accepted.${index}`,
        row.candidateKind || row.spanKind || 'activation',
        text,
        row.score
      );
    });
    const negationContext = negationContextForBrief(brief);
    (brief.languageSpans || []).slice(0, 18).forEach((row, index) => {
      push('language-span', row.id || `span.${index}`, row.kind || 'span', positiveSpanText(row, negationContext), 0.34);
    });
    return rows.slice(0, 36);
  }

  function solverStepText(step) {
    if (!step || typeof step !== 'object') return String(step || '');
    return [
      step.id,
      step.family,
      step.operatorType,
      step.operatorId,
      step.solverId,
      step.name,
      step.kind,
    ].filter(Boolean).join(' ');
  }

  function isEvidenceObject(object) {
    const source = String(object && object.source || '');
    if (!object || source === 'catalog') return false;
    return Boolean(source || object.phrase || object.semanticRef || object.physicalRef);
  }

  function isSemanticField(field, context = {}) {
    const text = normalizeText([
      field && field.id,
      field && field.kind,
      field && field.channel,
      field && field.stateBinding,
    ].filter(Boolean).join(' '));
    if (!/temperature|thermal|heat/.test(text)) return true;
    const solverText = normalizeText([
      ...((context.solverPlan && context.solverPlan.steps) || []).map(solverStepText),
      ...((context.solverPlan && context.solverPlan.executableSteps) || []).map(solverStepText),
    ].join(' '));
    const causalText = normalizeText((context.causalAffordances || []).map((row) => [
      row.id,
      row.causalRelationId,
      row.geometry,
      ...(row.shaderHints || []),
      ...(row.motionHints || []),
    ].filter(Boolean).join(' ')).join(' '));
    const sceneText = normalizeText(context.sceneKind || '');
    return /heat|thermal|combust|fire|phase|lava|steam/.test(`${solverText} ${causalText} ${sceneText}`);
  }

  function stableContextHash(text) {
    let hash = 2166136261;
    for (let i = 0; i < String(text || '').length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }

  function normalizeText(value) {
    return String(value || '').toLowerCase().replace(/[_-]+/g, ' ');
  }

  function labelize(value) {
    return String(value || '')
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function clamp01(value) {
    return Math.min(1, Math.max(0, Number(value || 0)));
  }

  function uniqueStrings(rows) {
    return Array.from(new Set((rows || []).filter(Boolean)));
  }

  return {
    GRAPHICS_ATOM_PLAN_SCHEMA,
    GRAPHICS_ATOM_UNIFORMS_SCHEMA,
    VISUAL_ATOM_UNIFORM_SLOTS,
    VISUAL_OPERATOR_COMPILER_SCHEMA,
    compileVisualGraphicsAtoms,
    graphicsAtomUniformVector,
    visualOperatorContextText,
  };
});
