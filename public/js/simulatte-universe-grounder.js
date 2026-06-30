(function attachSimulatteUniverseGrounder(root, factory) {
  const catalog = typeof module === 'object' && module.exports
    ? require('./simulatte-physics-catalog.js')
    : root.SimulattePhysicsCatalog;
  const api = factory(catalog || {});
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteUniverseGrounder = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createUniverseGrounderApi(catalog = {}) {
  const UNIVERSE_GRAPH_SCHEMA = 'simulatte.universeGraph.v1';
  const { clamp01 = (value) => Math.max(0, Math.min(1, value)), slugify = defaultSlugify } = catalog;

  const CONCEPTS = Object.freeze({
    lava: concept('material.lava', 'fluid', ['fluid', 'thermal', 'phase'], 'lava', ['advection', 'heat_source']),
    magma: concept('material.lava', 'fluid', ['fluid', 'thermal', 'phase'], 'lava', ['advection', 'heat_source']),
    turbine: concept('machine.turbine', 'machine', ['rigidBody', 'rotationalMechanics', 'fluid'], 'metal', ['rotational_torque']),
    rotor: concept('machine.rotor', 'machine', ['rigidBody', 'rotationalMechanics'], 'metal', ['rotational_torque']),
    shaft: concept('machine.shaft', 'machine', ['rigidBody', 'rotationalMechanics'], 'metal', ['rotational_torque']),
    'blade array': concept('machine.blade_array', 'machine', ['rigidBody', 'fluid'], 'metal', ['rotational_torque']),
    castle: concept('structure.castle', 'structure', ['solid', 'rigidBody', 'fracture'], 'rock', ['fracture_threshold']),
    wall: concept('structure.wall', 'structure', ['solid', 'rigidBody', 'fracture'], 'rock', ['fracture_threshold']),
    'castle wall': concept('structure.castle_wall', 'structure', ['solid', 'rigidBody', 'fracture'], 'rock', ['fracture_threshold']),
    tower: concept('structure.tower', 'structure', ['solid', 'rigidBody', 'fracture'], 'rock', ['fracture_threshold']),
    'glass tower': concept('structure.glass_tower', 'structure', ['solid', 'field', 'rigidBody', 'fracture'], 'glass', ['fracture_threshold', 'field_refraction']),
    bridge: concept('structure.bridge', 'structure', ['solid', 'rigidBody', 'wave', 'fracture'], 'metal', ['oscillator', 'fracture_threshold']),
    cable: concept('constraint.cable', 'constraint', ['solid', 'oscillator', 'rigidBody'], 'metal', ['oscillator']),
    cables: concept('constraint.cable', 'constraint', ['solid', 'oscillator', 'rigidBody'], 'metal', ['oscillator']),
    'bridge cable': concept('constraint.bridge_cable', 'constraint', ['solid', 'oscillator', 'rigidBody', 'wave'], 'metal', ['oscillator']),
    'bridge cables': concept('constraint.bridge_cable', 'constraint', ['solid', 'oscillator', 'rigidBody', 'wave'], 'metal', ['oscillator']),
    ice: concept('material.ice', 'solid', ['solid', 'thermal', 'phase'], 'ice', ['phase_transition']),
    river: concept('environment.river', 'environment', ['fluid', 'terrain'], 'water', ['advection']),
    water: concept('material.water', 'fluid', ['fluid', 'thermal'], 'water', ['advection']),
    projectile: concept('body.projectile', 'body', ['rigidBody', 'collision'], 'metal', ['rigid_collision']),
    stone: concept('material.stone', 'solid', ['solid', 'fracture'], 'rock', ['fracture_threshold']),
    rocket: concept('machine.rocket', 'machine', ['rigidBody', 'thermal', 'particles'], 'metal', ['thrust', 'heat_source']),
    exhaust: concept('flow.exhaust', 'fluid', ['fluid', 'thermal', 'particles'], 'smoke', ['advection', 'heat_source']),
    fuel: concept('material.fuel', 'material', ['thermal', 'reaction'], 'fire', ['reaction_diffusion']),
    fire: concept('process.fire', 'process', ['thermal', 'reaction', 'particles'], 'fire', ['heat_source', 'reaction_diffusion']),
    flame: concept('process.fire', 'process', ['thermal', 'reaction', 'particles'], 'fire', ['heat_source']),
    wind: concept('environment.wind', 'field', ['fluid', 'field'], 'air', ['advection']),
    rain: concept('environment.rain', 'particleSet', ['fluid', 'particles', 'terrain'], 'water', ['advection']),
    sand: concept('material.sand', 'granular', ['particles', 'solid', 'terrain'], 'sand', ['pressure_flow_lite']),
    rock: concept('material.rock', 'solid', ['solid', 'fracture'], 'rock', ['fracture_threshold']),
    basalt: concept('material.basalt', 'solid', ['solid', 'fracture', 'terrain'], 'rock', ['fracture_threshold', 'pressure_flow_lite']),
    delta: concept('environment.delta', 'environment', ['fluid', 'terrain', 'particles'], 'sand', ['advection', 'pressure_flow_lite']),
    'basalt delta': concept('environment.basalt_delta', 'environment', ['fluid', 'terrain', 'solid', 'fracture'], 'rock', ['advection', 'pressure_flow_lite', 'fracture_threshold']),
    magnet: concept('field.magnet', 'fieldSource', ['field', 'rigidBody'], 'magnet', ['field_force']),
    wheel: concept('machine.wheel', 'machine', ['rigidBody', 'rotationalMechanics'], 'metal', ['rotational_torque']),
    lens: concept('optic.lens', 'body', ['field', 'solid'], 'glass', ['field_refraction']),
    prism: concept('optic.prism', 'body', ['field', 'solid'], 'glass', ['field_refraction']),
    mirror: concept('optic.mirror', 'body', ['field', 'solid'], 'glass', ['field_reflection']),
    city: concept('system.city', 'network', ['network', 'control'], 'silicon', ['network_flow']),
    traffic: concept('system.traffic', 'network', ['network', 'control'], 'silicon', ['network_flow']),
    queue: concept('system.queue', 'network', ['network', 'control'], 'silicon', ['network_flow']),
    market: concept('system.market', 'network', ['network', 'control'], 'silicon', ['network_flow']),
    network: concept('system.network', 'network', ['network', 'control'], 'silicon', ['network_flow']),
    feedback: concept('system.feedback', 'network', ['network', 'control', 'oscillator'], 'silicon', ['network_flow', 'oscillator']),
    shock: concept('event.shock', 'event', ['wave', 'collision', 'field'], 'air', ['wave_field', 'rigid_collision']),
    'feedback shock': concept('system.feedback_shock', 'networkEvent', ['network', 'control', 'wave'], 'silicon', ['network_flow', 'wave_field']),
    packet: concept('system.packet', 'networkToken', ['network', 'particles'], 'silicon', ['network_flow']),
    piano: concept('instrument.piano', 'oscillator', ['wave', 'oscillator', 'rigidBody'], 'wood', ['wave_field', 'oscillator']),
    submarine: concept('vehicle.submarine', 'machine', ['rigidBody', 'fluid'], 'metal', ['pressure_flow_lite']),
    volcano: concept('environment.volcano', 'environment', ['thermal', 'fluid', 'terrain'], 'lava', ['heat_source', 'advection']),
    algae: concept('organism.algae', 'biology', ['field', 'growth', 'fluid'], 'biomass', ['growth_decay']),
    storm: concept('environment.storm', 'field', ['fluid', 'wave', 'field'], 'air', ['advection', 'wave_field']),
    wave: concept('field.wave', 'field', ['wave', 'field'], 'air', ['wave_field']),
    waves: concept('field.wave', 'field', ['wave', 'field'], 'air', ['wave_field']),
    cloud: concept('environment.cloud', 'field', ['fluid', 'particles'], 'water', ['advection']),
    swamp: concept('environment.swamp', 'environment', ['fluid', 'biology', 'terrain'], 'water', ['advection', 'growth_decay']),
    wetland: concept('environment.wetland', 'environment', ['fluid', 'biology', 'terrain'], 'water', ['advection', 'growth_decay']),
    'quartz wetland': concept('environment.quartz_wetland', 'environment', ['fluid', 'biology', 'terrain', 'field'], 'quartz', ['advection', 'growth_decay', 'field_refraction']),
    hammer: concept('tool.hammer', 'body', ['rigidBody', 'collision'], 'metal', ['rigid_collision']),
    glass: concept('material.glass', 'solid', ['solid', 'field', 'fracture'], 'glass', ['fracture_threshold', 'field_refraction']),
    gold: concept('material.gold', 'solid', ['solid', 'rigidBody'], 'gold', ['rigid_collision']),
    quartz: concept('material.quartz', 'solid', ['solid', 'field', 'fracture'], 'quartz', ['fracture_threshold']),
    cathedral: concept('structure.cathedral', 'structure', ['solid', 'rigidBody', 'fracture'], 'rock', ['fracture_threshold']),
    jellyfish: concept('organism.jellyfish', 'biology', ['fluid', 'growth', 'oscillator'], 'membrane', ['growth_decay', 'oscillator']),
    entropy: concept('observable.entropy', 'observable', ['field'], '', []),
  });

  const PROCESS_TO_EDGE = Object.freeze({
    rotate: 'torqueTransfer',
    phase_transition: 'phaseChange',
    impact: 'collision',
    heat_transfer: 'heatTransfer',
    cooling: 'heatTransfer',
    flow: 'fluidForce',
    diffusion: 'diffusion',
    oscillation: 'waveCoupling',
    growth: 'growthCoupling',
    exchange: 'exchange',
    split: 'topologySplit',
    join: 'topologyJoin',
    consume: 'consumption',
    coexists: 'adjacent',
  });
  const ABSTRACT_UNSUPPORTED_TERMS = new Set(['soul']);

  function concept(canonicalId, semanticType, domains, materialId, operatorHints) {
    return { canonicalId, semanticType, domains, materialId, operatorHints };
  }

  function groundUniverseGraph(input = {}) {
    const promptParse = input.promptParse || {};
    const spanRows = Array.isArray(promptParse.spans) ? promptParse.spans : [];
    const candidates = [];
    const nodes = [];
    const unresolved = [];
    const rejected = [];
    const bySpan = new Map();
    const seen = new Map();
    const candidateRows = candidateRowsForInput(input);
    const intentBrief = input.intentBrief || null;

    for (const span of spanRows) {
      if (!['entity', 'material', 'environment', 'observable'].includes(span.kind)) continue;
      const row = bestCandidateForSpan(span, candidateRows);
      candidates.push({ spanId: span.id, span: span.text, candidates: row.matches });
      if (!row.best || row.best.confidence < 0.34) {
        unresolved.push({
          spanId: span.id,
          text: span.text,
          kind: span.kind,
          reason: 'no grounded concept or primitive support',
        });
        continue;
      }
      const key = `${row.best.canonicalId}:${span.text}`;
      const index = seen.get(key) || 0;
      seen.set(key, index + 1);
      const node = {
        id: index ? `${slugify(row.best.canonicalId)}-${index + 1}` : slugify(row.best.canonicalId),
        spanId: span.id,
        semanticType: row.best.semanticType,
        canonicalId: row.best.canonicalId,
        label: labelFromSpan(span.text),
        aliases: unique([span.text, row.best.label].filter(Boolean)),
        confidence: row.best.confidence,
        domains: row.best.domains,
        materialId: row.best.materialId,
        materialIds: row.best.materialIds || (row.best.materialId ? [row.best.materialId] : []),
        operatorHints: row.best.operatorHints,
        operatorTypes: row.best.operatorTypes || row.best.operatorHints || [],
        primitiveHints: row.best.primitiveHints || [],
        conceptIds: row.best.conceptIds || [],
        shapeHints: row.best.shapeHints || [],
        sceneHints: row.best.sceneHints || [],
        indexName: row.best.indexName || '',
        rankSignals: row.best.rankSignals || null,
        evidence: row.best.evidence,
      };
      nodes.push(node);
      bySpan.set(span.id, node);
    }

    addComponentNodes(nodes, seen, input, rejected);
    addUniverseCandidateNodes(nodes, seen, candidateRows, input);
    const promptEdges = edgeRowsForClauses(promptParse.clauses || [], bySpan, nodes);
    const edges = uniqueEdgeRows([
      ...promptEdges,
      ...edgeRowsForIntentBrief(intentBrief, nodes),
    ]);
    const observables = spanRows
      .filter((span) => span.kind === 'observable')
      .map((span) => ({ spanId: span.id, label: span.text, channel: observableChannel(span.text) }));
    const semanticGraph = buildSemanticGraph(nodes, edges);
    const affordanceGraph = buildAffordanceGraph(nodes, candidateRows);
    const primitiveMapping = buildPrimitiveMapping(nodes, candidateRows);
    const unsupported = mergeUnsupportedRows(
      buildUnsupportedRows(nodes, primitiveMapping, unresolved),
      unsupportedRowsFromIntentBrief(intentBrief)
    );
    return {
      schema: UNIVERSE_GRAPH_SCHEMA,
      prompt: promptParse.prompt || input.prompt || '',
      candidates,
      nodes,
      edges,
      semanticGraph,
      affordanceGraph,
      primitiveMapping,
      environments: nodes.filter((node) => node.semanticType === 'environment'),
      observables,
      visualAffordances: intentBrief && intentBrief.visualIntent && Array.isArray(intentBrief.visualIntent.affordances)
        ? intentBrief.visualIntent.affordances.slice(0, 8).map((row) => ({ ...row }))
        : [],
      unresolved,
      unsupported,
      rejected,
      intentBrief: intentBrief ? {
        schema: intentBrief.schema || '',
        evidenceCount: (intentBrief.retrievedEvidence || []).length,
        causalEdgeCount: (intentBrief.causalGraph || []).length,
        assumptionCount: (intentBrief.assumptions || []).length,
        unsupportedCount: (intentBrief.unsupported || []).length,
        retrievedEvidence: (intentBrief.retrievedEvidence || []).map((row) => ({ ...row })),
        causalGraph: (intentBrief.causalGraph || []).map((row) => ({ ...row })),
        assumptions: (intentBrief.assumptions || []).map((row) => ({ ...row })),
        alternatives: (intentBrief.alternatives || []).map((row) => ({ ...row })),
        unsupported: (intentBrief.unsupported || []).map((row) => ({ ...row })),
        degradedTo: (intentBrief.degradedTo || []).map((row) => ({ ...row })),
        negativeKnowledge: (intentBrief.negativeKnowledge || []).map((row) => ({ ...row })),
        visualIntent: intentBrief.visualIntent ? {
          ...intentBrief.visualIntent,
          affordances: Array.isArray(intentBrief.visualIntent.affordances)
            ? intentBrief.visualIntent.affordances.map((row) => ({ ...row }))
            : [],
        } : null,
      } : null,
      provenance: {
        grounder: 'simulatte.universe-grounder.v1',
        parseSchema: promptParse.schema || '',
        semanticRag: input.semanticRag && input.semanticRag.schema || '',
        synthesis: input.synthesis && input.synthesis.schema || '',
      },
    };
  }

  function candidateRowsForInput(input) {
    const rows = [];
    for (const component of input.components || []) {
      rows.push({
        label: component.role || component.phrase || component.id,
        canonicalId: `primitive.${component.id}`,
        semanticType: component.type || 'body',
        domains: component.domains || [],
        materialId: component.material || '',
        materialIds: component.material ? [component.material] : [],
        operatorHints: operatorHintsForDomains(component.domains || []),
        operatorTypes: operatorHintsForDomains(component.domains || []),
        primitiveHints: component.id ? [component.id] : [],
        conceptIds: [`primitive.${component.id}`],
        shapeHints: [],
        sceneHints: [],
        indexName: 'components',
        confidence: clamp01(Number(component.score || 0.46)),
        evidence: ['intent-component'],
      });
    }
    const rag = input.semanticRag && input.semanticRag.openComponents || [];
    for (const row of rag) {
      rows.push({
        label: row.phrase || row.role || row.id,
        canonicalId: `semantic.${row.id}`,
        semanticType: row.type || 'component',
        domains: row.domains || [],
        materialId: row.material || '',
        materialIds: row.material ? [row.material] : [],
        operatorHints: operatorHintsForDomains(row.domains || []),
        operatorTypes: operatorHintsForDomains(row.domains || []),
        primitiveHints: row.id ? [row.id] : [],
        conceptIds: row.id ? [`semantic.${row.id}`] : [],
        shapeHints: [],
        sceneHints: [],
        indexName: 'semantic-rag',
        confidence: clamp01(Number(row.score || 0.38)),
        evidence: ['semantic-rag'],
      });
    }
    for (const row of input.universeMatches && input.universeMatches.candidates || []) {
      if (!row || !row.label) continue;
      rows.push({
        label: row.label,
        aliases: row.aliases || [],
        canonicalId: row.canonicalId || `universe.${row.id}`,
        semanticType: row.semanticType || 'concept',
        domains: row.domains || [],
        materialId: row.materialId || '',
        materialIds: row.materialIds || (row.materialId ? [row.materialId] : []),
        operatorHints: row.operatorHints || row.operatorTypes || [],
        operatorTypes: row.operatorTypes || row.operatorHints || [],
        primitiveHints: row.primitiveHints || [],
        conceptIds: row.conceptIds || (row.canonicalId ? [row.canonicalId] : []),
        shapeHints: row.shapeHints || [],
        sceneHints: row.sceneHints || [],
        indexName: row.indexName || '',
        rankSignals: row.rankSignals || null,
        confidence: clamp01(Number(row.score || 0.42)),
        evidence: row.evidence || ['universe-index'],
      });
    }
    for (const row of input.intentBrief && input.intentBrief.retrievedEvidence || []) {
      if (!row || !row.label) continue;
      rows.push({
        id: row.id || row.label,
        label: row.label,
        aliases: row.aliases || [],
        canonicalId: row.canonicalId || row.id || `intent.${row.label}`,
        semanticType: row.semanticType || row.indexName || 'intentEvidence',
        domains: row.domains || [],
        materialId: row.materialId || '',
        materialIds: row.materialIds || (row.materialId ? [row.materialId] : []),
        operatorHints: row.operatorHints || row.operatorTypes || [],
        operatorTypes: row.operatorTypes || row.operatorHints || [],
        primitiveHints: row.primitiveHints || [],
        conceptIds: row.conceptIds || [],
        shapeHints: row.shapeHints || [],
        sceneHints: row.sceneHints || [],
        indexName: row.indexName || row.source || 'intent-brief',
        confidence: clamp01(Number(row.score || row.confidence || 0.42)),
        evidence: row.evidence || [row.id || row.label],
      });
    }
    return rows;
  }

  function edgeRowsForIntentBrief(intentBrief, nodes) {
    const edges = [];
    if (!intentBrief || !Array.isArray(intentBrief.causalGraph)) return edges;
    for (const edge of intentBrief.causalGraph) {
      const from = nodeForCausalRef(nodes, edge.sourceRef, edge.sourceLabel);
      const to = nodeForCausalRef(nodes, edge.targetRef, edge.targetLabel);
      if (!from || !to || from.id === to.id) continue;
      edges.push({
        id: `intent-${edge.id || edges.length + 1}`,
        type: edge.relationType || edge.type || 'interaction',
        from: from.id,
        to: to.id,
        processId: edge.processId || edge.operatorType || 'interact',
        prepositions: [],
        confidence: clamp01(Number(edge.confidence || 0.66)),
        evidence: edge.evidence || ['intent-brief'],
        operatorType: edge.operatorType || '',
        mechanism: edge.mechanism || '',
      });
    }
    return edges;
  }

  function nodeForCausalRef(nodes, ref, label) {
    const refText = String(ref || '').toLowerCase();
    const labelText = String(label || '').toLowerCase();
    return (nodes || []).find((node) => {
      const text = [node.id, node.canonicalId, node.label, ...(node.aliases || [])].join(' ').toLowerCase();
      return refText && text.includes(refText) || labelText && (text.includes(labelText) || labelText.includes(String(node.label || '').toLowerCase()));
    }) || null;
  }

  function uniqueEdgeRows(edges) {
    const seen = new Set();
    return (edges || []).filter((edge) => {
      const key = `${edge.type}:${edge.from}:${edge.to}:${edge.processId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function unsupportedRowsFromIntentBrief(intentBrief) {
    const rows = [];
    for (const row of intentBrief && intentBrief.unsupported || []) {
      rows.push({
        id: row.id || row.label,
        label: row.label || row.id,
        reason: row.reason || 'unsupported by intent brief',
        source: 'intent-brief',
      });
    }
    for (const row of intentBrief && intentBrief.degradedTo || []) {
      rows.push({
        id: row.id || row.label,
        label: row.label || row.id,
        reason: row.reason || 'degraded approximation selected',
        degraded: true,
        source: 'intent-brief',
      });
    }
    return rows;
  }

  function mergeUnsupportedRows(a, b) {
    const seen = new Set();
    return [...(a || []), ...(b || [])].filter((row) => {
      const key = `${row.id}:${row.label}:${row.reason}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function bestCandidateForSpan(span, externalRows) {
    const text = String(span.text || '').toLowerCase();
    const builtin = CONCEPTS[text] || CONCEPTS[text.replace(/s$/, '')] || null;
    const matches = [];
    if (ABSTRACT_UNSUPPORTED_TERMS.has(text) && !builtin) {
      return { best: null, matches };
    }
    if (builtin) {
      matches.push({
        label: text,
        confidence: span.kind === 'observable' ? 0.72 : 0.92,
        evidence: ['parser-lexicon'],
        ...builtin,
      });
    }
    for (const row of externalRows) {
      const labels = candidateLabels(row);
      const overlap = labelOverlap(text, labels);
      const exact = labels.includes(text);
      const contained = labels.some((label) => label && (label.includes(text) || text.includes(label)));
      if (!contained && overlap <= 0) continue;
      matches.push({
        ...row,
        confidence: clamp01(Number(row.confidence || 0.36) + (exact ? 0.12 : contained ? 0.04 : overlap * 0.08)),
      });
    }
    matches.sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0));
    return { best: matches[0] || null, matches: matches.slice(0, 5) };
  }

  function addComponentNodes(nodes, seen, input, rejected) {
    const prompt = String(input.prompt || input.promptParse && input.promptParse.prompt || '').toLowerCase();
    let added = 0;
    for (const component of input.components || []) {
      const label = component.role || component.phrase || component.id;
      const lower = String(label || '').toLowerCase();
      if (nodes.some((node) => lower.includes(String(node.label || '').toLowerCase()))) continue;
      const source = String(component.source || '');
      const fillsGroundingGap = nodes.length < 2;
      const isSynthesis = /^embedding-guided-synth/.test(source);
      const isOpenSemantic = source === 'open-semantic-rag' || source === 'semantic-surface-grounder';
      const directlyMentioned = prompt && (
        prompt.includes(lower) || promptIncludesAny(prompt, [component.id, component.phrase, component.role])
      );
      const highConfidence = Number(component.score || 0) >= 0.78 && directlyMentioned;
      if (!fillsGroundingGap && !isSynthesis && !highConfidence && !(isOpenSemantic && directlyMentioned)) continue;
      if (added >= 10) break;
      const id = slugify(`primitive-${component.id}`);
      if (seen.has(id)) continue;
      if (!component.id) {
        rejected.push({ label, reason: 'component without stable id' });
        continue;
      }
      seen.set(id, 1);
      nodes.push({
        id,
        spanId: null,
        semanticType: component.type || 'body',
        canonicalId: `primitive.${component.id}`,
        label: labelFromSpan(label),
        aliases: unique([component.id, label, component.phrase].filter(Boolean)),
        confidence: clamp01(Number(component.score || 0.42)),
        domains: component.domains || [],
        materialId: component.material || '',
        materialIds: component.material ? [component.material] : [],
        operatorHints: operatorHintsForDomains(component.domains || []),
        operatorTypes: operatorHintsForDomains(component.domains || []),
        primitiveHints: component.id ? [component.id] : [],
        conceptIds: [`primitive.${component.id}`],
        shapeHints: [],
        sceneHints: [],
        indexName: 'components',
        evidence: ['intent-component'],
      });
      added += 1;
    }
  }

  function addUniverseCandidateNodes(nodes, seen, candidateRows, input) {
    const prompt = String(input.prompt || input.promptParse && input.promptParse.prompt || '').toLowerCase();
    let added = 0;
    const universeRows = (candidateRows || [])
      .filter((row) => (row.evidence || []).includes('universe-index'))
      .filter((row) => universeRowCanMaterialize(row))
      .sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0));
    for (const row of universeRows) {
      if (added >= 8) break;
      const confidence = clamp01(Number(row.confidence || 0));
      if (confidence < 0.34) continue;
      const labels = [row.label, row.canonicalId, ...(row.aliases || [])].filter(Boolean);
      if (prompt && !promptIncludesAny(prompt, labels)) continue;
      if (nodes.some((node) => node.canonicalId === row.canonicalId || node.label === row.label)) continue;
      const baseId = slugify(row.canonicalId || row.id || row.label);
      const index = seen.get(baseId) || 0;
      seen.set(baseId, index + 1);
      nodes.push({
        id: index ? `${baseId}-${index + 1}` : baseId,
        spanId: null,
        semanticType: row.semanticType || 'concept',
        canonicalId: row.canonicalId || row.id,
        label: labelFromSpan(row.label || row.canonicalId || row.id),
        aliases: unique(labels),
        confidence,
        domains: row.domains || [],
        materialId: row.materialId || '',
        materialIds: row.materialIds || (row.materialId ? [row.materialId] : []),
        operatorHints: row.operatorHints || row.operatorTypes || [],
        operatorTypes: row.operatorTypes || row.operatorHints || [],
        primitiveHints: row.primitiveHints || [],
        conceptIds: row.conceptIds || (row.canonicalId ? [row.canonicalId] : []),
        shapeHints: row.shapeHints || [],
        sceneHints: row.sceneHints || [],
        indexName: row.indexName || '',
        rankSignals: row.rankSignals || null,
        evidence: row.evidence || ['universe-index'],
      });
      added += 1;
    }
  }

  function buildSemanticGraph(nodes, edges) {
    return {
      schema: 'simulatte.semanticGraph.v1',
      nodes: (nodes || []).map((node) => ({
        id: node.id,
        label: node.label,
        canonicalId: node.canonicalId,
        semanticType: node.semanticType,
        domains: node.domains || [],
        materialId: node.materialId || '',
        confidence: Number(node.confidence || 0),
        evidence: node.evidence || [],
      })),
      edges: (edges || []).map((edge) => ({
        id: edge.id,
        type: edge.type,
        from: edge.from,
        to: edge.to,
        processId: edge.processId || '',
        confidence: Number(edge.confidence || 0),
        evidence: edge.evidence || [],
      })),
    };
  }

  function buildAffordanceGraph(nodes, candidateRows) {
    const graphNodes = [];
    const graphEdges = [];
    for (const node of nodes || []) {
      const rows = rowsForNode(node, candidateRows);
      const operatorTypes = unique([
        ...(node.operatorTypes || []),
        ...(node.operatorHints || []),
        ...rows.flatMap((row) => row.operatorTypes || row.operatorHints || []),
      ]);
      const materialIds = unique([
        ...(node.materialIds || []),
        node.materialId,
        ...rows.flatMap((row) => row.materialIds || (row.materialId ? [row.materialId] : [])),
      ]);
      const primitiveHints = unique([
        ...(node.primitiveHints || []),
        ...rows.flatMap((row) => row.primitiveHints || []),
      ]);
      const shapeHints = unique([
        ...(node.shapeHints || []),
        ...rows.flatMap((row) => row.shapeHints || []),
      ]);
      const sceneHints = unique([
        ...(node.sceneHints || []),
        ...rows.flatMap((row) => row.sceneHints || []),
      ]);
      graphNodes.push({
        id: node.id,
        canonicalId: node.canonicalId,
        label: node.label,
        operatorTypes,
        materialIds,
        primitiveHints,
        shapeHints,
        sceneHints,
        supported: primitiveHints.length > 0,
      });
      for (const operatorType of operatorTypes) {
        graphEdges.push({
          id: `affordance-${graphEdges.length + 1}`,
          from: node.id,
          to: `operator.${operatorType}`,
          type: 'hasOperator',
        });
      }
      for (const primitiveId of primitiveHints) {
        graphEdges.push({
          id: `affordance-${graphEdges.length + 1}`,
          from: node.id,
          to: `primitive.${primitiveId}`,
          type: 'mapsToPrimitive',
        });
      }
    }
    return {
      schema: 'simulatte.affordanceGraph.v1',
      nodes: graphNodes,
      edges: graphEdges,
    };
  }

  function buildPrimitiveMapping(nodes, candidateRows) {
    const rows = (nodes || []).map((node) => {
      const matches = rowsForNode(node, candidateRows);
      const primitiveHints = unique([
        ...(node.primitiveHints || []),
        ...matches.flatMap((row) => row.primitiveHints || []),
      ]);
      const operatorTypes = unique([
        ...(node.operatorTypes || []),
        ...(node.operatorHints || []),
        ...matches.flatMap((row) => row.operatorTypes || row.operatorHints || []),
      ]);
      return {
        nodeId: node.id,
        canonicalId: node.canonicalId,
        label: node.label,
        supported: primitiveHints.length > 0,
        primitiveHints,
        operatorTypes,
        materialIds: unique([
          ...(node.materialIds || []),
          node.materialId,
          ...matches.flatMap((row) => row.materialIds || (row.materialId ? [row.materialId] : [])),
        ]),
        sourceCandidateIds: matches.map((row) => row.id).filter(Boolean).slice(0, 12),
      };
    });
    return {
      schema: 'simulatte.primitiveMapping.v1',
      supportedCount: rows.filter((row) => row.supported).length,
      unsupportedCount: rows.filter((row) => !row.supported).length,
      rows,
    };
  }

  function buildUnsupportedRows(nodes, primitiveMapping, unresolved) {
    const rows = [];
    for (const row of unresolved || []) {
      rows.push({
        id: row.spanId,
        label: row.text,
        reason: row.reason || 'unresolved prompt span',
      });
    }
    for (const row of primitiveMapping && primitiveMapping.rows || []) {
      if (row.supported) continue;
      rows.push({
        id: row.nodeId,
        label: row.label,
        canonicalId: row.canonicalId,
        reason: 'semantic node has no simulator primitive mapping',
      });
    }
    const seen = new Set();
    return rows.filter((row) => {
      const key = `${row.id}:${row.label}:${row.reason}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function rowsForNode(node, candidateRows) {
    const nodeLabels = candidateLabels(node);
    const nodeKeys = new Set([
      node.canonicalId,
      ...(node.conceptIds || []),
      ...nodeLabels,
    ].filter(Boolean).map((value) => String(value).toLowerCase()));
    return (candidateRows || []).filter((row) => {
      const rowConcepts = [row.canonicalId, ...(row.conceptIds || [])]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());
      if (rowConcepts.some((value) => nodeKeys.has(value))) return true;
      const labels = candidateLabels(row);
      return labels.some((label) => nodeKeys.has(label)) || labels.some((label) => labelOverlap(label, nodeLabels) >= 0.6);
    });
  }

  function candidateLabels(row) {
    return unique([
      row.label,
      row.canonicalId,
      row.id,
      ...(row.aliases || []),
      ...(row.conceptIds || []),
    ]).map((value) => String(value).toLowerCase()).filter(Boolean);
  }

  function labelOverlap(text, labels) {
    const tokens = tokenSet(text);
    if (!tokens.size) return 0;
    let best = 0;
    for (const label of labels || []) {
      const other = tokenSet(label);
      if (!other.size) continue;
      let hits = 0;
      for (const token of tokens) if (other.has(token)) hits += 1;
      best = Math.max(best, hits / Math.max(1, Math.min(tokens.size, other.size)));
    }
    return best;
  }

  function tokenSet(text) {
    return new Set(String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2));
  }

  function universeRowCanMaterialize(row) {
    const indexName = String(row.indexName || '').toLowerCase();
    if (['relations', 'operators', 'processes'].includes(indexName)) return false;
    return Boolean(row.materialId || (row.domains || []).length || /concept|material|analog/.test(indexName));
  }

  function promptIncludesAny(prompt, values) {
    return (values || []).some((value) => {
      const text = String(value || '').toLowerCase();
      return text && prompt.includes(text);
    });
  }

  function edgeRowsForClauses(clauses, bySpan, nodes) {
    const edges = [];
    for (const clause of clauses || []) {
      const from = bySpan.get(clause.subjectSpanId) || null;
      const to = bySpan.get(clause.objectSpanId) || null;
      if (!from || !to) continue;
      const type = PROCESS_TO_EDGE[clause.process] || 'interaction';
      edges.push({
        id: `edge${edges.length + 1}`,
        type,
        from: from.id,
        to: to.id,
        processId: clause.process || 'interact',
        prepositions: clause.prepositions || [],
        confidence: Math.min(from.confidence, to.confidence, 0.82),
        evidence: ['prompt-clause'],
      });
    }
    if (!edges.length && nodes.length > 1) {
      for (let index = 1; index < Math.min(nodes.length, 4); index += 1) {
        edges.push({
          id: `edge${edges.length + 1}`,
          type: 'adjacent',
          from: nodes[index - 1].id,
          to: nodes[index].id,
          processId: 'coexists',
          prepositions: [],
          confidence: 0.42,
          evidence: ['grounding-adjacency'],
        });
      }
    }
    return edges;
  }

  function operatorHintsForDomains(domains) {
    const text = (domains || []).join(' ');
    const hints = [];
    if (/fluid|water|wind|flow/.test(text)) hints.push('advection');
    if (/thermal|fire|heat|phase/.test(text)) hints.push('heat_transfer');
    if (/rigid|collision|mechanic/.test(text)) hints.push('rigid_collision');
    if (/rotat|wheel|turbine/.test(text)) hints.push('rotational_torque');
    if (/network|queue|market/.test(text)) hints.push('network_flow');
    if (/wave|acoustic/.test(text)) hints.push('wave_field');
    if (/bio|growth/.test(text)) hints.push('growth_decay');
    return unique(hints);
  }

  function observableChannel(text) {
    const value = String(text || '').toLowerCase();
    if (/angular/.test(value)) return 'angularVelocity';
    if (/temp|heat/.test(value)) return 'temperature';
    if (/press/.test(value)) return 'pressure';
    if (/damage|stress/.test(value)) return 'damage';
    if (/flow|velocity|speed/.test(value)) return 'velocity';
    return slugify(value);
  }

  function labelFromSpan(text) {
    return String(text || '')
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\b[a-z]/g, (match) => match.toUpperCase());
  }

  function unique(values) {
    return Array.from(new Set((values || []).filter(Boolean)));
  }

  function defaultSlugify(value) {
    return String(value || 'item').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
  }

  return {
    UNIVERSE_GRAPH_SCHEMA,
    CONCEPTS,
    groundUniverseGraph,
  };
});
