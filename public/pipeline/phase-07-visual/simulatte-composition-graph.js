(function attachSimulatteCompositionGraph(root, factory) {
  function markMissingDependency(moduleName, dependencyName) {
    const state = root.SimulatteBoot = root.SimulatteBoot || { failedScripts: [] };
    state.missingDependencies = state.missingDependencies || [];
    state.missingDependencies.push({ moduleName, dependencyName });
    console.warn(`[simulatte.boot] ${moduleName} waiting for ${dependencyName}`);
  }

  const catalog = typeof module === 'object' && module.exports
    ? require('../phase-06-simulation/simulatte-physics-catalog.js')
    : root.SimulattePhysicsCatalog;
  const visualOperatorCompiler = typeof module === 'object' && module.exports
    ? require('./simulatte-visual-operator-compiler.js')
    : root.SimulatteVisualOperatorCompiler;
  if (!catalog) {
    markMissingDependency('SimulatteCompositionGraph', 'SimulattePhysicsCatalog');
    return;
  }
  const api = factory(catalog, visualOperatorCompiler);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteCompositionGraph = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCompositionGraphApi(catalog, visualOperatorCompiler = {}) {
  const {
    clamp,
    hashNoise,
    PROCEDURAL_VISUAL_BASE,
    SEMANTIC_VISUAL_ATLAS,
    uniqueList,
  } = catalog;

  const COMPOSITION_SCHEMA = 'simulatte.compositionGraph.v1';
  const RENDER_PROGRAM_SCHEMA = 'simulatte.renderProgram.v1';
  const VISUAL_IR_SCHEMA = 'simulatte.visualIR.v1';
  const SCENE_RENDER_PACKET_SCHEMA = 'simulatte.sceneRenderPacket.v1';
  const VISUAL_GENOME_SCHEMA = 'simulatte.visualGenome.v1';
  const SCENE_MIX_SLOTS = Object.freeze([
    'thermal',
    'water',
    'mechanical',
    'magnetic',
    'optical',
    'acoustic',
    'biological',
    'chemical',
    'orbital',
    'network',
    'energy',
    'robotic',
    'granular',
    'instrument',
    'phase',
    'hazard',
  ]);
  const VISUAL_IR_LAYER_SLOTS = Object.freeze([
    'biological-agent',
    'water-volume',
    'detector-geometry',
    'node-graph',
    'readout-panel',
    'track-line',
    'field-sheet',
    'flow-field',
    'thermal-field',
    'optical-field',
    'network-flow',
    'material-surface',
    'organic-matrix',
    'bubble-volume',
    'constraint-surface',
    'causal-affordance',
    'process-pulse',
    'particle-swarm',
    'robot-armature',
    'granular-strata',
    'orbital-body',
    'acoustic-waveguide',
    'chemical-front',
    'phase-boundary',
  ]);

  const MATERIAL_STYLES = Object.freeze({
    air: style('#dff7ff', '#76c7e7', 0.18),
    biomass: style('#5a8f52', '#2f6130', 0.72),
    brine: style('#8edbe8', '#2d8ba4', 0.58),
    carbon: style('#55606a', '#252b32', 0.76),
    copper: style('#d08b62', '#8a4b38', 0.82),
    bacteria: style('#9adf8f', '#458947', 0.48),
    ferrofluid: style('#2b303b', '#111820', 0.88),
    fire: style('#ff8f4f', '#c65361', 0.68),
    foam: style('#efffff', '#86cfd9', 0.26),
    gel: style('#c4f4ef', '#6bb7aa', 0.36),
    glass: style('#dff9ff', '#66b8e8', 0.34),
    concrete: style('#aeb4ad', '#5d665f', 0.78),
    gold: style('#ffd760', '#b47a23', 0.86),
    ice: style('#dcf7ff', '#72b8da', 0.58),
    lava: style('#ff6b2a', '#872b1a', 0.88),
    leaf: style('#8fd878', '#3f7d3c', 0.68),
    light: style('#ffe873', '#efb425', 0.84),
    magnet: style('#d44a8f', '#2959c6', 0.88),
    matte: style('#b7b4aa', '#66635c', 0.56),
    membrane: style('#eadcff', '#a884d8', 0.42),
    metal: style('#b8c1ca', '#68737e', 0.74),
    mercury: style('#dce8ef', '#667985', 0.66),
    mycelium: style('#f2f1dc', '#9e9a72', 0.52),
    protein: style('#e8d6ff', '#9277bd', 0.42),
    rock: style('#8f8b82', '#54524d', 0.86),
    sand: style('#d9bd7b', '#a8793d', 0.76),
    silicon: style('#9eb7ce', '#5d748a', 0.64),
    signal: style('#ffd760', '#3b5f8a', 0.78),
    quartz: style('#e6f6ff', '#8db9d4', 0.54),
    smoke: style('#aeb5ba', '#687077', 0.28),
    soil: style('#8a6845', '#4d3826', 0.78),
    water: style('#56b7e8', '#216b9c', 0.62),
    wood: style('#9b6236', '#57351d', 0.8),
  });

  function style(fill, stroke, alpha) {
    return { fill, stroke, alpha };
  }

  function buildCompositionGraph(spec = {}) {
    const contract = spec.contract || {};
    const graph = contract.graph || {};
    const universeGraph = spec.universeGraph || {};
    const priors = selectionPriors(spec);
    const selected = selectGraphNodes(spec, priors);
    const nodes = selected.map((component, index) => (
      compositionNode(component, index, selected.length, spec, contract, priors)
    ));
    const relations = compositionRelations(nodes, graph);
    const operators = (graph.operators || []).map((operator) => ({
      id: operator.id,
      inputs: operator.inputs || [],
      outputs: operator.outputs || [],
    }));
    return {
      schema: COMPOSITION_SCHEMA,
      graphId: `${spec.id || 'sim'}-cg`,
      intentText: compiledIntentText(universeGraph, spec),
      nodes,
      relations,
      operators,
      priors,
      provenance: {
        composer: 'simulatte.grid-like-composition.v1',
        source: 'concept-graph-selection-priors',
        conceptCount: Array.isArray(universeGraph.nodes) ? universeGraph.nodes.length : 0,
        primitiveCount: nodes.length,
      },
    };
  }

  function compiledIntentText(universeGraph = {}, spec = {}) {
    const renderIR = spec.renderIR || {};
    return [
      ...(universeGraph.nodes || []).map((node) => [
        node.id,
        node.canonicalId,
        node.primitiveId,
        node.label,
        node.kind,
        node.semanticType,
        ...(node.domains || []),
        ...(node.tags || []),
        ...(node.operatorHints || []),
      ].filter(Boolean).join(' ')),
      ...(universeGraph.visualAffordances || []).map((row) => [
        row.id,
        row.causalRelationId,
        row.sceneKind,
        row.geometry,
        ...(row.shaderHints || []),
        ...(row.motionHints || []),
      ].filter(Boolean).join(' ')),
      ...(renderIR.objects || []).map((object) => [
        object.id,
        object.label,
        object.glyph,
        object.materialId,
        object.visualRegime,
        object.semanticRef,
        object.physicalRef,
      ].filter(Boolean).join(' ')),
      ...(renderIR.fields || []).map((field) => [
        field.id,
        field.name,
        field.channel,
        field.domainId,
      ].filter(Boolean).join(' ')),
      ...(renderIR.causalAffordances || []).map((row) => [
        row.id,
        row.causalRelationId,
        row.sceneKind,
        row.geometry,
        ...(row.shaderHints || []),
        ...(row.motionHints || []),
      ].filter(Boolean).join(' ')),
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function selectionPriors(spec = {}) {
    const universeGraph = spec.universeGraph || {};
    const conceptGraph = Array.isArray(universeGraph.nodes) ? universeGraph.nodes : [];
    return conceptGraph
      .map((concept, index) => ({
        primitiveId: concept.primitiveId || concept.canonicalId || concept.id,
        score: Number.isFinite(Number(concept.score)) ? Number(concept.score) : 0,
        domains: concept.domains || [],
        rank: index,
      }))
      .sort((a, b) => b.score - a.score || a.rank - b.rank);
  }

  function selectGraphNodes(spec, priors) {
    const components = Array.isArray(spec.objects) ? spec.objects : [];
    const byId = new Map(components.map((component) => [component.id, component]));
    const top = spec.contract && Array.isArray(spec.contract.topLevel) ? spec.contract.topLevel : [];
    const promptText = compiledPromptTextForSelection(spec);
    const sceneKind = selectionSceneKindForSpec(spec, promptText);
    const hasPromptGrounded = components.some((component) => isPromptGroundedComponent(component, promptText));
    const selected = [];
    for (const id of top) {
      if (byId.has(id) && !selected.includes(byId.get(id)) &&
        shouldSelectTopLevelComponent(byId.get(id), hasPromptGrounded, promptText, sceneKind)) {
        selected.push(byId.get(id));
      }
    }
    for (const component of components) {
      if (selected.length >= 24) break;
      if (isRequiredComponent(component) && !selected.includes(component)) selected.push(component);
    }
    for (const component of components) {
      if (selected.length >= 24) break;
      if (isPromptGroundedComponent(component, promptText) && !selected.includes(component)) selected.push(component);
    }
    for (const prior of priors) {
      if (selected.length >= 24) break;
      const component = byId.get(prior.primitiveId);
      if (component && !selected.includes(component) &&
        shouldSelectPriorComponent(component, selected, promptText, sceneKind)) {
        selected.push(component);
      }
    }
    for (const component of components) {
      if (selected.length >= 24) break;
      if (!selected.includes(component) && shouldSelectFallbackComponent(component, selected, promptText, sceneKind)) selected.push(component);
    }
    return selected;
  }

  const GENERIC_CATALOG_SUPPORT_IDS = new Set([
    'collision',
    'elasticity',
    'constraint',
    'surface-boundary',
    'time-step',
    'friction',
    'rigid-body',
    'soft-body',
    'matrix-tensor',
    'vector',
    'scalar-field',
    'gradient',
    'kernel',
    'laplacian',
    'unit-dimension',
    'threshold',
    'oscillator',
    'wave-source',
    'conservation-ledger',
    'energy-ledger',
  ]);

  function compiledPromptTextForSelection(spec = {}) {
    const promptParse = spec.promptParse || {};
    return [
      spec.name,
      spec.renderIR && spec.renderIR.prompt,
      spec.physicsIR && spec.physicsIR.prompt,
      ...((promptParse.spans || []).map((span) => span.text)),
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function selectionSceneKindForSpec(spec = {}, promptText = '') {
    const prompt = positiveLanguageText(promptText);
    const direct = nonFallbackSceneKind(spec && spec.renderIR && (spec.renderIR.sceneKind || spec.renderIR.sceneHint));
    if (direct) return direct;
    if (hasDirectSwimmingSignal(prompt)) return 'watershed';
    return baseSceneKindForPromptText(prompt) || expandedSceneKindForText(prompt) || '';
  }

  function shouldSelectPriorComponent(component, selected, promptText, sceneKind) {
    if (!component) return false;
    if (!(selected || []).some((item) => isPromptGroundedComponent(item, promptText))) return true;
    if (isPromptGroundedComponent(component, promptText)) return true;
    return sceneCompatibleSupportComponent(component, sceneKind, promptText);
  }

  function shouldSelectFallbackComponent(component, selected, promptText, sceneKind) {
    if (!component) return false;
    const source = String(component.source || '');
    if (!(selected || []).some((item) => isPromptGroundedComponent(item, promptText))) return true;
    if (isPromptGroundedComponent(component, promptText)) return true;
    if (source === 'semantic-surface-grounder') return false;
    return sceneCompatibleSupportComponent(component, sceneKind, promptText);
  }

  function shouldSelectTopLevelComponent(component, hasPromptGrounded, promptText, sceneKind) {
    if (!component) return false;
    const source = String(component.source || '');
    if (source !== 'catalog') return true;
    if (!hasPromptGrounded) return true;
    return sceneCompatibleSupportComponent(component, sceneKind, promptText);
  }

  function catalogSupportIsPrompted(component, promptText) {
    const prompt = String(promptText || '').toLowerCase();
    const id = String(component && component.id || '').toLowerCase();
    if (!prompt) return false;
    if (id === 'collision') return /\b(collision|collide|collides|colliding|crash|crashes|crashing|impact|hits?|strikes?)\b/.test(prompt);
    if (id === 'elasticity') return /\b(elastic|elasticity|spring|bounce|bouncy|deform|stretch)\b/.test(prompt);
    if (id === 'friction') return /\b(friction|slip|slide|drag|traction)\b/.test(prompt);
    if (id === 'constraint' || id === 'surface-boundary') return /\b(constraint|boundary|wall|contact|support|surface)\b/.test(prompt);
    if (id === 'time-step') return /\b(time[- ]?step|timestep|dt|integration)\b/.test(prompt);
    if (id === 'wave-source') return /\b(wave|waves|oscillation|speaker|sound|acoustic|driver)\b/.test(prompt);
    if (id === 'energy-ledger' || id === 'conservation-ledger') return /\b(energy|conservation|ledger|accounting|loss|stored)\b/.test(prompt);
    const terms = id.split(/[-_]+/).filter((term) => term.length > 2);
    return terms.length > 0 && terms.some((term) => new RegExp(`\\b${term}\\b`).test(prompt));
  }

  function sceneCompatibleSupportComponent(component, sceneKind, promptText) {
    if (!component) return false;
    if (catalogSupportIsPrompted(component, promptText)) return true;
    const source = String(component.source || '');
    if (source === 'semantic-surface-grounder') return false;
    if (source !== 'catalog') return true;
    const text = componentSelectionText(component);
    const prompt = String(promptText || '').toLowerCase();
    if (GENERIC_CATALOG_SUPPORT_IDS.has(component.id) && !catalogSupportIsPrompted(component, prompt)) {
      return false;
    }
    if (sceneKind === 'fire' || sceneKind === 'thermal-plume') {
      if (/\b(water|river|erosion|sediment|terrain|watershed|soil|rock-wall|flow-inlet|flow-outlet|fluid-advection|moving-fluid|buoyancy|population|growth-decay|infection|biology|optics|lens|mirror|prism|queue|network|traffic|market)\b/.test(text)) {
        return /\b(water|river|terrain|erosion|sediment|wet|rain|flood|flow|growth|plant|forest|tree)\b/.test(prompt);
      }
      return /\b(fire|flame|combust|smoke|fuel|wood|air|wind|oxygen|heat|thermal|radiation|cooling|phase-change|plasma)\b/.test(text);
    }
    if (sceneKind === 'optics' || sceneKind === 'thin-film') {
      if (/\b(water|fluid|flow|advection|pressure|moving-fluid|flow-inlet|flow-outlet|buoyancy)\b/.test(text)) {
        return /\b(water|fluid|river|pond|ocean|brine|liquid|through water)\b/.test(prompt);
      }
      if (/\b(fire|flame|smoke|combust|queue|traffic|market|network|infection|population|terrain|erosion|sediment)\b/.test(text)) {
        return false;
      }
      return /\b(optic|prism|lens|mirror|light|ray|glass|sensor|lamp|caustic|film|beam|radiation|transparent|crystal)\b/.test(text);
    }
    if (sceneKind === 'city' || sceneKind === 'civic-market' || sceneKind === 'digital-network' || sceneKind === 'venue-crowd') {
      if (/\b(fire|flame|smoke|wood|thermal|water|river|fluid|erosion|sediment|terrain|biology|protein|bacteria|animal)\b/.test(text)) {
        return /\b(fire|water|river|cooling|heat|thermal|animal|biology)\b/.test(prompt);
      }
      return /\b(network|queue|traffic|market|power|sensor|ledger|delay|controller|route|node|link|agent|platform|slot|logistics|server|rack|signal|grid|building|parcel|zoning|pedestrian)\b/.test(text);
    }
    if (sceneKind === 'watershed' || sceneKind === 'restoration-water' || sceneKind === 'ocean-cryosphere') {
      if (/\b(fire|flame|smoke|thermal|optic|lens|mirror|prism|queue|traffic|market|network)\b/.test(text)) {
        return false;
      }
      return /\b(water|river|flow|fluid|advection|pressure|terrain|heightfield|erosion|channel|sand|soil|clay|rock|sediment|gravity|granular|grain|slope|animal|body|biomass|swim|buoyancy|glacier|ice|ocean|storm|surge|wetland|mangrove|root)\b/.test(text);
    }
    if (sceneKind === 'biology' || sceneKind === 'molecular-biology' || sceneKind === 'evolution-ecology') {
      if (/\b(fire|flame|smoke|thermal|optic|lens|mirror|prism|queue|traffic|market|network|glacier)\b/.test(text)) {
        return false;
      }
      if (/\b(water|fluid|flow|advection)\b/.test(text)) {
        return /\b(water|fluid|swim|wetland|pond|river|nutrient|metabolite)\b/.test(prompt);
      }
      return /\b(animal|body|biomass|membrane|soft|growth|diffusion|nutrient|population|cell|protein|bacteria|mycelium|leaf|plant|root|tissue|metabolite|colony|organism|infection)\b/.test(text);
    }
    if (sceneKind === 'granular') {
      if (/\b(fire|flame|smoke|optic|lens|prism|queue|network)\b/.test(text)) return false;
      return /\b(granular|grain|bead|sieve|avalanche|powder|sand|rock|sediment|gravity|collision|constraint|friction|surface-boundary)\b/.test(text);
    }
    if (sceneKind === 'mechanical' || sceneKind === 'robotics-control') {
      if (/\b(fire|flame|smoke|thermal|fluid-advection|river|water|protein|bacteria)\b/.test(text)) return false;
      return /\b(collision|friction|rigid-body|soft-body|wheel|wall|constraint|surface-boundary|energy-ledger|metal|rubber|robot|gripper|servo|motor|contact|force|bearing|spring)\b/.test(text);
    }
    if (sceneKind === 'ferrofluid' || sceneKind === 'magnetic-machine') {
      if (/\b(fire|flame|smoke|queue|traffic|protein|bacteria|terrain|river)\b/.test(text)) return false;
      return /\b(magnet|ferrofluid|coil|current|conductor|copper|rotor|stator|wheel|slider|solar|panel|motor|load|flux|dipole|electric|field)\b/.test(text);
    }
    if (sceneKind === 'acoustic') {
      if (/\b(fire|flame|smoke|queue|traffic|network|optic|lens|prism)\b/.test(text)) return false;
      return /\b(acoustic|sound|wave|pressure|resonance|emitter|tube|water|brass|membrane|air|oscillator)\b/.test(text);
    }
    if (sceneKind === 'particle-instrument' || sceneKind === 'quantum-instrument') {
      return /\b(collider|muon|particle|track|detector|calorimeter|instrument|sensor|field|magnet|thermal|readout|measurement|optical|light)\b/.test(text);
    }
    if (sceneKind === 'planetary-space') {
      return /\b(planet|ring|moon|resonance|orbit|orbital|gravity|boulder|ice|space|trajectory|density|wave)\b/.test(text);
    }
    return false;
  }

  function componentSelectionText(component) {
    return [
      component && component.id,
      component && component.type,
      component && component.kind,
      component && component.role,
      component && component.phrase,
      component && component.shape,
      component && component.material,
      component && component.visualRegime,
      ...((component && component.domains) || []),
      ...((component && component.tags) || []),
      component && component.text,
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function phraseMatchesPrompt(phrase, promptText) {
    const phraseText = positiveLanguageText(phrase);
    const prompt = positiveLanguageText(promptText);
    if (!phraseText || !prompt) return false;
    if (prompt.includes(phraseText)) return true;
    const stop = new Set([
      'and', 'with', 'through', 'into', 'from', 'the', 'a', 'an', 'of', 'in', 'on',
      'environment', 'component', 'physics', 'material', 'primitive', 'generated',
    ]);
    const terms = phraseText.split(/\s+/).filter((term) => term.length > 2 && !stop.has(term));
    if (!terms.length) return false;
    return terms.every((term) => {
      const singular = term.endsWith('s') ? term.slice(0, -1) : term;
      return new RegExp(`\\b${singular}(?:s|es)?\\b`).test(prompt);
    });
  }

  function isPromptGroundedComponent(component, promptText = '') {
    const source = String(component && component.source || '');
    if (source === 'semantic-surface-grounder') {
      return phraseMatchesPrompt(component && component.phrase, promptText);
    }
    return /^embedding-guided-synth|open-semantic-rag|semantic-surface-grounder|prompt-family|prompt-explicit|render-ir|doppler-residual/.test(source) ||
      Boolean(component && component.phrase && source && source !== 'catalog');
  }

  function isRequiredComponent(component) {
    const source = String(component && component.source || '');
    return Boolean(component && component.pinned) || source === 'prompt-family';
  }

  function pinnedComponentIdsForSpec(spec) {
    void spec;
    return [];
  }

  function compositionNode(component, index, total, spec, contract, priors) {
    const prior = priors.find((item) => item.primitiveId === component.id) || {};
    const graphNode = graphNodeFor(contract, component.id);
    return {
      nodeId: `cg${index + 1}`,
      primitiveId: component.id,
      type: component.type || 'body',
      layer: component.layer || inferLayer(component),
      role: component.role || component.id,
      score: prior.score || component.score || 0,
      material: materialForComponent(component),
      shape: shapeForComponent(component),
      visualRegime: component.visualRegime || '',
      assembly: component.assembly || '',
      phrase: component.phrase || '',
      source: component.source || '',
      domains: component.domains || [],
      placement: placementFor(component, index, total, spec, contract),
      params: { ...(component.params || {}) },
      state: graphNode ? graphNode.state || null : component.state || null,
      ports: component.ports || null,
      primitiveProgram: component.primitiveProgram || null,
    };
  }

  function graphNodeFor(contract, id) {
    const nodes = contract && contract.graph && Array.isArray(contract.graph.nodes)
      ? contract.graph.nodes
      : [];
    return nodes.find((node) => node.id === id) || null;
  }

  function compositionRelations(nodes, graph) {
    const valid = new Set(nodes.map((node) => node.primitiveId));
    const fromGraph = (graph.edges || [])
      .filter((edge) => valid.has(edge.from) && valid.has(edge.to))
      .map((edge) => ({
        from: edge.from,
        to: edge.to,
        channel: edge.channel || edge.kind || 'coupled-state',
        strength: Number.isFinite(Number(edge.weight)) ? Number(edge.weight) : 0.64,
      }));
    if (fromGraph.length) return fromGraph.slice(0, 42);
    return nodes.slice(1).map((node, index) => ({
      from: nodes[index].primitiveId,
      to: node.primitiveId,
      channel: 'coupled-state',
      strength: 0.45,
    }));
  }

  function placementFor(component, index, total, spec, contract) {
    const grammar = contract && contract.layout ? contract.layout.grammar : 'freeform';
    const phase = hashNoise((spec.id || '').length + 17, index);
    const id = String(component && component.id || '');
    const text = componentText(component);
    const radial = radialPlacement(index, total, phase);
    if (id === 'rotor-wheel') return anchoredPlacement(0.5, 0.5, 0, index);
    if (id === 'stator-slider') return anchoredPlacement(0.68, 0.42, -0.18, index);
    if (id === 'solar-panel') return anchoredPlacement(0.18, 0.18, 0.18, index);
    if (id === 'motor-load') return anchoredPlacement(0.78, 0.74, 0.12, index);
    if (/load|generator|motor-load/.test(text)) return anchoredPlacement(0.78, 0.74, 0.12, index);
    if (/solar|sun|lamp|panel/.test(text)) return anchoredPlacement(0.18, 0.18, 0.18, index);
    if (/wheel|rotor/.test(text)) return anchoredPlacement(0.5, 0.5, 0, index);
    if (/slider|stator|magnet/.test(text)) return anchoredPlacement(0.68, 0.42, -0.18, index);
    if (/mycelium|bacteria|protein|leaf|cell/.test(text)) return anchoredPlacement(0.46, 0.56, 0, index);
    if (grammar === 'bench') return linePlacement(index, total, 0.18, 0.46, 0.74);
    if (grammar === 'orthogonal network' || grammar === 'route graph' || grammar === 'network') {
      return gridPlacement(index);
    }
    if (grammar === 'flow path' || grammar === 'downhill channel') return flowPlacement(index, total);
    if (grammar === 'process line' || grammar === 'hub and queues' || grammar === 'supply demand loop') {
      return linePlacement(index, total, 0.14, 0.52 + Math.sin(index) * 0.08, 0.72);
    }
    if (grammar === 'patch spread') return patchPlacement(component, index, total, phase);
    return radial;
  }

  function anchoredPlacement(x, y, rotation, layer) {
    return { anchor: clampAnchor([x, y]), rotation, scale: 1, layer };
  }

  function clampAnchor(anchor) {
    return [clamp(anchor[0], 0.08, 0.92), clamp(anchor[1], 0.1, 0.9)];
  }

  function radialPlacement(index, total, phase) {
    const angle = (index / Math.max(1, total)) * Math.PI * 2 - Math.PI / 2;
    const radius = 0.16 + (index % 5) * 0.038 + phase * 0.02;
    return {
      anchor: clampAnchor([0.52 + Math.cos(angle) * radius, 0.52 + Math.sin(angle) * radius]),
      rotation: angle + Math.PI / 2,
      scale: 1,
      layer: index,
    };
  }

  function linePlacement(index, total, left, y, width) {
    const t = total <= 1 ? 0.5 : index / (total - 1);
    return { anchor: clampAnchor([left + t * width, y + Math.sin(index) * 0.035]), rotation: 0, scale: 1, layer: index };
  }

  function gridPlacement(index) {
    const col = index % 5;
    const row = Math.floor(index / 5);
    return { anchor: clampAnchor([0.18 + col * 0.16, 0.26 + row * 0.16]), rotation: 0, scale: 1, layer: index };
  }

  function flowPlacement(index, total) {
    const t = total <= 1 ? 0.5 : index / (total - 1);
    return { anchor: clampAnchor([0.18 + t * 0.64, 0.24 + t * 0.52 + Math.sin(index) * 0.04]), rotation: 0.42, scale: 1, layer: index };
  }

  function patchPlacement(component, index, total, phase) {
    const text = componentText(component);
    if (/wind|air/.test(text)) return anchoredPlacement(0.2, 0.36, 0, index);
    if (/water|flow/.test(text)) return anchoredPlacement(0.28, 0.74, -0.18, index);
    if (/wall|rock/.test(text)) return anchoredPlacement(0.76, 0.56, 0.08, index);
    const t = total <= 1 ? 0.5 : index / (total - 1);
    return { anchor: clampAnchor([0.38 + t * 0.2, 0.55 + (phase - 0.5) * 0.12]), rotation: 0.04, scale: 1, layer: index };
  }

  function compileCompositionToRenderProgram(graph = null, spec = {}) {
    if (!graph || graph.schema !== COMPOSITION_SCHEMA) return null;
    if (spec && spec.renderIR && spec.solverGraph) {
      return renderProgramFromRenderIR(graph, spec);
    }
    const initialObjects = graph.nodes.map((node) => renderObjectForNode(node, spec));
    const relations = graph.relations.map((relation) => ({
      ...relation,
      reason: relation.channel,
    }));
    const rawFields = fieldsForComposition(graph, spec);
    const sceneKind = resolveSceneKind(graph, initialObjects, rawFields, spec);
    const fields = focusFieldsForScene(rawFields, sceneKind);
    const laidOutObjects = layoutObjectsForScene(prioritizeObjectsForScene(initialObjects, sceneKind), sceneKind, spec);
    const objectLedger = visualObjectAcceptanceLedger(laidOutObjects, sceneKind, spec);
    const objects = objectLedger.accepted;
    const visualRegimes = uniqueList(objects.map((object) => object.visualRegime));
    const emitters = emittersForComposition(graph);
    const solverPlan = refineSolverPlanForScene(solverPlanForComposition(graph, laidOutObjects), sceneKind);
    const rendererPlan = {
      ...rendererPlanForComposition(graph, objects, fields, solverPlan, spec, sceneKind),
      visualObjectLedger: objectLedger.summary,
    };
    const visualIR = visualIRForRenderProgram(graph, objects, fields, solverPlan, spec, rendererPlan, sceneKind);
    const program = {
      schema: RENDER_PROGRAM_SCHEMA,
      sourceGraphId: graph.graphId,
      intentText: graph.intentText,
      materials: { ...MATERIAL_STYLES },
      objects,
      supportObjects: objectLedger.rejected,
      visualAcceptance: objectLedger.receipts,
      relations,
      fields,
      emitters,
      solverPlan,
      rendererPlan,
      visualGenome: rendererPlan.visualGenome,
      visualIR,
      sceneRenderPacket: visualIR.sceneRenderPacket,
      camera: { framing: 'composition-2d', padding: 0.08, sceneKind: rendererPlan.sceneKind },
      provenance: {
        compiler: 'simulatte.composition-to-render-program.v1',
        nodeCount: graph.nodes.length,
        relationCount: graph.relations.length,
        operatorCount: graph.operators.length,
        visualRegimes,
        dominantRegime: rendererPlan.dominantRegime,
        sceneKind: rendererPlan.sceneKind,
        visualIdentity: rendererPlan.visualIdentity,
        visualGenome: rendererPlan.visualGenome,
        visualObjectLedger: objectLedger.summary,
        signature: uniqueList(graph.nodes.map((node) => node.shape)).join('+'),
      },
    };
    return program;
  }

  function augmentRenderProgramWithRenderIR(program, spec) {
    const renderObjects = spec.renderIR && spec.renderIR.objects || [];
    const bindingByText = renderBindingIndex(renderObjects);
    const objects = (program.objects || []).map((object) => {
      const key = bestRenderBindingKey(object, bindingByText);
      const binding = key ? bindingByText.get(key) : null;
      if (!binding) return object;
      return {
        ...object,
        stateBindings: binding.stateBindings || {},
        physicalRef: binding.physicalRef || object.physicalRef || '',
        semanticRef: binding.semanticRef || object.semanticRef || '',
      };
    });
    const fields = program.fields || [];
    const solverFamilies = uniqueList([
      ...((program.solverPlan && program.solverPlan.families) || []),
      ...((spec.solverGraph.steps || []).map((step) => step.solverId)),
    ]);
    return {
      ...program,
      objects,
      fields,
      renderIR: spec.renderIR,
      solverPlan: {
        ...(program.solverPlan || {}),
        families: solverFamilies,
        state: uniqueList([
          ...((program.solverPlan && program.solverPlan.state) || []),
          ...Object.keys(spec.solverGraph.channels || {}),
        ]),
        executableSteps: (spec.solverGraph.steps || []).map((step) => step.operatorType),
      },
      provenance: {
        ...(program.provenance || {}),
        renderIR: spec.renderIR.schema,
        solverGraph: spec.solverGraph.schema,
      },
    };
  }

  function renderBindingIndex(renderObjects) {
    const map = new Map();
    for (const object of renderObjects || []) {
      for (const key of renderBindingKeys(object)) {
        if (key && !map.has(key)) map.set(key, object);
      }
    }
    return map;
  }

  function renderBindingKeys(object) {
    return [
      object.physicalRef,
      object.semanticRef,
      object.label,
      object.glyph,
      object.materialId,
    ].map((value) => String(value || '').toLowerCase()).filter(Boolean);
  }

  function bestRenderBindingKey(object, bindingByText) {
    const text = [
      object.id,
      object.role,
      object.shape,
      object.material,
      object.assembly,
      object.visualRegime,
    ].join(' ').toLowerCase();
    for (const key of bindingByText.keys()) {
      if (key && (text.includes(key) || key.includes(object.id))) return key;
    }
    if (/lava|magma/.test(text) && bindingByText.has('lava')) return 'lava';
    if (/turbine|rotor|wheel/.test(text) && bindingByText.has('turbine')) return 'turbine';
    if (/castle|wall/.test(text) && bindingByText.has('castle')) return 'castle';
    if (/ice/.test(text) && bindingByText.has('ice')) return 'ice';
    return '';
  }

  function renderProgramFromRenderIR(graph, spec) {
    const renderIR = spec.renderIR || {};
    const solverGraph = spec.solverGraph || {};
    const bindingByText = renderBindingIndex(renderIR.objects || []);
    const irObjects = (renderIR.objects || []).map((object, index) => ({
      id: object.physicalRef || object.id,
      kind: object.glyph === 'field' ? 'field' : 'body',
      material: object.materialId || 'metal',
      role: object.label || object.semanticRef || object.id,
      shape: shapeForRenderGlyph(object.glyph, object),
      visualRegime: object.visualRegime || '',
      assembly: object.semanticRef || '',
      phrase: object.label || '',
      source: 'render-ir',
      pose: poseForRenderObject(object, index, renderIR.objects.length),
      dynamics: {},
      stateBindings: object.stateBindings || {},
      physicalRef: object.physicalRef || '',
      semanticRef: object.semanticRef || '',
      required: true,
    }));
    const graphObjects = (graph.nodes || [])
      .map((node) => renderObjectForNode(node, spec))
      .map((object) => bindRenderIRToObject(object, bindingByText));
    const sceneKind = sceneKindForRenderIR(renderIR, solverGraph, graph, graphObjects, spec);
    const irContext = unmatchedRenderIRObjects(graphObjects, irObjects, sceneKind);
    const laidOutObjects = preservePromptGroundedSurfaceObjects(layoutObjectsForScene(
      prioritizeObjectsForScene(uniqueObjectsById([...graphObjects, ...irContext]), sceneKind),
      sceneKind,
      spec
    ), graphObjects, spec, sceneKind);
    const objectLedger = visualObjectAcceptanceLedger(laidOutObjects, sceneKind, spec);
    const objects = objectLedger.accepted;
    const irFields = (renderIR.fields || []).map((field) => ({
      id: field.id,
      kind: fieldKindForRenderIRField(field, sceneKind),
      channel: field.channel,
      stateBinding: field.channel,
      domainId: field.domainId,
      strength: 0.7,
    }));
    const legacyFields = fieldsForComposition(graph, spec);
    const fields = focusFieldsForScene(uniqueFieldsByKind([...irFields, ...legacyFields]), sceneKind);
    const legacySolverPlan = refineSolverPlanForScene(solverPlanForComposition(graph, laidOutObjects), sceneKind);
    const solverSteps = solverGraphStepsForScene((solverGraph && solverGraph.steps) || [], sceneKind);
    const solverPlan = {
      schema: 'simulatte.solverPlan.v1',
      integrator: legacySolverPlan.integrator || 'mixed-semi-implicit',
      families: uniqueList([
        ...((legacySolverPlan && legacySolverPlan.families) || []),
        ...(solverSteps.map((step) => step.solverId)),
      ]),
      state: uniqueList([
        ...((legacySolverPlan && legacySolverPlan.state) || []),
        ...Object.keys(solverGraph.channels || {}),
      ]),
      steps: solverSteps.map((step) => step.operatorType),
      executableSteps: solverSteps.map((step) => step.operatorType),
    };
    const rendererPlan = {
      ...rendererPlanForComposition(graph, objects, fields, solverPlan, spec, sceneKind),
      visualObjectLedger: objectLedger.summary,
    };
    const visualIR = visualIRForRenderProgram(graph, objects, fields, solverPlan, spec, rendererPlan, sceneKind);
    return {
      schema: RENDER_PROGRAM_SCHEMA,
      sourceGraphId: graph.graphId,
      intentText: graph.intentText,
      materials: { ...MATERIAL_STYLES },
      objects,
      supportObjects: objectLedger.rejected,
      visualAcceptance: objectLedger.receipts,
      relations: relationsFromPhysicsIR(spec),
      fields,
      emitters: emittersForComposition(graph),
      solverPlan,
      rendererPlan,
      visualGenome: rendererPlan.visualGenome,
      visualIR,
      sceneRenderPacket: visualIR.sceneRenderPacket,
      renderIR,
      camera: { framing: 'composition-2d', padding: 0.08, sceneKind },
      provenance: {
        compiler: 'simulatte.render-ir-to-render-program.v1',
        nodeCount: objects.length,
        relationCount: spec.physicsIR ? (spec.physicsIR.couplings || []).length : 0,
        operatorCount: solverGraph.steps ? solverGraph.steps.length : 0,
        visualRegimes: uniqueList(objects.map((object) => object.visualRegime)),
        dominantRegime: rendererPlan.dominantRegime,
        sceneKind,
        visualIdentity: rendererPlan.visualIdentity,
        visualGenome: rendererPlan.visualGenome,
        visualObjectLedger: objectLedger.summary,
        signature: uniqueList(objects.map((object) => object.shape)).join('+'),
        renderIR: renderIR.schema,
        solverGraph: solverGraph.schema,
      },
    };
  }

  function bindRenderIRToObject(object, bindingByText) {
    const key = bestRenderBindingKey(object, bindingByText);
    const binding = key ? bindingByText.get(key) : null;
    if (!binding) return object;
    return {
      ...object,
      stateBindings: binding.stateBindings || {},
      physicalRef: binding.physicalRef || object.physicalRef || '',
      semanticRef: binding.semanticRef || object.semanticRef || '',
    };
  }

  function preservePromptGroundedSurfaceObjects(objects, graphObjects, spec, sceneKind) {
    const promptText = compiledPromptTextForSelection(spec);
    const existing = new Set((objects || []).map((object) => object.id));
    const directSurface = (graphObjects || []).filter((object) => {
      if (!object || existing.has(object.id)) return false;
      if (object.source !== 'semantic-surface-grounder') return false;
      if (!isPromptGroundedComponent(object, promptText)) return false;
      return sceneObjectPriority(object, sceneKind) >= 0;
    });
    if (!directSurface.length) return objects;
    return uniqueObjectsById([...objects, ...directSurface]).slice(0, 24);
  }

  function unmatchedRenderIRObjects(graphObjects, irObjects, sceneKind) {
    const seen = new Set((graphObjects || []).flatMap((object) => [
      object.id,
      object.semanticRef,
      object.physicalRef,
      object.role,
      object.shape,
    ].map((value) => String(value || '').toLowerCase()).filter(Boolean)));
    return (irObjects || [])
      .filter((object) => {
        const text = renderObjectText(object);
        if ([object.id, object.role, object.shape, object.phrase]
          .some((value) => seen.has(String(value || '').toLowerCase()))) {
          return false;
        }
        return contextObjectForRenderIRScene(text, sceneKind);
      })
      .slice(0, 10);
  }

  function sceneKindForRenderIR(renderIR, solverGraph, graph, graphObjects, spec) {
    const sceneHint = normalizedSceneHint(renderIR.sceneHint);
    const directScene = directSceneKindForRenderIR(renderIR, spec);
    if (directScene && broadSceneHintCanYieldToDirectLanguage(sceneHint)) return directScene;
    if (sceneHint && sceneHint !== 'literal-composite') return sceneHint;
    const signalScene = sceneKindFromRenderIRSignals(renderIR, solverGraph, spec);
    if (signalScene && signalScene !== 'literal-composite') return signalScene;
    const fallbackScene = sceneKindForComposition(
      graph,
      graphObjects,
      fieldsForComposition(graph, spec),
      spec
    );
    if (fallbackScene && fallbackScene !== 'generic') return fallbackScene;
    return signalScene || sceneHint || 'generic';
  }

  function directSceneKindForRenderIR(renderIR, spec) {
    return directSceneKindForText(
      directRenderIRSceneText(renderIR, spec),
      directPromptSceneText(renderIR, spec)
    );
  }

  function directSceneKindForText(text = '', promptText = text) {
    if (hasDirectCombustionSignal(promptText)) return 'fire';
    if (hasDirectSwimmingSignal(promptText)) return 'watershed';
    if (hasDirectAnimalOrPlantSignal(text) && !hasDirectMechanicalRigSignal(promptText)) return 'biology';
    return '';
  }

  function broadSceneHintCanYieldToDirectLanguage(sceneHint) {
    return !sceneHint || sceneHint === 'generic' || sceneHint === 'literal-composite' ||
      sceneHint === 'mechanical' || sceneHint === 'biology';
  }

  function normalizedSceneHint(value) {
    const scene = String(value || '').trim();
    return scene && scene !== 'generic' ? scene : '';
  }

  function nonFallbackSceneKind(value) {
    const scene = String(value || '').trim();
    return scene && scene !== 'generic' && scene !== 'literal-composite' ? scene : '';
  }

  function sceneKindFromRenderIRSignals(renderIR, solverGraph, spec) {
    const directText = directRenderIRSceneText(renderIR, spec);
    if (hasDirectSwimmingSignal(directText)) return 'watershed';
    if (hasDirectAnimalOrPlantSignal(directText) && !hasDirectMechanicalRigSignal(directText)) return 'biology';
    const text = [
      (renderIR.objects || []).map((object) => [
        object.label,
        object.glyph,
        object.materialId,
        object.visualRegime,
        object.domainKind,
        object.semanticRef,
        object.physicalRef,
        ...(object.domainTags || []),
        ...(object.operatorHints || []),
        Object.keys(object.stateBindings || {}).join(' '),
      ].join(' ')).join(' '),
      (renderIR.fields || []).map((field) => `${field.name} ${field.channel} ${field.domainId}`).join(' '),
      (solverGraph.steps || []).map((step) => `${step.operatorType} ${step.solverId}`).join(' '),
    ].join(' ').toLowerCase();
    const expanded = expandedSceneKindForText(text);
    if (expanded) return expanded;
    if (hasRoboticsSignal(text)) return 'robotics-control';
    if (hasChemistryLabSignal(text)) return 'chemistry-lab';
    if (hasGranularCombustionSignal(text)) return 'granular';
    if (hasThinFilmSignal(text)) return 'thin-film';
    if (/tray|raw material|heat diffusion sample/.test(text) && /water|air|rock|wood|metal|glass|steel/.test(text)) {
      return 'material-tray';
    }
    if (/thermal plume|cooling|cooler|smoke over cooling/.test(text) && /thermal|heat|temperature/.test(text)) {
      return 'thermal-plume';
    }
    if (/process-fire|flame|combustion|fuel|burn/.test(text) && /heat_source|reaction_diffusion|burn/.test(text)) {
      return 'fire';
    }
    if (/lava|magma|molten|volcano|heat_transfer|phase_transition|steam|thermal|temperature/.test(text)) return 'thermal-plume';
    if (/black-hole|black hole|singularity|spaceship|spacecraft|rocket|orbital|orbit|planetary/.test(text)) return 'planetary-space';
    if (/lens|prism|mirror|optics|field_refraction|field_reflection|laser/.test(text)) return 'optics';
    if (/network|queue|traffic|market|network_flow|backlog|throughput/.test(text)) return 'city';
    if (/wheel|rotor|stator|slider|sliding|electromagnetism|magnetic_force|rotor-wheel/.test(text) && /magnet|magnetic/.test(text)) {
      return 'magnetic-machine';
    }
    if (/ferrofluid|magnetic_fluid|magnetizes|spikes|magnetic_field/.test(text)) return 'ferrofluid';
    if (/\b(terrain|erosion|sediment|river|rain|basalt|watershed|gravity)\b/.test(text)) return 'watershed';
    if (/acoustic|sound|wave_field|resonance|amplitude/.test(text) &&
      !/biology|growth|mycelium|bacteria|membrane|protein|nutrient|density/.test(text)) {
      return 'acoustic';
    }
    if (/granular|grain|bead|sieve|avalanche|powder/.test(text)) return 'granular';
    if (/rigid_collision|fracture_threshold|rotational_torque|projectile|collision/.test(text) &&
      !/acoustic|sound|wave_field|resonance|amplitude/.test(text)) {
      return 'mechanical';
    }
    if (/biology|growth|mycelium|bacteria|membrane|protein|nutrient|density/.test(text)) return 'biology';
    if (/acoustic|sound|wave_field|resonance|amplitude/.test(text)) return 'acoustic';
    if (/fluid|water|flowVelocity|advection/.test(text)) return 'watershed';
    if (/turbine|castle|ice|storm|instrument/.test(text)) return 'literal-composite';
    return '';
  }

  function directRenderIRSceneText(renderIR, spec) {
    return positiveLanguageText([
      directPromptSceneText(renderIR, spec),
      ...((renderIR && renderIR.objects || []).map((object) => [
        object.label,
        object.glyph,
        object.materialId,
        object.visualRegime,
        object.domainKind,
        object.semanticRef,
        object.physicalRef,
        ...(object.domainTags || []),
        ...(object.operatorHints || []),
      ].join(' '))),
    ].filter(Boolean).join(' '));
  }

  function directPromptSceneText(renderIR, spec) {
    const promptParse = spec && spec.promptParse || {};
    const universeGraph = spec && spec.universeGraph || {};
    const physicsIR = spec && spec.physicsIR || {};
    return positiveLanguageText([
      renderIR && renderIR.prompt,
      universeGraph.prompt,
      physicsIR.prompt,
      spec && spec.name,
      ...((promptParse.spans || []).map((span) => span.text)),
    ].filter(Boolean).join(' '));
  }

  function hasDirectSwimmingSignal(text = '') {
    return /\b(swim|swims|swimming|swam|underwater|water|pool|pond|lake|river)\b/.test(text) &&
      (hasDirectAnimalOrPlantSignal(text) || /\b(swim|swims|swimming|swam|underwater)\b/.test(text));
  }

  function hasDirectCombustionSignal(text = '') {
    return /\b(forest fire|wildfire|fire|flame|flames|smoke|soot|burn|burns|burning|combust|combustion|ember|embers)\b/.test(text);
  }

  function hasDirectAnimalOrPlantSignal(text = '') {
    return /\b(dog|dogs|cat|cats|mouse|mice|gerbil|gerbils|hamster|hamsters|animal|animals|mammal|mammals|bird|birds|fish|flower|flowers|tree|trees|plant|plants|leaf|leaves|root|roots|grass|forest)\b/.test(text);
  }

  function hasDirectMechanicalRigSignal(text = '') {
    return /\b(hamster wheel|running wheel|wheel crashing|crash|crashes|crashing|collision|collide|impact|fracture|projectile|gear|rotor|motor)\b/.test(text);
  }

  function hasRoboticsSignal(text = '') {
    const positive = positiveLanguageText(text);
    return /\b(robot|robotic|gripper|servo|workcell|manipulator|pick-place|pick and place|contact force)\b/.test(positive) &&
      /\b(robot|robotic|gripper|servo|manipulator|workcell)\b/.test(positive);
  }

  function positiveLanguageText(value = '') {
    const word = "[a-z0-9]+(?:[-'][a-z0-9]+)*";
    const stop = '(?:and|with|while|where|when|because|but|however|though|although|unless|inside|outside|near|around|between|against|across|during|through|then|so)';
    const negated = new RegExp(`\\b(?:no|not|never|none|without|cannot|can't|wont|won't|avoid|exclude|except)\\b(?:\\s+(?:a|an|the|any))?(?:\\s+(?!\\b${stop}\\b)${word}){1,6}`, 'gi');
    return String(value || '').toLowerCase().replace(negated, ' ').replace(/\s+/g, ' ').trim();
  }

  function hasChemistryLabSignal(text = '') {
    return /\b(microfluidic|droplet|droplets|channel junction|meniscus|reagent|reaction vessel|catalyst|dose|insulin pump)\b/.test(text) &&
      !/\b(warehouse|traffic|market|orbit|planet|battery runaway|heat plume)\b/.test(text);
  }

  function hasGranularCombustionSignal(text = '') {
    if (/\b(rain|river|water|watershed|terrain|erosion|erodes|mountain|delta|channel)\b/.test(text) &&
      !/\b(dust|powder|silo|aerosol|explode|explodes|explosion)\b/.test(text)) {
      return false;
    }
    return /\b(grain|dust|powder|silo|aerosol|bead|sand|avalanche)\b/.test(text) &&
      /\b(explode|explodes|explosion|combust|burn|ignite|silo|avalanche|sieve|grain bed|bead stream)\b/.test(text);
  }

  function hasThinFilmSignal(text = '') {
    const positive = positiveLanguageText(text);
    return /\b(thin-film|thin film|soap|wire-loop|wire loop|surface_tension|iridescen)\b/.test(positive) ||
      (/\b(air bubble|air bubbles|bubble|bubbles)\b/.test(positive) &&
        /\b(soap|film|wire|loop|iridescen|surface tension|surface_tension)\b/.test(positive));
  }

  function renderIRObjectSceneText(renderIR, graphObjects) {
    return [
      (renderIR.objects || []).map((object) => [
        object.id,
        object.label,
        object.glyph,
        object.materialId,
        object.visualRegime,
        object.semanticRef,
        object.physicalRef,
      ].join(' ')).join(' '),
      specificGraphObjects(graphObjects).map(renderObjectText).join(' '),
    ].join(' ').toLowerCase();
  }

  function renderIRSceneText(renderIR, solverGraph, graph, graphObjects, spec) {
    return [
      renderIR.sceneHint,
      (renderIR.objects || []).map((object) => [
        object.id,
        object.label,
        object.glyph,
        object.materialId,
        object.visualRegime,
        object.semanticRef,
        object.physicalRef,
        Object.keys(object.stateBindings || {}).join(' '),
      ].join(' ')).join(' '),
      (renderIR.fields || []).map((field) => `${field.name} ${field.channel} ${field.domainId}`).join(' '),
      (solverGraph.steps || []).map((step) => `${step.operatorType} ${step.solverId}`).join(' '),
      specificGraphObjects(graphObjects).map(renderObjectText).join(' '),
    ].join(' ').toLowerCase();
  }

  function specificGraphObjects(objects) {
    return (objects || []).filter((object) => {
      const source = object.source || '';
      if (!source) return false;
      return source !== 'catalog';
    });
  }

  function contextObjectForRenderIRScene(text, sceneKind) {
    if (sceneKind === 'fire') return /flame|smoke|fuel|water|terrain|wall/.test(text);
    if (sceneKind === 'optics') return /lens|prism|mirror|beam|light|sensor/.test(text);
    if (sceneKind === 'city') return /queue|network|market|traffic|sensor|ledger/.test(text);
    if (sceneKind === 'watershed') return /rain|river|terrain|sediment|sand|soil|rock|delta|basalt|storm|surge|submarine|turbine|algae|undersea|water|tank/.test(text);
    if (sceneKind === 'magnetic-machine') return /wheel|rotor|stator|slider|magnet|panel|ledger/.test(text);
    if (sceneKind === 'mechanical') return /collision|fractur|constraint|wall|projectile|tower|glass|rigid/.test(text);
    if (sceneKind === 'literal-composite') return /lava|turbine|ice|castle|storm|bridge|wetland|volcano|rocket|submarine/.test(text);
    if (sceneKind === 'biology') return /algae|wetland|swamp|nutrient|growth|membrane|plant/.test(text);
    if (sceneKind === 'acoustic') return /wave|storm|bridge|cable|pressure|resonance|tube/.test(text);
    return false;
  }

  function fieldKindForRenderIRField(field, sceneKind) {
    const text = `${field.name || ''} ${field.channel || ''} ${field.domainId || ''}`.toLowerCase();
    if (sceneKind === 'city' && /backlog|throughput|delay|network/.test(text)) return 'network-flow';
    if (sceneKind === 'watershed' && /flow|pressure|water|river|channel|fluid/.test(text)) return 'flow';
    if (sceneKind === 'watershed' && /damage|terrain|rain|delta|slope|sediment|erosion/.test(text)) return 'gravity';
    if (sceneKind === 'optics' && /phase|amplitude|field|light|glass|refraction/.test(text)) return 'optical-rays';
    if (sceneKind === 'acoustic' && /phase|amplitude|pressure|wave/.test(text)) return 'pressure-wave';
    if (sceneKind === 'biology' && /density|nutrient|growth/.test(text)) return 'force-field';
    if ((sceneKind === 'fire' || sceneKind === 'thermal-plume') && /temperature|heat|reaction/.test(text)) return 'thermal';
    if (sceneKind === 'mechanical' && /damage|stress|velocity|angle|torque/.test(text)) return 'force-field';
    if (sceneKind === 'literal-composite' && /temperature|flow|damage|phase|pressure/.test(text)) return 'force-field';
    return field.name || 'state-field';
  }

  function uniqueFieldsByKind(fields) {
    const seen = new Set();
    const out = [];
    for (const field of fields || []) {
      const key = `${field.kind}:${field.channel || field.id || ''}`;
      const sceneKey = String(field.kind || '');
      if (seen.has(key) || seen.has(sceneKey)) continue;
      seen.add(key);
      seen.add(sceneKey);
      out.push(field);
    }
    return out;
  }

  function uniqueObjectsById(objects) {
    const seen = new Set();
    const out = [];
    for (const object of objects || []) {
      if (!object) continue;
      const key = String(
        object.id
        || object.physicalRef
        || object.semanticRef
        || `${object.shape || 'object'}:${object.role || ''}:${object.phrase || ''}`
      );
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(object);
    }
    return out;
  }

  function shapeForRenderGlyph(glyph, object) {
    if (glyph === 'lava') return 'lava-flow';
    if (glyph === 'volcano') return 'volcano';
    if (glyph === 'turbine') return 'turbine';
    if (glyph === 'bridge') return 'bridge';
    if (glyph === 'tower') return 'tower';
    if (glyph === 'castle') return /wall/i.test(object.label || '') ? 'wall' : 'castle';
    if (glyph === 'ice') return 'sample';
    if (glyph === 'lens') return 'lens';
    if (glyph === 'prism') return 'prism';
    if (glyph === 'mirror') return 'mirror';
    if (glyph === 'flame') return 'flame-front';
    if (glyph === 'smoke') return 'plume';
    if (glyph === 'storm') return 'storm';
    if (glyph === 'wetland') return 'wetland';
    if (glyph === 'fluid_path') return 'flow-path';
    if (glyph === 'projectile') return 'bar';
    if (glyph === 'rocket') return 'rocket';
    if (glyph === 'submarine') return 'submarine';
    if (glyph === 'instrument') return 'instrument';
    if (glyph === 'network') return 'network-node';
    if (glyph === 'field') return 'field-envelope';
    if (glyph === 'particle_cloud') return 'flow-path';
    if (glyph === 'organism') return 'plant-cluster';
    return 'body';
  }

  function poseForRenderObject(object, index, total) {
    const geometry = object.geometry || {};
    if (Array.isArray(geometry.anchor)) {
      const size = sizeForRenderGlyph(object.glyph);
      return { x: geometry.anchor[0], y: geometry.anchor[1], rotation: 0, w: size[0], h: size[1] };
    }
    if (Array.isArray(geometry.bounds)) {
      return {
        x: geometry.bounds[0] + geometry.bounds[2] * 0.5,
        y: geometry.bounds[1] + geometry.bounds[3] * 0.5,
        rotation: 0,
        w: geometry.bounds[2],
        h: geometry.bounds[3],
      };
    }
    if (geometry.kind === 'path') {
      return { points: [[0.1, 0.38], [0.34, 0.46], [0.58, 0.5], [0.88, 0.62]] };
    }
    const angle = total <= 1 ? 0 : index / Math.max(1, total) * Math.PI * 2;
    const size = sizeForRenderGlyph(object.glyph);
    return {
      x: 0.5 + Math.cos(angle) * 0.22,
      y: 0.5 + Math.sin(angle) * 0.16,
      rotation: 0,
      w: size[0],
      h: size[1],
    };
  }

  function sizeForRenderGlyph(glyph) {
    if (glyph === 'lava' || glyph === 'fluid_path') return [0.34, 0.12];
    if (glyph === 'volcano') return [0.24, 0.18];
    if (glyph === 'turbine') return [0.18, 0.18];
    if (glyph === 'bridge') return [0.24, 0.1];
    if (glyph === 'tower') return [0.14, 0.22];
    if (glyph === 'castle') return [0.22, 0.22];
    if (glyph === 'lens' || glyph === 'prism' || glyph === 'mirror') return [0.13, 0.13];
    if (glyph === 'flame' || glyph === 'smoke') return [0.18, 0.22];
    if (glyph === 'storm') return [0.32, 0.2];
    if (glyph === 'wetland') return [0.26, 0.16];
    if (glyph === 'field') return [0.3, 0.26];
    if (glyph === 'network') return [0.08, 0.08];
    return [0.16, 0.12];
  }

  function relationsFromPhysicsIR(spec) {
    const ir = spec.physicsIR || {};
    return (ir.couplings || []).map((coupling) => ({
      from: String(coupling.from || '').replace(/^domain:/, ''),
      to: String(coupling.to || '').replace(/^domain:/, ''),
      channel: coupling.type || 'coupling',
      reason: coupling.type || 'coupling',
      strength: 0.72,
      operatorId: coupling.operatorId,
    }));
  }

  function renderObjectForNode(node, spec) {
    const pose = poseForNode(node, spec);
    return {
      id: node.primitiveId,
      kind: node.type,
      material: node.material,
      role: node.role,
      shape: node.shape,
      visualRegime: visualRegimeForNode(node),
      assembly: node.assembly || '',
      phrase: node.phrase || '',
      source: node.source || '',
      pose,
      dynamics: { ...(node.state || {}), ...(node.params || {}) },
      primitiveProgram: node.primitiveProgram || primitiveProgramForNode(node),
      required: true,
    };
  }

  function rendererPlanForComposition(graph, objects, fields, solverPlan, spec, forcedSceneKind = '') {
    const sceneKind = forcedSceneKind || sceneKindForComposition(graph, objects, fields, spec);
    const dominantRegime = dominantRegimeForScene(sceneKind, objects);
    const fieldKinds = uniqueList((fields || []).map((field) => field.kind));
    const solverFamilies = uniqueList((solverPlan && solverPlan.families) || []);
    const shapeSignature = uniqueList((objects || []).map((object) => object.shape)).join('+');
    const materialSignature = uniqueList((objects || []).map((object) => object.material)).join('+');
    const visualGenome = visualGenomeForComposition(graph, objects, fields, solverPlan, spec, sceneKind);
    const visualIdentity = {
      schema: 'simulatte.visualIdentity.v1',
      sceneKind,
      dominantRegime,
      shapeSignature,
      materialSignature,
      fieldKinds,
      solverFamilies,
      objectCount: (objects || []).length,
      visualGenomeId: visualGenome.id,
      visualGenomeSeed: visualGenome.seed,
      motifs: visualGenome.motifs,
    };
    const registry = renderRegistryRef();
    const visualRecipe = registry && typeof registry.recipeForScene === 'function'
      ? registry.recipeForScene(sceneKind)
      : null;
    return {
      schema: 'simulatte.rendererPlan.v1',
      renderer: `simulatte.regime.${sceneKind}.v1`,
      sceneKind,
      dominantRegime,
      passOrder: renderPassOrder(sceneKind, solverFamilies),
      visualRecipe,
      visualIdentity,
      visualGenome,
    };
  }

  function visualIRForRenderProgram(graph, objects, fields, solverPlan, spec, rendererPlan, sceneKind) {
    const visualGenome = rendererPlan && rendererPlan.visualGenome || {};
    const recipe = rendererPlan && rendererPlan.visualRecipe || null;
    const semantic = visualGenome.semanticVisuals || {};
    const causalAffordances = causalAffordancesFromSpec(spec, sceneKind);
    const graphicsAtoms = visualGraphicsAtomsForIR({
      sceneKind,
      objects,
      fields,
      solverPlan,
      spec,
      rendererPlan,
      causalAffordances,
      visualGenome,
      recipe,
    });
    const visualEntities = (objects || []).map((object, index) => visualEntityForObject(object, index, sceneKind));
    const materialRows = uniqueVisualRows([
      ...visualMaterialsForObjects(objects, visualGenome, recipe, causalAffordances),
      ...visualMaterialsForGraphicsAtoms(graphicsAtoms.materials),
    ]);
    const fieldRows = uniqueVisualRows([
      ...(fields || []).map((field, index) => visualFieldForField(field, index, sceneKind)),
      ...visualFieldsForGraphicsAtoms(graphicsAtoms.fields, sceneKind),
    ]);
    const processRows = uniqueVisualRows([
      ...visualProcessesForPlan(objects, solverPlan, semantic, sceneKind, causalAffordances),
      ...visualProcessesForGraphicsAtoms(graphicsAtoms.processes, objects, sceneKind),
    ]);
    const geometryRows = [
      ...visualEntities.map((entity) => visualGeometryForEntity(entity, sceneKind)),
      ...visualGeometryForCausalAffordances(causalAffordances, sceneKind),
      ...visualGeometryForGraphicsAtoms(graphicsAtoms.geometry, sceneKind),
    ];
    const motionRows = uniqueVisualRows([
      ...visualMotionForProcesses(processRows, visualGenome, sceneKind, causalAffordances),
      ...visualMotionForGraphicsAtoms(graphicsAtoms.motion, visualGenome, sceneKind),
    ]);
    const renderInstances = visualRenderInstancesForIR(
      visualEntities,
      geometryRows,
      materialRows,
      fieldRows,
      processRows,
      motionRows,
      sceneKind
    );
    const operators = visualOperatorsForIR(
      visualEntities,
      materialRows,
      fieldRows,
      processRows,
      geometryRows,
      motionRows,
      recipe,
      causalAffordances,
      graphicsAtoms
    );
    const camera = {
      ...visualCameraForScene(sceneKind, recipe, visualEntities),
      atoms: graphicsAtoms.camera,
    };
    const lighting = visualLightingForScene(sceneKind, recipe, visualGenome);
    const sceneRenderPacket = sceneRenderPacketForVisualIR({
      sceneKind,
      camera,
      lighting,
      entities: visualEntities,
      materials: materialRows,
      fields: fieldRows,
      processes: processRows,
      geometry: geometryRows,
      motion: motionRows,
      renderInstances,
      graphicsAtoms,
    });
    return {
      schema: VISUAL_IR_SCHEMA,
      compiler: 'simulatte.visual-ir.compiler.v1',
      intentText: graph && graph.intentText || '',
      sceneKind,
      painterKind: recipe && recipe.painterKind || sceneKind,
      scale: visualScaleForScene(sceneKind, visualEntities),
      camera,
      lighting,
      entities: visualEntities,
      materials: materialRows,
      fields: fieldRows,
      processes: processRows,
      geometry: geometryRows,
      motion: motionRows,
      renderInstances,
      sceneRenderPacket,
      rejectedRows: visualRejectedRowsForIR(rendererPlan, graphicsAtoms),
      graphicsAtoms,
      operators,
      causalAffordances,
      receipts: augmentVisualReceiptsWithIntentBrief(
        visualReceiptsForIR(
          visualEntities,
          materialRows,
          fieldRows,
          processRows,
          operators,
          rendererPlan,
          causalAffordances,
          graphicsAtoms,
          renderInstances,
          rendererPlan
        ),
        spec,
        sceneKind
      ),
    };
  }

  function causalAffordancesFromSpec(spec, sceneKind = '') {
    const affordances = spec && spec.renderIR && spec.renderIR.causalAffordances || [];
    return Array.isArray(affordances)
      ? affordances.filter((row) => sceneAllowsCausalAffordance(row, sceneKind)).slice(0, 8)
      : [];
  }

  function sceneAllowsCausalAffordance(row, sceneKind = '') {
    const rowScene = String(row && row.sceneKind || '').toLowerCase();
    const scene = String(sceneKind || '').toLowerCase();
    if (!rowScene || !scene || rowScene === scene) return true;
    if (scene === 'particle-instrument') {
      return [
        'thermal-plume',
        'mechanical',
        'ferrofluid',
        'digital-network',
        'space-instrument',
        'quantum-instrument',
        'materials-lab',
      ].includes(rowScene);
    }
    const families = [
      ['civic-market', 'digital-network', 'venue-crowd', 'city'],
      ['watershed', 'restoration-water', 'geology-water', 'ocean', 'cryosphere', 'ocean-cryosphere'],
      ['biology', 'evolution-ecology', 'molecular-biology', 'clinical-control', 'agriculture'],
      ['fire', 'thermal-plume', 'fire-weather', 'weather-atmosphere', 'thermal-fluid'],
      ['planetary-space', 'space-instrument', 'aerospace'],
      ['optics', 'optics-thermal', 'thin-film'],
      ['mechanical', 'mechanical-fluid', 'robotics-control', 'structural-geology', 'structural-weather'],
      ['chemistry-lab', 'advanced-energy', 'materials-lab', 'grid-energy'],
    ];
    return families.some((family) => family.includes(scene) && family.includes(rowScene));
  }

  function visualGraphicsAtomsForIR(context) {
    if (visualOperatorCompiler && typeof visualOperatorCompiler.compileVisualGraphicsAtoms === 'function') {
      return visualOperatorCompiler.compileVisualGraphicsAtoms(context);
    }
    return {
      schema: 'simulatte.graphicsAtomPlan.v1',
      atlas: 'simulatte.visualOperatorAtlas.v1',
      compiler: 'missing-visual-operator-compiler',
      atlasId: 'missing-runtime-atlas',
      source: 'fallback-graphics-atom-plan',
      mappings: [],
      geometry: [],
      fields: [],
      materials: [],
      processes: [],
      motion: [],
      camera: [],
      uniforms: {
        schema: 'simulatte.graphicsAtomUniforms.v1',
        order: [],
        values: [],
        bySlot: {},
      },
      wgslOperators: [],
      rejections: [],
      receipts: [],
    };
  }

  function visualMaterialsForGraphicsAtoms(atoms = []) {
    return (atoms || []).map((atom, index) => {
      const family = materialFamilyForGraphicsAtom(atom.id);
      const hue = hashProgram(atom.id || index) % 360;
      return {
        id: `atom:${atom.id}`,
        family,
        shader: shaderForGraphicsMaterialAtom(atom.id, family),
        fill: `hsl(${hue}, 70%, 62%)`,
        stroke: `hsl(${hue}, 58%, 30%)`,
        opacity: /transparent|vapor|fluid|glass/.test(atom.id) ? 0.34 : 0.52,
        roughness: materialRoughness(family),
        emissive: /emissive|hot|flame|plasma|signal|spectral/.test(atom.id),
        evidence: [`graphics-atom:${atom.id}`, ...(atom.evidence || [])],
        status: 'accepted',
        confidence: 0.66,
        reason: 'graphics atom material compiled from accepted VisualIR operator mapping',
      };
    });
  }

  function materialFamilyForGraphicsAtom(id) {
    const text = String(id || '').toLowerCase();
    if (/hot|thermal|flame|plasma|emissive|heat/.test(text)) return 'thermal';
    if (/vapor|fluid|wet|ripple|water|pressure/.test(text)) return 'fluid';
    if (/transparent|glass|caustic|phase|crystal/.test(text)) return 'transparent';
    if (/metal|trace|coil|instrument|brushed/.test(text)) return 'metal';
    if (/bio|cell|fibrous|membrane/.test(text)) return 'biological';
    if (/granular|soil|strata/.test(text)) return 'granular';
    if (/signal|charged|monitor|electric/.test(text)) return 'electric';
    return 'matte';
  }

  function shaderForGraphicsMaterialAtom(id, family) {
    const text = String(id || '').toLowerCase();
    if (/hot|thermal|flame|emissive/.test(text)) return 'atom-emissive-gradient';
    if (/vapor|fluid|wet|ripple/.test(text)) return 'atom-volume-ripple';
    if (/caustic|transparent|glass|crystal/.test(text)) return 'atom-refractive-caustic';
    if (/signal|charged|trace|monitor/.test(text)) return 'atom-signal-trace';
    if (/fracture|deformed/.test(text)) return 'atom-stress-material';
    return shaderForMaterialFamily(family);
  }

  function visualFieldsForGraphicsAtoms(atoms = [], sceneKind = '') {
    return (atoms || []).map((atom, index) => {
      const id = `atom-field:${atom.id}`;
      const kind = fieldKindForGraphicsAtom(atom.id);
      return {
        id,
        kind,
        channel: atom.id,
        visualEncoding: fieldEncodingForGraphicsAtom(atom.id, sceneKind),
        strength: Number((0.56 + (hashProgram(atom.id) % 31) / 100).toFixed(2)),
        geometry: visualFieldGeometry({ id, kind }, kind),
        evidence: [`graphics-atom:${atom.id}`, ...(atom.evidence || [])],
        atomId: atom.id,
        status: 'accepted',
        confidence: 0.66,
        reason: 'graphics atom field compiled from accepted VisualIR operator mapping',
      };
    });
  }

  function fieldKindForGraphicsAtom(id) {
    const text = String(id || '').toLowerCase();
    if (/heat|thermal|soot|latent/.test(text)) return 'thermal';
    if (/queue|network|setpoint|state|error/.test(text)) return 'network-flow';
    if (/velocity|pressure|flow/.test(text)) return 'flow';
    if (/stress|impulse|force|constraint/.test(text)) return 'force-field';
    if (/gravity|barycenter/.test(text)) return 'gravity';
    if (/phase|caustic|ray|optical/.test(text)) return 'optical-rays';
    if (/measurement|uncertainty|readout|telemetry|probe|sample/.test(text)) return 'measurement-field';
    if (/sediment|slope|granular|grain|soil|terrain/.test(text)) return 'granular-gradient';
    if (/nutrient|density|growth|bio|cell|membrane|organic/.test(text)) return 'biological-gradient';
    if (/acidity|acid|chemical|reaction|concentration/.test(text)) return 'chemical-gradient';
    if (/flux|charge|magnetic|electromagnetic/.test(text)) return 'dipole';
    return 'state-field';
  }

  function fieldEncodingForGraphicsAtom(id, sceneKind) {
    const text = `${id || ''} ${sceneKind || ''}`.toLowerCase();
    if (/heat|thermal|latent/.test(text)) return 'heat-isobands';
    if (/velocity|flow|slope|sediment/.test(text)) return 'topographic-streamlines';
    if (/stress|impulse|force/.test(text)) return 'vector-flux-lines';
    if (/gravity|barycenter|orbit/.test(text)) return 'ray-cone-caustics';
    if (/caustic|phase|ray|optical/.test(text)) return 'ray-cone-caustics';
    if (/measurement|uncertainty|readout|telemetry|probe|sample/.test(text)) return 'readout-bands';
    if (/queue|network|state/.test(text)) return 'node-link-pressure';
    return 'scalar-contours';
  }

  function visualProcessesForGraphicsAtoms(atoms = [], objects = [], sceneKind = '') {
    return (atoms || []).map((atom, index) => ({
      id: `atom-process:${atom.id}`,
      family: atom.id,
      operator: processOperatorForGraphicsAtom(atom.id, sceneKind),
      affects: affectedEntitiesForGraphicsAtom(atom.id, objects),
      motion: motionGrammarForGraphicsAtom(atom.id, sceneKind),
      evidence: [`graphics-atom:${atom.id}`, ...(atom.evidence || [])],
      order: 200 + index,
      atomId: atom.id,
      status: 'accepted',
      confidence: 0.64,
      reason: 'graphics atom process compiled from accepted VisualIR operator mapping',
    }));
  }

  function processOperatorForGraphicsAtom(id, sceneKind) {
    const text = `${id || ''} ${sceneKind || ''}`.toLowerCase();
    if (/thermal|heat|flame|phase/.test(text)) return 'thermal-front';
    if (/flow|transport|pressure|settling|erosion/.test(text)) return 'advected-particles';
    if (/orbit|wave|resonant|phase/.test(text)) return 'wave-or-orbit-trails';
    if (/feedback|routing|queue|control|measurement/.test(text)) return 'agent-routing-pulses';
    if (/growth|diffusion-limited|cell/.test(text)) return 'growth-diffusion-front';
    if (/fracture|contact|impulse|force/.test(text)) return 'constraint-impulse-arcs';
    if (/field|charge|flux|spark/.test(text)) return 'field-line-advection';
    return 'state-pulse-overlay';
  }

  function affectedEntitiesForGraphicsAtom(id, objects) {
    const text = String(id || '').toLowerCase();
    return (objects || []).filter((object) => {
      const row = renderObjectText(object);
      if (/heat|thermal|phase|flame/.test(text)) return /heat|fire|lava|air|metal|steam|ice/.test(row);
      if (/flow|pressure|transport/.test(text)) return /flow|fluid|water|air|pipe|river|coolant/.test(row);
      if (/network|queue|control|feedback|measurement/.test(text)) return /sensor|network|queue|server|controller|agent/.test(row);
      if (/orbit|gravity/.test(text)) return /orbit|space|planet|rocket|body/.test(row);
      if (/fracture|stress|contact/.test(text)) return /wall|solid|bridge|body|impact|constraint/.test(row);
      return true;
    }).slice(0, 8).map((object) => object.id);
  }

  function motionGrammarForGraphicsAtom(id, sceneKind) {
    return motionForProcessFamily(id, sceneKind);
  }

  function visualGeometryForGraphicsAtoms(atoms = [], sceneKind = '') {
    return (atoms || []).map((atom, index) => ({
      id: `geometry:atom:${visualSafeId(atom.id)}`,
      entityId: `graphics-atom:${visualSafeId(atom.id)}`,
      primitive: geometryPrimitiveForGraphicsAtom(atom.id, sceneKind),
      sceneKind,
      label: atom.label || atom.id,
      description: `Graphics atom ${atom.id}`,
      evidence: [`graphics-atom:${atom.id}`, ...(atom.evidence || [])],
      order: 200 + index,
      atomId: atom.id,
      status: 'accepted',
      confidence: 0.64,
      reason: 'graphics atom geometry compiled from accepted VisualIR operator mapping',
    }));
  }

  function geometryPrimitiveForGraphicsAtom(id, sceneKind) {
    const text = `${id || ''} ${sceneKind || ''}`.toLowerCase();
    if (/node[-_ ]?link|graph|route|routing/.test(text)) return 'route-node-graph';
    if (/parcel|grid/.test(text)) return 'parcel-cell-grid';
    if (/agent|controller|feedback/.test(text)) return 'agent-token-swarm';
    if (/plume|volume|tube|flow|cloud|flame/.test(text)) return 'fluid-volume-ribbon';
    if (/sheet|surface|solid|strata|terrain|phase|fuel|wall/.test(text)) return 'sectioned-surface';
    if (/instrument|probe|readout|sensor|resonator/.test(text)) return 'instrument-glyph';
    if (/organic|cell|branch|membrane/.test(text)) return 'organic-silhouette';
    if (/orbit|gravity|trajectory|astral/.test(text)) return 'orbital-body';
    if (/ray|caustic|optical/.test(text)) return 'optical-field-sheet';
    if (/field|flux|pressure|stress/.test(text)) return 'scalar-field-sheet';
    return 'procedural-silhouette';
  }

  function visualMotionForGraphicsAtoms(atoms = [], visualGenome = {}, sceneKind = '') {
    return (atoms || []).map((atom, index) => ({
      id: `motion:atom:${visualSafeId(atom.id)}`,
      processId: `atom-process:${atom.id}`,
      grammar: motionGrammarForGraphicsAtom(atom.id, sceneKind),
      phase: index / Math.max(1, atoms.length),
      speed: motionSpeedForScene(sceneKind, atom.id),
      density: Math.max(24, visualGenome && visualGenome.morphology
        ? visualGenome.morphology.particleDensity || 24
        : 24),
      atomId: atom.id,
      evidence: [`graphics-atom:${atom.id}`, ...(atom.evidence || [])],
      status: 'accepted',
      confidence: 0.62,
      reason: 'graphics atom motion compiled from accepted VisualIR operator mapping',
    }));
  }

  function uniqueVisualRows(rows) {
    const seen = new Set();
    const out = [];
    for (const row of rows || []) {
      const key = String(row && (row.id || row.atomId || row.family || row.kind) || '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
    return out;
  }

  function visualGeometryForCausalAffordances(affordances, sceneKind) {
    return (affordances || []).map((row, index) => ({
      id: `geometry:causal:${visualSafeId(row.id || `affordance-${index + 1}`)}`,
      entityId: `affordance:${visualSafeId(row.id || `affordance-${index + 1}`)}`,
      primitive: geometryPrimitiveForAffordance(row, sceneKind),
      sceneKind: row.sceneKind || sceneKind,
      label: row.id || `causal affordance ${index + 1}`,
      description: row.geometry || 'hand-authored causal visual affordance',
      shaderHints: row.shaderHints || [],
      motionHints: row.motionHints || [],
      causalRelationId: row.causalRelationId || '',
      evidence: [`causal-affordance:${row.id || index}`, row.causalRelationId || 'causal-relation'],
      order: 100 + index,
      status: 'accepted',
      confidence: 0.74,
      reason: 'causal affordance geometry accepted from grounded intent receipt',
    }));
  }

  function geometryPrimitiveForAffordance(row, sceneKind) {
    const text = `${row && row.geometry || ''} ${row && row.sceneKind || ''} ${sceneKind || ''}`.toLowerCase();
    if (/plume|steam|smoke|funnel|aurora|curtain|volume|cloud/.test(text)) return 'volume-ribbon';
    if (/orbit|ring|field|magnetic|pressure|wave|caustic|ray/.test(text)) return 'field-curve-set';
    if (/heightfield|terrain|delta|slope|soil|reef|glacier|ocean/.test(text)) return 'heightfield-slice';
    if (/network|queue|node|shard|warehouse|supply|controller/.test(text)) return 'node-link-volume';
    if (/tube|pipe|artery|droplet|channel|flow/.test(text)) return 'transparent-flow-tube';
    if (/robot|bridge|turbine|rotor|chip|metal|valve/.test(text)) return 'cutaway-machine';
    if (/protein|neuron|root|coral|biomass|algae/.test(text)) return 'organic-branch-volume';
    return 'semantic-3d-affordance';
  }

  function augmentVisualReceiptsWithIntentBrief(receipts, spec, sceneKind) {
    const brief = spec && spec.renderIR && spec.renderIR.intentBriefReceipt ||
      spec && spec.universeGraph && spec.universeGraph.intentBrief ||
      null;
    if (!brief) return receipts;
    const row = {
      schema: 'simulatte.visualIntentBriefReceipt.v1',
      sceneKind,
      evidenceCount: (brief.retrievedEvidence || []).length,
      causalEdges: (brief.causalGraph || []).map((edge) => ({
        id: edge.id,
        relationType: edge.relationType,
        operatorType: edge.operatorType,
        sourceLabel: edge.sourceLabel,
        targetLabel: edge.targetLabel,
        mechanism: edge.mechanism,
      })).slice(0, 16),
      assumptions: (brief.assumptions || []).map((assumption) => ({
        id: assumption.id,
        label: assumption.label,
        statement: assumption.statement,
      })).slice(0, 12),
      unsupported: (brief.unsupported || []).map((item) => ({
        id: item.id,
        label: item.label,
        reason: item.reason,
      })).slice(0, 12),
      degradedTo: (brief.degradedTo || []).map((item) => ({
        id: item.id,
        label: item.label,
        reason: item.reason,
      })).slice(0, 12),
      visualAffordances: brief.visualIntent && Array.isArray(brief.visualIntent.affordances)
        ? brief.visualIntent.affordances.slice(0, 8)
        : [],
      visualAffordanceCount: brief.visualIntent &&
        Array.isArray(brief.visualIntent.affordances)
        ? brief.visualIntent.affordances.length
        : 0,
      causalEdgeCount: (brief.causalGraph || []).length,
      assumptionCount: (brief.assumptions || []).length,
      unsupportedCount: (brief.unsupported || []).length,
      degradedCount: (brief.degradedTo || []).length,
      evidenceIds: (brief.retrievedEvidence || []).map((item) => item.id).filter(Boolean).slice(0, 24),
      causalEdgeIds: (brief.causalGraph || []).map((edge) => edge.id || edge.ruleId).filter(Boolean).slice(0, 16),
      shaderHints: brief.visualIntent && brief.visualIntent.shaderHints || [],
      motionHints: brief.visualIntent && brief.visualIntent.motionHints || [],
    };
    if (Array.isArray(receipts)) return [...receipts, row];
    return { ...(receipts || {}), intentBrief: row };
  }

  function visualEntityForObject(object, index, sceneKind) {
    const text = renderObjectText(object);
    return {
      id: object.id || `entity-${index + 1}`,
      sourceObject: object.id || '',
      label: object.phrase || object.role || object.id || `entity ${index + 1}`,
      kind: visualEntityKind(object, text),
      role: visualEntityRole(object, text, sceneKind),
      material: object.material || 'matte',
      shape: object.shape || 'body',
      visualRegime: object.visualRegime || 'generic',
      pose: object.pose || {},
      semanticRef: object.semanticRef || '',
      physicalRef: object.physicalRef || '',
      sourceGraphId: object.visualSourceGraphId || object.id || '',
      sourceKind: object.visualSourceKind || object.source || 'compiled-object',
      sourceIds: object.visualSourceIds || uniqueList([object.id, object.semanticRef, object.physicalRef].filter(Boolean)),
      status: object.visualStatus || 'accepted',
      confidence: Number.isFinite(Number(object.visualConfidence)) ? Number(object.visualConfidence) : 0.72,
      reason: object.visualReason || 'accepted compiled graph object',
      supportOnly: object.visualSupportOnly === true,
      evidence: visualEvidenceForObject(object, text),
    };
  }

  function visualEntityKind(object, text) {
    if (/field-envelope|vector-band|thermal|gravity|dipole/.test(text) || object.kind === 'field') return 'field';
    if (/queue|traffic|agent|patient|robot|vehicle|animal|fish|bird|crowd/.test(text)) return 'agent';
    if (/water|air|smoke|plume|fluid|lava|foam|gel|soil|sand|biofilm|plasma/.test(text)) return 'medium';
    if (/sensor|meter|instrument|lens|probe|antenna|detector|camera|microscope|telescope/.test(text)) return 'instrument';
    if (/wall|boundary|bridge|building|vessel|tank|cage|reactor|repository/.test(text)) return 'surface';
    return 'object';
  }

  function visualEntityRole(object, text, sceneKind) {
    if (/source|sun|lamp|battery|pump|heater|injector/.test(text)) return 'source';
    if (/sink|load|ledger|sensor|detector|readout/.test(text)) return 'measurement';
    if (/constraint|wall|boundary|containment|repository|vessel/.test(text)) return 'constraint';
    if (/flow|path|channel|queue|route|orbit|track/.test(text)) return 'path';
    if (/process|front|reaction|burn|growth|fracture|collision/.test(text)) return 'process';
    if (/city|digital|civic/.test(sceneKind) && /node|agent|queue/.test(text)) return 'agent';
    return 'primary';
  }

  function visualEvidenceForObject(object, text) {
    return uniqueList([
      object.source || 'compiled-object',
      object.shape ? `shape:${object.shape}` : '',
      object.material ? `material:${object.material}` : '',
      object.visualRegime ? `regime:${object.visualRegime}` : '',
      object.phrase ? `phrase:${object.phrase}` : '',
      text.includes('embedding-guided') ? 'embedding-grounded' : '',
    ].filter(Boolean));
  }

  function visualMaterialsForObjects(objects, visualGenome, recipe, causalAffordances = []) {
    const seen = new Set();
    const rows = [];
    for (const object of objects || []) {
      const id = object.material || 'matte';
      if (seen.has(id)) continue;
      seen.add(id);
      const style = MATERIAL_STYLES[id] || MATERIAL_STYLES.matte || MATERIAL_STYLES.light;
      const family = materialFamilyForVisualMaterial(id, object.visualRegime, recipe);
      rows.push({
        id,
        family,
        shader: shaderForMaterialFamily(family),
        fill: style.fill,
        stroke: style.stroke,
        opacity: style.alpha,
        roughness: materialRoughness(family),
        emissive: /thermal|plasma|electric|signal/.test(family),
        evidence: [`material:${id}`, `family:${family}`],
        status: 'accepted',
        confidence: Number.isFinite(Number(object.visualConfidence)) ? Number(object.visualConfidence) : 0.7,
        reason: `material selected from accepted object ${object.id || id}`,
        sourceGraphId: object.visualSourceGraphId || object.id || '',
      });
    }
    const semanticMaterials = semanticRowsFromGenome(visualGenome, 'materials').slice(0, 5);
    for (const row of semanticMaterials) {
      if (seen.has(row.family)) continue;
      seen.add(row.family);
      rows.push({
        id: row.family,
        family: row.family,
        shader: row.shader || shaderForMaterialFamily(row.family),
        fill: `hsl(${row.hue || 180}, 62%, 62%)`,
        stroke: `hsl(${row.hue || 180}, 54%, 32%)`,
        opacity: 0.42,
        roughness: materialRoughness(row.family),
        emissive: /thermal|electric|transparent/.test(row.family),
        evidence: [`semantic-material:${row.id}`],
        status: 'accepted',
        confidence: 0.58,
        reason: 'semantic visual genome material selected from accepted compiled text',
      });
    }
    for (const row of causalAffordances || []) {
      for (const hint of row.shaderHints || []) {
        const id = `causal:${hint}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const family = materialFamilyForAffordanceHint(hint);
        rows.push({
          id,
          family,
          shader: shaderForAffordanceHint(hint, family),
          fill: `hsl(${affordanceHue(row, hint)}, 70%, 62%)`,
          stroke: `hsl(${affordanceHue(row, hint)}, 58%, 30%)`,
          opacity: /volume|mist|steam|veil|transparent/.test(hint) ? 0.34 : 0.58,
          roughness: materialRoughness(family),
          emissive: /emissive|thermal|plasma|laser|glow|heat/.test(hint),
          evidence: [`causal-affordance:${row.id}`, `shader-hint:${hint}`],
          status: 'accepted',
          confidence: 0.68,
          reason: 'causal affordance shader hint accepted for VisualIR material',
        });
      }
    }
    return rows;
  }

  function materialFamilyForAffordanceHint(hint) {
    const text = String(hint || '').toLowerCase();
    if (/steam|mist|volume|veil|water|wet|caustic|vessel/.test(text)) return 'fluid';
    if (/thermal|emissive|crust|heat|lava|runaway|hot/.test(text)) return 'thermal';
    if (/glass|transparent|lens|crystal|frost|ice/.test(text)) return 'transparent';
    if (/metal|circuit|trace|corrosion|battery|chip/.test(text)) return 'metal';
    if (/bio|root|coral|protein|neuron|artery/.test(text)) return 'biological';
    if (/grain|soil|silt|terrain|dust/.test(text)) return 'granular';
    if (/field|signal|magnetic|electric|node/.test(text)) return 'electric';
    return 'matte';
  }

  function shaderForAffordanceHint(hint, family) {
    const text = String(hint || '').toLowerCase();
    if (/phase|front|crust|frost|crystal/.test(text)) return 'phase-boundary-gradient';
    if (/steam|mist|volume|veil|plume/.test(text)) return 'volumetric-scattering';
    if (/vector|field|magnetic|signal/.test(text)) return 'vector-flux-overlay';
    if (/caustic|glass|transparent/.test(text)) return 'refractive-caustic';
    if (/stress|fracture|pressure|strain/.test(text)) return 'stress-isoband-overlay';
    return shaderForMaterialFamily(family);
  }

  function affordanceHue(row, hint) {
    const seed = hashProgram(`${row && row.id || ''}:${hint || ''}`);
    return seed % 360;
  }

  function materialFamilyForVisualMaterial(id, regime, recipe) {
    void recipe;
    const text = `${id || ''} ${regime || ''}`.toLowerCase();
    if (/plasma|radiation|fire|lava|thermal|heat/.test(text)) return 'thermal';
    if (/water|fluid|brine|river|wetland|coolant/.test(text)) return 'fluid';
    if (/glass|ice|quartz|transparent|lens/.test(text)) return 'transparent';
    if (/metal|copper|gold|silicon|graphite|conductor/.test(text)) return 'metal';
    if (/cell|bio|plant|tissue|microbe|microbiome|bacteria|protein|biomass|moss|algae|mycelium/.test(text)) return 'biological';
    if (/soil|sand|rock|grain|ceramic|porcelain|mineral/.test(text)) return 'granular';
    if (/signal|packet|charge|electric|sensor/.test(text)) return 'electric';
    if (/concrete|paper|pigment|artifact/.test(text)) return 'cultural';
    return 'matte';
  }

  function shaderForMaterialFamily(family) {
    const map = {
      thermal: 'emissive-heat-bands',
      fluid: 'advected-ripple-volume',
      transparent: 'caustic-transmission',
      metal: 'brushed-rim-light',
      biological: 'fibrous-cellular-mesh',
      granular: 'particle-strata',
      electric: 'charged-trace-glow',
      cultural: 'aged-surface-grain',
      matte: 'soft-lambert-fill',
    };
    return map[family] || map.matte;
  }

  function materialRoughness(family) {
    if (/transparent|fluid/.test(family)) return 0.18;
    if (/metal|electric/.test(family)) return 0.34;
    if (/granular|cultural/.test(family)) return 0.82;
    return 0.56;
  }

  function visualFieldForField(field, index, sceneKind) {
    const kind = field.kind || field.name || 'force-field';
    return {
      id: field.id || `field-${index + 1}`,
      kind,
      channel: field.channel || field.stateBinding || '',
      visualEncoding: visualEncodingForField(kind, sceneKind),
      strength: Number.isFinite(Number(field.strength)) ? Number(field.strength) : 0.58,
      geometry: visualFieldGeometry(field, kind),
      evidence: [`field:${kind}`, field.channel ? `channel:${field.channel}` : 'compiled-field'],
      sourceGraphId: field.domainId || field.id || '',
      status: field.status || 'accepted',
      confidence: Number.isFinite(Number(field.confidence)) ? Number(field.confidence) : 0.64,
      reason: field.reason || 'field row accepted from renderIR/PhysicsIR channel',
    };
  }

  function visualEncodingForField(kind, sceneKind) {
    if (/measurement|readout|instrument/.test(kind)) return 'readout-bands';
    if (/network|queue/.test(kind) || /digital|civic|venue/.test(sceneKind)) return 'node-link-pressure';
    if (/optical|radiation/.test(kind) || /space|planetary/.test(sceneKind)) return 'ray-cone-caustics';
    if (/thermal|heat/.test(kind) || /energy|hazard/.test(sceneKind)) return 'heat-isobands';
    if (/gravity|flow/.test(kind) || /water|restoration/.test(sceneKind)) return 'topographic-streamlines';
    if (/biological|chemical/.test(kind)) return 'scalar-contours';
    if (/dipole|magnetic/.test(kind)) return 'vector-flux-lines';
    if (/force/.test(kind)) return 'vector-field-lines';
    return 'scalar-contours';
  }

  function visualFieldGeometry(field, kind) {
    if (field.from || field.to) return { kind: 'directed-field', from: field.from || [0.12, 0.2], to: field.to || [0.84, 0.76] };
    if (field.center) return { kind: 'radial-field', center: field.center, radius: field.radius || 0.32 };
    if (/network/.test(kind)) return { kind: 'graph-field' };
    return { kind: 'canvas-field' };
  }

  function visualProcessesForPlan(objects, solverPlan, semantic, sceneKind, causalAffordances = []) {
    const families = uniqueList([
      ...((solverPlan && solverPlan.families) || []),
      ...semanticRowsFromPlan(semantic, 'processes').map((row) => row.family),
    ]).filter((family) => sceneAllowsProcessFamily(sceneKind, family));
    const source = families.length ? families : ['coupled-state'];
    const rows = source.slice(0, 12).map((family, index) => ({
      id: `process:${family}`,
      family,
      operator: visualOperatorForProcessFamily(family, sceneKind),
      affects: affectedEntitiesForProcess(family, objects),
      motion: motionForProcessFamily(family, sceneKind),
      evidence: [`solver:${family}`, `scene:${sceneKind}`],
      order: index,
      status: 'accepted',
      confidence: 0.62,
      reason: 'process accepted from solver family after scene filtering',
    }));
    for (const row of causalAffordances || []) {
      const family = causalAffordanceProcessFamily(row);
      if (rows.some((process) => process.id === `process:${family}`)) continue;
      rows.push({
        id: `process:${family}`,
        family,
        operator: 'causal-affordance-motion',
        affects: affectedEntitiesForAffordance(row, objects),
        motion: (row.motionHints && row.motionHints[0]) || 'causal-state-transition',
        motionHints: row.motionHints || [],
        geometryHint: row.geometry || '',
        evidence: [`causal-affordance:${row.id}`, row.causalRelationId || 'causal-relation'],
        order: rows.length,
        status: 'accepted',
        confidence: 0.74,
        reason: 'causal affordance process accepted from grounded intent receipt',
      });
    }
    return rows.slice(0, 20);
  }

  function sceneAllowsProcessFamily(sceneKind, family) {
    const text = String(family || '').toLowerCase();
    if (/molecular-biology/.test(sceneKind)) {
      return /growth|membrane|fracture|constraint|bond|chemical|reaction|fermentation|advection|coupled/.test(text);
    }
    if (/evolution-ecology/.test(sceneKind)) {
      return /growth|population|nutrient|diffusion|advection|membrane|coupled/.test(text);
    }
    if (/restoration-water/.test(sceneKind)) {
      return /advection|flow|water|gravity|granular|settling|erosion|growth|sediment|coupled/.test(text);
    }
    if (/\b(city|civic-market|digital-network|venue-crowd)\b/.test(sceneKind)) {
      return /network|queue|agent|routing|constraint|delay|ledger|coupled/.test(text);
    }
    if (/robotics-control/.test(sceneKind)) {
      return /network|queue|robot|servo|contact|constraint|collision|friction|electric|feedback|coupled/.test(text);
    }
    if (/planetary-space/.test(sceneKind)) {
      return /orbit|gravity|density|ring|granular|constraint|resonance|coupled/.test(text);
    }
    if (/ocean-cryosphere/.test(sceneKind)) {
      return /advection|flow|phase|fracture|constraint|calving|meltwater|thermal-transfer|phase-transition|wave-field|coupled/.test(text);
    }
    if (/particle-instrument/.test(sceneKind)) {
      return /particle|collision|thermal|heat|field|instrument|measurement|constraint|advection|coupled/.test(text);
    }
    if (/quantum-instrument/.test(sceneKind)) {
      return /quantum|phase|field|measurement|instrument|electric|constraint|coupled/.test(text);
    }
    if (/fire/.test(sceneKind)) {
      return /heat|thermal|combust|reaction|advection|flow|fluid|plume|soot|constraint|coupled/.test(text);
    }
    return true;
  }

  function causalAffordanceProcessFamily(row) {
    return String(row && row.id || 'affordance')
      .replace(/^affordance\./, 'causal-')
      .replace(/[^a-zA-Z0-9_-]+/g, '-');
  }

  function affectedEntitiesForAffordance(row, objects) {
    const triggerText = (row && row.triggers || []).join(' ').toLowerCase();
    const relationText = `${row && row.causalRelationId || ''} ${row && row.geometry || ''}`.toLowerCase();
    return (objects || [])
      .filter((object) => {
        const text = renderObjectText(object);
        return triggerText.split(/\s+/).some((term) => term && text.includes(term)) ||
          relationText.split(/[^a-z0-9]+/).some((term) => term && text.includes(term));
      })
      .slice(0, 8)
      .map((object) => object.id);
  }

  function semanticRowsFromPlan(semantic, key) {
    return semantic && Array.isArray(semantic[key]) ? semantic[key] : [];
  }

  function semanticRowsFromGenome(visualGenome, key) {
    return semanticRowsFromPlan(visualGenome && visualGenome.semanticVisuals, key);
  }

  function visualOperatorForProcessFamily(family, sceneKind) {
    const text = `${family} ${sceneKind}`.toLowerCase();
    if (/heat|thermal|burn|reaction|energy/.test(text)) return 'thermal-front';
    if (/flow|advection|fluid|water|restoration/.test(text)) return 'advected-particles';
    if (/wave|acoustic|pressure|orbit|space/.test(text)) return 'wave-or-orbit-trails';
    if (/network|queue|digital|civic|venue/.test(text)) return 'agent-routing-pulses';
    if (/growth|bio|clinical|ecology/.test(text)) return 'growth-diffusion-front';
    if (/collision|constraint|mechanical|sport/.test(text)) return 'constraint-impulse-arcs';
    if (/magnetic|electric|charge|plasma/.test(text)) return 'field-line-advection';
    if (/granular|erosion|hazard/.test(text)) return 'particle-strata-motion';
    return 'state-pulse-overlay';
  }

  function affectedEntitiesForProcess(family, objects) {
    const text = String(family || '').toLowerCase();
    return (objects || [])
      .filter((object) => {
        const row = renderObjectText(object);
        if (/heat|thermal|burn/.test(text)) return /fire|heat|smoke|metal|air|lava|plasma/.test(row);
        if (/flow|fluid|advection/.test(text)) return /water|flow|river|air|pipe|pump|channel/.test(row);
        if (/network|queue/.test(text)) return /queue|network|agent|sensor|ledger|route/.test(row);
        if (/growth|bio/.test(text)) return /bio|cell|plant|moss|algae|mycelium|patient|tissue/.test(row);
        if (/collision|constraint/.test(text)) return /wheel|wall|body|bridge|hammer|projectile/.test(row);
        return true;
      })
      .slice(0, 8)
      .map((object) => object.id);
  }

  function motionForProcessFamily(family, sceneKind) {
    const operator = visualOperatorForProcessFamily(family, sceneKind);
    const map = {
      'thermal-front': 'rising-plume-and-isobands',
      'advected-particles': 'streamline-advection',
      'wave-or-orbit-trails': 'phase-propagating-arcs',
      'agent-routing-pulses': 'packet-or-agent-pulses',
      'growth-diffusion-front': 'branching-front-expansion',
      'constraint-impulse-arcs': 'impulse-and-contact-ghosts',
      'field-line-advection': 'curling-vector-flux',
      'particle-strata-motion': 'settling-and-shear-bands',
      'state-pulse-overlay': 'bounded-state-pulses',
    };
    return map[operator] || map['state-pulse-overlay'];
  }

  function visualGeometryForEntity(entity, sceneKind) {
    return {
      id: `geometry:${entity.id}`,
      entityId: entity.id,
      primitive: geometryPrimitiveForEntity(entity, sceneKind),
      instancing: instancingForEntity(entity),
      layout: layoutForEntity(entity, sceneKind),
      scale: entity.pose && (entity.pose.w || entity.pose.h || entity.pose.r) ? 'specified' : 'adaptive',
      constraints: geometryConstraintsForEntity(entity),
      sourceGraphId: entity.sourceGraphId || entity.sourceObject || entity.id || '',
      sourceKind: entity.sourceKind || '',
      sourceIds: entity.sourceIds || [],
      status: entity.status || 'accepted',
      confidence: entity.confidence || 0.72,
      reason: entity.reason || 'geometry accepted for visual entity',
      evidence: entity.evidence || [],
    };
  }

  function geometryPrimitiveForEntity(entity, sceneKind) {
    const identityLocal = [
      entity.id,
      entity.sourceObject,
      entity.kind,
      entity.shape,
      entity.material,
      entity.visualRegime,
      entity.role,
    ].join(' ').toLowerCase();
    const local = `${identityLocal} ${entity.label || ''}`.toLowerCase();
    const scene = String(sceneKind || '').toLowerCase();
    if (/\b(dog|dogs|cat|cats|animal|mammal|swimmer)\b|animal-body/.test(identityLocal)) return 'animal-body';
    if (/\b(flower|flowers|plant|plants|tree|trees|leaf|leaves|root|mangrove|botanical|fuel-bed|biomass)\b/.test(identityLocal)) return 'botanical-cluster';
    if (/\b(gut|microbiome|microbe|bacteria|colonies|colony|intestinal|immune|tissue|cell|membrane)\b/.test(identityLocal)) return 'cellular-fold-volume';
    if (/\b(train|railway|rail|subway|dispatch|platform|signal block|signal blocks)\b/.test(identityLocal)) return 'rail-dispatch-grid';
    if (/\b(building|zoning|shadow|sunlight|pedestrian|comfort|city-grid|city grid)\b/.test(identityLocal)) return 'building-shadow-volume';
    if (/\b(network|queue|route|routing|traffic|market|packet|server|parcel)\b/.test(identityLocal)) return 'route-node-graph';
    if (/field|heat|pressure|gravity|dipole/.test(local)) return 'scalar-field-sheet';
    if (/water|fluid|air|smoke|plume|medium/.test(local)) return 'fluid-volume-ribbon';
    if (/surface|wall|building|bridge|vessel|repository/.test(local)) return 'sectioned-surface';
    if (/instrument|sensor|detector|lens|probe/.test(local)) return 'instrument-glyph';
    if (/animal|cell|plant|bio/.test(local)) return 'organic-silhouette';
    if (/orbit|space|planetary/.test(local) || /planetary/.test(scene)) return 'orbital-body';
    if (/digital|civic|venue/.test(scene) && entity.kind === 'agent') return 'route-node-graph';
    return 'procedural-silhouette';
  }

  function instancingForEntity(entity) {
    if (entity.kind === 'agent') return { mode: 'swarm', count: 12 };
    if (entity.kind === 'medium') return { mode: 'particles', count: 48 };
    if (entity.kind === 'field') return { mode: 'grid-samples', count: 64 };
    return { mode: 'single', count: 1 };
  }

  function layoutForEntity(entity, sceneKind) {
    if (/digital|civic|venue/.test(sceneKind)) return 'graph-map';
    if (/planetary/.test(sceneKind)) return 'orbital-depth';
    if (/clinical|chemistry|advanced|cultural/.test(sceneKind)) return 'cutaway-bench';
    if (/restoration|hazard|watershed/.test(sceneKind)) return 'terrain-section';
    return entity.pose && entity.pose.points ? 'path' : 'anchored';
  }

  function geometryConstraintsForEntity(entity) {
    return uniqueList([
      entity.role === 'constraint' ? 'boundary' : '',
      entity.role === 'path' ? 'path-continuity' : '',
      entity.kind === 'medium' ? 'volume-contained' : '',
      entity.kind === 'agent' ? 'non-overlap' : '',
    ].filter(Boolean));
  }

  function visualMotionForProcesses(processes, visualGenome, sceneKind, causalAffordances = []) {
    const rows = (processes || []).map((process, index) => ({
      id: `motion:${process.family}`,
      processId: process.id,
      grammar: process.motion,
      phase: index / Math.max(1, processes.length),
      speed: motionSpeedForScene(sceneKind, process.family),
      density: visualGenome && visualGenome.morphology
        ? visualGenome.morphology.particleDensity || 32
        : 32,
      status: process.status || 'accepted',
      confidence: process.confidence || 0.58,
      reason: `motion accepted for process ${process.id || process.family}`,
      evidence: process.evidence || [],
    }));
    for (const row of causalAffordances || []) {
      const family = causalAffordanceProcessFamily(row);
      rows.push({
        id: `motion:causal:${visualSafeId(row.id || family)}`,
        processId: `process:${family}`,
        grammar: (row.motionHints || []).join('+') || 'causal-state-transition',
        phase: rows.length / Math.max(1, rows.length + 1),
        speed: motionSpeedForScene(row.sceneKind || sceneKind, `${family} ${(row.motionHints || []).join(' ')}`),
        density: Math.max(36, visualGenome && visualGenome.morphology
          ? visualGenome.morphology.particleDensity || 36
          : 36),
        motionHints: row.motionHints || [],
        causalRelationId: row.causalRelationId || '',
        evidence: [`causal-affordance:${row.id || family}`, row.causalRelationId || 'causal-relation'],
        status: 'accepted',
        confidence: 0.72,
        reason: 'causal affordance motion accepted from grounded intent receipt',
      });
    }
    return rows.length ? rows : [{
      id: 'motion:state-pulse',
      processId: 'process:coupled-state',
      grammar: 'bounded-state-pulses',
      phase: 0,
      speed: 0.28,
      density: 24,
      status: 'rejected',
      confidence: 0.2,
      reason: 'fallback motion only; no accepted process motion was available',
    }];
  }

  function visualRenderInstancesForIR(entities, geometry, materials, fields, processes, motion, sceneKind) {
    const materialById = new Map((materials || []).map((row) => [row.id, row]));
    const entityById = new Map((entities || []).map((row) => [row.id, row]));
    const processById = new Map((processes || []).map((row) => [row.id, row]));
    const instances = [];
    for (const row of geometry || []) {
      if (!visualRowAccepted(row)) continue;
      const entity = entityById.get(row.entityId) || null;
      if (entity && !visualRowAccepted(entity)) continue;
      const material = materialById.get(entity && entity.material || '') ||
        materialById.get(row.materialId || '') ||
        materials && materials[0] ||
        null;
      instances.push(visualRenderInstance({
        type: 'geometry',
        row,
        entity,
        material,
        sceneKind,
        drawOrder: Number(row.order || 0),
      }));
    }
    for (const row of fields || []) {
      if (!visualRowAccepted(row)) continue;
      instances.push(visualRenderInstance({
        type: 'field',
        row,
        sceneKind,
        drawOrder: 100 + instances.length,
      }));
    }
    for (const row of processes || []) {
      if (!visualRowAccepted(row)) continue;
      instances.push(visualRenderInstance({
        type: 'process',
        row,
        sceneKind,
        drawOrder: 180 + Number(row.order || 0),
      }));
    }
    for (const row of motion || []) {
      if (!visualRowAccepted(row)) continue;
      instances.push(visualRenderInstance({
        type: 'motion',
        row,
        process: processById.get(row.processId) || null,
        sceneKind,
        drawOrder: 220 + instances.length,
      }));
    }
    return instances
      .sort((a, b) => a.drawOrder - b.drawOrder || a.id.localeCompare(b.id))
      .slice(0, 48);
  }

  function visualRenderInstance({ type, row, entity = null, material = null, process = null, sceneKind, drawOrder }) {
    const sourceGraphId = row.sourceGraphId || entity && (entity.sourceGraphId || entity.sourceObject) || row.entityId || row.id || '';
    const sourceIds = uniqueList([
      sourceGraphId,
      ...(row.sourceIds || []),
      ...(entity && entity.sourceIds || []),
      row.entityId,
      row.processId,
      row.fieldId,
    ].filter(Boolean)).slice(0, 8);
    const layerSlot = renderInstanceLayerSlot(type, row, entity, process, sceneKind);
    const transform = renderInstanceTransform({ type, row, entity, process, sceneKind, drawOrder });
    const geometry = renderInstanceGeometry({ type, row, entity, layerSlot, transform });
    const instanceMaterial = renderInstanceMaterial({ row, entity, material, layerSlot });
    const animation = renderInstanceAnimation({ type, row, entity, process, layerSlot, sceneKind, drawOrder });
    const collider = renderInstanceCollider({ row, entity, layerSlot, geometry, transform });
    return {
      schema: 'simulatte.renderInstance.v1',
      id: `instance:${type}:${visualSafeId(row.id || row.entityId || row.processId || sourceGraphId || 'row')}`,
      type,
      sceneKind,
      layerSlot,
      entityId: row.entityId || entity && entity.id || '',
      geometryId: type === 'geometry' ? row.id || '' : '',
      fieldId: type === 'field' ? row.id || row.fieldId || '' : row.fieldId || '',
      processId: row.processId || process && process.id || (type === 'process' ? row.id || '' : ''),
      materialId: material && material.id || entity && entity.material || row.materialId || '',
      primitive: row.primitive || row.visualEncoding || row.grammar || row.operator || '',
      shader: material && material.shader || row.shader || '',
      transform,
      geometry,
      material: instanceMaterial,
      animation,
      collider,
      sourceGraphId,
      sourceIds,
      status: 'accepted',
      confidence: Number(Math.min(
        1,
        Number(row.confidence || 0.62),
        entity ? Number(entity.confidence || 0.72) : 1,
        material ? Number(material.confidence || 0.7) : 1
      ).toFixed(3)),
      reason: row.reason || entity && entity.reason || `accepted ${type} render instance`,
      drawOrder,
      evidence: uniqueList([
        ...(row.evidence || []),
        ...(entity && entity.evidence || []),
        ...(material && material.evidence || []),
      ]).slice(0, 12),
    };
  }

  function renderInstanceTransform({ type, row = {}, entity = null, process = null, sceneKind = '', drawOrder = 0 }) {
    const pose = renderInstancePose(type, row, entity, process, sceneKind, drawOrder);
    return scenePacketTransform(pose, renderInstanceIndex(row, entity, process, drawOrder), 29, sceneKind);
  }

  function renderInstancePose(type, row = {}, entity = null, process = null, sceneKind = '', drawOrder = 0) {
    if (row.pose && typeof row.pose === 'object') return row.pose;
    if (entity && entity.pose && typeof entity.pose === 'object') return entity.pose;
    if (Array.isArray(row.points) && row.points.length) return { points: row.points, rotation: row.rotation || 0 };
    const layerSlot = renderInstanceLayerSlot(type, row, entity, process, sceneKind);
    const seedText = [
      type,
      layerSlot,
      row.id,
      row.entityId,
      row.processId,
      row.fieldId,
      entity && entity.id,
      process && process.id,
      sceneKind,
      drawOrder,
    ].filter(Boolean).join(':');
    const seed = hashProgram(seedText) || 1;
    const jitterX = unitFromSeed(seed, 7) * 0.12 - 0.06;
    const jitterY = unitFromSeed(seed, 11) * 0.1 - 0.05;
    if (type === 'field' || /field|water-volume|organic-matrix|thermal-field|optical-field|chemical-front/.test(layerSlot)) {
      return {
        x: clamp(0.5 + jitterX * 0.35, 0.16, 0.84),
        y: clamp((/water|ocean|watershed|cryosphere/.test(sceneKind) ? 0.6 : 0.48) + jitterY * 0.35, 0.16, 0.84),
        w: 0.72,
        h: /thermal|plume|optical/.test(layerSlot) ? 0.62 : 0.46,
        rotation: unitFromSeed(seed, 13) * 0.12 - 0.06,
      };
    }
    if (type === 'process' || type === 'motion' || /process|network-flow|track-line|causal/.test(layerSlot)) {
      const fromX = clamp(0.18 + unitFromSeed(seed, 17) * 0.24, 0.08, 0.44);
      const fromY = clamp(0.28 + unitFromSeed(seed, 19) * 0.42, 0.12, 0.78);
      const toX = clamp(0.58 + unitFromSeed(seed, 23) * 0.28, 0.48, 0.92);
      const toY = clamp(0.22 + unitFromSeed(seed, 29) * 0.5, 0.1, 0.86);
      return {
        points: [
          [fromX, fromY],
          [clamp((fromX + toX) * 0.5 + jitterX, 0.08, 0.92), clamp((fromY + toY) * 0.5 + jitterY, 0.1, 0.86)],
          [toX, toY],
        ],
        rotation: 0,
      };
    }
    return {
      x: clamp(0.16 + unitFromSeed(seed, 31) * 0.68, 0.08, 0.92),
      y: clamp((/water|ocean|watershed|cryosphere/.test(sceneKind) ? 0.54 : 0.26) + unitFromSeed(seed, 37) * 0.38, 0.1, 0.9),
      w: /readout|detector|robot|orbital|node/.test(layerSlot) ? 0.16 : 0.13,
      h: /readout|detector|robot|orbital|node/.test(layerSlot) ? 0.12 : 0.1,
      rotation: unitFromSeed(seed, 41) * 0.24 - 0.12,
    };
  }

  function renderInstanceIndex(row = {}, entity = null, process = null, drawOrder = 0) {
    const seed = hashProgram([
      row.id,
      row.entityId,
      row.processId,
      row.fieldId,
      entity && entity.id,
      process && process.id,
      drawOrder,
    ].filter(Boolean).join(':'));
    return Math.max(0, Math.floor(seed % 29));
  }

  function renderInstanceGeometry({ type, row = {}, entity = null, layerSlot = '', transform }) {
    const bounds = scenePacketBounds(transform);
    return {
      id: type === 'geometry' ? row.id || `geometry:${entity && entity.id || visualSafeId(layerSlot)}` : row.geometryId || `geometry:${visualSafeId(row.id || layerSlot || type)}`,
      kind: row.layout || row.kind || (type === 'field' ? 'field-layer' : type === 'process' || type === 'motion' ? 'path-layer' : 'anchored'),
      primitive: row.primitive || row.visualEncoding || row.grammar || entity && entity.shape || layerSlot || 'procedural-instance',
      bounds,
      instancing: row.instancing || entity && instancingForEntity(entity) || null,
      constraints: row.constraints || [],
    };
  }

  function renderInstanceMaterial({ row = {}, entity = null, material = null, layerSlot = '' }) {
    const packetMaterial = scenePacketMaterial(material || row, entity, layerSlot);
    return {
      ...packetMaterial,
      id: packetMaterial.id || row.materialId || entity && entity.material || 'matte',
      shader: row.shader || packetMaterial.shader || '',
    };
  }

  function renderInstanceAnimation({ type, row = {}, entity = null, process = null, layerSlot = '', sceneKind = '', drawOrder = 0 }) {
    return scenePacketAnimation({
      layerSlot,
      entity,
      field: type === 'field' ? row : null,
      process: type === 'process' ? row : process,
      motion: type === 'motion' ? row : null,
      text: [
        row.id,
        row.primitive,
        row.visualEncoding,
        row.grammar,
        row.operator,
        entity && entity.label,
        entity && entity.kind,
        process && process.family,
        sceneKind,
      ].filter(Boolean).join(' '),
      index: renderInstanceIndex(row, entity, process, drawOrder),
    });
  }

  function renderInstanceCollider({ row = {}, entity = null, layerSlot = '', geometry = {}, transform }) {
    return {
      kind: scenePacketColliderKind(layerSlot, entity, geometry),
      bounds: scenePacketBounds(transform),
      pickId: row.entityId || row.id || entity && entity.id || '',
      selectable: Boolean(row.entityId || entity && entity.id),
    };
  }

  function sceneRenderPacketForVisualIR(context = {}) {
    const sceneKind = context.sceneKind || 'generic';
    const entities = (context.entities || []).filter(visualRowAccepted);
    const materials = (context.materials || []).filter(visualRowAccepted);
    const fields = (context.fields || []).filter(visualRowAccepted);
    const processes = (context.processes || []).filter(visualRowAccepted);
    const motion = (context.motion || []).filter(visualRowAccepted);
    const geometry = (context.geometry || []).filter(visualRowAccepted);
    const renderInstances = (context.renderInstances || []).filter(visualRowAccepted);
    const geometryByEntity = new Map(geometry.map((row) => [row.entityId, row]));
    const materialById = new Map(materials.map((row) => [row.id, row]));
    const instancesByEntity = renderInstanceLookup(renderInstances, 'entityId');
    const instancesByField = renderInstanceLookup(renderInstances, 'fieldId');
    const instancesByProcess = renderInstanceLookup(renderInstances, 'processId');
    const processById = new Map(processes.map((row) => [row.id, row]));
    const motionByProcess = new Map(motion.map((row) => [row.processId, row]));
    const packetEntities = entities
      .map((entity, index) => scenePacketEntity({
        entity,
        geometry: geometryByEntity.get(entity.id),
        material: materialById.get(entity.material),
        instance: firstLookup(instancesByEntity, entity.id),
        motion: motionForEntity(entity, processById, motionByProcess),
        sceneKind,
        index,
        total: entities.length,
      }))
      .filter(Boolean)
      .slice(0, 32);
    const packetFields = fields
      .map((field, index) => scenePacketField({
        field,
        instance: firstLookup(instancesByField, field.id || field.fieldId),
        sceneKind,
        index,
      }))
      .filter(Boolean)
      .slice(0, 16);
    const packetEffects = [
      ...processes.map((process, index) => scenePacketEffect({
        row: process,
        kind: 'process',
        instance: firstLookup(instancesByProcess, process.id),
        sceneKind,
        index,
      })),
      ...motion.map((row, index) => scenePacketEffect({
        row,
        kind: 'motion',
        instance: firstLookup(instancesByProcess, row.processId),
        sceneKind,
        index,
      })),
    ].filter(Boolean).slice(0, 24);
    const uniforms = scenePacketUniformsForVisualIR({
      sceneKind,
      entities: packetEntities,
      fields: packetFields,
      effects: packetEffects,
      graphicsAtoms: context.graphicsAtoms || {},
    });
    return {
      schema: SCENE_RENDER_PACKET_SCHEMA,
      compiler: 'simulatte.visual-ir.scene-render-packet.compiler.v1',
      sceneKind,
      coordinateSystem: {
        space: 'normalized-canvas',
        origin: 'top-left',
        bounds: [0, 0, 1, 1],
      },
      time: {
        unit: 'seconds',
        stateBinding: 'simulation-time',
      },
      camera: {
        ...(context.camera || {}),
        coordinateSystem: 'normalized-canvas',
      },
      lights: scenePacketLights(context.lighting, sceneKind),
      entities: packetEntities,
      fields: packetFields,
      effects: packetEffects,
      uniforms,
      passes: scenePacketPasses(packetEntities, packetFields, packetEffects),
      receipts: {
        entityCount: packetEntities.length,
        fieldCount: packetFields.length,
        effectCount: packetEffects.length,
        source: 'visualIR.acceptedRows',
        primaryArtifact: 'sceneRenderPacket',
        renderCodeCount: packetEntities.length + packetFields.length + packetEffects.length,
      },
    };
  }

  function renderInstanceLookup(instances, key) {
    const map = new Map();
    for (const instance of instances || []) {
      const value = instance && instance[key];
      if (!value) continue;
      if (!map.has(value)) map.set(value, []);
      map.get(value).push(instance);
    }
    return map;
  }

  function firstLookup(map, key) {
    const rows = key && map && map.get(key);
    return rows && rows.length ? rows[0] : null;
  }

  function scenePacketEntity({ entity, geometry, material, instance, motion, sceneKind, index, total }) {
    if (!entity || !visualRowAccepted(entity)) return null;
    const transform = scenePacketTransform(entity.pose, index, total, sceneKind);
    const layerSlot = instance && instance.layerSlot ||
      renderInstanceLayerSlot('geometry', geometry || {}, entity, null, sceneKind);
    const identity = scenePacketEntityIdentity(entity, geometry, layerSlot);
    const animation = scenePacketAnimation({
      layerSlot,
      entity,
      motion,
      text: [
        entity.id,
        entity.label,
        entity.kind,
        entity.role,
        entity.shape,
        entity.material,
        geometry && geometry.primitive,
        motion && motion.grammar,
        sceneKind,
      ].filter(Boolean).join(' '),
      index,
    });
    const bounds = scenePacketBounds(transform);
    const renderCodes = scenePacketRenderCodes({
      id: entity.id,
      label: identity.label || entity.label || entity.id,
      sourceGraphId: entity.sourceGraphId || entity.sourceObject || entity.id || '',
      layerSlot,
      identity,
      animation,
      packetKind: 'entity',
    });
    return {
      schema: 'simulatte.sceneEntity.v1',
      id: entity.id,
      label: identity.label || entity.label || entity.id,
      identity,
      semanticRef: entity.semanticRef || '',
      physicalRef: entity.physicalRef || '',
      sourceGraphId: entity.sourceGraphId || entity.sourceObject || entity.id || '',
      sourceIds: entity.sourceIds || [],
      layerSlot,
      transform,
      geometry: {
        id: geometry && geometry.id || `geometry:${entity.id}`,
        kind: geometry && geometry.layout || 'anchored',
        primitive: geometry && geometry.primitive || entity.shape || 'procedural-silhouette',
        bounds,
        instancing: geometry && geometry.instancing || instancingForEntity(entity),
        constraints: geometry && geometry.constraints || [],
      },
      material: scenePacketMaterial(material, entity, layerSlot),
      animation,
      renderCodes,
      collider: {
        kind: scenePacketColliderKind(layerSlot, entity, geometry),
        bounds,
        pickId: entity.id,
        selectable: true,
      },
      renderPriority: scenePacketDrawablePriority({
        packetKind: 'entity',
        layerSlot,
        identity,
        confidence: entity.confidence || instance && instance.confidence || 0.72,
      }, sceneKind),
      drawOrder: Number(instance && instance.drawOrder || index),
      evidence: uniqueList([
        ...(entity.evidence || []),
        ...(geometry && geometry.evidence || []),
        ...(material && material.evidence || []),
        ...(instance && instance.evidence || []),
      ]).slice(0, 12),
      confidence: Number(entity.confidence || instance && instance.confidence || 0.72),
      reason: entity.reason || instance && instance.reason || 'scene packet entity compiled from accepted VisualIR entity',
    };
  }

  function scenePacketEntityIdentity(entity = {}, geometry = {}, layerSlot = '') {
    const isNetworkLayer = layerSlot === 'node-graph' || layerSlot === 'network-flow';
    const objectText = [
      entity.id,
      entity.sourceObject,
      entity.role,
      entity.kind,
      entity.shape,
      entity.material,
      entity.visualRegime,
      entity.semanticRef,
      entity.physicalRef,
      geometry && geometry.primitive,
      layerSlot,
    ].filter(Boolean).join(' ').toLowerCase();
    const provenanceText = [
      ...(entity.sourceIds || []),
      ...(entity.evidence || []),
    ].filter(Boolean).join(' ').toLowerCase();
    const text = [objectText, provenanceText, entity.label].filter(Boolean).join(' ').toLowerCase();
    let type = 'object';
    let category = 'object';
    if (isNetworkLayer || /node|edge|queue|network|packet|route/.test(objectText)) {
      type = 'network-node';
      category = 'network';
    } else if (/\bdogs?\b/.test(objectText)) {
      type = 'dog';
      category = 'animal';
    } else if (/\bcats?\b/.test(objectText)) {
      type = 'cat';
      category = 'animal';
    } else if (/\bwater\b|pool|river|lake|ocean|fluid-volume/.test(objectText)) {
      type = 'water';
      category = 'medium';
    } else if (/\b(mouse|mice|gerbil|hamster|animal|mammal|fish|bird|swimmer)\b|animal-body/.test(objectText)) {
      type = 'animal';
      category = 'animal';
    } else if (/smoke|plume|air|gas|fluid|field-envelope|scalar-field/.test(objectText)) {
      type = /smoke|plume/.test(objectText) ? 'smoke' : 'field';
      category = /smoke|plume|air|gas|fluid/.test(objectText) ? 'medium' : 'field';
    } else if (/robot|gripper|armature/.test(objectText)) {
      type = 'robot';
      category = 'machine';
    } else if (/detector|calorimeter|readout|sensor|instrument/.test(objectText)) {
      type = /readout/.test(objectText) ? 'readout' : 'instrument';
      category = 'instrument';
    } else if (/fire|flame|thermal|combust|soot/.test(objectText)) {
      type = 'fire';
      category = 'process';
    } else if (/building|wall|stairwell|surface|boundary/.test(objectText)) {
      type = 'structure';
      category = 'surface';
    } else if (/protein|molecule|bond|cell|membrane/.test(objectText)) {
      type = /protein/.test(objectText) ? 'protein' : 'cell';
      category = 'biological';
    } else if (isNetworkLayer || /node|edge|queue|network|packet|route/.test(text)) {
      type = 'network-node';
      category = 'network';
    } else if (/\bdogs?\b/.test(text)) {
      type = 'dog';
      category = 'animal';
    } else if (/\bcats?\b/.test(text)) {
      type = 'cat';
      category = 'animal';
    } else if (/\bwater\b|pool|river|lake|ocean|fluid-volume/.test(text)) {
      type = 'water';
      category = 'medium';
    } else if (/\b(mouse|mice|gerbil|hamster|animal|mammal|fish|bird|swimmer)\b|animal-body/.test(text)) {
      type = 'animal';
      category = 'animal';
    } else if (/smoke|plume|air|gas|fluid|field-envelope|scalar-field/.test(text)) {
      type = /smoke|plume/.test(text) ? 'smoke' : 'field';
      category = /smoke|plume|air|gas|fluid/.test(text) ? 'medium' : 'field';
    } else if (/robot|gripper|armature/.test(text)) {
      type = 'robot';
      category = 'machine';
    } else if (/detector|calorimeter|readout|sensor|instrument/.test(text)) {
      type = /readout/.test(text) ? 'readout' : 'instrument';
      category = 'instrument';
    } else if (/fire|flame|thermal|combust|soot/.test(text)) {
      type = 'fire';
      category = 'process';
    } else if (/building|wall|stairwell|surface|boundary/.test(text)) {
      type = 'structure';
      category = 'surface';
    } else if (/protein|molecule|bond|cell|membrane/.test(text)) {
      type = /protein/.test(text) ? 'protein' : 'cell';
      category = 'biological';
    }
    return {
      schema: 'simulatte.sceneEntityIdentity.v1',
      type,
      category,
      label: scenePacketIdentityLabel(type, entity),
      renderClass: layerSlot || '',
      role: entity.role || '',
      sourceLabel: entity.label || '',
      primitive: geometry && geometry.primitive || entity.shape || '',
      material: entity.material || '',
      semanticRef: entity.semanticRef || '',
      physicalRef: entity.physicalRef || '',
    };
  }

  function scenePacketIdentityLabel(type, entity = {}) {
    if (type && type !== 'object' && type !== 'field') return type;
    const role = String(entity.role || '').toLowerCase();
    const roleMatch = role.match(/\b(dog|cat|mouse|gerbil|hamster|water|robot|fire|smoke|protein|cell|instrument|readout|structure)\b/);
    if (roleMatch) return roleMatch[1];
    return entity.label || entity.id || type || 'object';
  }

  function scenePacketField({ field, instance, sceneKind, index }) {
    if (!field || !visualRowAccepted(field)) return null;
    const layerSlot = instance && instance.layerSlot ||
      renderInstanceLayerSlot('field', field, null, null, sceneKind);
    const domain = scenePacketFieldDomain(field.geometry, index);
    const animation = scenePacketAnimation({
      layerSlot,
      field,
      text: `${field.id || ''} ${field.kind || ''} ${field.channel || ''} ${field.visualEncoding || ''}`,
      index,
    });
    const identity = {
      schema: 'simulatte.sceneEntityIdentity.v1',
      type: 'field',
      category: 'field',
      label: field.label || field.id || `field-${index + 1}`,
      renderClass: layerSlot,
      role: field.kind || '',
      sourceLabel: field.name || field.id || '',
      primitive: field.visualEncoding || '',
      material: field.materialId || '',
      semanticRef: field.semanticRef || '',
      physicalRef: field.physicalRef || '',
    };
    const renderCodes = scenePacketRenderCodes({
      id: field.id || `field-${index + 1}`,
      label: identity.label,
      sourceGraphId: field.sourceGraphId || field.domainId || field.id || '',
      layerSlot,
      identity,
      animation,
      packetKind: 'field',
    });
    return {
      schema: 'simulatte.sceneField.v1',
      id: field.id || `field-${index + 1}`,
      sourceGraphId: field.sourceGraphId || field.domainId || field.id || '',
      layerSlot,
      identity,
      domain,
      encoding: {
        kind: field.visualEncoding || field.kind || 'scalar-contours',
        channel: field.channel || field.stateBinding || '',
        strength: Number.isFinite(Number(field.strength)) ? Number(field.strength) : 0.58,
      },
      material: {
        shader: shaderForFieldLayer(layerSlot, field),
        opacity: layerSlot === 'water-volume' ? 0.46 : 0.32,
      },
      animation,
      renderCodes,
      renderPriority: scenePacketDrawablePriority({
        packetKind: 'field',
        layerSlot,
        identity,
        confidence: field.confidence || instance && instance.confidence || 0.64,
      }, sceneKind),
      drawOrder: Number(instance && instance.drawOrder || 100 + index),
      evidence: field.evidence || [],
      confidence: Number(field.confidence || instance && instance.confidence || 0.64),
      reason: field.reason || instance && instance.reason || 'scene packet field compiled from accepted VisualIR field',
    };
  }

  function scenePacketEffect({ row, kind, instance, sceneKind, index }) {
    if (!row || !visualRowAccepted(row)) return null;
    const process = kind === 'process' ? row : null;
    const layerSlot = instance && instance.layerSlot ||
      renderInstanceLayerSlot(kind, row, null, process, sceneKind);
    const domain = scenePacketEffectDomain(index);
    const animation = scenePacketAnimation({
      layerSlot,
      process: kind === 'process' ? row : null,
      motion: kind === 'motion' ? row : null,
      text: `${row.id || ''} ${row.family || ''} ${row.motion || ''} ${row.grammar || ''} ${row.operator || ''}`,
      index,
    });
    const identity = {
      schema: 'simulatte.sceneEntityIdentity.v1',
      type: kind === 'process' ? 'process' : 'motion',
      category: 'process',
      label: row.label || row.id || `${kind}-${index + 1}`,
      renderClass: layerSlot,
      role: row.family || row.grammar || '',
      sourceLabel: row.label || row.id || '',
      primitive: row.operator || row.motion || '',
      material: row.materialId || '',
      semanticRef: row.semanticRef || '',
      physicalRef: row.physicalRef || '',
    };
    const renderCodes = scenePacketRenderCodes({
      id: row.id || `${kind}-${index + 1}`,
      label: identity.label,
      sourceGraphId: row.sourceGraphId || row.processId || row.id || '',
      layerSlot,
      identity,
      animation,
      packetKind: 'effect',
    });
    return {
      schema: 'simulatte.sceneEffect.v1',
      id: row.id || `${kind}-${index + 1}`,
      type: kind,
      sourceGraphId: row.sourceGraphId || row.processId || row.id || '',
      processId: row.processId || row.id || '',
      layerSlot,
      identity,
      domain,
      animation,
      renderCodes,
      renderPriority: scenePacketDrawablePriority({
        packetKind: 'effect',
        layerSlot,
        identity,
        confidence: row.confidence || instance && instance.confidence || 0.58,
      }, sceneKind),
      drawOrder: Number(instance && instance.drawOrder || 180 + index),
      evidence: row.evidence || [],
      confidence: Number(row.confidence || instance && instance.confidence || 0.58),
      reason: row.reason || instance && instance.reason || `scene packet ${kind} compiled from accepted VisualIR row`,
    };
  }

  function motionForEntity(entity, processById, motionByProcess) {
    if (!entity) return null;
    const id = entity.id;
    for (const process of processById.values()) {
      if (Array.isArray(process.affects) && process.affects.includes(id)) {
        return motionByProcess.get(process.id) || null;
      }
    }
    return null;
  }

  function scenePacketTransform(pose = {}, index = 0, total = 1, sceneKind = '') {
    if (Array.isArray(pose.points) && pose.points.length) {
      const points = pose.points.map((point) => [
        scenePacketClamp01(point && point[0], 0.5),
        scenePacketClamp01(point && point[1], 0.5),
      ]);
      const bounds = pointsBounds(points);
      return {
        position: [bounds[0] + bounds[2] * 0.5, bounds[1] + bounds[3] * 0.5, scenePacketDepth(index, total)],
        rotation: [0, 0, Number(pose.rotation || 0)],
        scale: [Math.max(bounds[2], 0.08), Math.max(bounds[3], 0.06), 1],
        anchor: [0.5, 0.5],
        path: points,
      };
    }
    const fallback = scenePacketFallbackPose(index, total, sceneKind);
    const x = scenePacketClamp01(pose.x, fallback.x);
    const y = scenePacketClamp01(pose.y, fallback.y);
    const w = scenePacketSize(pose.w || pose.width || pose.r && pose.r * 2, fallback.w);
    const h = scenePacketSize(pose.h || pose.height || pose.r && pose.r * 2, fallback.h);
    return {
      position: [x, y, scenePacketDepth(index, total)],
      rotation: [0, 0, Number(pose.rotation || pose.angle || 0)],
      scale: [w, h, 1],
      anchor: [0.5, 0.5],
    };
  }

  function scenePacketFallbackPose(index, total, sceneKind) {
    const count = Math.max(1, total);
    const column = index % Math.min(4, count);
    const row = Math.floor(index / Math.max(1, Math.min(4, count)));
    const x = 0.2 + column * 0.2 + (row % 2) * 0.06;
    const yBase = /water|watershed|ocean|restoration|cryosphere/.test(sceneKind) ? 0.62 : 0.36;
    return {
      x: scenePacketClamp01(x, 0.5),
      y: scenePacketClamp01(yBase + row * 0.12, 0.5),
      w: 0.14,
      h: 0.1,
    };
  }

  function scenePacketDepth(index, total) {
    return Number((index / Math.max(1, total) * 0.8).toFixed(3));
  }

  function scenePacketBounds(transform) {
    const position = transform.position || [0.5, 0.5, 0];
    const scale = transform.scale || [0.12, 0.1, 1];
    const x = scenePacketClamp01(position[0] - scale[0] * 0.5, 0);
    const y = scenePacketClamp01(position[1] - scale[1] * 0.5, 0);
    return [
      x,
      y,
      scenePacketClamp01(scale[0], 0.12),
      scenePacketClamp01(scale[1], 0.1),
    ];
  }

  function pointsBounds(points) {
    const xs = points.map((point) => point[0]);
    const ys = points.map((point) => point[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return [minX, minY, maxX - minX, maxY - minY];
  }

  function scenePacketMaterial(material, entity, layerSlot = '') {
    const row = material || {};
    if (layerSlot === 'node-graph' || layerSlot === 'network-flow') {
      const style = MATERIAL_STYLES.signal || MATERIAL_STYLES.light || MATERIAL_STYLES.matte;
      return {
        id: layerSlot === 'network-flow' ? 'packet-signal' : 'network-node',
        kind: 'network',
        shader: 'charged-trace-glow',
        fill: style.fill,
        stroke: style.stroke,
        opacity: Number.isFinite(Number(row.opacity)) ? Math.max(Number(row.opacity), 0.52) : style.alpha,
        emissive: true,
      };
    }
    return {
      id: row.id || entity && entity.material || 'matte',
      kind: row.family || materialFamilyForVisualMaterial(entity && entity.material, entity && entity.visualRegime),
      shader: row.shader || shaderForMaterialFamily(row.family || 'matte'),
      fill: row.fill || '',
      stroke: row.stroke || '',
      opacity: Number.isFinite(Number(row.opacity)) ? Number(row.opacity) : 0.7,
      emissive: row.emissive === true,
    };
  }

  function scenePacketAnimation({ layerSlot, entity = null, field = null, process = null, motion = null, text = '', index = 0 }) {
    const value = `${layerSlot || ''} ${text || ''}`.toLowerCase();
    let kind = 'state-pulse';
    let stateBinding = 'simulation-time';
    if (/biological-agent/.test(value) && /water|swim|fluid|watershed|ocean/.test(value)) kind = 'swim-cycle';
    else if (/water-volume|flow-field|fluid|advection|streamline|ripple|velocity/.test(value)) kind = 'flow-ripple';
    else if (/detector|track-line|particle/.test(value)) kind = 'particle-track';
    else if (/readout|measurement|telemetry/.test(value)) kind = 'readout-pulse';
    else if (/node-graph|network-flow|queue|packet|route/.test(value)) kind = 'packet-flow';
    else if (/organic-matrix|bubble-volume|fermentation|gas|dough|gluten/.test(value)) kind = 'fermentation-rise';
    else if (/thermal|fire|plume|smoke|combust/.test(value)) kind = 'plume-rise';
    else if (/orbital|orbit|gravity|planet/.test(value)) kind = 'orbital-drift';
    const speedSource = motion && motion.speed || process && process.speed || field && field.speed;
    const speed = Number.isFinite(Number(speedSource)) ? Number(speedSource) : animationSpeedForKind(kind);
    return {
      kind,
      stateBinding,
      speed,
      amplitude: animationAmplitudeForKind(kind),
      phase: Number(((index % 17) / 17).toFixed(3)),
      affects: uniqueList([
        entity && entity.id,
        field && field.id,
        process && process.id,
        motion && motion.processId,
      ].filter(Boolean)),
    };
  }

  function animationSpeedForKind(kind) {
    if (kind === 'particle-track' || kind === 'packet-flow') return 0.74;
    if (kind === 'swim-cycle' || kind === 'flow-ripple') return 0.48;
    if (kind === 'fermentation-rise' || kind === 'orbital-drift') return 0.24;
    if (kind === 'plume-rise') return 0.58;
    return 0.34;
  }

  function animationAmplitudeForKind(kind) {
    if (kind === 'swim-cycle') return 0.055;
    if (kind === 'flow-ripple') return 0.04;
    if (kind === 'packet-flow' || kind === 'particle-track') return 0.08;
    if (kind === 'fermentation-rise') return 0.05;
    if (kind === 'plume-rise') return 0.075;
    return 0.035;
  }

  function scenePacketColliderKind(layerSlot, entity, geometry) {
    const text = `${layerSlot || ''} ${entity && entity.kind || ''} ${geometry && geometry.primitive || ''}`.toLowerCase();
    if (/field|water|volume|matrix|plume/.test(text)) return 'bounds';
    if (/track|path|flow|network/.test(text)) return 'polyline';
    if (/agent|body|orbital|bubble|particle/.test(text)) return 'ellipse';
    return 'bounds';
  }

  function scenePacketFieldDomain(geometry = {}, index = 0) {
    if (geometry && geometry.kind === 'directed-field') {
      const from = Array.isArray(geometry.from) ? geometry.from : [0.12, 0.2];
      const to = Array.isArray(geometry.to) ? geometry.to : [0.84, 0.76];
      return {
        kind: 'directed-field',
        from: [scenePacketClamp01(from[0], 0.12), scenePacketClamp01(from[1], 0.2)],
        to: [scenePacketClamp01(to[0], 0.84), scenePacketClamp01(to[1], 0.76)],
        bounds: pointsBounds([from, to]),
      };
    }
    if (geometry && geometry.kind === 'radial-field') {
      const center = Array.isArray(geometry.center) ? geometry.center : [0.5, 0.5];
      const radius = scenePacketSize(geometry.radius, 0.32);
      return {
        kind: 'radial-field',
        center: [scenePacketClamp01(center[0], 0.5), scenePacketClamp01(center[1], 0.5)],
        radius,
        bounds: [
          scenePacketClamp01(center[0] - radius, 0.18),
          scenePacketClamp01(center[1] - radius, 0.18),
          scenePacketClamp01(radius * 2, 0.64),
          scenePacketClamp01(radius * 2, 0.64),
        ],
      };
    }
    if (geometry && geometry.kind === 'graph-field') {
      return {
        kind: 'graph-field',
        bounds: [0.08, 0.12, 0.84, 0.76],
      };
    }
    const inset = 0.05 + (index % 3) * 0.015;
    return {
      kind: 'canvas-field',
      bounds: [inset, inset, 1 - inset * 2, 1 - inset * 2],
    };
  }

  function scenePacketEffectDomain(index) {
    const inset = 0.12 + (index % 4) * 0.025;
    return {
      kind: 'overlay',
      bounds: [inset, inset, 1 - inset * 2, 1 - inset * 2],
    };
  }

  function shaderForFieldLayer(layerSlot, field) {
    const text = `${layerSlot || ''} ${field && field.visualEncoding || ''} ${field && field.kind || ''}`.toLowerCase();
    if (/water|flow|fluid/.test(text)) return 'advected-ripple-volume';
    if (/thermal|heat|fire/.test(text)) return 'heat-isoband-overlay';
    if (/network|node|queue/.test(text)) return 'node-link-pressure';
    if (/detector|readout|track/.test(text)) return 'instrument-readout-overlay';
    if (/optical|ray|caustic/.test(text)) return 'refractive-caustic';
    return 'scalar-contours';
  }

  function scenePacketLights(lighting = {}, sceneKind = '') {
    const atmosphere = String(lighting.atmosphere || sceneKind || '').toLowerCase();
    const warm = /thermal|fire|lava|hazard/.test(atmosphere);
    const cool = /water|ice|cryosphere|instrument|network/.test(atmosphere);
    return [
      {
        id: 'key',
        kind: 'directional',
        direction: [-0.36, -0.58, 0.72],
        color: warm ? [1, 0.78, 0.52] : cool ? [0.72, 0.9, 1] : [0.96, 0.96, 0.9],
        intensity: 0.86,
      },
      {
        id: 'fill',
        kind: 'ambient',
        color: [0.28, 0.36, 0.44],
        intensity: 0.34,
      },
    ];
  }

  function scenePacketPasses(entities, fields, effects) {
    const passes = ['background'];
    if ((fields || []).length) passes.push('fields');
    if ((entities || []).length) passes.push('entities');
    if ((effects || []).length) passes.push('effects');
    if ((entities || []).some((row) => row.layerSlot === 'readout-panel')) passes.push('readouts');
    return passes;
  }

  function scenePacketUniformsForVisualIR({ sceneKind = '', entities = [], fields = [], effects = [], graphicsAtoms = {} }) {
    return {
      schema: 'simulatte.sceneRenderPacketUniforms.v1',
      compiler: 'simulatte.visual-ir.scene-render-packet.uniforms.v1',
      phase: 7,
      source: 'sceneRenderPacket.renderCodes',
      sceneId: scenePacketSceneId(sceneKind),
      atomUniforms: scenePacketAtomUniforms(graphicsAtoms),
      sceneMix: scenePacketSceneMixVector(sceneKind, entities, fields, effects),
      visualLayers: scenePacketVisualLayerVector(entities, fields, effects),
    };
  }

  function scenePacketAtomUniforms(graphicsAtoms = {}) {
    const values = graphicsAtoms && graphicsAtoms.uniforms && Array.isArray(graphicsAtoms.uniforms.values)
      ? graphicsAtoms.uniforms.values
      : [];
    const out = new Array(24).fill(0);
    for (let i = 0; i < Math.min(out.length, values.length); i += 1) {
      out[i] = Number(clamp(Number(values[i] || 0), 0, 1).toFixed(4));
    }
    return out;
  }

  function scenePacketSceneMixVector(sceneKind = '', entities = [], fields = [], effects = []) {
    const vector = new Array(SCENE_MIX_SLOTS.length).fill(0);
    scenePacketAddSceneKindMix(vector, sceneKind, 0.58);
    for (const row of [...entities, ...fields, ...effects]) {
      scenePacketAddLayerSceneMix(vector, row.layerSlot, row.renderCodes && row.renderCodes.categoryCode || 0);
    }
    return scenePacketCompressVector(vector, 0.08, 8);
  }

  function scenePacketVisualLayerVector(entities = [], fields = [], effects = []) {
    const vector = new Array(VISUAL_IR_LAYER_SLOTS.length).fill(0);
    const add = (row, value) => {
      const index = VISUAL_IR_LAYER_SLOTS.indexOf(String(row && row.layerSlot || ''));
      if (index >= 0) vector[index] = clamp(vector[index] + value, 0, 1);
    };
    for (const row of entities || []) add(row, 0.96);
    for (const row of fields || []) add(row, 0.72);
    for (const row of effects || []) add(row, 0.58);
    return scenePacketCompressVector(vector, 0.06, 12);
  }

  function scenePacketAddSceneKindMix(vector, sceneKind, strength = 0.32) {
    const value = String(sceneKind || '').toLowerCase();
    if (!value) return;
    const add = (slot, amount = strength) => scenePacketAddSlot(vector, SCENE_MIX_SLOTS, slot, amount);
    if (/thermal|fire|plume|weather/.test(value)) add('thermal');
    if (/watershed|ocean|fluid|restoration|cryosphere/.test(value)) add('water');
    if (/mechanical|structural|sport/.test(value)) add('mechanical');
    if (/magnetic|ferrofluid/.test(value)) add('magnetic');
    if (/optics|thin-film|quantum/.test(value)) add('optical');
    if (/acoustic/.test(value)) add('acoustic');
    if (/biology|ecology|clinical|agro|molecular/.test(value)) add('biological');
    if (/chemistry|material|cultural/.test(value)) add('chemical');
    if (/planetary|space|atomic/.test(value)) add('orbital');
    if (/digital|city|civic|venue|network|grid/.test(value)) add('network');
    if (/energy|grid|advanced|plasma/.test(value)) add('energy');
    if (/robot|manufacturing|factory/.test(value)) add('robotic');
    if (/granular/.test(value)) add('granular');
    if (/instrument|particle|detector/.test(value)) add('instrument');
    if (/phase|thin-film|cryosphere/.test(value)) add('phase', strength * 0.8);
    if (/hazard|storm|wildfire|tsunami|earthquake/.test(value)) add('hazard');
  }

  function scenePacketAddLayerSceneMix(vector, layerSlot = '', categoryCode = 0) {
    const add = (slot, value) => scenePacketAddSlot(vector, SCENE_MIX_SLOTS, slot, value);
    switch (String(layerSlot || '')) {
      case 'biological-agent':
      case 'organic-matrix':
        add('biological', 0.72);
        break;
      case 'water-volume':
      case 'flow-field':
      case 'bubble-volume':
        add('water', 0.64);
        break;
      case 'detector-geometry':
      case 'readout-panel':
      case 'track-line':
        add('instrument', 0.72);
        break;
      case 'node-graph':
      case 'network-flow':
        add('network', 0.72);
        break;
      case 'thermal-field':
        add('thermal', 0.7);
        break;
      case 'optical-field':
        add('optical', 0.68);
        break;
      case 'chemical-front':
        add('chemical', 0.66);
        break;
      case 'robot-armature':
        add('robotic', 0.68);
        break;
      case 'granular-strata':
        add('granular', 0.66);
        break;
      case 'orbital-body':
        add('orbital', 0.68);
        break;
      case 'acoustic-waveguide':
        add('acoustic', 0.68);
        break;
      case 'phase-boundary':
        add('phase', 0.64);
        break;
      case 'particle-swarm':
        add('instrument', 0.38);
        break;
      default:
        break;
    }
    if (categoryCode === 5) add('instrument', 0.32);
    if (categoryCode === 6) add('network', 0.32);
    if (categoryCode === 9) add('biological', 0.32);
  }

  function scenePacketAddSlot(vector, slots, slot, value) {
    const index = slots.indexOf(slot);
    if (index < 0) return;
    vector[index] = clamp(vector[index] + value, 0, 1);
  }

  function scenePacketCompressVector(input, threshold, maxSlots) {
    const ranked = (input || []).map((value, index) => ({
      index,
      value: clamp(Number(value || 0), 0, 1),
    })).sort((a, b) => b.value - a.value || a.index - b.index);
    const out = new Array(input.length).fill(0);
    ranked.slice(0, maxSlots).forEach((entry, rank) => {
      if (entry.value < threshold) return;
      const gain = rank === 0 ? 1 : rank < 4 ? 0.92 : rank < 8 ? 0.76 : 0.54;
      out[entry.index] = Number(clamp(entry.value * gain, 0, 1).toFixed(4));
    });
    return out;
  }

  function scenePacketRenderCodes({ id = '', label = '', sourceGraphId = '', layerSlot = '', identity = {}, animation = {}, packetKind = '' }) {
    return {
      schema: 'simulatte.sceneRenderCodes.v1',
      layerCode: scenePacketLayerCode(layerSlot),
      animationCode: scenePacketAnimationCode(animation && animation.kind),
      semanticCode: scenePacketSemanticCode(identity),
      categoryCode: scenePacketCategoryCode(identity, packetKind),
      variantCode: scenePacketVariantCode(id, label, sourceGraphId),
      packetKindCode: scenePacketKindCode(packetKind),
    };
  }

  function scenePacketLayerCode(layerSlot) {
    const index = VISUAL_IR_LAYER_SLOTS.indexOf(String(layerSlot || ''));
    return index >= 0 ? index + 1 : 0;
  }

  function scenePacketAnimationCode(kind) {
    switch (String(kind || '').toLowerCase()) {
      case 'swim-cycle': return 1;
      case 'flow-ripple': return 2;
      case 'particle-track': return 3;
      case 'readout-pulse': return 4;
      case 'packet-flow': return 5;
      case 'fermentation-rise': return 6;
      case 'plume-rise': return 7;
      case 'orbital-drift': return 8;
      default: return 0.5;
    }
  }

  function scenePacketSemanticCode(identity = {}) {
    switch (String(identity.type || '').toLowerCase()) {
      case 'dog': return 1;
      case 'cat': return 2;
      case 'animal': return 3;
      case 'water': return 4;
      case 'smoke': return 5;
      case 'fire': return 6;
      case 'robot': return 7;
      case 'instrument': return 8;
      case 'readout': return 9;
      case 'network-node': return 10;
      case 'protein': return 11;
      case 'cell': return 12;
      case 'structure': return 13;
      case 'field': return 14;
      default: return 0;
    }
  }

  function scenePacketCategoryCode(identity = {}, packetKind = '') {
    switch (String(identity.category || '').toLowerCase()) {
      case 'animal': return 1;
      case 'medium': return 2;
      case 'field': return 3;
      case 'surface': return 4;
      case 'instrument': return 5;
      case 'network': return 6;
      case 'machine': return 7;
      case 'process': return 8;
      case 'biological': return 9;
      case 'entity':
      case 'object': return 10;
      default:
        return packetKind === 'entity' ? 10 : packetKind === 'field' ? 3 : packetKind === 'effect' ? 8 : 0;
    }
  }

  function scenePacketKindCode(kind) {
    if (kind === 'entity') return 1;
    if (kind === 'field') return 2;
    if (kind === 'effect') return 3;
    return 0;
  }

  function scenePacketVariantCode(id = '', label = '', sourceGraphId = '') {
    const text = `${id}:${label}:${sourceGraphId}`;
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return Number(((hash >>> 0) / 4294967295).toFixed(6));
  }

  function scenePacketDrawablePriority(row = {}, sceneKind = '') {
    const layer = String(row.layerSlot || '');
    const scene = String(sceneKind || '').toLowerCase();
    const identity = row.identity || {};
    let score = row.packetKind === 'entity' ? 8 : row.packetKind === 'field' ? 3 : 2;
    if (identity.type && identity.type !== 'object' && identity.type !== 'field') score += 4;
    if (identity.category === 'animal') score += 5;
    if (identity.category === 'medium') score += 3;
    if (layer === 'water-volume') score += /water|ocean|watershed|restoration|cryosphere/.test(scene) ? 6 : 4;
    if (layer === 'biological-agent') score += 5;
    if (layer === 'detector-geometry' || layer === 'track-line' || layer === 'readout-panel') score += 5;
    if (layer === 'node-graph' || layer === 'network-flow') score += 5;
    if (layer === 'organic-matrix' || layer === 'bubble-volume') score += 5;
    if (layer === 'thermal-field' || layer === 'phase-boundary') score += 4;
    if (layer === 'field-sheet' || layer === 'flow-field') score += 2;
    score += clamp(Number(row.confidence || 0), 0, 1) * 2;
    return Number(score.toFixed(3));
  }

  function scenePacketSceneId(sceneKind = '') {
    const ids = {
      'thermal-plume': 0,
      fire: 33,
      'weather-atmosphere': 1,
      watershed: 2,
      ocean: 23,
      'mechanical-fluid': 3,
      mechanical: 3,
      'structural-mechanics': 24,
      ferrofluid: 4,
      'magnetic-machine': 4,
      optics: 5,
      'optics-thermal': 5,
      'thin-film': 34,
      acoustic: 6,
      biology: 7,
      ecology: 25,
      'evolution-ecology': 25,
      'restoration-water': 26,
      'agro-waste-loop': 20,
      'chemistry-lab': 8,
      'material-tray': 35,
      cryosphere: 27,
      'ocean-cryosphere': 27,
      'planetary-space': 10,
      'digital-network': 11,
      city: 28,
      'civic-market': 29,
      'venue-crowd': 30,
      'advanced-energy': 12,
      'grid-energy': 16,
      'molecular-biology': 13,
      'clinical-control': 14,
      'particle-instrument': 15,
      'quantum-instrument': 19,
      atomic: 19,
      'robotics-control': 17,
      'manufacturing-line': 18,
      granular: 22,
      'sport-motion': 21,
      'cultural-material': 36,
      'hazard-atmosphere': 31,
      'space-instrument': 32,
    };
    return ids[String(sceneKind || '')] ?? 3;
  }

  function scenePacketClamp01(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? clamp(numeric, 0, 1) : fallback;
  }

  function scenePacketSize(value, fallback = 0.1) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? clamp(numeric, 0.01, 1) : fallback;
  }

  function renderInstanceLayerSlot(type, row = {}, entity = null, process = null, sceneKind = '') {
    const text = [
      type,
      row.id,
      row.primitive,
      row.kind,
      row.visualEncoding,
      row.grammar,
      row.operator,
      entity && entity.kind,
      entity && entity.shape,
      entity && entity.role,
      entity && entity.material,
      process && process.family,
    ].filter(Boolean).join(' ').toLowerCase();
    const scene = String(sceneKind || '').toLowerCase();
    const networkScene = /\b(city|civic-market|digital-network|venue-crowd|network)\b/.test(scene);
    const biologicalText = text.replace(/\b(parcel[-_ ]?cell[-_ ]?grid|cell[-_ ]?grid|grid[-_ ]?cell|grid[-_ ]?cells)\b/g, ' ');
    if (/causal[-_ ]?affordance|causal[-_ ]?relation|cause|causes|produces|drives|modulates/.test(text)) {
      return 'causal-affordance';
    }
    if (networkScene && /\b(flow[-_ ]?path|flow|fluid|field|route|routing|queue|network|packet|traffic|backlog|throughput)\b/.test(text)) {
      return /\b(node|nodes|graph)\b/.test(text) ? 'node-graph' : 'network-flow';
    }
    if (/thermal|heat|combust|flame|fire|smoke|soot|plasma/.test(text)) return 'thermal-field';
    if (/detector|calorimeter|instrument/.test(text)) return 'detector-geometry';
    if (/readout|measurement|telemetry/.test(text)) return 'readout-panel';
    if (/\b(gluten|dough|sourdough|ferment|fermentation|organic[-_ ]?matrix|porous[-_ ]?dough|strand[-_ ]?network|matrix)\b/.test(text)) {
      return 'organic-matrix';
    }
    if (/\b(bubble|bubbles|gas[-_ ]?pocket|foam)\b/.test(text)) return 'bubble-volume';
    if (/dog|cat|animal|biological|cell|organic|soft/.test(biologicalText)) return 'biological-agent';
    if (/\b(node|nodes|graph|queue|route|routing|network|rail|railway|parcel|dispatch|platform|signal|packet|traffic|backlog|throughput)\b/.test(text)) {
      return /\b(queue|route|routing|network[-_ ]?flow|queue-pressure|backlog|throughput|dispatch|signal|packet|traffic)\b/.test(text)
        ? 'network-flow'
        : 'node-graph';
    }
    if (/\b(track|tracks|trajectory|muon|collider|particle[-_ ]?track|particle[-_ ]?instrument)\b/.test(text)) return 'track-line';
    if (/water|fluid|flow|ripple|volume-ribbon/.test(text)) return 'water-volume';
    if (/optical|ray|caustic|spectral/.test(text)) return 'optical-field';
    if (/field|scalar|vector|pressure|force/.test(text)) return 'field-sheet';
    if (/robot|gripper|servo/.test(text)) return 'robot-armature';
    if (/granular|sediment|grain|strata/.test(text)) return 'granular-strata';
    if (/orbit|planet|moon/.test(text)) return 'orbital-body';
    if (/acoustic|waveguide|sound/.test(text)) return 'acoustic-waveguide';
    if (/chemical|acid|reaction|diffusion/.test(text)) return 'chemical-front';
    if (/phase|melt|freeze|transition/.test(text)) return 'phase-boundary';
    if (/motion|pulse|process/.test(text)) return 'process-pulse';
    return type === 'field' ? 'field-sheet' : type === 'process' || type === 'motion' ? 'process-pulse' : 'material-surface';
  }

  function visualRowAccepted(row = {}) {
    return row.status !== 'rejected';
  }

  function visualRejectedRowsForIR(rendererPlan = {}, graphicsAtoms = {}) {
    const objectRows = rendererPlan && rendererPlan.visualObjectLedger &&
      Array.isArray(rendererPlan.visualObjectLedger.rows)
      ? rendererPlan.visualObjectLedger.rows
      : [];
    return [
      ...objectRows
        .filter((row) => row.status !== 'accepted')
        .map((row) => ({
          schema: 'simulatte.visualRejectedRow.v1',
          id: row.id,
          sourceGraphId: row.sourceGraphId,
          sourceKind: row.sourceKind,
          status: row.status,
          reason: row.reason,
          supportOnly: row.supportOnly === true,
        })),
      ...((graphicsAtoms && graphicsAtoms.rejections) || []).map((row, index) => ({
        schema: 'simulatte.visualRejectedRow.v1',
        id: row.id || `graphics-atom-rejection-${index + 1}`,
        sourceKind: 'graphics-atom',
        status: 'rejected',
        reason: row.reason || row.message || 'graphics atom rejected by visual operator compiler',
      })),
    ].slice(0, 48);
  }

  function motionSpeedForScene(sceneKind, family) {
    const text = `${sceneKind} ${family}`.toLowerCase();
    if (/explosion|hazard|packet|signal|plasma|collision/.test(text)) return 0.74;
    if (/growth|cultural|repository|clinical/.test(text)) return 0.22;
    if (/queue|traffic|flow|orbit|wave/.test(text)) return 0.46;
    return 0.34;
  }

  function visualOperatorsForIR(
    entities,
    materials,
    fields,
    processes,
    geometry,
    motion,
    recipe,
    causalAffordances = [],
    graphicsAtoms = {}
  ) {
    const base = [
      visualOperator('camera-frame', 'camera', 'sets explanatory view before drawing'),
      visualOperator('material-shaders', 'material', 'draws material-specific surface and volume cues'),
      visualOperator('geometry-instances', 'geometry', 'places objects, agents, media, and instruments'),
      visualOperator('field-overlays', 'field', 'renders scalar/vector fields as contours, rays, or graph pressure'),
      visualOperator('process-motion', 'process', 'animates evolving physical processes'),
      visualOperator('receipt-marks', 'receipt', 'adds minimal evidence ticks for why marks exist'),
    ];
    if ((recipe && recipe.layerPlan || []).includes('diagnostics')) {
      base.push(visualOperator('diagnostic-sightlines', 'annotation', 'draws instrument sightlines and readout paths'));
    }
    if ((fields || []).some((field) => /network|node-link/.test(field.visualEncoding))) {
      base.push(visualOperator('agent-network-routing', 'field', 'draws queue and routing pressure through graph edges'));
    }
    if ((materials || []).some((material) => material.emissive)) {
      base.push(visualOperator('emissive-bloom', 'lighting', 'adds bounded glow for hot or charged materials'));
    }
    if ((geometry || []).some((row) => row.primitive === 'volume-ribbon')) {
      base.push(visualOperator('volume-ribbons', 'geometry', 'renders transparent media and plumes with depth'));
    }
    if ((motion || []).some((row) => /orbit|wave/.test(row.grammar))) {
      base.push(visualOperator('phase-trails', 'motion', 'renders orbit, acoustic, or wave phase trails'));
    }
    if ((causalAffordances || []).length) {
      base.push(visualOperator(
        'causal-affordance-program',
        'process',
        'composes hand-authored causal geometry, shader, and motion hints'
      ));
    }
    if (graphicsAtomCount(graphicsAtoms)) {
      base.push(visualOperator(
        'visual-operator-atlas',
        'operator-basis',
        'composes reusable graphics atoms from grounded physical operators'
      ));
    }
    return base;
  }

  function visualOperator(id, stage, reason) {
    return { id, stage, reason };
  }

  function visualReceiptsForIR(
    entities,
    materials,
    fields,
    processes,
    operators,
    rendererPlan,
    causalAffordances = [],
    graphicsAtoms = {},
    renderInstances = []
  ) {
    const objectLedger = rendererPlan && rendererPlan.visualObjectLedger || {};
    const acceptedObjectCount = Number(objectLedger.acceptedCount || entities.length || 0);
    const rejectedObjectCount = Number(objectLedger.rejectedCount || 0);
    return [
      {
        id: 'receipt:entities',
        reason: `${entities.length} grounded visual entities compiled from graph objects`,
        count: entities.length,
        acceptedCount: entities.filter(visualRowAccepted).length,
        rejectedSourceObjectCount: rejectedObjectCount,
        sourceGraphIds: entities.map((row) => row.sourceGraphId || row.sourceObject || row.id).filter(Boolean).slice(0, 16),
      },
      {
        id: 'receipt:materials',
        reason: `${materials.length} material shader rows selected from object materials and semantic plan`,
        count: materials.length,
        acceptedCount: materials.filter(visualRowAccepted).length,
      },
      {
        id: 'receipt:fields',
        reason: `${fields.length} visible field encodings compiled from PhysicsIR/render fields`,
        count: fields.length,
        acceptedCount: fields.filter(visualRowAccepted).length,
      },
      {
        id: 'receipt:processes',
        reason: `${processes.length} process motion grammars compiled from solver families`,
        count: processes.length,
        acceptedCount: processes.filter(visualRowAccepted).length,
      },
      {
        id: 'receipt:visual-object-acceptance',
        reason: `${acceptedObjectCount} accepted visual graph objects; ${rejectedObjectCount} support objects rejected from visual evidence`,
        count: acceptedObjectCount + rejectedObjectCount,
        acceptedCount: acceptedObjectCount,
        rejectedCount: rejectedObjectCount,
        acceptedIds: (objectLedger.acceptedIds || []).slice(0, 16),
        rejectedIds: (objectLedger.rejectedIds || []).slice(0, 16),
      },
      {
        id: 'receipt:render-instances',
        reason: `${renderInstances.length} explicit render instances compiled from accepted VisualIR rows`,
        count: renderInstances.length,
        acceptedCount: renderInstances.filter(visualRowAccepted).length,
        instanceIds: renderInstances.map((row) => row.id).slice(0, 16),
        layerSlots: uniqueList(renderInstances.map((row) => row.layerSlot).filter(Boolean)).slice(0, 16),
      },
      {
        id: 'receipt:operators',
        reason: `${operators.length} low-level renderer operators scheduled`,
        count: operators.length,
      },
      {
        id: 'receipt:recipe',
        reason: rendererPlan && rendererPlan.visualRecipe
          ? `handwritten style recipe ${rendererPlan.visualRecipe.sceneKind} provides defaults only`
          : 'no style recipe; VisualIR uses object and field structure',
        count: rendererPlan && rendererPlan.visualRecipe ? 1 : 0,
      },
      {
        id: 'receipt:causal-affordances',
        reason: `${(causalAffordances || []).length} causal affordance rows compiled into visual program hints`,
        count: (causalAffordances || []).length,
        affordanceIds: (causalAffordances || []).map((row) => row.id).slice(0, 12),
        causalRelationIds: uniqueList((causalAffordances || []).map((row) => row.causalRelationId).filter(Boolean)).slice(0, 12),
        shaderHints: uniqueList((causalAffordances || []).flatMap((row) => row.shaderHints || [])).slice(0, 16),
        motionHints: uniqueList((causalAffordances || []).flatMap((row) => row.motionHints || [])).slice(0, 16),
      },
      {
        id: 'receipt:graphics-atoms',
        reason: `${graphicsAtomCount(graphicsAtoms)} reusable graphics atoms compiled from the visual operator atlas`,
        count: graphicsAtomCount(graphicsAtoms),
        atlasId: graphicsAtoms && graphicsAtoms.atlasId || '',
        compiler: graphicsAtoms && graphicsAtoms.compiler || '',
        mappingIds: (graphicsAtoms && graphicsAtoms.mappings || []).map((row) => row.id).slice(0, 12),
        uniformSlots: graphicsAtoms && graphicsAtoms.uniforms &&
          Object.keys(graphicsAtoms.uniforms.bySlot || {}).filter((slot) => graphicsAtoms.uniforms.bySlot[slot] > 0),
        wgslOperators: (graphicsAtoms && graphicsAtoms.wgslOperators || []).slice(0, 16),
        geometryAtoms: (graphicsAtoms && graphicsAtoms.geometry || []).map((row) => row.id).slice(0, 12),
        fieldAtoms: (graphicsAtoms && graphicsAtoms.fields || []).map((row) => row.id).slice(0, 12),
        materialAtoms: (graphicsAtoms && graphicsAtoms.materials || []).map((row) => row.id).slice(0, 12),
        processAtoms: (graphicsAtoms && graphicsAtoms.processes || []).map((row) => row.id).slice(0, 12),
        motionAtoms: (graphicsAtoms && graphicsAtoms.motion || []).map((row) => row.id).slice(0, 12),
        languageSignalCount: (graphicsAtoms && graphicsAtoms.languageSignals || []).length,
        languageSignals: (graphicsAtoms && graphicsAtoms.languageSignals || [])
          .map((row) => row.id || row.kind || row.text)
          .filter(Boolean)
          .slice(0, 12),
      },
    ];
  }

  function graphicsAtomCount(graphicsAtoms = {}) {
    return ['geometry', 'fields', 'materials', 'processes', 'motion', 'camera']
      .reduce((total, key) => total + ((graphicsAtoms[key] || []).length), 0);
  }

  function visualSafeId(value) {
    return String(value || 'row').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'row';
  }

  function visualScaleForScene(sceneKind, entities) {
    const text = `${sceneKind} ${(entities || []).map((entity) => entity.label).join(' ')}`.toLowerCase();
    if (/cell|protein|micro|molecule|catalyst|biofilm/.test(text)) return 'micro';
    if (/planet|orbit|space|galaxy|comet|asteroid/.test(text)) return 'orbital';
    if (/city|market|traffic|hospital|warehouse|railway|zoning/.test(text)) return 'system';
    if (/terrain|watershed|hazard|atmosphere|storm|reef|peatland/.test(text)) return 'landscape';
    return 'bench';
  }

  function visualCameraForScene(sceneKind, recipe, entities) {
    const scale = visualScaleForScene(sceneKind, entities);
    const mode = recipe && recipe.camera ||
      (scale === 'micro' ? 'microscopic-cutaway-depth'
        : scale === 'orbital' ? 'orbital-depth'
          : scale === 'system' ? 'network-map-depth'
            : scale === 'landscape' ? 'topographic-cutaway-depth'
              : 'instrumented-lab-depth');
    return {
      mode,
      scale,
      framing: /network|system|map/.test(mode) ? 'wide-system' : /micro/.test(mode) ? 'macro-detail' : 'explanatory-three-quarter',
      depth: /depth|cutaway|orbital/.test(mode) ? 'layered' : 'flat',
    };
  }

  function visualLightingForScene(sceneKind, recipe, visualGenome) {
    const palette = visualGenome && visualGenome.palette || {};
    const text = `${sceneKind} ${recipe && recipe.materialLanguage || ''}`.toLowerCase();
    const model = /space|optics|transparent|orbital/.test(text) ? 'spectral-rim'
      : /clinical|chemistry|cultural/.test(text) ? 'instrumented-clinical'
        : /hazard|thermal|plasma|energy/.test(text) ? 'volumetric-emissive'
          : /water|restoration|ecology/.test(text) ? 'underwater-atmospheric'
            : /digital|civic|venue/.test(text) ? 'monitor-and-map'
              : 'soft-lab';
    return {
      model,
      keyHue: palette.hue || 180,
      rimHue: palette.accentHue || 220,
      shadowHue: palette.shadowHue || 34,
      contrast: palette.contrast || 0.68,
    };
  }

  function visualGenomeForComposition(graph, objects, fields, solverPlan, spec, sceneKind) {
    const genomeObjects = genomeSourceObjects(objects);
    const compiledText = compiledVisualGenomeText(graph, genomeObjects, fields, solverPlan, spec, sceneKind);
    const objectSignature = uniqueList((genomeObjects || []).map((object) => [
      object.id,
      object.shape,
      object.material,
      object.role,
      object.phrase,
      object.assembly,
      object.visualRegime,
    ].filter(Boolean).join(':'))).join('|');
    const fieldSignature = uniqueList((fields || []).map((field) => field.kind || field.channel)).join('|');
    const solverSignature = uniqueList([
      ...((solverPlan && solverPlan.executableSteps) || []),
      ...((solverPlan && solverPlan.steps) || []),
    ]).join('|');
    const seedText = [compiledText, sceneKind, objectSignature, fieldSignature, solverSignature].join('|');
    const seed = hashProgram(seedText) || 1;
    const directObjectSignature = uniqueList((genomeObjects || [])
      .filter(isPromptGroundedGenomeObject)
      .map((object) => [
        object.id,
        object.shape,
        object.material,
        object.role,
        object.phrase,
        object.assembly,
        object.visualRegime,
      ].filter(Boolean).join(':'))).join('|');
    const motifText = `${compiledText} ${directObjectSignature}`.toLowerCase();
    const tokens = compiledTokensForGenome(compiledText);
    const visualDna = compiledDnaForGenome(compiledText, seed);
    const motifs = genomeMotifs(motifText, sceneKind, genomeObjects, fields);
    const semanticVisuals = semanticVisualsForGenome(compiledText, genomeObjects, fields, sceneKind, seed, tokens);
    const palette = genomePalette(sceneKind, motifs, seed);
    const morphology = genomeMorphology(sceneKind, motifs, seed, genomeObjects, fields, visualDna, semanticVisuals);
    return {
      schema: VISUAL_GENOME_SCHEMA,
      id: `vg_${seed.toString(36).padStart(6, '0')}`,
      seed,
      sourceHash: hashProgram(compiledText),
      source: 'compiled-artifact-seeded-procedural',
      sceneKind,
      palette,
      morphology,
      motifs,
      tokens,
      visualDna,
      semanticVisuals,
      objectSignature: hashProgram(objectSignature),
      fieldSignature: hashProgram(fieldSignature),
      stochastic: {
        mode: 'deterministic-compiled-artifact-seeded',
        sampler: 'hash-noise',
        dimensions: [
          'semantic-atlas',
          'semantic-archetype',
          'material-shader',
          'process-overlay',
          'ngram-dna',
          'palette',
          'layout',
          'texture',
          'motif',
          'scale',
          'field-density',
        ],
      },
    };
  }

  function genomeSourceObjects(objects) {
    return (objects || []).filter((object) => {
      const source = String(object && object.source || '');
      if (source && source !== 'catalog') return true;
      if (object && (object.semanticRef || object.physicalRef)) return true;
      return false;
    });
  }

  function compiledVisualGenomeText(graph, objects, fields, solverPlan, spec, sceneKind) {
    const visualAffordances = causalAffordancesFromSpec(spec, sceneKind);
    return [
      sceneKind,
      ...(objects || []).map((object) => [
        object.id,
        object.shape,
        object.material,
        object.role,
        object.phrase,
        object.assembly,
        object.visualRegime,
        object.source,
        object.semanticRef,
        object.physicalRef,
      ].filter(Boolean).join(' ')),
      ...(fields || []).map((field) => [
        field.id,
        field.kind,
        field.channel,
        field.stateBinding,
        field.domainId,
      ].filter(Boolean).join(' ')),
      ...((solverPlan && solverPlan.executableSteps) || []),
      ...((solverPlan && solverPlan.steps) || []),
      ...visualAffordances.map((row) => [
        row.id,
        row.causalRelationId,
        row.sceneKind,
        row.geometry,
        ...(row.shaderHints || []),
        ...(row.motionHints || []),
      ].filter(Boolean).join(' ')),
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function compiledTokensForGenome(value) {
    const stop = new Set([
      'and', 'with', 'the', 'into', 'from', 'over', 'under', 'while',
      'primitive', 'semantic', 'open', 'generated', 'component', 'material',
      'process', 'physics', 'sample', 'field', 'domain', 'state', 'visual',
      'render', 'body', 'catalog', 'prompt', 'derived', 'generic',
    ]);
    return uniqueList(String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]+/g, ' ')
      .split(/\s+/)
      .map((token) => token.replace(/^-+|-+$/g, ''))
      .flatMap((token) => token.split('-'))
      .map((token) => token.replace(/^-+|-+$/g, ''))
      .filter((token) => token.length > 2 && !/^\d+$/.test(token) && !stop.has(token))
      .slice(0, 32));
  }

  function compiledDnaForGenome(compiledText, seed) {
    const rawTokens = compiledTokensForGenome(compiledText).slice(0, 24);
    const sourceTokens = rawTokens.length ? rawTokens : ['blank'];
    const ngrams = [];
    for (let n = 1; n <= 3; n += 1) {
      for (let index = 0; index <= sourceTokens.length - n; index += 1) {
        const text = sourceTokens.slice(index, index + n).join(' ');
        const hash = hashProgram(`${n}:${index}:${text}:${seed}`);
        ngrams.push({
          text,
          n,
          index,
          hash,
          lane: hash % 7,
          mark: hash % 9,
          hue: normalizeHue(hash % 360),
          weight: Number((0.42 + unitFromSeed(hash, n + index + 1) * 0.58).toFixed(3)),
        });
      }
    }
    const selected = ngrams
      .sort((a, b) => a.index - b.index || b.n - a.n || a.text.localeCompare(b.text))
      .slice(0, 32);
    const hash = hashProgram(selected.map((row) => `${row.n}:${row.index}:${row.text}:${row.hash}`).join('|'));
    return {
      schema: 'simulatte.compiledVisualDna.v1',
      catalog: PROCEDURAL_VISUAL_BASE && PROCEDURAL_VISUAL_BASE.schema || 'simulatte.proceduralVisualBase.v1',
      hash,
      tokenCount: sourceTokens.length,
      ngramCount: ngrams.length,
      ngrams: selected,
      paletteShift: Math.round(unitFromSeed(hash || seed, 41) * 160) - 80,
      densityBias: Number((0.72 + unitFromSeed(hash || seed, 43) * 1.1).toFixed(3)),
      laneBias: Math.round(unitFromSeed(hash || seed, 47) * 6),
    };
  }

  function semanticVisualsForGenome(compiledText, objects, fields, sceneKind, seed, tokens) {
    const text = String(compiledText || '').toLowerCase();
    const sourceTokens = tokens && tokens.length ? tokens : compiledTokensForGenome(compiledText);
    const archetypes = semanticVisualRows(text, seed, SEMANTIC_ARCHETYPE_RULES, 'archetype', sourceTokens);
    const materials = semanticVisualRows(text, seed, SEMANTIC_MATERIAL_RULES, 'material', sourceTokens);
    const processes = semanticVisualRows(text, seed, SEMANTIC_PROCESS_RULES, 'process', sourceTokens);
    const overlayIds = uniqueList([
      ...archetypes.map((row) => row.overlay),
      ...materials.map((row) => row.shader),
      ...processes.map((row) => row.overlay),
    ].filter(Boolean)).slice(0, 18);
    const matchedTokens = uniqueList([
      ...archetypes.flatMap((row) => row.matchedTokens || []),
      ...materials.flatMap((row) => row.matchedTokens || []),
      ...processes.flatMap((row) => row.matchedTokens || []),
    ]);
    const addressableTokens = atlasAddressableTokens(sourceTokens);
    const coverage = addressableTokens.length
      ? Number((matchedTokens.filter((token) => addressableTokens.includes(token)).length / addressableTokens.length).toFixed(3))
      : 1;
    const signatureText = [
      sceneKind,
      ...archetypes.map((row) => row.id),
      ...materials.map((row) => row.id),
      ...processes.map((row) => row.id),
      ...overlayIds,
    ].join('|');
    return {
      schema: 'simulatte.semanticVisualPlan.v1',
      atlas: SEMANTIC_VISUAL_ATLAS && SEMANTIC_VISUAL_ATLAS.schema || 'simulatte.semanticVisualAtlas.v1',
      signature: hashProgram(signatureText),
      sceneKind,
      archetypes,
      materials,
      processes,
      overlays: overlayIds,
      quality: {
        semanticTokens: sourceTokens.length,
        addressableTokens: addressableTokens.length,
        matchedTokens: matchedTokens.length,
        coverage,
        unmatchedTokens: addressableTokens.filter((token) => !matchedTokens.includes(token)),
        layerCount: archetypes.length + materials.length + processes.length,
      },
    };
  }

  function semanticVisualRows(text, seed, rules, kind, tokens) {
    return rules
      .map((rule, index) => {
        const matchesPattern = rule.pattern.test(text);
        const matchedTokens = (tokens || []).filter((token) => rule.terms.includes(token));
        if (!matchedTokens.length) return null;
        const tokenBoost = Math.min(0.28, matchedTokens.length * 0.07);
        const score = Number((rule.weight + tokenBoost + unitFromSeed(seed, index + rule.salt) * 0.06).toFixed(3));
        return {
          id: `${kind}.${rule.id}`,
          family: rule.family,
          label: rule.label,
          overlay: rule.overlay,
          shader: rule.shader,
          motion: rule.motion,
          score,
          hue: normalizeHue(rule.hue + Math.round((unitFromSeed(seed, index + 101) - 0.5) * 38)),
          matchedTokens,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, 9);
  }

  function atlasAddressableTokens(tokens) {
    const terms = new Set([
      ...SEMANTIC_ARCHETYPE_RULES.flatMap((rule) => rule.terms),
      ...SEMANTIC_MATERIAL_RULES.flatMap((rule) => rule.terms),
      ...SEMANTIC_PROCESS_RULES.flatMap((rule) => rule.terms),
    ]);
    return uniqueList((tokens || []).filter((token) => terms.has(token)));
  }

  const SEMANTIC_ARCHETYPE_RULES = Object.freeze([
    semanticRule('built-enclosure', 'architecture', 'Built enclosure', /\b(building|house|room|warehouse|factory|office|school|hospital|stairwell|corridor|hallway|roof|wall|city|street)\b/, ['building', 'house', 'room', 'warehouse', 'factory', 'office', 'school', 'hospital', 'stairwell', 'corridor', 'hallway', 'roof', 'wall', 'city', 'street'], 'section-grid', 34, 0.78, 11),
    semanticRule('water-system', 'hydrology', 'Water system', /\b(water|river|rain|brine|ocean|undersea|swamp|wetland|pond|fluid|flow|channel|delta)\b/, ['water', 'river', 'rain', 'brine', 'ocean', 'undersea', 'swamp', 'wetland', 'pond', 'fluid', 'flow', 'channel', 'delta'], 'flow-map', 194, 0.76, 17),
    semanticRule('optical-bench', 'optics', 'Optical bench', /\b(glass|lens|prism|laser|mirror|sunlight|beam|photon|caustic|film|optics)\b/, ['glass', 'lens', 'prism', 'laser', 'mirror', 'sunlight', 'beam', 'photon', 'caustic', 'film', 'optics'], 'ray-caustics', 208, 0.79, 23),
    semanticRule('magnetic-field', 'electromagnetism', 'Magnetic field', /\b(magnet|coil|current|ferrofluid|electric|battery|copper|conductor|charge|field)\b/, ['magnet', 'coil', 'current', 'ferrofluid', 'electric', 'battery', 'copper', 'conductor', 'charge', 'field'], 'flux-lines', 268, 0.76, 29),
    semanticRule('living-network', 'biology', 'Living network', /\b(moss|algae|mycelium|cell|bacteria|membrane|protein|plant|leaf|growth|nutrient)\b/, ['moss', 'algae', 'mycelium', 'cell', 'bacteria', 'membrane', 'protein', 'plant', 'leaf', 'growth', 'nutrient'], 'branch-field', 116, 0.78, 31),
    semanticRule('granular-bed', 'granular', 'Granular bed', /\b(sand|dust|grain|bead|powder|sieve|avalanche|sediment|pile)\b/, ['sand', 'dust', 'grain', 'bead', 'powder', 'sieve', 'avalanche', 'sediment', 'pile'], 'grain-stream', 42, 0.74, 37),
    semanticRule('waveguide', 'acoustics', 'Waveguide', /\b(sound|acoustic|wave|pressure|resonance|tube|brass|levitator)\b/, ['sound', 'acoustic', 'wave', 'pressure', 'resonance', 'tube', 'brass', 'levitator'], 'pressure-rings', 196, 0.75, 41),
    semanticRule('machine-assembly', 'mechanics', 'Machine assembly', /\b(turbine|wheel|rotor|gear|motor|pump|robot|hammer|bridge|mechanism|machine)\b/, ['turbine', 'wheel', 'rotor', 'gear', 'motor', 'pump', 'robot', 'hammer', 'bridge', 'mechanism', 'machine'], 'mechanism-cutaway', 216, 0.74, 43),
    semanticRule('operations-network', 'civic', 'Operations network', /\b(queue|traffic|market|subway|grid|logistics|route|sensor|warehouse|robot)\b/, ['queue', 'traffic', 'market', 'subway', 'grid', 'logistics', 'route', 'sensor', 'warehouse', 'robot'], 'route-ledger', 172, 0.74, 47),
    semanticRule('geologic-body', 'geology', 'Geologic body', /\b(rock|stone|basalt|crystal|quartz|mountain|volcano|mineral|ceramic|porcelain)\b/, ['rock', 'stone', 'basalt', 'crystal', 'quartz', 'mountain', 'volcano', 'mineral', 'ceramic', 'porcelain'], 'faceted-strata', 52, 0.72, 53),
    semanticRule('sky-orbit', 'astronomy', 'Sky orbit', /\b(orbit|orbital|sun|space|spaceship|rocket|mirror|solar|planet|black hole)\b/, ['orbit', 'orbital', 'sun', 'space', 'spaceship', 'rocket', 'mirror', 'solar', 'planet'], 'orbital-arcs', 246, 0.72, 59),
    semanticRule('weather-system', 'weather', 'Weather system', /\b(storm|smoke|cloud|wind|plume|humid|air|rain|thermal)\b/, ['storm', 'smoke', 'cloud', 'wind', 'plume', 'humid', 'air', 'rain', 'thermal'], 'weather-shear', 198, 0.7, 61),
    semanticRule('electronics-bench', 'electronics', 'Electronics bench', /\b(circuit|battery|wire|sensor|camera|microphone|antenna|server|signal|ledger)\b/, ['circuit', 'battery', 'wire', 'sensor', 'camera', 'microphone', 'antenna', 'server', 'signal', 'ledger'], 'circuit-board', 146, 0.72, 67),
    semanticRule('chemical-vessel', 'chemistry', 'Chemical vessel', /\b(reaction|acid|base|salt|electrolyte|foam|gel|molecule|ion|crystallize)\b/, ['reaction', 'acid', 'base', 'salt', 'electrolyte', 'foam', 'gel', 'molecule', 'ion', 'crystallize'], 'reaction-vessel', 86, 0.72, 71),
  ]);

  const SEMANTIC_MATERIAL_RULES = Object.freeze([
    semanticMaterialRule('glass', 'transparent', /\b(glass|lens|prism|mirror|transparent|crystal)\b/, ['glass', 'lens', 'prism', 'mirror', 'transparent', 'crystal'], 'transparent-caustic', 206, 0.78, 103),
    semanticMaterialRule('metal', 'metal', /\b(metal|steel|copper|brass|gold|graphite|conductor|wire|coil)\b/, ['metal', 'steel', 'copper', 'brass', 'gold', 'graphite', 'conductor', 'wire', 'coil'], 'brushed-metal', 48, 0.74, 107),
    semanticMaterialRule('concrete', 'concrete', /\b(concrete|building|warehouse|stairwell|wall|street|factory)\b/, ['concrete', 'building', 'warehouse', 'stairwell', 'wall', 'street', 'factory'], 'aggregate-concrete', 92, 0.72, 109),
    semanticMaterialRule('plant', 'biological', /\b(moss|algae|mycelium|plant|leaf|wood|nutrient|biofilm)\b/, ['moss', 'algae', 'mycelium', 'plant', 'leaf', 'wood', 'nutrient', 'biofilm'], 'fibrous-biology', 116, 0.78, 113),
    semanticMaterialRule('water', 'fluid', /\b(water|brine|rain|river|pond|ocean|fluid|wetland|swamp)\b/, ['water', 'brine', 'rain', 'river', 'pond', 'ocean', 'fluid', 'wetland', 'swamp'], 'fluid-ripples', 194, 0.74, 127),
    semanticMaterialRule('fire', 'thermal', /\b(fire|flame|ember|smoke|heat|lava|molten|thermal)\b/, ['fire', 'flame', 'ember', 'smoke', 'heat', 'lava', 'molten', 'thermal'], 'thermal-glow', 22, 0.78, 131),
    semanticMaterialRule('granular', 'granular', /\b(sand|dust|grain|bead|powder|sediment|porcelain|ceramic)\b/, ['sand', 'dust', 'grain', 'bead', 'powder', 'sediment', 'porcelain', 'ceramic'], 'particle-matrix', 42, 0.72, 137),
    semanticMaterialRule('electric', 'electric', /\b(battery|electric|charge|current|signal|circuit|sensor)\b/, ['battery', 'electric', 'charge', 'current', 'signal', 'circuit', 'sensor'], 'charged-grid', 152, 0.74, 139),
    semanticMaterialRule('ice', 'ice', /\b(ice|frozen|cold|crystal|quartz)\b/, ['ice', 'frozen', 'cold', 'crystal', 'quartz'], 'ice-facets', 196, 0.7, 149),
  ]);

  const SEMANTIC_PROCESS_RULES = Object.freeze([
    semanticProcessRule('burn', 'burn', /\b(burn|burning|fire|flame|combust|smoke|char)\b/, ['burn', 'burning', 'fire', 'flame', 'combust', 'smoke', 'char'], 'burn-front', 'rise', 22, 0.78, 181),
    semanticProcessRule('flow', 'flow', /\b(flow|pump|river|leak|channel|wave|current|brine|water)\b/, ['flow', 'pump', 'river', 'leak', 'channel', 'wave', 'current', 'brine', 'water'], 'flow-trails', 'advect', 194, 0.74, 191),
    semanticProcessRule('growth', 'growth', /\b(grow|growth|sprout|mycelium|algae|cell|biofilm|nutrient)\b/, ['grow', 'growth', 'sprout', 'mycelium', 'algae', 'cell', 'biofilm', 'nutrient'], 'growth-front', 'branch', 116, 0.76, 193),
    semanticProcessRule('fracture', 'fracture', /\b(fracture|crack|break|shatter|damage|impact|collision)\b/, ['fracture', 'crack', 'break', 'shatter', 'damage', 'impact', 'collision'], 'fracture-mask', 'snap', 214, 0.74, 197),
    semanticProcessRule('queue', 'queue', /\b(queue|traffic|route|reroute|jam|grid|market|logistics)\b/, ['queue', 'traffic', 'route', 'reroute', 'jam', 'grid', 'market', 'logistics'], 'queue-pulses', 'pulse', 172, 0.74, 199),
    semanticProcessRule('focus', 'focus', /\b(focus|focusing|lens|laser|mirror|sunlight|beam|caustic)\b/, ['focus', 'focusing', 'lens', 'laser', 'mirror', 'sunlight', 'beam', 'caustic'], 'focus-cone', 'converge', 208, 0.76, 211),
    semanticProcessRule('levitate', 'levitate', /\b(levitate|levitator|suspend|sort|dust|acoustic)\b/, ['levitate', 'levitator', 'suspend', 'sort', 'dust', 'acoustic'], 'levitation-nodes', 'hover', 196, 0.72, 223),
    semanticProcessRule('crystallize', 'crystallize', /\b(crystallize|crystal|quartz|sinter|freeze|facet)\b/, ['crystallize', 'crystal', 'quartz', 'sinter', 'freeze', 'facet'], 'crystal-growth', 'facet', 188, 0.72, 227),
    semanticProcessRule('orbit', 'orbit', /\b(orbit|orbital|swarm|planet|mirror|space|rocket)\b/, ['orbit', 'orbital', 'swarm', 'planet', 'mirror', 'space', 'rocket'], 'orbit-trails', 'orbit', 246, 0.72, 229),
    semanticProcessRule('melt', 'melt', /\b(melt|molten|lava|sinter|kiln|heat|thermal)\b/, ['melt', 'molten', 'lava', 'sinter', 'kiln', 'heat', 'thermal'], 'melt-drips', 'drip', 28, 0.72, 233),
    semanticProcessRule('charge', 'charge', /\b(charge|battery|current|electric|signal|coil|magnet)\b/, ['charge', 'battery', 'current', 'electric', 'signal', 'coil', 'magnet'], 'charge-flow', 'spark', 152, 0.72, 239),
    semanticProcessRule('leak', 'leak', /\b(leak|leaking|spill|seep|electrolyte|drip)\b/, ['leak', 'leaking', 'spill', 'seep', 'electrolyte', 'drip'], 'leak-drops', 'drip', 188, 0.73, 241),
    semanticProcessRule('rotate', 'rotate', /\b(turbine|wheel|rotor|gear|spin|rotate|orbiting)\b/, ['turbine', 'wheel', 'rotor', 'gear', 'spin', 'rotate', 'orbiting'], 'rotation-trails', 'rotate', 218, 0.73, 251),
    semanticProcessRule('pump', 'pump', /\b(pump|pumps|breathes|breathing|heart|peristaltic)\b/, ['pump', 'pumps', 'breathes', 'breathing', 'heart', 'peristaltic'], 'pump-waves', 'pulse', 124, 0.72, 257),
    semanticProcessRule('erode', 'erode', /\b(erode|erosion|carve|carves|sediment|rain|channel)\b/, ['erode', 'erosion', 'carve', 'carves', 'sediment', 'rain', 'channel'], 'erosion-cuts', 'cut', 42, 0.72, 263),
    semanticProcessRule('sort', 'sort', /\b(sort|sorts|sieve|filter|classify|dust|beads)\b/, ['sort', 'sorts', 'sieve', 'filter', 'classify', 'dust', 'beads'], 'sorting-bands', 'sort', 66, 0.72, 269),
    semanticProcessRule('resonate', 'resonate', /\b(resonate|resonance|acoustic|sound|tube|waveguide)\b/, ['resonate', 'resonance', 'acoustic', 'sound', 'tube', 'waveguide'], 'resonance-rings', 'oscillate', 196, 0.72, 271),
  ]);

  function semanticRule(id, family, label, pattern, terms, overlay, hue, weight, salt) {
    return { id, family, label, pattern, terms, overlay, hue, weight, salt };
  }

  function semanticMaterialRule(id, family, pattern, terms, shader, hue, weight, salt) {
    return { id, family, label: `${id} material`, pattern, terms, shader, hue, weight, salt };
  }

  function semanticProcessRule(id, family, pattern, terms, overlay, motion, hue, weight, salt) {
    return { id, family, label: `${id} process`, pattern, terms, overlay, motion, hue, weight, salt };
  }

  function isPromptGroundedGenomeObject(object) {
    const source = String(object && object.source || '');
    return /^embedding-guided-synth|open-semantic-rag|doppler-residual|render-ir/.test(source) ||
      Boolean(source && source !== 'catalog' && object && object.phrase);
  }

  function genomeMotifs(text, sceneKind, objects, fields) {
    const motifs = [];
    const scene = String(sceneKind || '').toLowerCase();
    const add = (...values) => values.forEach((value) => {
      if (value && !motifs.includes(value)) motifs.push(value);
    });
    if (sceneKind === 'fire' || sceneKind === 'thermal-plume') add('ember-shear', 'smoke-strata', 'charred-edges');
    if (sceneKind === 'acoustic') add('pressure-rings', 'waveguide-lines', 'resonant-slits');
    if (sceneKind === 'planetary-space') add('orbital-arcs', 'limb-glow', 'trajectory-dust');
    if (sceneKind === 'city' || sceneKind === 'civic-market' || sceneKind === 'digital-network') add('route-weave', 'signal-ticks', 'node-ledger');
    if (sceneKind === 'optics' || sceneKind === 'quantum-instrument' || sceneKind === 'particle-instrument') add('caustic-ribs', 'spectral-slices', 'thin-line-optics');
    if (sceneKind === 'biology' || sceneKind === 'molecular-biology' || sceneKind === 'restoration-water') add('branch-network', 'cellular-mesh', 'membrane-rims');
    if (sceneKind === 'granular') add('grain-strata', 'impact-trails', 'sorting-bands');
    if (sceneAllowsMotifFamily(scene, 'architecture') &&
      /building|tower|castle|house|room|wall|structure|street|city|warehouse|factory|office|school|hospital|stairwell|corridor|hallway|basement|garage|roof|shed|cabin/.test(text)) {
      add('architectural-grid', 'occluded-windows', 'structural-silhouette');
    }
    if (sceneAllowsMotifFamily(scene, 'fire') &&
      /fire|flame|burn|smoke|ember|ash|plume|heat/.test(text)) {
      add('ember-shear', 'smoke-strata', 'charred-edges');
    }
    if (sceneAllowsMotifFamily(scene, 'water') &&
      /water|river|brine|rain|swamp|wetland|erosion|sediment|delta|ocean|pond|swim|swimming/.test(text)) {
      add('flow-contours', 'sediment-bands', 'wet-refraction');
    }
    if (sceneAllowsMotifFamily(scene, 'optics') &&
      /glass|lens|prism|laser|optics|mirror|sunlight|beam|photon|caustic|film/.test(text)) {
      add('caustic-ribs', 'spectral-slices', 'thin-line-optics');
    }
    if (sceneAllowsMotifFamily(scene, 'magnetic') &&
      /magnet|magnetic|coil|current|ferrofluid|dipole|rotor/.test(text)) {
      add('flux-hatching', 'dipole-dust', 'coil-shadow');
    }
    if (sceneAllowsMotifFamily(scene, 'granular') &&
      /grain|sand|bead|sieve|powder|avalanche|granular/.test(text)) {
      add('grain-strata', 'impact-trails', 'sorting-bands');
    }
    const biologicalMotifPattern = scene === 'watershed'
      ? /biology|cell|bacteria|mycelium|membrane|protein|leaf|plant|dog|cat|animal|flower|tree|forest|mangrove|root|biomass|ecology|ecological/
      : /biology|cell|bacteria|mycelium|membrane|growth|protein|leaf|plant|dog|cat|animal|flower|tree|forest|root|biomass|ecology|ecological/;
    if (sceneAllowsMotifFamily(scene, 'biology') && biologicalMotifPattern.test(text)) {
      add('branch-network', 'cellular-mesh', 'membrane-rims');
    }
    if (sceneAllowsMotifFamily(scene, 'acoustic') &&
      /sound|acoustic|resonance|wave|tube|instrument/.test(text)) {
      add('pressure-rings', 'waveguide-lines', 'resonant-slits');
    }
    if (sceneAllowsMotifFamily(scene, 'fracture') &&
      /crack|fracture|collision|impact|hammer|projectile|break/.test(text)) {
      add('fracture-lines', 'stress-rulers', 'impact-ghosts');
    }
    if (sceneAllowsMotifFamily(scene, 'network') &&
      (/queue|traffic|market|network|grid|sensor|ledger|power|subway/.test(text) || sceneKind === 'city')) {
      add('route-weave', 'signal-ticks', 'node-ledger');
    }
    const fieldKinds = uniqueList((fields || []).map((field) => field.kind)).join(' ');
    if (/reaction|combustion/.test(fieldKinds)) add('reaction-front');
    if (/optical/.test(fieldKinds)) add('ray-stack');
    if (/network/.test(fieldKinds)) add('route-weave');
    if (!motifs.length) {
      const regimes = uniqueList((objects || []).map((object) => object.visualRegime)).filter(Boolean);
      add(...regimes.slice(0, 3).map((regime) => `${regime}-field`));
    }
    return motifs.slice(0, 9);
  }

  function sceneAllowsMotifFamily(sceneKind, family) {
    const scene = String(sceneKind || '').toLowerCase();
    if (family === 'architecture') return /city|civic|digital|venue|mechanical|fire|literal|robotics|manufacturing|structural/.test(scene);
    if (family === 'fire') return /fire|thermal-plume|hazard|weather-atmosphere/.test(scene);
    if (family === 'water') return /watershed|water|restoration|ocean|cryosphere|optics|thin-film|biology|ecology|particle-instrument/.test(scene);
    if (family === 'optics') return /optics|thin-film|quantum|particle|space|planetary|cultural-material/.test(scene);
    if (family === 'magnetic') return /magnetic|ferrofluid|grid-energy|advanced-energy|electric|particle-instrument/.test(scene);
    if (family === 'granular') return /granular|watershed|geology|restoration|ocean-cryosphere/.test(scene);
    if (family === 'biology') return /biology|ecology|restoration|agro|clinical|watershed/.test(scene);
    if (family === 'acoustic') return /acoustic/.test(scene);
    if (family === 'fracture') return /mechanical|robotics|literal|particle|structural|ocean-cryosphere/.test(scene);
    if (family === 'network') return /city|civic|digital|venue|grid-energy|network|logistics|robotics/.test(scene);
    return true;
  }

  function genomePalette(sceneKind, motifs, seed) {
    const sceneHue = {
      fire: 22,
      optics: 208,
      city: 172,
      watershed: 194,
      'magnetic-machine': 278,
      'material-tray': 42,
      biology: 116,
      acoustic: 196,
      ferrofluid: 238,
      'thin-film': 302,
      granular: 38,
      'thermal-plume': 18,
      mechanical: 206,
      'literal-composite': 148,
    };
    const motifShift = motifs.includes('architectural-grid') ? 34
      : motifs.includes('caustic-ribs') ? 74
        : motifs.includes('branch-network') ? -36
          : motifs.includes('route-weave') ? 18
            : 0;
    const hue = normalizeHue((sceneHue[sceneKind] ?? 156) + motifShift + Math.round((unitFromSeed(seed, 1) - 0.5) * 58));
    const accentHue = normalizeHue(hue + 82 + Math.round(unitFromSeed(seed, 2) * 112));
    const shadowHue = normalizeHue(hue + 206 + Math.round(unitFromSeed(seed, 3) * 42));
    return {
      hue,
      accentHue,
      shadowHue,
      warmth: Number(unitFromSeed(seed, 4).toFixed(3)),
      contrast: Number((0.54 + unitFromSeed(seed, 5) * 0.36).toFixed(3)),
      lightness: Number((0.44 + unitFromSeed(seed, 6) * 0.24).toFixed(3)),
    };
  }

  function genomeMorphology(sceneKind, motifs, seed, objects, fields, visualDna = null, semanticVisuals = null) {
    const layoutModes = ['strata', 'section', 'radial', 'field-map', 'network', 'specimen'];
    const textureKinds = ['contour-hatch', 'woven-grid', 'cutaway-lines', 'spectral-ribs', 'grain-scan'];
    const motifText = motifs.join(' ');
    const layoutMode = /route|network|ledger/.test(motifText) || sceneKind === 'city'
      ? 'network'
      : /architecture|structural|fracture/.test(motifText) ? 'section'
        : /flow|sediment|smoke|grain/.test(motifText) ? 'strata'
          : /caustic|flux|pressure|ray/.test(motifText) ? 'radial'
            : layoutModes[Math.floor(unitFromSeed(seed, 7) * layoutModes.length) % layoutModes.length];
    const textureKind = /caustic|ray|spectral/.test(motifText)
      ? 'spectral-ribs'
      : /grain|sediment|strata/.test(motifText) ? 'grain-scan'
        : /architecture|route|network|grid/.test(motifText) ? 'woven-grid'
          : textureKinds[Math.floor(unitFromSeed(seed, 8) * textureKinds.length) % textureKinds.length];
    const objectCount = Math.max(1, (objects || []).length);
    const fieldCount = Math.max(1, (fields || []).length);
    const dnaDensity = visualDna && Number.isFinite(visualDna.densityBias) ? visualDna.densityBias : 1;
    const semanticLayerCount = semanticVisuals && semanticVisuals.quality
      ? Math.min(8, Number(semanticVisuals.quality.layerCount) || 0)
      : 0;
    return {
      layoutMode,
      textureKind,
      strokeWeight: Number((0.7 + unitFromSeed(seed, 9) * 1.7).toFixed(3)),
      grain: Number((0.22 + unitFromSeed(seed, 10) * 0.62).toFixed(3)),
      bandCount: 5 + Math.round(unitFromSeed(seed, 11) * 11),
      particleDensity: Math.round((18 + unitFromSeed(seed, 12) * 70 + Math.min(42, fieldCount * 4)) * dnaDensity),
      flowCurl: Number((0.14 + unitFromSeed(seed, 13) * 0.72).toFixed(3)),
      objectScale: Number((0.86 + unitFromSeed(seed, 14) * 0.34 + Math.min(0.22, objectCount * 0.006)).toFixed(3)),
      fieldComplexity: 3 + Math.round(unitFromSeed(seed, 15) * 6) + Math.min(4, fieldCount) + semanticLayerCount,
      asymmetry: Number((0.18 + unitFromSeed(seed, 16) * 0.74).toFixed(3)),
    };
  }

  function normalizeHue(value) {
    return ((Math.round(value) % 360) + 360) % 360;
  }

  function unitFromSeed(seed, salt) {
    return hashProgram(`${seed}:${salt}`) / 4294967295;
  }

  function prioritizeObjectsForScene(objects, sceneKind) {
    const rows = (objects || []).map((object, index) => ({
      object,
      index,
      priority: sceneObjectPriority(object, sceneKind),
    }));
    const filtered = rows.filter((row) => row.priority >= 0);
    const source = filtered.length ? filtered : rows;
    return source
      .sort((a, b) => b.priority - a.priority || a.index - b.index)
      .slice(0, 24)
      .map((row) => row.object);
  }

  function visualObjectAcceptanceLedger(objects, sceneKind, spec) {
    const promptText = compiledPromptTextForSelection(spec);
    const rows = (objects || []).map((object, index) => {
      const receipt = visualObjectAcceptanceReceipt(object, sceneKind, promptText, index);
      return { object, index, ...receipt };
    });
    const hasPromptGrounded = rows.some((row) => row.promptGrounded);
    for (const row of rows) {
      const decision = visualObjectAcceptanceDecision(row.object, sceneKind, promptText, hasPromptGrounded);
      row.status = decision.status;
      row.reason = decision.reason;
      row.confidence = decision.confidence;
      row.promptGrounded = row.promptGrounded || decision.promptGrounded === true;
      row.supportOnly = decision.supportOnly === true;
    }
    if (!rows.some((row) => row.status === 'accepted') && rows.length) {
      const best = rows
        .slice()
        .sort((a, b) => sceneObjectPriority(b.object, sceneKind) - sceneObjectPriority(a.object, sceneKind) || a.index - b.index)[0];
      best.status = 'accepted';
      best.reason = 'last visual seed retained because no prompt-grounded visual object survived';
      best.confidence = 0.35;
      best.supportOnly = true;
    }
    const receipts = rows.map((row) => visualObjectAcceptanceSummary(row));
    const accepted = rows
      .filter((row) => row.status === 'accepted')
      .map((row) => annotateAcceptedVisualObject(row.object, row));
    const rejected = rows
      .filter((row) => row.status !== 'accepted')
      .map((row) => visualObjectAcceptanceSummary(row));
    const acceptedRows = receipts.filter((row) => row.status === 'accepted');
    return {
      accepted,
      rejected,
      receipts,
      summary: {
        schema: 'simulatte.visualObjectAcceptanceLedger.v1',
        sceneKind,
        promptGroundedCount: rows.filter((row) => row.promptGrounded).length,
        acceptedCount: acceptedRows.length,
        rejectedCount: receipts.length - acceptedRows.length,
        acceptedIds: acceptedRows.map((row) => row.id).slice(0, 16),
        rejectedIds: receipts.filter((row) => row.status !== 'accepted').map((row) => row.id).slice(0, 16),
        rows: receipts.slice(0, 32),
      },
    };
  }

  function visualObjectAcceptanceReceipt(object, sceneKind, promptText, index) {
    const source = String(object && object.source || '');
    const phrase = object && (object.phrase || object.role || object.id) || '';
    const promptGrounded = visualPromptGroundedObject(object, promptText);
    return {
      schema: 'simulatte.visualObjectAcceptance.v1',
      id: object && object.id || `object-${index + 1}`,
      sourceGraphId: object && object.id || '',
      sourceKind: source || 'compiled-object',
      sourceIds: uniqueList([
        object && object.id,
        object && object.semanticRef,
        object && object.physicalRef,
      ].filter(Boolean)).slice(0, 6),
      sceneKind,
      phrase,
      promptGrounded,
      status: 'rejected',
      confidence: 0,
      reason: '',
    };
  }

  function visualPromptGroundedObject(object, promptText) {
    const source = String(object && object.source || '');
    const phrase = object && (object.phrase || object.role || object.id) || '';
    if (source === 'semantic-surface-grounder') return phraseMatchesPrompt(phrase, promptText);
    if (/^embedding-guided-synth-environment/.test(source) && phrase && !phraseMatchesPrompt(phrase, promptText)) {
      return false;
    }
    if (/^embedding-guided-synth/.test(source) && phrase) {
      return phraseMatchesPrompt(phrase, promptText) || /\b(event|node)\b/.test(source);
    }
    return isPromptGroundedComponent(object, promptText);
  }

  function visualObjectAcceptanceDecision(object, sceneKind, promptText, hasPromptGrounded) {
    const source = String(object && object.source || '');
    const phrase = object && (object.phrase || object.role || object.id) || '';
    const phraseMatched = phraseMatchesPrompt(phrase, promptText);
    const promptGrounded = visualPromptGroundedObject(object, promptText);
    if (promptGrounded) {
      return {
        status: 'accepted',
        reason: 'source graph row is prompt-grounded visual intent',
        confidence: phraseMatched ? 0.96 : 0.86,
        promptGrounded: true,
      };
    }
    if (/^embedding-guided-synth-environment/.test(source) && hasPromptGrounded) {
      return {
        status: 'rejected',
        reason: 'embedding-near environment did not match prompt surface terms',
        confidence: 0.18,
        supportOnly: true,
      };
    }
    if (source === 'catalog') {
      if (catalogSupportIsPrompted(object, promptText)) {
        return {
          status: 'accepted',
          reason: 'catalog support is explicitly named by the prompt',
          confidence: 0.72,
          supportOnly: false,
        };
      }
      if (hasPromptGrounded) {
        return {
          status: 'rejected',
          reason: 'catalog solver support kept out of visual evidence',
          confidence: 0.22,
          supportOnly: true,
        };
      }
    }
    if (source && source !== 'catalog' && phraseMatched) {
      return {
        status: 'accepted',
        reason: 'compiled source row phrase matches prompt evidence',
        confidence: 0.82,
        promptGrounded: true,
      };
    }
    if (sceneCompatibleSupportComponent(object, sceneKind, promptText)) {
      return hasPromptGrounded
        ? {
          status: 'rejected',
          reason: 'scene-compatible support is not source-linked to prompt visual intent',
          confidence: 0.34,
          supportOnly: true,
        }
        : {
          status: 'accepted',
          reason: 'scene-compatible support retained only to seed a sparse visual graph',
          confidence: 0.48,
          supportOnly: true,
        };
    }
    return {
      status: 'rejected',
      reason: 'row is neither prompt-grounded nor compatible visual support',
      confidence: 0.12,
      supportOnly: true,
    };
  }

  function annotateAcceptedVisualObject(object, row) {
    return {
      ...object,
      visualStatus: 'accepted',
      visualConfidence: row.confidence,
      visualReason: row.reason,
      visualSourceGraphId: row.sourceGraphId,
      visualSourceKind: row.sourceKind,
      visualSourceIds: row.sourceIds,
      visualSupportOnly: row.supportOnly === true,
    };
  }

  function visualObjectAcceptanceSummary(row) {
    return {
      schema: row.schema,
      id: row.id,
      sourceGraphId: row.sourceGraphId,
      sourceKind: row.sourceKind,
      sourceIds: row.sourceIds,
      sceneKind: row.sceneKind,
      phrase: row.phrase,
      status: row.status,
      confidence: row.confidence,
      reason: row.reason,
      promptGrounded: row.promptGrounded === true,
      supportOnly: row.supportOnly === true,
    };
  }

  function sceneObjectPriority(object, sceneKind) {
    const source = String(object && object.source || '');
    const isCatalog = source === 'catalog';
    const text = [
      object.id,
      object.shape,
      object.material,
      object.visualRegime,
      object.role,
      object.phrase,
      object.assembly,
      object.source,
    ].join(' ').toLowerCase();
    if (/^embedding-guided-synth/.test(object.source || '')) return 12;
    const expandedPriority = expandedSceneObjectPriority(text, object, sceneKind);
    if (Number.isFinite(expandedPriority)) return expandedPriority;
    if (isPromptGroundedComponent(object)) return promptGroundedScenePriority(text, object, sceneKind);
    if (sceneKind === 'fire') {
      if (/optic|prism|lens|mirror|queue|traffic|network|river|water|erosion|sediment|terrain|growth-decay|population/.test(text)) return -1;
      if (/flame|fire|smoke|fuel|wood|thermal|heat|plume|pine|wind|air|ridge/.test(text)) return 8;
      return isCatalog ? -1 : 2;
    }
    if (sceneKind === 'thermal-plume') {
      if (/optic|prism|lens|mirror|queue|traffic|network/.test(text)) return -1;
      if (/thermal|plume|smoke|heat|cooling|fin|air|metal|conductor|sensor/.test(text)) return 8;
      return isCatalog ? -1 : 2;
    }
    if (sceneKind === 'ferrofluid') {
      if (/flame-front|fuel-bed|fire|smoke|queue|traffic/.test(text)) return -1;
      if (/ferrofluid|magnet|coil|current|copper|conductor|dipole|field|spike/.test(text)) return 8;
      return isCatalog ? -1 : 2;
    }
    if (sceneKind === 'thin-film') {
      if (/flame-front|fuel-bed|fire|queue|traffic|terrain/.test(text)) return -1;
      if (/soap|film|bubble|wire|loop|foam|membrane|light|optic|interference|air/.test(text)) return 8;
      return isCatalog ? -1 : 2;
    }
    if (sceneKind === 'granular') {
      if (/flame-front|fuel-bed|fire|smoke|optic|lens|prism/.test(text)) return -1;
      if (/granular|grain|bead|sieve|avalanche|powder|sand|rock|sediment|gravity/.test(text)) return 8;
      return isCatalog ? -1 : 2;
    }
    if (sceneKind === 'mechanical') {
      if (/embedding-guided-synth/.test(text)) return 10;
      if (/collision|friction|rigid-body|soft-body|wheel|wall|constraint|surface-boundary|energy-ledger|metal|rubber/.test(text)) return 6;
      return -1;
    }
    if (sceneKind === 'literal-composite') {
      if (/embedding-guided-synth/.test(text)) return 10;
      if (/black hole|singularity|swamp|wetland|hammer|gold|glass|fractur|collision|constraint|rigid-body/.test(text)) return 8;
      return -1;
    }
    if (sceneKind === 'city') {
      if (/flame-front|fuel-bed|fire|smoke|wood|thermal/.test(text)) return -1;
      if (/network|queue|traffic|market|power|sensor|ledger|delay|controller/.test(text)) return 8;
      return isCatalog ? -1 : 2;
    }
    if (sceneKind === 'optics') {
      if (/flame-front|fuel-bed|fire|smoke|wood|thermal/.test(text)) return -1;
      if (/optic|prism|lens|mirror|light|ray|glass|sensor|lamp/.test(text)) return 8;
      if (/water|fluid|flow|advection|pressure/.test(text)) return 4;
      return isCatalog ? -1 : 2;
    }
    if (sceneKind === 'watershed') {
      if (/flame-front|fuel-bed|fire|smoke|thermal/.test(text)) return -1;
      if (/catalog/.test(text)) {
        if (/water|river|flow|terrain|heightfield|erosion|channel|sand|soil|clay|rock|sediment|gravity|granular|grain|slope/.test(text)) return 6;
        return -1;
      }
      if (/water|river|flow|swim|swimming|terrain|mountain|mountaint|tree|plant|forest|erosion|sand|soil|rock|sediment|gravity|granular|grain|bead|sieve|avalanche|powder/.test(text)) return 8;
      return 2;
    }
    if (sceneKind === 'magnetic-machine') {
      if (/flame-front|fuel-bed|fire|smoke|thermal/.test(text)) return -1;
      if (/\b(rotor-wheel|stator-slider|solar-panel|motor-load)\b/.test(text)) return 10;
      if (/magnet|ferrofluid|coil|current|conductor|copper|rotor|stator|wheel|slider|solar|panel|motor|load|flux|dipole/.test(text)) return 8;
      return isCatalog ? -1 : 2;
    }
    if (sceneKind === 'biology') {
      if (/flame-front|fire|smoke|thermal/.test(text) ||
        (/fuel-bed/.test(text) && !/flower|plant|tree|leaf|root|biomass|ecological|biological/.test(text))) {
        return -1;
      }
      if (/catalog/.test(text)) {
        if (/leaf|soil|wood|root|gel|membrane|soft-body|growth-decay|diffusion|nutrient|biomass|water/.test(text)) return 5;
        return -1;
      }
      if (/dog|cat|mouse|gerbil|hamster|animal|mammal|flower|tree|plant|leaf|root|bio|cell|bacteria|mycelium|protein|gel|membrane|growth|infection/.test(text)) return 8;
      return 2;
    }
    if (sceneKind === 'acoustic') {
      if (/flame-front|fuel-bed|fire|smoke|thermal/.test(text)) return -1;
      if (/acoustic|sound|wave|pressure|resonance|emitter|tube|water|brass|membrane/.test(text)) return 8;
      return 1;
    }
    return 2;
  }

  function promptGroundedScenePriority(text, object, sceneKind) {
    const source = String(object && object.source || '');
    const directBoost = /^embedding-guided-synth|open-semantic-rag|semantic-surface-grounder|prompt-family|prompt-explicit|render-ir|doppler-residual/.test(source) ? 2 : 0;
    if (sceneKind === 'biology') {
      if (/dog|cat|mouse|gerbil|hamster|animal|mammal|flower|tree|plant|leaf|root|biomass|soft_tissue|soft-tissue|gel|membrane|growth|bio/.test(text)) {
        return 9 + directBoost;
      }
      return 5 + directBoost;
    }
    if (sceneKind === 'watershed') {
      if (/dog|cat|mouse|gerbil|hamster|animal|mammal|swim|swimming|water|pool|river|flow|pressure|fluid-advection|terrain|mountain|mountaint|tree|plant|forest|soil|rock|sediment/.test(text)) {
        return 9 + directBoost;
      }
      return 4 + directBoost;
    }
    if (sceneKind === 'mechanical') {
      if (/wheel|collision|crash|impact|constraint|animal-body|dog|cat|mouse|gerbil|hamster/.test(text)) return 7 + directBoost;
      return 4 + directBoost;
    }
    return 4 + directBoost;
  }

  function expandedSceneObjectPriority(text, object, sceneKind) {
    const source = String(object && object.source || '');
    const direct = /^embedding-guided-synth|open-semantic-rag|semantic-surface-grounder|prompt-explicit|render-ir|doppler-residual/.test(source);
    const directBoost = direct ? 3 : 0;
    const reject = (pattern) => (pattern.test(text) ? -1 : null);
    const keep = (pattern, score = 6) => (pattern.test(text) ? score + directBoost : null);
    const fallback = () => (direct ? 3 : -1);
    const choose = (...values) => values.find((value) => value !== null && value !== undefined);

    if (sceneKind === 'particle-instrument') {
      return choose(
        keep(/\b(collider|muon|particle|track|collision|plume|detector|calorimeter|field line|instrument|sensor|heat|thermal|electromagnetic|magnetic)\b/, 7),
        reject(/\b(queue|traffic|market|soil|bacteria|robot|warehouse)\b/),
        fallback()
      );
    }
    if (sceneKind === 'restoration-water') {
      return choose(
        keep(/\b(mangrove|root|storm|surge|sediment|brackish|tidal|channel|water|fluid|terrain|soil|biomass|granular|gravity|growth|ecological)\b/, 7),
        reject(/\b(magnet|optic|lens|thermal-source|queue|traffic|robot)\b/),
        fallback()
      );
    }
    if (sceneKind === 'evolution-ecology') {
      return choose(
        keep(/\b(microbiome|colony|colonies|metabolite|intestinal|immune|sampling|bacteria|cell|membrane|population|nutrient|diffusion|biological|ecology|organism)\b/, 7),
        reject(/\b(magnet|electromagnet|optics?|thermal-source|phase-change|queue|traffic|robot|warehouse)\b/),
        fallback()
      );
    }
    if (sceneKind === 'molecular-biology') {
      return choose(
        keep(/\b(protein|fold|bond|constraint|energy|molecular|chain|solvent|enzyme|ribosome|fermentation|sourdough|gluten|dough|yeast|bubble|acid|chemical|biological|soft-body|population)\b/, 7),
        reject(/\b(robot|warehouse|magnet|electromagnet|optics?|queue|traffic|thermal-source|phase-change-material)\b/),
        fallback()
      );
    }
    if (sceneKind === 'digital-network') {
      return choose(
        keep(/\b(server|rack|data center|cooling|aisle|controller|network|packet|queue|signal|heat|thermal|sensor|silicon|coolant)\b/, 7),
        reject(/\b(magnet|protein|bacteria|terrain|glacier|robot arm)\b/),
        fallback()
      );
    }
    if (sceneKind === 'civic-market') {
      return choose(
        keep(/\b(railway|dispatch|signal|block|train|agent|platform|slot|zoning|shadow|building|sunlight|pedestrian|parcel|market|queue|network|ledger|constraint)\b/, 7),
        reject(/\b(flame|smoke|protein|glacier|bacteria)\b/),
        fallback()
      );
    }
    if (sceneKind === 'planetary-space') {
      return choose(
        keep(/\b(planet|planetary|ring|moon|resonance|orbit|orbital|gravity|gap|boulder|ice|space|trajectory|density wave)\b/, 7),
        reject(/\b(queue|robot|warehouse|bacteria|thermal-source|fluid-advection|acoustic-emitter)\b/),
        fallback()
      );
    }
    if (sceneKind === 'ocean-cryosphere') {
      return choose(
        reject(/\b(acoustic-emitter|resonator|queue|network|robot|thermal-source|granular-bed)\b/),
        keep(/\b(glacier|calving|fjord|sea ice|iceberg|ice|ocean|water|wave|cryosphere|shelf|fluid|phase|fracture|stress|terrain)\b/, 7),
        fallback()
      );
    }
    if (sceneKind === 'robotics-control') {
      return choose(
        reject(/\b(protein|bacteria|glacier|plasma|fire|thermal-source|fluid-advection)\b/),
        keep(/\b(robot|robotic|arm|gripper|servo|workcell|manipulator|warehouse|conveyor|parcel|sort|task|sensor|feedback|force|contact|collision|friction|motor|metal)\b/, 7),
        fallback()
      );
    }
    return null;
  }

  function layoutObjectsForScene(objects, sceneKind, spec) {
    if (sceneKind === 'mechanical') return layoutMechanicalObjects(objects);
    if (sceneKind === 'thin-film') return layoutThinFilmObjects(objects);
    if (sceneKind === 'ferrofluid') return layoutFerrofluidObjects(objects);
    if (sceneKind === 'thermal-plume') return layoutThermalPlumeObjects(objects);
    if (sceneKind === 'literal-composite') return layoutLiteralCompositeObjects(objects);
    return layoutGenericSemanticObjects(objects, sceneKind);
  }

  function layoutGenericSemanticObjects(objects, sceneKind = '') {
    const slots = [
      [0.18, 0.34],
      [0.38, 0.28],
      [0.62, 0.32],
      [0.82, 0.42],
      [0.24, 0.66],
      [0.5, 0.62],
      [0.74, 0.68],
      [0.5, 0.82],
    ];
    let entityIndex = 0;
    let fieldIndex = 0;
    let readoutIndex = 0;
    return objects.map((object) => {
      if (object && object.pose && (Number.isFinite(Number(object.pose.x)) || Array.isArray(object.pose.points))) return object;
      const text = renderObjectText(object);
      const seed = hashProgram(`${sceneKind}:${object && object.id || ''}:${text}`) || 1;
      const jitterX = unitFromSeed(seed, 3) * 0.06 - 0.03;
      const jitterY = unitFromSeed(seed, 5) * 0.06 - 0.03;
      if (/field|flow|plume|matrix|volume|water|thermal|optical|chemical|gradient/.test(text)) {
        const y = /water|ocean|watershed|cryosphere/.test(sceneKind) ? 0.64 : 0.52;
        fieldIndex += 1;
        return withPose(object, clamp(0.5 + jitterX, 0.12, 0.88), clamp(y + jitterY + fieldIndex * 0.015, 0.14, 0.86), 0, [0.68, 0.42]);
      }
      if (/readout|meter|telemetry|panel|scope|measurement/.test(text)) {
        const x = readoutIndex % 2 ? 0.84 : 0.16;
        const y = 0.18 + Math.floor(readoutIndex / 2) * 0.12;
        readoutIndex += 1;
        return withPose(object, clamp(x + jitterX, 0.08, 0.92), clamp(y + jitterY, 0.08, 0.9), 0, [0.16, 0.1]);
      }
      const slot = slots[entityIndex % slots.length];
      const row = Math.floor(entityIndex / slots.length);
      entityIndex += 1;
      return withPose(
        object,
        clamp(slot[0] + jitterX, 0.08, 0.92),
        clamp(slot[1] + row * 0.08 + jitterY, 0.08, 0.92),
        unitFromSeed(seed, 7) * 0.2 - 0.1,
        [0.14 + unitFromSeed(seed, 11) * 0.08, 0.1 + unitFromSeed(seed, 13) * 0.06]
      );
    });
  }

  function layoutMechanicalObjects(objects) {
    let wheelIndex = 0;
    let animalIndex = 0;
    const wheelCount = objects.filter((object) => object.shape === 'wheel').length;
    const wheelSlots = wheelCount > 1 ? [[0.36, 0.56], [0.64, 0.56]] : [[0.42, 0.56]];
    return objects.map((object) => {
      const text = renderObjectText(object);
      if (object.shape === 'wheel') {
        const slot = wheelSlots[Math.min(wheelIndex, wheelSlots.length - 1)];
        wheelIndex += 1;
        return withPose(object, slot[0], slot[1], 0, [0.27, 0.27]);
      }
      if (object.shape === 'animal-body') {
        const slot = wheelSlots[Math.min(animalIndex, wheelSlots.length - 1)];
        animalIndex += 1;
        return withPose(object, slot[0], slot[1] + 0.015, 0.02, [0.17, 0.105]);
      }
      if (/wall|constraint|surface-boundary/.test(text)) return withPose(object, 0.78, 0.56, 0.02, [0.055, 0.34]);
      if (/collision|impact|crash|fractur/.test(text)) return withPose(object, 0.56, 0.51, 0, [0.12, 0.09]);
      if (/energy-ledger|meter/.test(text)) return withPose(object, 0.18, 0.78, -0.04, [0.11, 0.08]);
      return object;
    });
  }

  function layoutThinFilmObjects(objects) {
    let bubbleIndex = 0;
    const bubbleSlots = [[0.42, 0.43], [0.57, 0.51], [0.48, 0.58], [0.62, 0.4]];
    return objects.map((object) => {
      if (object.shape === 'film') return withPose(object, 0.5, 0.47, 0.02, [0.46, 0.34]);
      if (object.shape === 'wire-loop') return withPose(object, 0.5, 0.47, 0, [0.52, 0.38]);
      if (object.shape === 'bubble') {
        const slot = bubbleSlots[bubbleIndex % bubbleSlots.length];
        bubbleIndex += 1;
        return withPose(object, slot[0], slot[1], 0, [0.12, 0.12]);
      }
      return object;
    });
  }

  function layoutFerrofluidObjects(objects) {
    let conductorIndex = 0;
    return objects.map((object) => {
      const text = renderObjectText(object);
      if (/ferrofluid/.test(text)) return withPose(object, 0.5, 0.62, 0, [0.34, 0.18]);
      if (object.shape === 'coil') return withPose(object, 0.5, 0.34, 0.02, [0.32, 0.2]);
      if (/current|pulsing|dipole|field-envelope/.test(text)) return withPose(object, 0.5, 0.46, 0, [0.42, 0.3]);
      if (/copper|conductor|magnet|metal/.test(text)) {
        const x = conductorIndex % 2 ? 0.72 : 0.28;
        conductorIndex += 1;
        return withPose(object, x, 0.55, conductorIndex % 2 ? 0.1 : -0.1, [0.14, 0.09]);
      }
      return object;
    });
  }

  function layoutThermalPlumeObjects(objects) {
    return objects.map((object) => {
      const text = renderObjectText(object);
      if (object.shape === 'cooling-fins') return withPose(object, 0.5, 0.76, 0, [0.46, 0.18]);
      if (/thermal plume|plume|heat|thermal-source/.test(text)) {
        if (object.shape === 'flow-path') {
          return withPathPose(object, [[0.5, 0.76], [0.52, 0.55], [0.48, 0.28]]);
        }
        return withPose(object, 0.5, 0.6, 0, [0.12, 0.09]);
      }
      if (/air|smoke/.test(text)) return withPose(object, 0.56, 0.4, 0, [0.12, 0.1]);
      return object;
    });
  }

  function layoutLiteralCompositeObjects(objects) {
    return objects.map((object) => {
      const text = renderObjectText(object);
      const identity = `${object.id || ''} ${object.shape || ''} ${object.material || ''} ${object.role || ''}`.toLowerCase();
      if (/black hole|singularity/.test(identity) || /black hole|singularity/.test(text)) {
        return withPose(object, 0.78, 0.32, 0, [0.28, 0.28]);
      }
      if (/swamp|wetland/.test(identity) || /swamp|wetland/.test(text)) {
        return withPose(object, 0.46, 0.75, 0, [0.56, 0.22]);
      }
      if (/hammer/.test(identity)) return withPose(object, 0.48, 0.5, -0.38, [0.22, 0.14]);
      if (/gold/.test(identity)) return withPose(object, 0.34, 0.58, 0.05, [0.24, 0.08]);
      if (/glass|lens|prism/.test(identity)) return withPose(object, 0.58, 0.49, 0.08, [0.16, 0.14]);
      if (/fractur|collision|impact/.test(text)) return withPose(object, 0.61, 0.45, 0, [0.12, 0.09]);
      return object;
    });
  }

  function renderObjectText(object) {
    return [
      object && object.id,
      object && object.shape,
      object && object.material,
      object && object.role,
      object && object.phrase,
      object && object.assembly,
      object && object.source,
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function withPose(object, x, y, rotation = 0, size = null) {
    const pose = { ...(object.pose || {}), x, y, rotation };
    delete pose.points;
    if (size) {
      pose.w = size[0];
      pose.h = size[1];
    }
    return { ...object, pose };
  }

  function withPathPose(object, points) {
    return { ...object, pose: { ...(object.pose || {}), points } };
  }

  // Resolve the render registry lazily so script load order (browser) and lazy
  // require() (node) both work without a hard module-init dependency.
  function renderRegistryRef() {
    try {
      if (typeof module === 'object' && module.exports) {
        return require('../phase-06-simulation/simulatte-render-registry.js');
      }
    } catch (error) {
      /* fall through to global lookup */
    }
    const scope = typeof globalThis !== 'undefined' ? globalThis : window;
    return (scope && scope.SimulatteRenderRegistry) || null;
  }

  // Derive scene kind from semantic grounding outputs, using the SAME authority the
  // fast path uses: the RenderIR scene hint, recomputed from grounded objects +
  // PhysicsIR via sceneHintForObjects when no precomputed hint is present. The raw
  // composition `graph.operators` set is a candidate superset (every prompt lists
  // refraction/collision/magnetism/...), so it is deliberately NOT used for routing.
  // Returns 'generic' when the semantic signal is inconclusive so callers fall back
  // to prompt-keyword heuristics only as a last resort.
  function sceneKindFromSemantics(graph, objects, fields, spec) {
    const direct = normalizedSceneHint(spec && spec.renderIR && spec.renderIR.sceneHint);
    if (direct && direct !== 'literal-composite') return direct;
    const registry = renderRegistryRef();
    if (registry && typeof registry.sceneHintForObjects === 'function') {
      const hint = normalizedSceneHint(registry.sceneHintForObjects(
        objects || [],
        (spec && spec.physicsIR) || {},
        (spec && spec.solverGraph) || {}
      ));
      if (hint && hint !== 'literal-composite') return hint;
    }
    return 'generic';
  }

  // Semantic-first scene routing: grounded semantic outputs drive execution, the
  // prompt-keyword cascade is consulted only when the semantic signal is inconclusive.
  // This is the fix for the old defect where brittle phrase logic could override
  // stronger retrieval/grounding signals on the non-fast compile path.
  function resolveSceneKind(graph, objects, fields, spec) {
    const semantic = sceneKindFromSemantics(graph, objects, fields, spec);
    const promptText = directPromptSceneText((spec && spec.renderIR) || {}, spec || {});
    const objectText = (objects || []).map(renderObjectText).join(' ');
    const directScene = directSceneKindForText([promptText, objectText].join(' '), promptText);
    if (directScene && broadSceneHintCanYieldToDirectLanguage(semantic)) return directScene;
    if (semantic && semantic !== 'generic') return semantic;
    return sceneKindForComposition(graph, objects, fields, spec);
  }

  function sceneKindForComposition(graph, objects, fields, spec) {
    const operatorIds = new Set((graph.operators || []).map((operator) => operator.id));
    const promptText = compositionPromptText(graph, spec);
    const text = [
      promptText,
      (objects || []).map((object) => `${object.id} ${object.shape} ${object.role}`).join(' '),
      (fields || []).map((field) => field.kind).join(' '),
      Array.from(operatorIds).join(' '),
    ].join(' ').toLowerCase();
    if (/sample tray|material tray|raw material|materials|water air rock wood metal/.test(promptText)) {
      return 'material-tray';
    }
    if (/thermal plume|cooling fin|cooling fins/.test(promptText)) {
      return 'thermal-plume';
    }
    if (/ferrofluid|copper coil|pulsing current|magnetic spikes/.test(promptText)) {
      return 'ferrofluid';
    }
    if (hasThinFilmSignal(promptText)) {
      return 'thin-film';
    }
    if (hasAcousticWaveSignal(promptText)) {
      return 'acoustic';
    }
    if (/granular|beads|avalanche|sieve|powder/.test(promptText)) {
      return 'granular';
    }
    if (/\b(fire|flame|smoke|burn|burning|combust|wildfire|pine)\b|forest-fire/.test(promptText)) {
      return 'fire';
    }
    if (/projectile|crack|fracture|impact|collision/.test(promptText) && /tower|glass|wall|bridge|body/.test(promptText)) {
      return 'mechanical';
    }
    if (/storm waves|bridge cables|flex bridge|wave.*bridge|pressure wave/.test(promptText)) return 'acoustic';
    if (
      /rain carves|carves basalt|basalt delta|watershed|river|erosion|terrain|sediment|mountain|rain channel|sand|soil|rock ridges/.test(promptText) &&
      !/lava|magma|volcano|bridge|castle|mirror|spaceship|spacecraft|submarine|turbine/.test(promptText)
    ) {
      return 'watershed';
    }
    if (/algae grows|quartz wetland|grow|grows|growing|growth|biological|mycelium|bacteria|membrane|colony|infection|protein|fermentation|sourdough|gluten|dough|yeast/.test(promptText)) {
      return 'biology';
    }
    if (/solar magnetic|magnetic wheel|perpetual|magnetic motor|rotor|stator/.test(promptText)) {
      return 'magnetic-machine';
    }
    if (/\b(mouse|gerbil|hamster wheel|running wheel|crash|collision|impact)\b/.test(promptText)) {
      return 'mechanical';
    }
    if (/spaceship|spacecraft|rocket|submarine|volcano|lava|magma|piano|keyboard|castle|crystal tower|storm|turbine|algae|black hole|singularity|swamp|wetland|hammer|gold/.test(promptText)) {
      return 'literal-composite';
    }
    if (/city grid|traffic|market queue|feedback shock|power grid|queue|logistics/.test(promptText) || operatorIds.has('queueService')) {
      return 'city';
    }
    if (/acoustic|sound|pressure wave|waveguide|resonance|brass tube/.test(promptText)) {
      return 'acoustic';
    }
    if (/optics|prism|lens|mirror|laser|glass/.test(promptText) || operatorIds.has('refraction')) {
      return 'optics';
    }
    if (operatorIds.has('growthDecay')) {
      return 'biology';
    }
    if (hasRoboticsSignal(text)) return 'robotics-control';
    if (hasChemistryLabSignal(text)) return 'chemistry-lab';
    if (hasGranularCombustionSignal(text)) return 'granular';
    if (/thermal plume|cooling fin|heat plume/.test(text)) return 'thermal-plume';
    if (/ferrofluid|coil|current|copper conductor|magnetic spikes/.test(text)) return 'ferrofluid';
    if (hasThinFilmSignal(text)) return 'thin-film';
    if (hasAcousticWaveSignal(text)) return 'acoustic';
    if (/granular|grain-bed|bead|sieve|avalanche|powder/.test(text)) return 'granular';
    if (/flame|fuel-bed|fire-front|smoke|combust/.test(text)) return 'fire';
    if (/solar magnetic|magnetic-motor|rotor-wheel|stator-slider|dipole/.test(text) || operatorIds.has('magnetism')) {
      return 'magnetic-machine';
    }
    if (/acoustic|sound|wavefront|resonance|pressure/.test(text)) return 'acoustic';
    if (/sediment|terrain|basalt|delta/.test(text)) return 'watershed';
    if (/fluid|water|flow-path|advection|river/.test(text) || operatorIds.has('advection')) return 'watershed';
    if (/\b(atom|atomic|electron|ion|lattice|crystal)\b/.test(text)) return 'atomic';
    return 'generic';
  }

  function compositionPromptText(graph = {}, spec = {}) {
    const renderIR = spec.renderIR || {};
    const universeGraph = spec.universeGraph || {};
    const physicsIR = spec.physicsIR || {};
    const promptParse = spec.promptParse || {};
    return positiveLanguageText([
      renderIR.prompt,
      universeGraph.prompt,
      physicsIR.prompt,
      spec.name,
      graph.intentText,
      ...(promptParse.spans || []).map((span) => span.text),
    ].filter(Boolean).join(' '));
  }

  function hasAcousticWaveSignal(text = '') {
    const positive = positiveLanguageText(text);
    return /\b(acoustic|sound|standing wave|standing waves|pressure wave|pressure waves|waveguide|resonance|resonator|levitator|speaker|brass tube)\b/.test(positive) ||
      (/\b(dust|particle|particles)\b/.test(positive) &&
        /\b(levitate|levitator|standing|pressure|acoustic|sound|wave|tube|brass)\b/.test(positive));
  }

  function focusFieldsForScene(fields, sceneKind) {
    const registry = renderRegistryRef();
    const recipe = registry && typeof registry.recipeForScene === 'function'
      ? registry.recipeForScene(sceneKind)
      : null;
    if (recipe && Array.isArray(recipe.fieldKinds) && recipe.fieldKinds.length) {
      const wanted = new Set(recipe.fieldKinds);
      const focused = (fields || []).filter((field) => wanted.has(field.kind));
      if (focused.length) return focused;
      return recipe.fieldKinds.map((kind, index) => defaultFieldForKind(kind, index, sceneKind));
    }
    const allowed = {
      fire: ['thermal', 'gravity'],
      optics: ['optical-rays'],
      city: ['network-flow'],
      watershed: ['flow', 'gravity'],
      'magnetic-machine': ['dipole', 'radiation'],
      ferrofluid: ['dipole'],
      'thin-film': ['optical-rays'],
      granular: ['gravity'],
      'thermal-plume': ['thermal', 'gravity'],
      'material-tray': ['thermal', 'gravity'],
      biology: ['force-field'],
      mechanical: ['force-field', 'gravity'],
      'literal-composite': ['force-field', 'gravity'],
      acoustic: ['force-field'],
      fluid: ['gravity', 'force-field'],
      atomic: ['force-field'],
      generic: ['force-field'],
    };
    const wanted = new Set(allowed[sceneKind] || allowed.generic);
    const focused = (fields || []).filter((field) => wanted.has(field.kind));
    if (focused.length) return focused;
    if (sceneKind === 'optics' || sceneKind === 'thin-film') {
      return [{ id: 'scene-optical-rays', kind: 'optical-rays', from: [0.12, 0.46], to: [0.88, 0.56], strength: 0.72 }];
    }
    if (sceneKind === 'city') {
      return [{ id: 'scene-network-flow', kind: 'network-flow', strength: 0.72 }];
    }
    if (sceneKind === 'fire' || sceneKind === 'thermal-plume') {
      return [{ id: 'scene-thermal-field', kind: 'thermal', center: [0.5, 0.56], radius: 0.34, strength: 0.72 }];
    }
    if (sceneKind === 'magnetic-machine' || sceneKind === 'ferrofluid') {
      return [{ id: 'scene-dipole-field', kind: 'dipole', center: [0.54, 0.5], radius: 0.32, strength: 0.72 }];
    }
    if (sceneKind === 'watershed' || sceneKind === 'granular') {
      return [{ id: 'scene-gravity-flow', kind: 'gravity', from: [0.16, 0.16], to: [0.78, 0.84], strength: 0.68 }];
    }
    return [{ id: 'scene-force-field', kind: 'force-field', center: [0.52, 0.52], radius: 0.32, strength: 0.5 }];
  }

  function defaultFieldForKind(kind, index, sceneKind) {
    if (kind === 'network-flow') return { id: `scene-${sceneKind}-network-${index}`, kind, strength: 0.72 };
    if (kind === 'optical-rays') {
      return { id: `scene-${sceneKind}-rays-${index}`, kind, from: [0.1, 0.32], to: [0.88, 0.5], strength: 0.68 };
    }
    if (kind === 'gravity') {
      return { id: `scene-${sceneKind}-gravity-${index}`, kind, from: [0.18, 0.16], to: [0.78, 0.84], strength: 0.64 };
    }
    if (kind === 'flow') {
      return { id: `scene-${sceneKind}-flow-${index}`, kind, from: [0.14, 0.72], to: [0.86, 0.44], strength: 0.66 };
    }
    if (kind === 'thermal') {
      return { id: `scene-${sceneKind}-thermal-${index}`, kind, center: [0.52, 0.56], radius: 0.36, strength: 0.68 };
    }
    if (kind === 'dipole') {
      return { id: `scene-${sceneKind}-dipole-${index}`, kind, center: [0.54, 0.5], radius: 0.34, strength: 0.68 };
    }
    return { id: `scene-${sceneKind}-field-${index}`, kind, center: [0.52, 0.52], radius: 0.34, strength: 0.58 };
  }

  function dominantRegimeForScene(sceneKind, objects) {
    const registry = renderRegistryRef();
    const recipe = registry && typeof registry.recipeForScene === 'function'
      ? registry.recipeForScene(sceneKind)
      : null;
    if (recipe && recipe.dominantRegime) return recipe.dominantRegime;
    const map = {
      fire: 'thermal',
      optics: 'optical',
      city: 'network',
      watershed: 'fluid',
      'magnetic-machine': 'magnetic',
      ferrofluid: 'magnetic',
      'thin-film': 'optical',
      granular: 'granular',
      'thermal-plume': 'thermal',
      'material-tray': 'material',
      biology: 'biological',
      mechanical: 'mechanical',
      'literal-composite': 'composite',
      fluid: 'fluid',
      atomic: 'atomic',
      acoustic: 'acoustic',
      generic: 'generic',
    };
    if (map[sceneKind]) return map[sceneKind];
    const counts = new Map();
    for (const object of objects || []) {
      const key = object.visualRegime || 'generic';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'generic';
  }

  function renderPassOrder(sceneKind, solverFamilies) {
    const registry = renderRegistryRef();
    const recipe = registry && typeof registry.recipeForScene === 'function'
      ? registry.recipeForScene(sceneKind)
      : null;
    if (recipe && Array.isArray(recipe.passOrder) && recipe.passOrder.length) return recipe.passOrder.slice();
    const shared = ['clear', 'world-field', 'solver-overlay', 'objects', 'emissions'];
    if (sceneKind === 'fire') return ['clear', 'fuel-terrain', 'heat-field', 'flame-front', 'smoke-embers'];
    if (sceneKind === 'optics') return ['clear', 'optical-rail', 'beam-trace', 'surfaces', 'caustics'];
    if (sceneKind === 'city') return ['clear', 'route-grid', 'queue-flow', 'service-pulses', 'ledger'];
    if (sceneKind === 'watershed') return ['clear', 'terrain-height', 'water-channel', 'sediment', 'erosion'];
    if (sceneKind === 'magnetic-machine') return ['clear', 'flux-field', 'rotor', 'stator', 'energy'];
    if (sceneKind === 'ferrofluid') return ['clear', 'coil-field', 'fluid-spikes', 'dipoles', 'objects'];
    if (sceneKind === 'thin-film') return ['clear', 'film-frame', 'interference', 'bubbles', 'wire'];
    if (sceneKind === 'granular') return ['clear', 'sieve', 'bead-stream', 'pile', 'contacts'];
    if (sceneKind === 'thermal-plume') return ['clear', 'cooling-fins', 'plume', 'smoke-shear', 'sensors'];
    if (sceneKind === 'material-tray') return ['clear', 'tray-field', 'specimens', 'interactions', 'composite'];
    if (sceneKind === 'biology') return ['clear', 'nutrient-field', 'membranes', 'growth-front', 'cells'];
    if (sceneKind === 'mechanical') return ['clear', 'constraint-space', 'bodies', 'contacts', 'impulse-ledger'];
    if (sceneKind === 'literal-composite') return ['clear', 'environment', 'literal-objects', 'contacts', 'fields'];
    if (sceneKind === 'acoustic') return ['clear', 'waveguide', 'pressure-fronts', 'resonators', 'objects'];
    return uniqueList([...shared, ...(solverFamilies || [])]);
  }

  function refineSolverPlanForScene(plan, sceneKind) {
    if (!plan) return plan;
    if (sceneKind === 'biology') {
      return solverPlanWithSceneFamilies(plan, [
        'growth-diffusion',
        'membrane-relaxation',
        'scalar-coupled-state',
      ], ['growth-diffusion']);
    }
    if (sceneKind === 'watershed') {
      return solverPlanWithSceneFamilies(plan, [
        'particle-advection',
        'granular-settling',
        'growth-diffusion',
        'phase-boundary',
        'scalar-coupled-state',
      ], ['particle-advection']);
    }
    if (sceneKind !== 'mechanical') return plan;
    const families = uniqueList([
      'constraint-dynamics',
      ...(plan.families || []).filter((family) => family === 'membrane-relaxation'),
    ]);
    return {
      ...plan,
      families,
      state: uniqueList([
        ...(plan.state || []),
        'contact-manifold',
        'impulse',
        'angular-velocity',
      ]),
    };
  }

  function solverPlanWithSceneFamilies(plan, allowedFamilies, fallbackFamilies) {
    const allowed = new Set(allowedFamilies);
    const families = uniqueList((plan.families || []).filter((family) => allowed.has(family)));
    const finalFamilies = families.length ? families : fallbackFamilies.slice();
    return {
      ...plan,
      families: finalFamilies,
      state: uniqueList(finalFamilies.flatMap(stateTexturesForFamily)),
    };
  }

  function solverGraphStepsForScene(steps, sceneKind) {
    const rows = steps || [];
    const allow = sceneSolverStepPattern(sceneKind);
    if (!allow) return rows;
    return rows.filter((step) => allow.test(`${step.operatorType || ''} ${step.solverId || ''}`));
  }

  function sceneSolverStepPattern(sceneKind) {
    if (sceneKind === 'biology') return /\b(growth|diffusion|membrane|soft|nutrient|density)\b/;
    if (sceneKind === 'watershed') return /\b(advection|flow|fluid|erosion|gravity|growth|sediment|pressure)\b/;
    return null;
  }

  function expandedSceneKindForText(value) {
    const registry = renderRegistryRef();
    if (!registry || typeof registry.sceneHintForText !== 'function') return '';
    const scene = normalizedSceneHint(registry.sceneHintForText(value));
    return scene && scene !== 'generic' ? scene : '';
  }

  function baseSceneKindForPromptText(value) {
    const text = String(value || '').toLowerCase();
    if (!text) return '';
    if (/\b(fire|forest fire|wildfire|dry pine fire|building fire|warehouse fire|flame|combustion|burning)\b/.test(text)) {
      return 'fire';
    }
    if (/\b(lava|magma|steam|thermal plume|heat plume|cooling fin|cooling fins|smoke over cooling)\b/.test(text)) {
      return 'thermal-plume';
    }
    if (/\b(hamster wheel|mouse|gerbil|wheel crashing|collision|bridge|cable|fracture|impact|robot|mechanical)\b/.test(text)) {
      return 'mechanical';
    }
    if (/\b(ferrofluid|copper coil|pulsing current|magnetic spikes)\b/.test(text)) return 'ferrofluid';
    if (/\b(soap film|thin film|air bubble|wire loop|iridescen)\b/.test(text)) return 'thin-film';
    if (/\b(granular|beads|avalanche|sieve|powder)\b/.test(text)) return 'granular';
    if (/\b(optics|prism|lens|mirror|laser|glass lens)\b/.test(text)) return 'optics';
    if (/\b(city grid|traffic|market queue|power grid|queue|logistics)\b/.test(text)) return 'city';
    if (/\b(watershed|river|erosion|terrain|sediment|rain channel|soil|rock ridges)\b/.test(text)) return 'watershed';
    if (/\b(acoustic|sound|pressure wave|waveguide|resonance|brass tube)\b/.test(text)) return 'acoustic';
    if (/\b(protein|mycelium|bacteria|membrane|colony|infection)\b/.test(text)) return 'biology';
    return '';
  }

  function poseForNode(node, spec) {
    const [x, y] = node.placement.anchor || [0.5, 0.5];
    const base = sizeForNode(node, spec);
    if (node.shape === 'flow-path') {
      return { points: [[x - 0.08, y - 0.04], [x, y], [x + 0.12, y + 0.04]] };
    }
    return { x, y, w: base[0], h: base[1], rotation: node.placement.rotation || 0 };
  }

  function sizeForNode(node, spec) {
    const density = clamp(Number(spec.params && spec.params.complexity || 0.5), 0, 1);
    if (node.shape === 'wheel') return [0.24, 0.24];
    if (node.shape === 'animal-body') return [0.16, 0.1];
    if (node.shape === 'coil') return [0.16, 0.12];
    if (node.shape === 'wire-loop' || node.shape === 'film') return [0.2, 0.16];
    if (node.shape === 'bubble') return [0.12, 0.12];
    if (node.shape === 'cooling-fins' || node.shape === 'sieve') return [0.24, 0.12];
    if (node.shape === 'bridge') return [0.22, 0.1];
    if (node.shape === 'singularity') return [0.18, 0.18];
    if (node.shape === 'hammer') return [0.18, 0.12];
    if (node.shape === 'wetland') return [0.26, 0.16];
    if (node.shape === 'rocket') return [0.18, 0.11];
    if (node.shape === 'submarine') return [0.22, 0.11];
    if (node.shape === 'volcano') return [0.24, 0.18];
    if (node.shape === 'lava-flow') return [0.28, 0.1];
    if (node.shape === 'instrument') return [0.2, 0.12];
    if (node.shape === 'castle') return [0.22, 0.19];
    if (node.shape === 'tower') return [0.14, 0.22];
    if (node.shape === 'turbine') return [0.16, 0.16];
    if (node.shape === 'storm') return [0.32, 0.2];
    if (node.shape === 'plant-cluster') return [0.18, 0.16];
    if (node.shape === 'heightfield') return [0.64, 0.46];
    if (node.shape === 'queue-node' || node.shape === 'network-node') return [0.08, 0.08];
    if (node.shape === 'field-envelope') return [0.24 + density * 0.16, 0.24 + density * 0.16];
    if (node.layer === 'material') return [0.11, 0.09];
    return [0.1, 0.08];
  }

  function fieldsForComposition(graph, spec) {
    const operatorIds = new Set(graph.operators.map((operator) => operator.id));
    const fields = [];
    if (operatorIds.has('magnetism')) {
      fields.push({ id: 'magnetic-composition-field', kind: 'dipole', center: [0.58, 0.52], radius: 0.3, strength: spec.params.magneticStrength || 0.62 });
    }
    if (operatorIds.has('radiation')) {
      fields.push({ id: 'radiation-composition-field', kind: 'radiation', from: [0.03, 0.06], to: [0.3, 0.28], strength: (spec.params.irradiance || 780) / 1200 });
    }
    if (operatorIds.has('combustion') || operatorIds.has('heatTransfer')) {
      fields.push({ id: 'thermal-composition-field', kind: 'thermal', center: [0.46, 0.56], radius: 0.32, strength: spec.params.heatTransfer || 0.5 });
    }
    if (operatorIds.has('refraction')) {
      fields.push({ id: 'optical-composition-field', kind: 'optical-rays', from: [0.16, 0.47], to: [0.84, 0.56], strength: spec.params.lightIntensity || 0.56 });
    }
    if (operatorIds.has('queueService')) {
      fields.push({ id: 'network-composition-flow', kind: 'network-flow', strength: spec.params.serviceRate || 0.58 });
    }
    if (operatorIds.has('erosion') || operatorIds.has('gravity')) {
      fields.push({ id: 'gravity-composition-flow', kind: 'gravity', from: [0.18, 0.18], to: [0.76, 0.82], strength: spec.params.gravity || 0.18 });
    }
    if (!fields.length) fields.push({ id: 'combined-composition-field', kind: 'force-field', center: [0.52, 0.52], radius: 0.32, strength: 0.5 });
    return fields;
  }

  function emittersForComposition(graph) {
    const operators = new Set(graph.operators.map((operator) => operator.id));
    const emitters = [];
    if (operators.has('combustion')) {
      const source = graph.nodes.find((node) => /combust|flame|fire/.test(node.primitiveId));
      if (source) {
        emitters.push({ id: 'composition-embers', kind: 'particles', source: source.primitiveId, material: 'fire', rate: 0.5 });
        emitters.push({ id: 'composition-smoke', kind: 'plume', source: source.primitiveId, material: 'smoke', rate: 0.42 });
      }
    }
    if (operators.has('erosion')) {
      const source = graph.nodes.find((node) => /erosion|sand|soil/.test(node.primitiveId));
      if (source) emitters.push({ id: 'composition-sediment', kind: 'particles', source: source.primitiveId, material: 'sand', rate: 0.38 });
    }
    return emitters;
  }

  function solverPlanForComposition(graph, objects) {
    const operatorIds = new Set((graph.operators || []).map((operator) => operator.id));
    const regimes = new Set((objects || []).map((object) => object.visualRegime));
    const families = [];
    if (operatorIds.has('advection') || regimes.has('fluid')) families.push('particle-advection');
    if (operatorIds.has('heatTransfer') || regimes.has('thermal')) families.push('heat-diffusion');
    if (operatorIds.has('combustion')) families.push('reaction-front');
    if (operatorIds.has('refraction') || regimes.has('optical')) families.push('ray-optics');
    if (operatorIds.has('magnetism') || regimes.has('magnetic')) families.push('magnetic-vector-field');
    if (operatorIds.has('erosion') || regimes.has('granular')) families.push('granular-settling');
    if (operatorIds.has('growthDecay') || regimes.has('biological') || regimes.has('ecological')) families.push('growth-diffusion');
    if (operatorIds.has('collision') || regimes.has('mechanical')) families.push('constraint-dynamics');
    if (regimes.has('electrical')) families.push('electric-potential-field');
    if (regimes.has('acoustic')) families.push('wave-equation');
    if (regimes.has('soft')) families.push('membrane-relaxation');
    if (regimes.has('phase')) families.push('phase-boundary');
    if (!families.length) families.push('scalar-coupled-state');
    return {
      schema: 'simulatte.solverPlan.v1',
      integrator: 'mixed-semi-implicit',
      families: uniqueList(families),
      state: uniqueList(families.flatMap(stateTexturesForFamily)),
    };
  }

  function stateTexturesForFamily(family) {
    const map = {
      'particle-advection': ['velocity', 'density'],
      'heat-diffusion': ['temperature'],
      'reaction-front': ['fuel', 'product', 'temperature'],
      'ray-optics': ['light-paths', 'surface-normal'],
      'magnetic-vector-field': ['flux', 'force'],
      'granular-settling': ['height', 'sediment'],
      'growth-diffusion': ['population', 'nutrient'],
      'electric-potential-field': ['charge', 'potential'],
      'wave-equation': ['phase', 'amplitude'],
      'membrane-relaxation': ['tension', 'displacement'],
      'phase-boundary': ['phase', 'latent-heat'],
      'scalar-coupled-state': ['energy', 'field'],
    };
    return map[family] || [];
  }

  function componentText(component) {
    if (!component) return '';
    return [
      component.id,
      component.type,
      component.role,
      component.phrase,
      component.material,
      component.visualRegime,
      component.assembly,
      component.source,
      ...(component.domains || []),
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function inferLayer(component) {
    const text = componentText(component);
    if (/water|wood|metal|glass|rock|sand|soil|air|smoke|fire/.test(text)) return 'material';
    if (/gravity|field|diffusion|collision|constraint/.test(text)) return 'physics';
    if (/queue|graph|source|sink|ledger|threshold|delay/.test(text)) return 'math';
    return component.type || 'component';
  }

  function materialForComponent(component) {
    if (component && component.material) return component.material;
    const text = componentText(component);
    const identity = [
      component && component.id,
      component && component.type,
      component && component.role,
      component && component.phrase,
    ].filter(Boolean).join(' ').toLowerCase();
    if (/brine/.test(text)) return 'brine';
    if (/mercury/.test(text)) return 'mercury';
    if (/copper/.test(text)) return 'copper';
    if (/silicon/.test(text)) return 'silicon';
    if (/carbon/.test(text)) return 'carbon';
    if (/gold/.test(text)) return 'gold';
    if (/lava|magma|molten/.test(text)) return 'lava';
    if (/ice|frozen/.test(text)) return 'ice';
    if (/quartz|crystal/.test(text)) return 'quartz';
    if (/ferrofluid/.test(text)) return 'ferrofluid';
    if (/gel/.test(text)) return 'gel';
    if (/foam/.test(text)) return 'foam';
    if (/membrane/.test(text)) return 'membrane';
    if (/leaf/.test(text)) return 'leaf';
    if (/mycelium/.test(text)) return 'mycelium';
    if (/protein/.test(text)) return 'protein';
    if (/bacteria/.test(text)) return 'bacteria';
    if (/water|river|lake|submarine/.test(identity)) return 'water';
    if (/wood|biomass|fuel/.test(text)) return 'wood';
    if (/glass|lens|prism/.test(text)) return 'glass';
    if (/magnet/.test(text)) return 'magnet';
    if (/metal|motor|generator|wheel|rotor|spacecraft|spaceship|rocket|turbine|submarine/.test(text)) return 'metal';
    if (/sand/.test(text)) return 'sand';
    if (/soil|terrain/.test(text)) return 'soil';
    if (/fire|flame|combust|plasma|volcano/.test(text)) return 'fire';
    if (/smoke/.test(text)) return 'smoke';
    if (/rock|wall/.test(text)) return 'rock';
    if (/bubble|foam|soap/.test(text)) return 'foam';
    if (/film|membrane/.test(text)) return 'membrane';
    if (/air|wind/.test(text)) return 'air';
    return 'matte';
  }

  function shapeForComponent(component) {
    const componentId = String(component && component.id || '');
    if (componentId === 'rotor-wheel') return 'wheel';
    if (componentId === 'stator-slider') return 'slider';
    if (componentId === 'solar-panel') return 'panel';
    if (componentId === 'motor-load') return 'meter';
    if (component && component.assembly === 'flow') return 'flow-path';
    if (component && component.assembly === 'field') return 'field-envelope';
    if (component && component.assembly === 'network') return 'network-node';
    if (component && component.assembly === 'source') return 'source-field';
    const geometryShapes = ((component && component.geometry && component.geometry.shapes) || [])
      .join(' ')
      .toLowerCase();
    const text = componentText(component);
    const phrase = String(component && component.phrase || '').toLowerCase();
    const identity = `${component && component.id || ''} ${component && component.role || ''} ${component && component.material || ''}`.toLowerCase();
    const namedIdentity = `${component && component.id || ''} ${component && component.role || ''} ${phrase}`.toLowerCase();
    const specific = [
      component && component.id,
      component && component.type,
      component && component.role,
      component && component.material,
      component && component.visualRegime,
      component && component.assembly,
      component && component.source,
      ...((component && component.domains) || []),
    ].filter(Boolean).join(' ').toLowerCase();
    if (/\bgold\b|gold-/.test(identity)) return 'bar';
    if (/air-material|air material/.test(identity)) return /bubble/.test(text) ? 'bubble' : 'sample';
    if (/water-material|water material/.test(identity)) return 'pool';
    if (/rocket[_-]body|spacecraft|spaceship|rocket|satellite/.test(`${specific} ${geometryShapes}`)) return 'rocket';
    if (/submarine[_-]body|submarine|submersible/.test(`${specific} ${geometryShapes}`)) return 'submarine';
    if (/volcano|volcanic/.test(specific)) return 'volcano';
    const directShapeText = [
      component && component.id,
      component && component.type,
      component && component.role,
      component && component.material,
      component && component.visualRegime,
      component && component.assembly,
    ].filter(Boolean).join(' ').toLowerCase();
    if (/\b(detector|phototube|calorimeter|instrument|sensor[-_ ]?array|data[-_ ]?recorder|readout)\b/.test(directShapeText)) return 'instrument';
    if (/\b(pressure[-_ ]?vessel|water[-_ ]?tank|tank|chamber)\b/.test(directShapeText)) return 'wall';
    if (/\b(laser|lens|glass|prism)\b/.test(directShapeText) && /\b(optical|light|laser|lens|glass|prism)\b/.test(directShapeText)) {
      return /\bprism\b/.test(directShapeText) ? 'prism' : 'lens';
    }
    if (/\b(photon|light[-_ ]?source|radiation|optics)\b/.test(directShapeText)) return 'field-envelope';
    const ownIdentity = [
      component && component.id,
      component && component.type,
      component && component.role,
      component && component.material,
      component && component.visualRegime,
      component && component.assembly,
      ...((component && component.domains) || []),
    ].filter(Boolean).join(' ').toLowerCase();
    if (/\b(mouse|mice|gerbil|hamster|dog|cat|animal|mammal|organism)\b/.test(ownIdentity)) return 'animal-body';
    if (/\b(person|people|human|pedestrian|worker|patient|agent)\b/.test(ownIdentity)) return 'body';
    if (/\b(car|vehicle|truck|bus|train|railcar|rail_vehicle|wheeled_vehicle)\b/.test(ownIdentity)) return 'wheel';
    if (/\b(chair|chairs|couch|sofa|table|desk|bench|furniture|household_object)\b/.test(ownIdentity)) return 'body';
    if (/\b(cup|mug|bowl|container|glass-cup|glass cup)\b/.test(ownIdentity)) return 'sample';
    if (/\b(laptop|computer|screen|monitor|window)\b/.test(ownIdentity)) return 'panel';
    if (/\b(hammer|mallet)\b/.test(ownIdentity)) return 'hammer';
    if (/\b(knife|blade|tool|hand_tool)\b/.test(ownIdentity)) return 'bar';
    if (/\b(box|crate|package|parcel)\b/.test(ownIdentity)) return 'body';
    if (/\b(building|room|warehouse|factory|house|apartment|office|school|hospital|stairwell|corridor|hallway|basement|garage|roof|shed|cabin)\b/.test(namedIdentity) || /\bbox\b.*\bshell\b/.test(geometryShapes)) {
      return 'building';
    }
    if (/gear[_-]train|gearbox|wheel|rotor|gear/.test(`${specific} ${geometryShapes}`)) return 'wheel';
    if (/span[_-]structure|bridge|truss|span/.test(`${specific} ${geometryShapes}`)) return 'bridge';
    if (/crystal tower|crystal towers/.test(phrase) || (/\btower\b/.test(specific) && !/castle/.test(specific))) return 'tower';
    if (/castle/.test(`${specific} ${geometryShapes}`)) return 'castle';
    if (/lava[_-]flow|lava|magma|molten/.test(`${specific} ${geometryShapes}`)) return 'lava-flow';
    if (/instrument[_-]body|piano|keyboard|instrument/.test(`${specific} ${geometryShapes}`)) return 'instrument';
    if (/turbine|propeller|fan turbine/.test(`${specific} ${geometryShapes}`)) return 'turbine';
    if (/storm|hurricane|rainstorm/.test(specific)) return 'storm';
    if (/colony[_-]field|algae|plant cluster|plant_cluster/.test(`${specific} ${geometryShapes}`)) return 'plant-cluster';
    if (/prism/.test(identity)) return 'prism';
    if (/glass|lens/.test(identity)) return 'lens';
    if (/spacecraft|spaceship|rocket|satellite/.test(text)) return 'rocket';
    if (/submarine|submersible/.test(text)) return 'submarine';
    if (/volcano|volcanic/.test(text)) return 'volcano';
    if (/bridge|truss|span/.test(text)) return 'bridge';
    if (/crystal tower|crystal towers|tower/.test(text)) return 'tower';
    if (/ice castle|castle/.test(text)) return 'castle';
    if (/lava|magma|molten/.test(text)) return 'lava-flow';
    if (/piano|keyboard|instrument/.test(text)) return 'instrument';
    if (/turbine|propeller|fan turbine/.test(text)) return 'turbine';
    if (/storm|hurricane|rainstorm/.test(text)) return 'storm';
    if (/algae|plant cluster/.test(text)) return 'plant-cluster';
    if (/wheel|rotor|gear/.test(text)) return 'wheel';
    if (/\b(mouse|gerbil|hamster|dog|cat|animal|organism)\b/.test(text)) return 'animal-body';
    if (/ferrofluid/.test(text)) return 'pool';
    if (/black hole|singularity|event horizon/.test(text)) return 'singularity';
    if (/swamp|marsh|wetland/.test(text)) return 'wetland';
    if (/hammer|mallet/.test(text)) return 'hammer';
    if (/cooling fin|cooling fins|heat sink|heatsink/.test(text)) return 'cooling-fins';
    if (/sieve|screen|mesh/.test(text)) return 'sieve';
    if (/copper coil|coil|solenoid|winding/.test(text)) return 'coil';
    if (/wire loop|wire loops|loop/.test(text)) return 'wire-loop';
    if (/air bubble|air bubbles|bubble/.test(text)) return 'bubble';
    if (/soap thin film|thin film|soap film|film/.test(text)) return 'film';
    if (/forest-fire|fuel bed|biomass/.test(text)) return 'fuel-bed';
    if (/\b(ledger|meter|recorder)\b/.test(namedIdentity) || /\benergy-ledger\b/.test(text)) return 'meter';
    if (/solar|panel/.test(text)) return 'panel';
    if (/slider|actuator/.test(text)) return 'slider';
    if (/magnet/.test(text)) return 'magnet';
    if (/prism/.test(text)) return 'prism';
    if (/lens/.test(text)) return 'lens';
    if (/river|flow|pipe|channel|water-line/.test(text)) return 'flow-path';
    if (/queue/.test(text)) return 'queue-node';
    if (/network|graph|grid|signal/.test(text)) return 'network-node';
    if (/terrain|heightfield/.test(text)) return 'heightfield';
    if (/wall|boundary|constraint|ridge/.test(text)) return 'wall';
    if (/field/.test(text)) return 'field-envelope';
    if (/fire|flame|combust/.test(text)) return 'flame-front';
    if (/smoke|plume/.test(text)) return 'plume';
    if (component.layer === 'material') return sampleShape(component.id);
    return 'body';
  }

  function sampleShape(id) {
    if (/gold|copper|silicon|carbon|metal|magnet/.test(id)) return 'bar';
    if (/foam|gel|membrane/.test(id)) return 'membrane-field';
    if (/bacteria|mycelium|leaf|protein/.test(id)) return 'colony-field';
    if (/brine|mercury|water|oil|steam|smoke|ferrofluid/.test(id)) return 'pool';
    if (/ice/.test(id)) return 'castle';
    if (/glass|quartz|crystal/.test(id)) return 'lens';
    if (/sand|soil|clay|rock/.test(id)) return 'grain-bed';
    if (/wood|fabric|rubber/.test(id)) return 'slab';
    if (/fire|plasma/.test(id)) return 'flame-front';
    return 'sample';
  }

  function visualRegimeForNode(node) {
    const identityText = [
      node.primitiveId,
      node.material,
      node.shape,
      node.role,
      node.assembly,
      (node.domains || []).join(' '),
    ].join(' ').toLowerCase();
    const text = [
      identityText,
      node.phrase,
      node.source,
    ].join(' ').toLowerCase();
    if (/dog|cat|mouse|gerbil|hamster|animal|mammal|flower|tree|plant|root|mycelium|bacteria|protein|leaf|biology|population|colony|infection/.test(identityText)) return 'biological';
    if (/\b(train|railway|rail|subway|dispatch|signal block|signal blocks|platform|queue|traffic|market|logistics)\b/.test(identityText)) return 'network';
    if (/swim|swimming|underwater/.test(String(node.phrase || '').toLowerCase()) &&
      /water|fluid|flow|pressure|pool/.test(identityText)) return 'fluid';
    if (/mountain|mountaint|terrain|heightfield|soil|rock|sediment|clay|granular|grain/.test(identityText)) return 'granular';
    if (/lava|magma|molten|melt|phase|ice|crystal|castle/.test(identityText)) return 'phase';
    if (/volcano|fire|flame|plume|thermal|heat|combust|smoke/.test(identityText)) return 'thermal';
    if (/water|river|fluid|flow|pool|pond|lake|swim|swimming/.test(identityText)) return 'fluid';
    if (node && node.visualRegime) return node.visualRegime;
    if (/spacecraft|spaceship|rocket|satellite|submarine|turbine/.test(text)) return 'mechanical';
    if (/glacier|fjord|sea ice|iceberg|cryosphere|calving/.test(text)) return 'phase';
    if (/piano|keyboard|instrument|acoustic/.test(text)) return 'acoustic';
    if (/storm|hurricane|rainstorm/.test(text)) return 'fluid';
    if (/volcano|lava|magma|molten/.test(text)) return 'thermal';
    if (/membrane|gel|foam|fabric|soft|adhesion|cohesion/.test(text)) return 'soft';
    if (/\b(atom|electron|ion|molecule|crystal|lattice|atomic)\b/.test(text)) return 'atomic';
    if (/electric|charge|current|copper|silicon|conductor|plasma/.test(text)) return 'electrical';
    if (/sound|acoustic|standing wave|pressure wave|pressure waves|resonance/.test(text)) return 'acoustic';
    if (/phase|melt|freeze|boil|steam|ice/.test(text)) return 'phase';
    if (/fire|flame|plume|thermal|heat|combust|smoke/.test(text)) return 'thermal';
    if (/ferrofluid|magnet|metal|electro|wheel|motor|bar|rail|field/.test(text)) return 'magnetic';
    if (/water|river|fluid|flow|pool|air|wind|brine|mercury/.test(text)) return 'fluid';
    if (/glass|light|lens|prism|ray|mirror|sensor|panel|optics/.test(text)) return 'optical';
    if (/rock|wood|soil|sand|terrain|grain|fuel|wall|ridge/.test(text)) return 'granular';
    if (/queue|network|market|logistics|traffic/.test(text)) return 'network';
    return 'generic';
  }

  function primitiveProgramForNode(node) {
    const visualRegime = visualRegimeForNode(node);
    const seed = hashProgram(`${node.primitiveId}:${node.role}:${node.shape}`);
    return {
      schema: 'simulatte.primitiveProgram.v1',
      source: 'composition-primitive-program',
      shapeKey: `cg_${seed.toString(16).padStart(8, '0')}`,
      phrase: node.phrase || node.role || node.primitiveId,
      assembly: node.assembly || node.shape || node.type,
      visualRegime,
      material: node.material,
      parts: programParts(visualRegime, node.shape, seed),
      provenance: {
        primitiveId: node.primitiveId,
        tokenHash: seed >>> 0,
      },
    };
  }

  function programParts(visualRegime, shape, seed) {
    if (shape === 'wheel') return [
      part('flux-loop', 10, 0.12),
      part('ring', 6, 0.1),
      part('particle', 18, 0.08),
    ];
    if (shape === 'prism' || shape === 'lens') return [
      part('spectral-ray', 9, 0.22),
      part('caustic', 8, 0.12),
      part('field-line', 3, 0.06),
    ];
    if (shape === 'flow-path') return [
      part('stream', 9, 0.14),
      part('droplet', 26, 0.1),
      part('ripple', 5, 0.08),
    ];
    if (shape === 'flame-front' || shape === 'plume') return [
      part('plume', 12, 0.13),
      part('spark', 26, 0.17),
      part('phase-band', 4, 0.06),
    ];
    if (shape === 'queue-node' || shape === 'network-node') return [
      part('network-thread', 12, 0.12),
      part('pulse', 18, 0.1),
      part('particle', 14, 0.08),
    ];
    if (visualRegime === 'biological') return [
      part('branch', 10, 0.14),
      part('cell', 22, 0.1),
      part('membrane', 4, 0.08),
    ];
    if (visualRegime === 'soft') return [part('membrane', 8, 0.13), part('ripple', 8, 0.08)];
    if (visualRegime === 'atomic') return [part('orbital', 7, 0.14), part('lattice', 24, 0.1)];
    if (visualRegime === 'electrical') return [part('arc', 10, 0.15), part('pulse', 14, 0.11)];
    if (visualRegime === 'acoustic') return [part('wavefront', 12, 0.11), part('ripple', 8, 0.09)];
    if (visualRegime === 'granular') return [part('strata', 9, 0.12), part('grain', 38, 0.1)];
    if (visualRegime === 'magnetic') return [part('flux-loop', 10, 0.12), part('particle', 18, 0.08)];
    if (visualRegime === 'fluid') return [part('stream', 8, 0.13), part('droplet', 24, 0.09)];
    if (visualRegime === 'phase') return [part('phase-band', 8, 0.12), part('droplet', 12, 0.08)];
    if (seed % 3 === 0) return [part('field-line', 7, 0.1), part('particle', 16, 0.08)];
    return [part('ripple', 6, 0.08), part('particle', 18, 0.08)];
  }

  function part(kind, count, alpha) {
    return { kind, count, alpha };
  }

  function hashProgram(value) {
    let h = 2166136261;
    for (let i = 0; i < String(value).length; i += 1) {
      h ^= String(value).charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  return {
    COMPOSITION_SCHEMA,
    MATERIAL_STYLES,
    RENDER_PROGRAM_SCHEMA,
    buildCompositionGraph,
    compileCompositionToRenderProgram,
  };
});
