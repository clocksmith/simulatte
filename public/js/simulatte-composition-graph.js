(function attachSimulatteCompositionGraph(root, factory) {
  const catalog = typeof module === 'object' && module.exports
    ? require('./simulatte-physics-catalog.js')
    : root.SimulattePhysicsCatalog;
  const api = factory(catalog);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteCompositionGraph = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCompositionGraphApi(catalog) {
  const {
    clamp,
    hashNoise,
    uniqueList,
  } = catalog;

  const COMPOSITION_SCHEMA = 'simulatte.compositionGraph.v1';
  const RENDER_PROGRAM_SCHEMA = 'simulatte.renderProgram.v1';

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
    gold: style('#ffd760', '#b47a23', 0.86),
    ice: style('#dcf7ff', '#72b8da', 0.58),
    lava: style('#ff6b2a', '#872b1a', 0.88),
    leaf: style('#8fd878', '#3f7d3c', 0.68),
    light: style('#ffe873', '#efb425', 0.84),
    magnet: style('#d44a8f', '#2959c6', 0.88),
    membrane: style('#eadcff', '#a884d8', 0.42),
    metal: style('#b8c1ca', '#68737e', 0.74),
    mercury: style('#dce8ef', '#667985', 0.66),
    mycelium: style('#f2f1dc', '#9e9a72', 0.52),
    protein: style('#e8d6ff', '#9277bd', 0.42),
    rock: style('#8f8b82', '#54524d', 0.86),
    sand: style('#d9bd7b', '#a8793d', 0.76),
    silicon: style('#9eb7ce', '#5d748a', 0.64),
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
    const intent = spec.intent || {};
    const contract = spec.contract || {};
    const graph = contract.graph || {};
    const priors = selectionPriors(intent);
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
      intentText: intent.prompt || spec.name || '',
      nodes,
      relations,
      operators,
      priors,
      provenance: {
        composer: 'simulatte.grid-like-composition.v1',
        source: 'concept-graph-selection-priors',
        conceptCount: Array.isArray(intent.conceptGraph) ? intent.conceptGraph.length : 0,
        primitiveCount: nodes.length,
      },
    };
  }

  function selectionPriors(intent = {}) {
    const conceptGraph = Array.isArray(intent.conceptGraph) ? intent.conceptGraph : [];
    return conceptGraph
      .map((concept, index) => ({
        primitiveId: concept.id,
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
    const selected = [];
    const hasValidSynthesis = spec.intent
      && spec.intent.synthesis
      && spec.intent.synthesis.validation
      && spec.intent.synthesis.validation.valid === true;
    if (hasValidSynthesis) {
      for (const component of components) {
        if (selected.length >= 24) break;
        if (/^embedding-guided-synth/.test(component.source || '') && !selected.includes(component)) {
          selected.push(component);
        }
      }
    }
    for (const id of top) {
      if (byId.has(id) && !selected.includes(byId.get(id))) selected.push(byId.get(id));
    }
    for (const prior of priors) {
      if (selected.length >= 24) break;
      const component = byId.get(prior.primitiveId);
      if (component && !selected.includes(component)) selected.push(component);
    }
    for (const component of components) {
      if (selected.length >= 24) break;
      if (!selected.includes(component)) selected.push(component);
    }
    return selected;
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
    const text = componentText(component);
    const radial = radialPlacement(index, total, phase);
    if (/wheel|rotor/.test(text)) return anchoredPlacement(0.5, 0.5, 0, index);
    if (/slider|stator|magnet/.test(text)) return anchoredPlacement(0.68, 0.42, -0.18, index);
    if (/solar|sun|lamp|panel/.test(text)) return anchoredPlacement(0.18, 0.18, 0.18, index);
    if (/load|generator|motor-load/.test(text)) return anchoredPlacement(0.78, 0.74, 0.12, index);
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
    const sceneKind = sceneKindForComposition(graph, initialObjects, rawFields, spec);
    const fields = focusFieldsForScene(rawFields, sceneKind);
    const objects = layoutObjectsForScene(prioritizeObjectsForScene(initialObjects, sceneKind), sceneKind, spec);
    const visualRegimes = uniqueList(objects.map((object) => object.visualRegime));
    const emitters = emittersForComposition(graph);
    const solverPlan = refineSolverPlanForScene(solverPlanForComposition(graph, objects), sceneKind);
    const rendererPlan = rendererPlanForComposition(graph, objects, fields, solverPlan, spec, sceneKind);
    const program = {
      schema: RENDER_PROGRAM_SCHEMA,
      sourceGraphId: graph.graphId,
      intentText: graph.intentText,
      materials: { ...MATERIAL_STYLES },
      objects,
      relations,
      fields,
      emitters,
      solverPlan,
      rendererPlan,
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
      object.phrase,
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
    const objects = layoutObjectsForScene(
      prioritizeObjectsForScene(uniqueObjectsById([...graphObjects, ...irContext]), sceneKind),
      sceneKind,
      spec
    );
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
    const legacySolverPlan = refineSolverPlanForScene(solverPlanForComposition(graph, objects), sceneKind);
    const solverPlan = {
      schema: 'simulatte.solverPlan.v1',
      integrator: legacySolverPlan.integrator || 'mixed-semi-implicit',
      families: uniqueList([
        ...((legacySolverPlan && legacySolverPlan.families) || []),
        ...((solverGraph.steps || []).map((step) => step.solverId)),
      ]),
      state: uniqueList([
        ...((legacySolverPlan && legacySolverPlan.state) || []),
        ...Object.keys(solverGraph.channels || {}),
      ]),
      steps: (solverGraph.steps || []).map((step) => step.operatorType),
      executableSteps: (solverGraph.steps || []).map((step) => step.operatorType),
    };
    const rendererPlan = rendererPlanForComposition(graph, objects, fields, solverPlan, spec, sceneKind);
    return {
      schema: RENDER_PROGRAM_SCHEMA,
      sourceGraphId: graph.graphId,
      intentText: graph.intentText,
      materials: { ...MATERIAL_STYLES },
      objects,
      relations: relationsFromPhysicsIR(spec),
      fields,
      emitters: emittersForComposition(graph),
      solverPlan,
      rendererPlan,
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
    if (sceneHint) return sceneHint;
    return sceneKindFromRenderIRSignals(renderIR, solverGraph, spec) || 'generic';
  }

  function normalizedSceneHint(value) {
    const scene = String(value || '').trim();
    return scene && scene !== 'generic' ? scene : '';
  }

  function sceneKindFromRenderIRSignals(renderIR, solverGraph, spec) {
    const physicsIR = spec && spec.physicsIR || {};
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
      (physicsIR.domains || []).map((domain) => [
        domain.kind,
        domain.materialId,
        ...(domain.tags || []),
        ...(domain.operatorHints || []),
      ].join(' ')).join(' '),
    ].join(' ').toLowerCase();
    if (/thin-film|thin film|soap|surface_tension|wire-loop|wire loop|bubble/.test(text)) return 'thin-film';
    if (/tray|raw material|heat diffusion sample/.test(text) && /water|air|rock|wood|metal|glass|steel/.test(text)) {
      return 'material-tray';
    }
    if (/thermal plume|cooling|cooler|smoke over cooling/.test(text) && /thermal|heat|temperature/.test(text)) {
      return 'thermal-plume';
    }
    if (/process-fire|flame|combustion|fuel|burn/.test(text) && /heat_source|reaction_diffusion|burn/.test(text)) {
      return 'fire';
    }
    if (/lava|magma|volcano|black-hole|singularity|swamp|wetland|hammer|gold|spaceship|spacecraft|rocket|submarine|piano/.test(text)) {
      return 'literal-composite';
    }
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
    if (sceneKind === 'watershed') return /rain|river|terrain|sediment|sand|soil|rock|delta|basalt/.test(text);
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
    if (sceneKind === 'watershed' && /flow|pressure|damage|terrain|rain|delta/.test(text)) return 'gravity';
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
    const visualIdentity = {
      schema: 'simulatte.visualIdentity.v1',
      sceneKind,
      dominantRegime,
      shapeSignature,
      materialSignature,
      fieldKinds,
      solverFamilies,
      objectCount: (objects || []).length,
    };
    return {
      schema: 'simulatte.rendererPlan.v1',
      renderer: `simulatte.regime.${sceneKind}.v1`,
      sceneKind,
      dominantRegime,
      passOrder: renderPassOrder(sceneKind, solverFamilies),
      visualIdentity,
    };
  }

  function prioritizeObjectsForScene(objects, sceneKind) {
    const rows = (objects || []).map((object, index) => ({
      object,
      index,
      priority: sceneObjectPriority(object, sceneKind),
    }));
    const filtered = rows.filter((row) => row.priority >= 0);
    const source = filtered.length >= Math.min(8, rows.length) ? filtered : rows;
    return source
      .sort((a, b) => b.priority - a.priority || a.index - b.index)
      .slice(0, 24)
      .map((row) => row.object);
  }

  function sceneObjectPriority(object, sceneKind) {
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
    if (sceneKind === 'fire') {
      if (/optic|prism|lens|mirror|queue|traffic|network/.test(text)) return -1;
      if (/flame|fire|smoke|fuel|wood|thermal|heat|plume|pine|wind|air|ridge/.test(text)) return 8;
      return 2;
    }
    if (sceneKind === 'thermal-plume') {
      if (/optic|prism|lens|mirror|queue|traffic|network/.test(text)) return -1;
      if (/thermal|plume|smoke|heat|cooling|fin|air|metal|conductor|sensor/.test(text)) return 8;
      return 2;
    }
    if (sceneKind === 'ferrofluid') {
      if (/flame-front|fuel-bed|fire|smoke|queue|traffic/.test(text)) return -1;
      if (/ferrofluid|magnet|coil|current|copper|conductor|dipole|field|spike/.test(text)) return 8;
      return 2;
    }
    if (sceneKind === 'thin-film') {
      if (/flame-front|fuel-bed|fire|queue|traffic|terrain/.test(text)) return -1;
      if (/soap|film|bubble|wire|loop|foam|membrane|light|optic|interference|air/.test(text)) return 8;
      return 2;
    }
    if (sceneKind === 'granular') {
      if (/flame-front|fuel-bed|fire|smoke|optic|lens|prism/.test(text)) return -1;
      if (/granular|grain|bead|sieve|avalanche|powder|sand|rock|sediment|gravity/.test(text)) return 8;
      return 2;
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
      return 2;
    }
    if (sceneKind === 'optics') {
      if (/flame-front|fuel-bed|fire|smoke|wood|thermal/.test(text)) return -1;
      if (/optic|prism|lens|mirror|light|ray|glass|sensor|lamp/.test(text)) return 8;
      return 2;
    }
    if (sceneKind === 'watershed') {
      if (/flame-front|fuel-bed|fire|smoke|thermal/.test(text)) return -1;
      if (/water|river|flow|terrain|erosion|sand|soil|rock|sediment|gravity|granular|grain|bead|sieve|avalanche|powder/.test(text)) return 8;
      return 2;
    }
    if (sceneKind === 'magnetic-machine') {
      if (/flame-front|fuel-bed|fire|smoke|thermal/.test(text)) return -1;
      if (/magnet|ferrofluid|coil|current|conductor|copper|rotor|stator|wheel|slider|solar|panel|motor|load|flux|dipole/.test(text)) return 8;
      return 2;
    }
    if (sceneKind === 'biology') {
      if (/flame-front|fuel-bed|fire|smoke|thermal/.test(text)) return -1;
      if (/bio|cell|bacteria|mycelium|protein|gel|membrane|growth|infection/.test(text)) return 8;
      return 2;
    }
    if (sceneKind === 'acoustic') {
      if (/flame-front|fuel-bed|fire|smoke|thermal/.test(text)) return -1;
      if (/acoustic|sound|wave|pressure|resonance|emitter|tube|water|brass|membrane/.test(text)) return 8;
      return 1;
    }
    return 2;
  }

  function layoutObjectsForScene(objects, sceneKind, spec) {
    if (sceneKind === 'mechanical') return layoutMechanicalObjects(objects);
    if (sceneKind === 'thin-film') return layoutThinFilmObjects(objects);
    if (sceneKind === 'ferrofluid') return layoutFerrofluidObjects(objects);
    if (sceneKind === 'thermal-plume') return layoutThermalPlumeObjects(objects);
    if (sceneKind === 'literal-composite') return layoutLiteralCompositeObjects(objects);
    return objects;
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

  function sceneKindForComposition(graph, objects, fields, spec) {
    const operatorIds = new Set((graph.operators || []).map((operator) => operator.id));
    const promptText = `${graph.intentText || ''} ${spec && spec.name || ''}`.toLowerCase();
    const text = [
      graph.intentText || '',
      spec && spec.name || '',
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
    if (/soap film|thin film|air bubble|air bubbles|wire loop|wire loops|iridescen/.test(promptText)) {
      return 'thin-film';
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
    if (/storm waves|bridge cables|flex bridge|wave.*bridge|pressure wave/.test(promptText)) {
      return 'acoustic';
    }
    if (
      /rain carves|carves basalt|basalt delta|watershed|river|erosion|terrain|sediment|mountain|rain channel|sand|soil|rock ridges/.test(promptText) &&
      !/lava|magma|volcano|bridge|castle|mirror|spaceship|spacecraft|submarine|turbine/.test(promptText)
    ) {
      return 'watershed';
    }
    if (/algae grows|quartz wetland|growth|biological|mycelium|bacteria|membrane|colony|infection|protein/.test(promptText)) {
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
    if (/thermal plume|cooling fin|heat plume/.test(text)) return 'thermal-plume';
    if (/ferrofluid|coil|current|copper conductor|magnetic spikes/.test(text)) return 'ferrofluid';
    if (/soap|thin-film|bubble|wire loop|interference/.test(text)) return 'thin-film';
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

  function focusFieldsForScene(fields, sceneKind) {
    const allowed = {
      fire: ['thermal', 'gravity'],
      optics: ['optical-rays'],
      city: ['network-flow'],
      watershed: ['gravity'],
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

  function dominantRegimeForScene(sceneKind, objects) {
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
    if (!plan || sceneKind !== 'mechanical') return plan;
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
    if (operatorIds.has('growthDecay') || regimes.has('biological')) families.push('growth-diffusion');
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
    if (/water|river|lake|submarine/.test(text)) return 'water';
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
    return 'light';
  }

  function shapeForComponent(component) {
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
    if (/rocket[_-]body|spacecraft|spaceship|rocket|satellite/.test(`${specific} ${geometryShapes}`)) return 'rocket';
    if (/submarine[_-]body|submarine|submersible/.test(`${specific} ${geometryShapes}`)) return 'submarine';
    if (/volcano|volcanic/.test(specific)) return 'volcano';
    if (/gear[_-]train|gearbox|wheel|rotor|gear/.test(`${specific} ${geometryShapes}`)) return 'wheel';
    if (/span[_-]structure|bridge|truss|span/.test(`${specific} ${geometryShapes}`)) return 'bridge';
    if (/crystal tower|crystal towers/.test(phrase) || (/\btower\b/.test(specific) && !/castle/.test(specific))) return 'tower';
    if (/castle/.test(`${specific} ${geometryShapes}`)) return 'castle';
    if (/lava[_-]flow|lava|magma|molten/.test(`${specific} ${geometryShapes}`)) return 'lava-flow';
    if (/instrument[_-]body|piano|keyboard|instrument/.test(`${specific} ${geometryShapes}`)) return 'instrument';
    if (/turbine|propeller|fan turbine/.test(`${specific} ${geometryShapes}`)) return 'turbine';
    if (/storm|hurricane|rainstorm/.test(specific)) return 'storm';
    if (/colony[_-]field|algae|plant cluster|plant_cluster/.test(`${specific} ${geometryShapes}`)) return 'plant-cluster';
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
    if (/slider|actuator/.test(text)) return 'slider';
    if (/magnet/.test(text)) return 'magnet';
    if (/solar|panel/.test(text)) return 'panel';
    if (/load|ledger|meter|recorder/.test(text)) return 'meter';
    if (/lens/.test(text)) return 'lens';
    if (/prism/.test(text)) return 'prism';
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
    if (node && node.visualRegime) return node.visualRegime;
    const text = [
      node.primitiveId,
      node.material,
      node.shape,
      node.role,
      (node.domains || []).join(' '),
    ].join(' ').toLowerCase();
    if (/mycelium|bacteria|protein|leaf|biology|population|colony|infection/.test(text)) return 'biological';
    if (/spacecraft|spaceship|rocket|satellite|submarine|turbine/.test(text)) return 'mechanical';
    if (/piano|keyboard|instrument|acoustic/.test(text)) return 'acoustic';
    if (/storm|hurricane|rainstorm/.test(text)) return 'fluid';
    if (/volcano|lava|magma|molten/.test(text)) return 'thermal';
    if (/membrane|gel|foam|fabric|soft|adhesion|cohesion/.test(text)) return 'soft';
    if (/\b(atom|electron|ion|molecule|crystal|lattice|atomic)\b/.test(text)) return 'atomic';
    if (/electric|charge|current|copper|silicon|conductor|plasma/.test(text)) return 'electrical';
    if (/sound|acoustic|wave|resonance/.test(text)) return 'acoustic';
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
