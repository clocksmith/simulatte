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
    const accepted = entries
      .filter((entry) => entry.accepted)
      .sort((a, b) => b.weightedScore - a.weightedScore || a.index - b.index)
      .slice(0, 7);
    const source = accepted.length ? accepted.map(compiledMapping) : [fallbackMapping(context)];
    const uniforms = compileAtomUniforms(source);
    return {
      schema: GRAPHICS_ATOM_PLAN_SCHEMA,
      compiler: VISUAL_OPERATOR_COMPILER_SCHEMA,
      atlas: atlas.VISUAL_OPERATOR_ATLAS_SCHEMA || 'simulatte.visualOperatorAtlas.v1',
      atlasId: 'simulatte-visual-operator-atlas-v1',
      source: 'handwritten-operator-graphics-basis',
      contextHash: stableContextHash(text),
      mappings: source,
      geometry: atomsForCategory(source, 'geometryAtoms', 'geometry'),
      fields: atomsForCategory(source, 'fieldAtoms', 'field'),
      materials: atomsForCategory(source, 'materialAtoms', 'material'),
      processes: atomsForCategory(source, 'processAtoms', 'process'),
      motion: atomsForCategory(source, 'motionAtoms', 'motion'),
      camera: atomsForCategory(source, 'cameraAtoms', 'camera'),
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

  function scoreMapping(row, index, text, normalized, context) {
    const matchedTerms = termsMatched(row.matchTerms || [], text, normalized);
    const requireResult = passesRequires(row.requires || [], text, normalized);
    const blockedTerms = termsMatched(row.excludes || [], text, normalized);
    const sceneGate = sceneAcceptsMapping(context, row);
    let score = 0;
    for (const term of matchedTerms) {
      score += /[_-]/.test(term) ? 0.36 : 0.24;
    }
    if (contextHasCausalAffordance(context, row)) score += 0.24;
    if (contextHasSolverFamily(context, row)) score += 0.18;
    if (contextHasObjectEvidence(context, row)) score += 0.14;
    const priority = Number(row.priority || 1);
    const rawScore = score;
    const weightedScore = rawScore * priority;
    const minimum = Number(row.minimumScore || 0.5);
    let accepted = true;
    let rejectionReason = '';
    if (!requireResult.ok) {
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

  function compiledMapping(entry) {
    return {
      id: entry.row.id,
      score: Number(entry.weightedScore.toFixed(3)),
      matchedTerms: entry.matchedTerms,
      requiredGroups: entry.requiredGroups,
      uniformSlots: entry.row.uniformSlots || [],
      wgslOperators: entry.row.wgslOperators || [],
      receiptText: entry.row.receiptText,
    };
  }

  function fallbackMapping(context) {
    const text = String(context.sceneKind || 'compiled').toLowerCase();
    const row = (atlas.VISUAL_OPERATOR_MAPPINGS || [])
      .find((item) => item.id === 'visual.operator.instrument-readout.v1') ||
      (atlas.VISUAL_OPERATOR_MAPPINGS || [])[0] ||
      {};
    return {
      id: row.id || 'visual.operator.instrument-readout.v1',
      score: 0.34,
      matchedTerms: text ? [text] : [],
      requiredGroups: [],
      uniformSlots: row.uniformSlots || ['instrument', 'measurement', 'signal'],
      wgslOperators: row.wgslOperators || ['atomInstrumentReadout'],
      receiptText: row.receiptText || 'Fallback graphics basis records compiled state with probes.',
    };
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

  function passesRequires(groups, text, normalized) {
    if (!groups || !groups.length) return { ok: true, matchedGroups: [] };
    const matchedGroups = [];
    for (const group of groups) {
      const matched = termsMatched(group, text, normalized);
      if (matched.length) matchedGroups.push(matched);
    }
    return { ok: matchedGroups.length > 0, matchedGroups };
  }

  function termsMatched(terms, text, normalized) {
    return uniqueStrings((terms || []).filter((term) => {
      const plain = normalizeText(term);
      return text.includes(String(term || '').toLowerCase()) || normalized.includes(plain);
    }));
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

  function visualOperatorContextText(context = {}) {
    const objects = (context.objects || []).filter(isEvidenceObject);
    return [
      context.sceneKind,
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
        return directHas(/\b(growth|cell|protein|root|coral|algae|mycelium|membrane|mangrove|kelp|plankton)\b/)
          ? { ok: true, reason: '' }
          : { ok: false, reason: 'scene-gate:no-direct-biological-evidence' };
      }
      if (/acoustic-wave/.test(id)) {
        return directHas(/\b(acoustic|sound|wave|resonance|standing|speaker|frequency|vibration)\b/)
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
      return directHas(/\b(water|river|wind|airflow|coolant|microfluidic|droplet|droplets|pump|channel|meniscus|fluid)\b/)
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
      return directHas(/\b(acoustic|sound|wave|resonance|standing|speaker|frequency|vibration)\b/)
        ? { ok: true, reason: '' }
        : { ok: false, reason: 'scene-gate:no-direct-acoustic-evidence' };
    }
    return { ok: true, reason: '' };
  }

  function directLanguageText(context = {}) {
    const promptText = [
      context.spec && context.spec.physicsIR && context.spec.physicsIR.prompt,
      context.spec && context.spec.renderIR && context.spec.renderIR.prompt,
      context.spec && context.spec.physicalSpec && context.spec.physicalSpec.prompt,
    ].filter(Boolean).join(' ');
    if (promptText) return normalizeText([context.sceneKind, promptText].filter(Boolean).join(' '));
    const objects = (context.objects || []).filter(isEvidenceObject);
    return normalizeText([
      context.sceneKind,
      ...objects.map((object) => [
        object.phrase,
      ].filter(Boolean).join(' ')),
      ...((context.causalAffordances || []).map((row) => [
        row.id,
        row.causalRelationId,
      ].filter(Boolean).join(' '))),
    ].filter(Boolean).join(' '));
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
